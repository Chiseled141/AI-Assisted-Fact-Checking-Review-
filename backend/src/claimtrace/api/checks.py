"""Starting checks, reading their results, follow-up questions, feedback, and the history list."""

import math
import time
from collections import defaultdict, deque
from functools import partial
from threading import Lock

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from claimtrace.config.labels import DECLINED_INPUT_CATEGORIES
from claimtrace.config.settings import Settings, get_settings
from claimtrace.core.pipeline.followup import answer_followup, result_context
from claimtrace.core.pipeline.memory import earlier_link, similar_claims
from claimtrace.core.pipeline.progress import closed_tasks
from claimtrace.core.pipeline.prompts import INPUT_SUGGESTIONS_SYSTEM, InputSuggestions, tagged
from claimtrace.core.pipeline.run import FINISHED, STOPPED, stop_requests
from claimtrace.core.providers.llm import LLMError
from claimtrace.core.search.fetcher import FetchError, check_url_allowed, fetch_page
from claimtrace.core.search.tavily import TavilySearch
from claimtrace.db import models
from claimtrace.db.session import get_session

from . import schemas
from .deps import current_user, optional_user, owned_check
from .provider import custom_llm, custom_starter, provider_settings
from .serializers import check_out, claim_out, message_out

router = APIRouter()

STILL_RUNNING = "Stop this check before deleting it."
_recent_checks: dict[str, deque[float]] = defaultdict(deque)
_recent_checks_lock = Lock()
_suggestions_in_flight: set[str] = set()
_suggestions_lock = Lock()


def enforce_rate_limit(key: str, settings: Settings, now: float | None = None) -> None:
    """Per process and per user, which is enough for one server. A shared limit would need a shared store."""
    limit = settings.max_checks_per_hour
    if not limit:
        return
    now = time.monotonic() if now is None else now
    with _recent_checks_lock:
        recent = _recent_checks[key]
        while recent and recent[0] <= now - 3600:
            recent.popleft()
        if len(recent) >= limit:
            raise HTTPException(429, "Too many checks. Please try again later.")
        recent.append(now)


def title_for(body: schemas.CreateCheck) -> str:
    if body.input_type == "url":
        return (body.url or "").strip().removeprefix("https://").removeprefix("http://")[:120]
    text = " ".join((body.text or "").split())
    if text:
        return text if len(text) <= 80 else f"{text[:77]}…"
    return ", ".join(file.name for file in body.files)


def validate_input(body: schemas.CreateCheck, settings: Settings) -> list[str]:
    if body.input_type == "url":
        url = (body.url or "").strip()
        if not url or len(url) > settings.max_url_length:
            raise HTTPException(422, "Enter a valid link.")
        try:
            check_url_allowed(url)
        except FetchError as error:
            raise HTTPException(422, str(error)) from error
    else:
        if not (body.text or "").strip() and not body.files:
            raise HTTPException(422, "Enter some text or attach a file.")
        if len(body.text or "") > settings.max_text_length:
            raise HTTPException(422, f"Text can be at most {settings.max_text_length} characters.")
        if len(body.files) > settings.max_files or any(len(file.text.encode()) > settings.max_file_bytes for file in body.files):
            raise HTTPException(422, f"Attach at most {settings.max_files} files, each within the size limit.")
    judge_ids = body.judge_ids or settings.default_judge_ids
    if len(set(judge_ids)) != 2 or any(judge not in settings.judges for judge in judge_ids):
        raise HTTPException(422, "Pick exactly 2 different judges.")
    return judge_ids


@router.post("/check", status_code=202, response_model=schemas.CheckOut, response_model_by_alias=True)
def create_check(
    body: schemas.CreateCheck,
    request: Request,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: models.User = Depends(current_user),
):
    if user.api_provider:
        settings = provider_settings(user.api_provider, settings)
        body = body.model_copy(update={"judge_ids": settings.default_judge_ids})
    judge_ids = validate_input(body, settings)
    start = custom_starter(user.id, user.api_provider, settings) if user.api_provider else request.app.state.start_check
    if start is None:
        raise HTTPException(503, "The server is missing its API keys, so it can’t run checks yet.")
    enforce_rate_limit(user.id, settings)
    search_option = settings.judges.get(user.preferred_search_model_id or "") if not user.api_provider else None
    check = models.Check(
        user_id=user.id,
        title=title_for(body),
        input_type=body.input_type,
        input_text=(body.text or "").strip() if body.input_type == "text" else None,
        input_url=(body.url or "").strip() if body.input_type == "url" else None,
        files=[file.model_dump() for file in body.files] or None,
        judge_ids=judge_ids,
        search_model=search_option.model if search_option else settings.research_model,
        search_instructions=user.search_instructions,
        search_options=user.search_options,
        api_provider=user.api_provider,
    )
    session.add(check)
    session.commit()
    background.add_task(start, check.id)
    return check_out(check, session)


