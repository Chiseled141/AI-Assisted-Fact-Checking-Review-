"""The check pipeline: extract claims, look up fact-checks, retrieve evidence, then judge."""

import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from sqlalchemy.orm import Session, sessionmaker

from ..core.config import Settings
from ..db.models import Check, Claim, Evidence, Source, Verdict, utcnow
from ..providers.fetcher import FetchError, Page
from ..providers.llm import LLM, LLMError
from ..providers.search import FactChecks, Search, SearchError, fast_path_verdict
from .passages import top_passages
from .prompts import (
    EXTRACT_SYSTEM,
    JUDGE_SYSTEM,
    SOURCE_SYSTEM,
    ExtractedClaim,
    ExtractedClaims,
    JudgeAnswer,
    SourceAnswer,
    tagged,
)

logger = logging.getLogger(__name__)

SEARCH_FAILED = "Evidence could not be retrieved, so there is no verdict."
JUDGES_FAILED = "The AI judges could not assess this claim, so there is no verdict."
NO_EVIDENCE = "No readable source was found for this claim, so it cannot be verified."


@dataclass
class Providers:
    llm: LLM
    search: Search
    fact_checks: FactChecks
    fetch: Callable[[str], Page]


def _input_text(check: Check, providers: Providers) -> tuple[str, Page | None]:
    if check.input_type == "url":
        page = providers.fetch(check.input_url or "")
        return page.text, page
    parts = [check.input_text or ""] + [file["text"] for file in check.files or []]
    return "\n\n".join(part for part in parts if part.strip()), None


def _today() -> str:
    """Models don't know today's date, and they need it to tell old news from current facts."""
    return f"Today's date: {utcnow().date().isoformat()}"


def _extract_claims(text: str, article: Page | None, providers: Providers, settings: Settings) -> list[ExtractedClaim]:
    lines = [_today()]
    if article and article.published_at:
        lines.append(f"Article date: {article.published_at}")
    answer, _ = providers.llm.complete(
        settings.extraction_model, EXTRACT_SYSTEM, "\n\n".join([*lines, tagged("input", text)]), ExtractedClaims
    )
    worthy = [claim for claim in answer.claims if claim.checkworthiness >= settings.min_checkworthiness]
    worthy.sort(key=lambda claim: claim.checkworthiness, reverse=True)
    return worthy[: settings.max_claims_per_check]


def _retrieve(
    claims: list[Claim], skip_url: str | None, providers: Providers, settings: Settings, pool: ThreadPoolExecutor
) -> tuple[dict[str, Page], dict[str, list[str]], set[str]]:
    """Returns pages by URL, the URLs each claim uses, and the claims whose search failed."""
    urls_by_claim: dict[str, list[str]] = {}
    failed: set[str] = set()

    def search(claim: Claim):
        try:
            return claim.id, providers.search.search(claim.text)
        except SearchError as error:
            logger.warning("Search failed: %s", error)
            return claim.id, None

    for claim_id, urls in pool.map(search, claims):
        if urls is None:
            failed.add(claim_id)
        else:
            # The article being checked can't be evidence for itself.
            urls_by_claim[claim_id] = [url for url in dict.fromkeys(urls) if url != skip_url]

    # At most this many pages for the whole check. Taking each claim's best result first keeps it fair.
    kept: list[str] = []
    for rank in range(settings.search_results_per_claim):
        for urls in urls_by_claim.values():
            if rank < len(urls) and urls[rank] not in kept and len(kept) < settings.max_sources_per_check:
                kept.append(urls[rank])

    def fetch(url: str):
        try:
            return url, providers.fetch(url)
        except FetchError:
            return url, None  # Not readable, so it isn't used as support.

    pages = {url: page for url, page in pool.map(fetch, kept) if page}
    return pages, {claim_id: [url for url in urls if url in pages] for claim_id, urls in urls_by_claim.items()}, failed


