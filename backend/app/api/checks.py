"""Starting checks, reading their results, and the history list."""

import math
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..db import models
from ..db.session import get_session
from ..providers.fetcher import FetchError, check_url_allowed
from . import schemas
from .deps import get_or_404
from .serializers import check_out, claim_out

router = APIRouter()

_recent_checks: dict[str, deque[float]] = defaultdict(deque)
_recent_checks_lock = Lock()


def enforce_rate_limit(address: str, settings: Settings, now: float | None = None) -> None:
    """Per process and per address, which is enough for one server. A shared limit would need Redis."""
    limit = settings.max_checks_per_hour
    if not limit:
        return
    now = time.monotonic() if now is None else now
    with _recent_checks_lock:
        recent = _recent_checks[address]
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
        if len(body.files) > settings.max_files or any(
            len(file.text.encode()) > settings.max_file_bytes for file in body.files
        ):
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
):
    judge_ids = validate_input(body, settings)
    start = request.app.state.start_check
    if start is None:
        raise HTTPException(503, "The server is missing its API keys, so it can’t run checks yet.")
    enforce_rate_limit(request.client.host if request.client else "unknown", settings)
    check = models.Check(
        title=title_for(body),
        input_type=body.input_type,
        input_text=(body.text or "").strip() if body.input_type == "text" else None,
        input_url=(body.url or "").strip() if body.input_type == "url" else None,
        files=[file.model_dump() for file in body.files] or None,
        judge_ids=judge_ids,
    )
    session.add(check)
    session.commit()
    background.add_task(start, check.id)
    return check_out(check, session)


@router.get("/check/{check_id}", response_model=schemas.CheckDetailOut)
def get_check(check_id: str, session: Session = Depends(get_session)):
    check = get_or_404(session, models.Check, check_id)
    return schemas.CheckDetailOut(
        **check_out(check, session).model_dump(), claims=[claim_out(claim) for claim in check.claims]
    )


@router.post("/check/{check_id}/feedback", status_code=201)
def add_feedback(check_id: str, body: schemas.FeedbackIn, session: Session = Depends(get_session)):
    get_or_404(session, models.Check, check_id)
    session.add(models.Feedback(check_id=check_id, helpful=body.helpful, comment=body.comment))
    session.commit()
    return {"ok": True}


@router.get("/checks", response_model=schemas.CheckPage)
def list_checks(
    query: str = "",
    status: str = "all",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100, alias="pageSize"),
    session: Session = Depends(get_session),
):
    statement = select(models.Check)
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
        statement = statement.where(models.Check.status.not_in(["completed", "failed"]))
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
