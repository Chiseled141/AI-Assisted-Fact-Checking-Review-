"""Looks over the extracted claims before any search, and pauses the check when the reader has to decide something.

Two things can pause it: a claim too unclear to search for, and a link, file or long paste holding several claims, where
the reader picks which claims to check. The check waits as `awaiting_input`, with what it needs saved on `Check.review`, so a
restart loses nothing. `POST /api/check/{id}/review` saves the answer and starts it again, and extraction isn't repeated.
"""

from concurrent.futures import ThreadPoolExecutor

from claimtrace.config.settings import Settings
from claimtrace.db.models import Check

from ..charts.chart_triggers import add_chart_requests
from ..providers.llm import LLM, LLMError
from .progress import TaskLog
from .prompts import EXTRACT_SYSTEM, REVIEW_SYSTEM, ClaimReview, ExtractedClaim, ExtractedClaims, tagged


def needs_choice(check: Check, text: str, claim_count: int, settings: Settings) -> bool:
    """Someone who typed a few claims wants them all. A link, a file or a pasted article may hold more than they care about."""
    return claim_count > 1 and (check.input_type == "url" or bool(check.files) or len(text) > settings.question_max_chars)


def ask_questions(extracted: list[ExtractedClaim], text: str, llm: LLM, settings: Settings, tasks: TaskLog) -> list[dict]:
    """The questions the research model has for the reader. If it fails, the claims go ahead as written."""

    def known_claims(answer: ClaimReview) -> None:
        unknown = [question.claim for question in answer.questions if question.claim > len(extracted)]
        if unknown:
            raise ValueError(f"Unknown claim positions: {unknown}. There are {len(extracted)} claims.")

    prompt = "\n\n".join([
        tagged("input", text[: settings.review_input_chars], type="source"),
        *(tagged("input", item.text, type="claim", position=str(index)) for index, item in enumerate(extracted, 1)),
    ])
    task = tasks.model("review", "reviewing", settings.research_model, settings)
    try:
        answer, model = llm.complete(settings.research_model, REVIEW_SYSTEM, prompt, ClaimReview, known_claims)
    except LLMError as error:
        task.fail(error.public_message)
        return []
    task.finish_model(model, settings)
    one_each = {question.claim: question for question in reversed(answer.questions)}
    return [one_each[claim].model_dump() for claim in sorted(one_each)[: settings.max_review_questions]]


def saved_review(
    extracted: list[ExtractedClaim], questions: list[dict], choose: bool, rephrased_from: str | None
) -> dict:
    """`extracted` and `rephrased_from` are for the pipeline. The reader gets the rest, through `ReviewOut`."""
    return {
        "extracted": [item.model_dump(mode="json") for item in extracted],
        "rephrased_from": rephrased_from,
        "claims": [{"position": index, "text": item.text} for index, item in enumerate(extracted, 1)],
        "choose": choose,
        "questions": questions,
        "answer": None,
    }


def answered_claims(
    review: dict, context: list[str], llm: LLM, settings: Settings, pool: ThreadPoolExecutor, tasks: TaskLog
) -> list[ExtractedClaim]:
    """The claims the reader chose. One they clarified is written again by the extraction model, so its query and charts fit."""
    answer = review["answer"]

    def has_a_claim(answer: ExtractedClaims) -> None:
        if not answer.claims:
            raise ValueError("Return the claim, rewritten with the reader's answer.")

    def extract(claim_text: str, question: str, reply: str) -> tuple[ExtractedClaims, str]:
        prompt = "\n\n".join([
            *context,
            tagged("input", claim_text),
            tagged("clarification", f"Question: {question}\nReader's answer: {reply}"),
        ])
        return llm.complete(settings.extraction_model, EXTRACT_SYSTEM, prompt, ExtractedClaims, has_a_claim)

    if answer.get("typed_claim"):
        task = tasks.for_claim(1).model("clarify", "clarifying", settings.extraction_model, settings)
        listed = "\n".join(claim["text"] for claim in review["claims"])
        rewritten, model = extract(listed, "Which claim should be checked?", answer["typed_claim"])
        task.finish_model(model, settings)
        return [add_chart_requests(rewritten.claims[0])]

    saved = [ExtractedClaim.model_validate(item) for item in review["extracted"]]
    positions = answer.get("selected_claims") or ([answer["claim"]] if answer["claim"] is not None else None)
    chosen = [(position, item) for position, item in enumerate(saved, 1) if positions is None or position in positions]
    questions = {question["claim"]: question["question"] for question in review["questions"]}
    replies = {reply["claim"]: reply["answer"] for reply in answer["answers"] if reply["answer"]}
    claims = [item for _, item in chosen]
    to_rewrite = [(place, position) for place, (position, _) in enumerate(chosen) if position in replies]
    jobs = [
        tasks.for_claim(place + 1).model("clarify", "clarifying", settings.extraction_model, settings)
        for place, _ in to_rewrite
    ]

    def rewrite(job: tuple[int, int]) -> tuple[ExtractedClaims, str]:
        place, position = job
        return extract(claims[place].text, questions[position], replies[position])

    # A failure here ends the check, because a verdict on the unclear wording would ignore what the reader said.
    for (place, _), task, (rewritten, model) in zip(to_rewrite, jobs, pool.map(rewrite, to_rewrite), strict=True):
        task.finish_model(model, settings)
        claims[place] = add_chart_requests(rewritten.claims[0])
    return claims