def _judge_claim(
    claim: Claim, evidence: list[Evidence], check: Check, providers: Providers, settings: Settings, pool: ThreadPoolExecutor
) -> Verdict | None:
    """Both judges read the same passages. Returns None when neither gives a valid answer."""
    labels = {f"E{index + 1}": item for index, item in enumerate(evidence)}
    prompt = "\n\n".join(
        [_today(), tagged("input", claim.text, type="claim")]
        + ([f"Period the claim refers to: {claim.time_context}"] if claim.time_context else [])
        + [
            tagged(
                "passage",
                top_passages(item.source.text, claim.text, settings.passages_per_source),
                evidence_id=label,
                title=item.source.title.replace('"', "'"),
                publisher=(item.source.publisher or "unknown").replace('"', "'"),
                published=item.source.published_at or "unknown",
            )
            for label, item in labels.items()
        ]
    )

    def check_answer(answer: JudgeAnswer) -> None:
        unknown = [citation.evidence_id for citation in answer.citations if citation.evidence_id not in labels]
        if unknown:
            raise ValueError(f"Unknown evidence ids: {unknown}. Use only: {list(labels)}")
        if answer.verdict != "insufficient_evidence" and not answer.citations:
            raise ValueError("This verdict must cite at least one passage.")

    def ask(judge_id: str):
        option = settings.judges[judge_id]
        try:
            answer, model = providers.llm.complete(option.model, JUDGE_SYSTEM, prompt, JudgeAnswer, check_answer)
            return option, answer, model
        except LLMError as error:
            logger.warning("Judge %s failed: %s", judge_id, error)
            return option, None, None

    results = list(pool.map(ask, check.judge_ids))
    answered = [result for result in results if result[1] is not None]
    if not answered:
        return None

    # The first judge that answered is shown as the claim's verdict. Disagreement is kept, never voted away.
    option, primary, model = answered[0]
    for _, answer, _ in reversed(answered):
        for citation in answer.citations:
            item = labels[citation.evidence_id]
            item.relation = citation.relation
            if citation.quote and citation.quote in item.source.text:  # Only real quotes are shown as quotes.
                item.excerpt = citation.quote
    cited = [labels[citation.evidence_id].id for citation in primary.citations]
    return Verdict(
        claim_id=claim.id,
        version=1,
        kind="ai_assessment",
        label=primary.verdict,
        explanation=primary.review,
        evidence_ids=list(dict.fromkeys(cited)),
        citation_freshness={
            labels[citation.evidence_id].id: {"status": citation.freshness, "reason": citation.freshness_reason}
            for citation in primary.citations
        },
        model={"name": model, "promptVersion": settings.prompt_version},
        judges=[
            {
                "judge": result_option.name,
                "verdict": answer.verdict,
                "confidence": answer.confidence,
                "review": answer.review,
                "primary": result_option is option,
            }
            for result_option, answer, _ in answered
        ],
        author=f"AI · {option.name}",
    )


def _judge_source(source: Source, claims: list[str], check: Check, providers: Providers, settings: Settings) -> dict | None:
    """Saved once per source. Both judges must answer, because the page compares them side by side."""
    prompt = "\n\n".join(
        [_today(), *(tagged("input", claim, type="claim") for claim in claims)]
        + [tagged("passage", top_passages(source.text, " ".join(claims), settings.passages_per_source + 2))]
    )
    notes, first = [], None
    for judge_id in check.judge_ids:
        option = settings.judges[judge_id]
        try:
            answer, _ = providers.llm.complete(option.model, SOURCE_SYSTEM, prompt, SourceAnswer)
        except LLMError as error:
            logger.warning("Source judgment by %s failed: %s", judge_id, error)
            return None
        first = first or answer
        ratings = answer.ratings
        notes.append(
            {
                "judge": option.name,
                "note": answer.note,
                "ratings": [ratings.match, ratings.directness, ratings.timing, ratings.detail],
            }
        )
    return {"summary": first.summary, "keyPoints": first.key_points, "assessment": first.assessment, "judgeNotes": notes}


def run_check(
    check_id: str,
    make_session: sessionmaker[Session],
    providers: Providers,
    settings: Settings,
    given_claims: list[str] | None = None,
) -> None:
    """`given_claims` skips extraction, for scoring the later steps on a labeled set."""
    with make_session() as session, ThreadPoolExecutor(settings.max_parallel_calls) as pool:
        check = session.get(Check, check_id)
        if check is None:
            return
        try:
            _run(check, session, providers, settings, pool, given_claims)
        except (FetchError, LLMError) as error:
            session.rollback()
            logger.warning("Check %s failed: %s", check_id, error)
            _fail(check, session, str(error) if isinstance(error, FetchError) else "The claims could not be extracted.")
        except Exception:
            session.rollback()
            logger.exception("Check %s failed", check_id)
            _fail(check, session, "Something went wrong while running this check.")