@router.get("/check/{check_id}", response_model=schemas.CheckDetailOut)
def get_check(
    check_id: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: models.User = Depends(current_user),
):
    check = owned_check(session, check_id, user)
    return schemas.CheckDetailOut(
        **check_out(check, session).model_dump(),
        claims=[claim_out(claim) for claim in check.claims],
        input_suggestions=check.input_suggestions,
        progress=check.progress or [],
        messages=_chat_messages(check, settings),
        review=schemas.ReviewOut(**check.review) if check.review else None,
    )


@router.post("/check/{check_id}/input-suggestions", response_model=schemas.InputSuggestionsOut)
def suggest_check_inputs(
    check_id: str,
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: models.User = Depends(current_user),
):
    check = owned_check(session, check_id, user)
    if check.status != "completed" or check.claims:
        raise HTTPException(422, "Suggestions are available for completed inputs without claims.")
    if check_out(check, session).input_category in DECLINED_INPUT_CATEGORIES:
        return schemas.InputSuggestionsOut(suggestions=[])
    if check.input_suggestions is not None:
        return schemas.InputSuggestionsOut(suggestions=check.input_suggestions)

    llm = None if check.api_provider else request.app.state.llm
    if llm is None and not check.api_provider:
        raise HTTPException(503, "Suggestions are temporarily unavailable.")

    parts = [check.title] if check.input_type == "url" else [
        check.input_text or "", *(file["text"] for file in check.files or []),
    ]
    text = "\n\n".join(part for part in parts if part.strip())[:settings.max_text_length]
    rate_key = f"{user.id}:input-suggestions"
    session.rollback()  # Release the read transaction while the model runs.
    with _suggestions_lock:
        if check_id in _suggestions_in_flight:
            raise HTTPException(409, "Suggestions are already being generated.")
        _suggestions_in_flight.add(check_id)

    try:
        saved = session.scalar(select(models.Check.input_suggestions).where(models.Check.id == check_id))
        if saved is not None:
            return schemas.InputSuggestionsOut(suggestions=saved)
        session.rollback()
        enforce_rate_limit(rate_key, settings)
        if check.api_provider:
            settings = provider_settings(check.api_provider, settings)
            llm = custom_llm(user.id, check.api_provider, settings)
        suggestions: list[str] = []
        if text:
            answer, _ = llm.complete(
                settings.extraction_model, INPUT_SUGGESTIONS_SYSTEM, tagged("input", text), InputSuggestions,
            )
            seen = {" ".join(text.split()).casefold()}
            for item in answer.suggestions:
                suggestion = " ".join(item.split())
                key = suggestion.casefold()
                if len(suggestion) >= 20 and suggestion.endswith("?") and key not in seen:
                    suggestions.append(suggestion)
                    seen.add(key)

        # Keep the first saved answer if another process filled this while the model was running.
        session.execute(
            update(models.Check)
            .where(models.Check.id == check_id, models.Check.input_suggestions.is_(None))
            .values(input_suggestions=suggestions, updated_at=models.Check.updated_at)
        )
        saved = session.scalar(select(models.Check.input_suggestions).where(models.Check.id == check_id))
        if saved is None:
            raise HTTPException(404, "Not found.")
        session.commit()
        return schemas.InputSuggestionsOut(suggestions=saved)
    except LLMError as error:
        raise HTTPException(503, error.public_message) from error
    finally:
        with _suggestions_lock:
            _suggestions_in_flight.discard(check_id)
        if check.api_provider and llm is not None:
            llm.client.close()


@router.post("/check/{check_id}/stop", status_code=202)
def stop_check(check_id: str, session: Session = Depends(get_session), user: models.User = Depends(current_user)):
    """The reader sees it stopped at once. The running pipeline ends at its next step, and no later call is made."""
    check = owned_check(session, check_id, user)
    if check.status in FINISHED:
        return {"ok": True}
    if check.status != "awaiting_input":  # A check waiting for an answer has nothing running to stop.
        stop_requests.add(check_id)
    stopped = session.execute(
        update(models.Check)
        .where(models.Check.id == check_id, models.Check.status.not_in(FINISHED))
        .values(status="stopped", error_message=STOPPED, progress=closed_tasks(check.progress, STOPPED))
    )
    if not stopped.rowcount:
        stop_requests.discard(check_id)  # It finished first, so nothing is left to end the request.
    session.commit()
    return {"ok": True}


def _deletable_checks(user: models.User):
    """A running pipeline would write into a deleted check. A stopped one still runs until its next step, so it waits too."""
    return (
        select(models.Check.id)
        .where(
            models.Check.user_id == user.id,
            models.Check.status.in_((*FINISHED, "awaiting_input")),
            models.Check.id.not_in(stop_requests),
        )
        .with_for_update()
    )


def _delete_checks(session: Session, check_ids: list[str]) -> None:
    """Removes the checks and everything saved under them, children first."""
    claims = select(models.Claim.id).where(models.Claim.check_id.in_(check_ids))
    session.execute(delete(models.Evidence).where(models.Evidence.claim_id.in_(claims)))
    session.execute(delete(models.Verdict).where(models.Verdict.claim_id.in_(claims)))
    for table in (models.Claim, models.Source, models.Feedback, models.CheckMessage):
        session.execute(delete(table).where(table.check_id.in_(check_ids)))
    session.execute(delete(models.Check).where(models.Check.id.in_(check_ids)))
    session.commit()


@router.delete("/check/{check_id}")
def delete_check(check_id: str, session: Session = Depends(get_session), user: models.User = Depends(current_user)):
    owned_check(session, check_id, user)
    if session.scalar(_deletable_checks(user).where(models.Check.id == check_id)) is None:
        raise HTTPException(422, STILL_RUNNING)
    _delete_checks(session, [check_id])
    return {"ok": True}


@router.delete("/checks")
def delete_all_checks(session: Session = Depends(get_session), user: models.User = Depends(current_user)):
    """Deletes the whole history, except checks still running, which are counted in `kept`."""
    check_ids = list(session.scalars(_deletable_checks(user)))
    _delete_checks(session, check_ids)
    kept = session.scalar(select(func.count()).select_from(models.Check).where(models.Check.user_id == user.id))
    return {"deleted": len(check_ids), "kept": kept}