def _fail(check: Check, session: Session, message: str) -> None:
    check.status = "failed"
    check.error_message = message
    session.commit()


def _set_status(check: Check, session: Session, status: str) -> None:
    check.status = status
    session.commit()


def _fact_check_verdict(claim: Claim, verdict: str) -> Verdict:
    publisher, rating = claim.fact_check["publisher"], claim.fact_check["rating"]
    return Verdict(
        claim_id=claim.id,
        version=1,
        kind="ai_assessment",
        label=verdict,
        explanation=f"{publisher}: {rating}",
        author=publisher,
    )


def _run(
    check: Check,
    session: Session,
    providers: Providers,
    settings: Settings,
    pool: ThreadPoolExecutor,
    given_claims: list[str] | None = None,
) -> None:
    _set_status(check, session, "extracting")
    if given_claims is None:
        text, article = _input_text(check, providers)
        if article:
            check.article = {"title": article.title, "publisher": article.publisher, "publishedAt": article.published_at}
            check.title = article.title
        extracted = _extract_claims(text, article, providers, settings)
    else:
        extracted = [ExtractedClaim(text=claim, checkworthiness=1) for claim in given_claims]
    claims = [
        Claim(
            check_id=check.id,
            position=index + 1,
            text=item.text,
            topic=item.topic,
            time_context=item.time_context,
            checkworthy_score=item.checkworthiness,
        )
        for index, item in enumerate(extracted)
    ]
    session.add_all(claims)
    session.flush()

    _set_status(check, session, "retrieving")
    fast_verdicts: dict[str, str] = {}
    for claim, match in zip(claims, pool.map(lambda claim: providers.fact_checks.lookup(claim.text), claims), strict=True):
        if match:
            verdict = fast_path_verdict(claim.text, match)
            if verdict:
                fast_verdicts[claim.id] = verdict
            claim.fact_check = {key: match[key] for key in ("publisher", "rating", "url")}
    to_retrieve = [claim for claim in claims if claim.id not in fast_verdicts]
    pages, urls_by_claim, failed = _retrieve(to_retrieve, check.input_url, providers, settings, pool)

    sources = {
        url: Source(
            check_id=check.id,
            url=page.url,
            title=page.title,
            publisher=page.publisher,
            published_at=page.published_at,
            image_url=page.image_url,
            text=page.text,
        )
        for url, page in pages.items()
    }
    session.add_all(sources.values())
    session.flush()
    evidence_by_claim: dict[str, list[Evidence]] = {}
    for claim in claims:
        items = [
            Evidence(
                claim_id=claim.id,
                source_id=sources[url].id,
                position=index,
                # Replaced by a judge's quote when one can be found in the page.
                excerpt=top_passages(sources[url].text, claim.text, 1)[:280].strip(),
                source=sources[url],
            )
            for index, url in enumerate(urls_by_claim.get(claim.id, []))
        ]
        session.add_all(items)
        evidence_by_claim[claim.id] = items
    session.flush()

    _set_status(check, session, "assessing")
    for claim in claims:
        items = evidence_by_claim[claim.id]
        if claim.id in fast_verdicts:
            session.add(_fact_check_verdict(claim, fast_verdicts[claim.id]))
        elif claim.id in failed:
            claim.status, claim.unavailable_reason = "unavailable", SEARCH_FAILED
        elif not items:
            session.add(
                Verdict(
                    claim_id=claim.id,
                    version=1,
                    kind="ai_assessment",
                    label="insufficient_evidence",
                    explanation=NO_EVIDENCE,
                    author="ClaimTrace",
                )
            )
        else:
            verdict = _judge_claim(claim, items, check, providers, settings, pool)
            if verdict:
                session.add(verdict)
            else:
                claim.status, claim.unavailable_reason = "unavailable", JUDGES_FAILED
    session.commit()

    claims_by_source: dict[str, list[str]] = {}
    for claim in claims:
        for item in evidence_by_claim[claim.id]:
            claims_by_source.setdefault(item.source_id, []).append(claim.text)
    for source in sources.values():
        if source.id in claims_by_source:
            source.analysis = _judge_source(source, claims_by_source[source.id], check, providers, settings)
    check.completed_at = utcnow()
    _set_status(check, session, "completed")