@router.post("/check/{check_id}/review", status_code=202)
def answer_review(
    check_id: str,
    body: schemas.ReviewAnswer,
    request: Request,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
    user: models.User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """The reader's answer to what the check asked before searching. The check goes on from where it stopped."""
    check = owned_check(session, check_id, user)
    review = check.review or {}
    if check.status != "awaiting_input" or not review:
        raise HTTPException(422, "This check is no longer waiting for an answer.")
    if body.claim is not None and not (review["choose"] and 1 <= body.claim <= len(review["claims"])):
        raise HTTPException(422, "That claim is no longer available.")
    selected = set(body.selected_claims or ())
    if body.selected_claims is not None and (
        not review["choose"] or body.claim is not None or len(selected) != len(body.selected_claims)
        or not selected <= {claim["position"] for claim in review["claims"]}
    ):
        raise HTTPException(422, "That claim is no longer available.")
    typed_claim = (body.typed_claim or "").strip() or None
    if body.typed_claim is not None and not (
        typed_claim and review["choose"] and body.claim is None and not selected and not body.answers
    ):
        raise HTTPException(422, "That claim is no longer available.")
    if body.claim is not None:
        selected = {body.claim}
    asked = {question["claim"] for question in review["questions"] if not selected or question["claim"] in selected}
    replies = {reply.claim: (reply.answer or "").strip() or None for reply in body.answers}
    if len(replies) != len(body.answers) or not replies.keys() <= asked:
        raise HTTPException(422, "That question is no longer available.")
    start = custom_starter(user.id, check.api_provider, settings) if check.api_provider else request.app.state.start_check
    if start is None:
        raise HTTPException(503, "The server is missing its API keys, so it can’t run checks yet.")
    answer = {
        "claim": body.claim,
        "answers": [{"claim": claim, "answer": text} for claim, text in replies.items()],
        "typed_claim": typed_claim,
    }
    if body.selected_claims is not None:
        answer["selected_claims"] = sorted(selected)
    # Only one answer can win, so a double click can't start the check twice.
    claimed = session.execute(
        update(models.Check)
        .where(models.Check.id == check_id, models.Check.status == "awaiting_input")
        .values(status="extracting", review={**review, "answer": answer})
    )
    if not claimed.rowcount:
        raise HTTPException(422, "This check is no longer waiting for an answer.")
    session.commit()
    background.add_task(start, check_id)
    return {"ok": True}


def _model_name(model: str | None, settings: Settings) -> str | None:
    return settings.model_display_name(model) if model else None


def _answer_reference(message: models.CheckMessage, settings: Settings) -> schemas.MessageReference:
    text = " ".join(message.answer.split())
    title = text if len(text) <= 160 else f"{text[:157]}…"
    return schemas.MessageReference(kind="answer", title=title, model_name=_model_name(message.model, settings))


def _chat_messages(check: models.Check, settings: Settings) -> list[schemas.MessageOut]:
    messages = []
    earlier: dict[str, models.CheckMessage | None] = {}
    for message in check.messages:
        output = message_out(message, _model_name(message.model, settings))
        if output.reference and output.reference.kind == "message":
            # Older references saved the question alone. A repeated question cannot identify one answer.
            source = earlier.get(output.reference.title)
            output.reference = (
                _answer_reference(source, settings) if source else schemas.MessageReference(kind="answer", title="")
            )
        messages.append(output)
        earlier[message.question] = None if message.question in earlier else message
    return messages


@router.post("/check/{check_id}/messages", status_code=201, response_model=schemas.MessageOut)
def ask_followup(
    check_id: str,
    body: schemas.FollowUpIn,
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: models.User = Depends(current_user),
):
    """A follow-up question, answered with saved context and optional web search. Each answer is a paid model call."""
    check = owned_check(session, check_id, user)
    question = body.question.strip()
    if not question or len(question) > settings.max_followup_length:
        raise HTTPException(422, f"Write a question of at most {settings.max_followup_length} characters.")
    if check.status != "completed":
        raise HTTPException(422, "Questions open once the check has finished.")
    if len(body.files) > settings.max_files or any(len(file.text.encode()) > settings.max_file_bytes for file in body.files):
        raise HTTPException(422, f"Attach at most {settings.max_files} files, each within the size limit.")
    if body.model_id is not None and body.model_id not in settings.judges and not check.api_provider:
        raise HTTPException(422, "Pick a model from the list.")
    cleared_followups = check.cleared_followups
    if cleared_followups + len(check.messages) >= settings.max_followups_per_check:
        raise HTTPException(429, "This check has reached its limit of follow-up questions. Start a new check.")
    reply_to = next((message for message in check.messages if message.id == body.reply_to_id), None)
    if body.reply_to_id and reply_to is None:
        raise HTTPException(422, "That reply is no longer available.")
    selected_result = None
    reference = _answer_reference(reply_to, settings) if reply_to else None
    if body.target:
        target = body.target
        selected_result = result_context(check, target.claim_id, target.kind, target.key, target.label)
        if selected_result is None:
            raise HTTPException(422, "That result is no longer available.")
        reference = schemas.MessageReference(kind=target.kind, title=selected_result.title, url=selected_result.url)
    llm = request.app.state.llm
    search, fetch = request.app.state.followup_search, request.app.state.followup_fetch
    if check.api_provider:
        settings = provider_settings(check.api_provider, settings)
        if body.model_id is not None and body.model_id not in {*settings.judges, "custom-model"}:
            raise HTTPException(422, "Pick a model from the list.")
        llm = custom_llm(user.id, check.api_provider, settings)
        search = TavilySearch(settings) if settings.tavily_api_key else None
        fetch = partial(fetch_page, settings=settings)
    if llm is None:
        raise HTTPException(503, "The server is missing its API keys, so it can’t answer questions yet.")
    try:
        chosen = settings.judges[body.model_id].model if body.model_id in settings.judges else settings.followup_model
        answer, model, sources = answer_followup(
            check, question, llm, settings, body.files, chosen,
            reply_to=reply_to, selected_result=selected_result.prompt if selected_result else None,
            search=search, fetch=fetch,
        )
    except LLMError as error:
        raise HTTPException(503, error.public_message) from error
    finally:
        if check.api_provider:
            llm.client.close()
    # Serialize saving and clearing on the check row without holding a lock during the model call.
    locked = session.execute(
        update(models.Check)
        .where(models.Check.id == check_id, models.Check.cleared_followups == cleared_followups)
        .values(cleared_followups=cleared_followups, updated_at=models.Check.updated_at)
    )
    if not locked.rowcount:
        raise HTTPException(409, "The follow-up chat was cleared. Please send your question again.")
    saved_count = session.scalar(
        select(func.count()).select_from(models.CheckMessage).where(models.CheckMessage.check_id == check_id)
    )
    if cleared_followups + saved_count >= settings.max_followups_per_check:
        raise HTTPException(429, "This check has reached its limit of follow-up questions. Start a new check.")
    files = [file.model_dump() for file in body.files] or None
    message = models.CheckMessage(
        check_id=check.id, question=question, files=files, answer=answer, model=model, sources=sources or None,
        reference=reference.model_dump(exclude_none=True) if reference else None,
    )
    session.add(message)
    session.commit()
    return message_out(message, _model_name(model, settings))


@router.delete("/check/{check_id}/messages", status_code=204)
def clear_followups(check_id: str, session: Session = Depends(get_session), user: models.User = Depends(current_user)):
    check = owned_check(session, check_id, user)
    session.execute(
        update(models.Check)
        .where(models.Check.id == check_id)
        .values(cleared_followups=models.Check.cleared_followups, updated_at=models.Check.updated_at)
    )
    cleared = session.execute(delete(models.CheckMessage).where(models.CheckMessage.check_id == check_id))
    session.refresh(check, ["cleared_followups"])
    check.cleared_followups += cleared.rowcount
    session.commit()
    return Response(status_code=204)


@router.post("/check/{check_id}/feedback", status_code=201)
def add_feedback(
    check_id: str, body: schemas.FeedbackIn, session: Session = Depends(get_session), user: models.User = Depends(current_user)
):
    owned_check(session, check_id, user)
    session.add(models.Feedback(check_id=check_id, helpful=body.helpful, comment=body.comment))
    session.commit()
    return {"ok": True}


@router.post("/checks/similar", response_model=schemas.SimilarOut)
def find_similar(
    body: schemas.SimilarIn, session: Session = Depends(get_session), user: models.User | None = Depends(optional_user)
):
    """The signed-in user's earlier checks of the same claim or link. No model is called; signed out finds nothing."""
    if user is None:
        return schemas.SimilarOut(claims=[], link=None)
    link = earlier_link(session, body.url, user.id) if body.url else None
    claims = similar_claims(session, body.text, user.id) if body.text else []
    return schemas.SimilarOut(
        claims=[schemas.EarlierClaimOut(**vars(claim)) for claim in claims],
        link=schemas.EarlierLinkOut(**vars(link)) if link else None,
    )


@router.get("/checks", response_model=schemas.CheckPage)
def list_checks(
    query: str = "",
    status: str = "all",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100, alias="pageSize"),
    session: Session = Depends(get_session),
    user: models.User = Depends(current_user),
):
    statement = select(models.Check).where(models.Check.user_id == user.id)
    if query.strip():
        pattern = f"%{query.strip()}%"
        statement = statement.where(
            or_(
                models.Check.title.ilike(pattern),
                models.Check.input_text.ilike(pattern),
                models.Check.input_url.ilike(pattern),
            )
        )
    if status == "processing":
        statement = statement.where(models.Check.status.not_in(FINISHED))
    elif status in ("completed", "failed"):
        statement = statement.where(models.Check.status == status)
    total = session.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows = session.scalars(
        statement.order_by(models.Check.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return schemas.CheckPage(
        items=[check_out(check, session) for check in rows],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=math.ceil(total / page_size),
    )
