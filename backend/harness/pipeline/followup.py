"""Follow-up answers use saved context, with optional search by the reader's selected model.

Search results belong to the conversation; they never revise the saved verdict or its evidence.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from json import dumps
from typing import Protocol

from config.settings import Settings
from database import models

from ..providers.llm import LLM, LLMError
from ..search.fetcher import Page
from ..search.tavily import (
    CHART_DOMAINS,
    Search,
    SearchError,
    SearchHit,
    data_table_domains,
    is_allowed_source,
    read_hit,
    within_domains,
)
from .prompts import FOLLOWUP_SYSTEM, FollowUpAnswer, tagged


class AttachedFile(Protocol):
    """A text file the reader attached to their question."""

    name: str
    text: str


EARLIER_MESSAGES = 6  # Enough for "and the second one?" to make sense, without resending a long conversation.
EXCERPT_CHARS = 1500


def _input(check: models.Check) -> str:
    if check.input_type == "url":
        title = (check.article or {}).get("title")
        return f"A link: {check.input_url}" + (f" ({title})" if title else "")
    parts = [check.input_text or ""] + [f"File {file['name']}:\n{file['text']}" for file in check.files or []]
    return "\n\n".join(part for part in parts if part)


def _claim(claim: models.Claim) -> str:
    latest = claim.verdicts[-1] if claim.verdicts else None
    lines = [f"Claim {claim.position}: {claim.text}"]
    if latest:
        lines.append(f"Verdict: {latest.label} ({latest.kind})")
        lines.append(f"Explanation: {latest.explanation}")
        for judge in latest.judges or []:
            lines.append(f"Judge {judge.get('judge')}: {judge.get('verdict')}. {judge.get('review', '')}")
    elif claim.status == "unavailable":
        lines.append(f"No verdict: {claim.unavailable_reason or 'verification was unavailable'}")
    return tagged("claim", "\n".join(lines), position=str(claim.position))


def _passages(claim: models.Claim) -> list[str]:
    return [
        tagged(
            "passage",
            item.excerpt[:EXCERPT_CHARS],
            claim=str(claim.position),
            publisher=item.source.publisher or "",
            title=item.source.title,
            date=item.source.published_at or "undated",
            relation=item.relation,
        )
        for item in claim.evidence
    ]


CHART_FIELDS = {
    "priceChart": ("price_chart", "Price chart"),
    "locationMap": ("location_map", "Places in this claim"),
    "incidentMap": ("incident_map", "Incident location"),
    "countryMap": ("country_map", "Statistics map"),
    "populationPyramid": ("population_pyramid", "Population pyramid"),
    "seatChart": ("seat_chart", "Seat chart"),
    "pieChart": ("pie_chart", "Share of the total"),
    "barChart": ("bar_chart", "Bar chart"),
    "routeMap": ("route_map", "Route map"),
    "matchResult": ("match_result", "Match result"),
    "electionMap": ("election_map", "Election map"),
}


@dataclass(frozen=True)
class ResultContext:
    prompt: str
    title: str
    url: str | None = None


def _chart_data(chart: dict) -> dict:
    data = dict(chart)
    for key in ("prices", "points"):
        entries = data.get(key) or []
        if len(entries) > 60:
            data[key] = [entries[round(index * (len(entries) - 1) / 59)] for index in range(60)]
            data[f"{key}_sampled_from"] = len(entries)
    if "values" in data:
        codes = {"world", *(place["code"] for place in data.get("selected", []))}
        data["values"] = {code: values for code, values in data["values"].items() if code in codes}
    return data


def result_context(
    check: models.Check, claim_id: str, kind: str, key: str, label: str | None = None,
) -> ResultContext | None:
    claim = next((claim for claim in check.claims if claim.id == claim_id), None)
    if claim is None:
        return None
    if kind == "source":
        item = next((item for item in claim.evidence if item.id == key), None)
        if item:
            data = {
                "title": item.source.title,
                "publisher": item.source.publisher,
                "date": item.source.published_at,
                "url": item.source.url,
                "relation": item.relation,
                "passage": item.excerpt[:EXCERPT_CHARS],
            }
            prompt = tagged("selected_result", dumps(data, ensure_ascii=False), kind=kind, claim=str(claim.position))
            return ResultContext(prompt, item.source.title, item.source.url)
    if kind == "judge" and claim.verdicts:
        judge = next((judge for judge in claim.verdicts[-1].judges or [] if judge.get("judge") == key), None)
        if judge:
            data = {field: judge.get(field) for field in ("judge", "verdict", "review")}
            prompt = tagged("selected_result", dumps(data, ensure_ascii=False), kind=kind, claim=str(claim.position))
            return ResultContext(prompt, key)
    if kind == "chart" and key in CHART_FIELDS:
        field, title = CHART_FIELDS[key]
        chart = getattr(claim, field)
        if chart:
            prompt = tagged("selected_result", dumps(_chart_data(chart)), kind=kind, claim=str(claim.position), chart=key)
            return ResultContext(prompt, (label or "").strip() or title)
    return None


def followup_prompt(
    check: models.Check,
    question: str,
    files: Sequence[AttachedFile] = (),
    *,
    reply_to: models.CheckMessage | None = None,
    selected_result: str | None = None,
) -> str:
    parts = [tagged("input", _input(check))]
    for claim in check.claims:
        parts.append(_claim(claim))
        parts += _passages(claim)
    for message in check.messages[-EARLIER_MESSAGES:]:
        if message is reply_to:
            continue
        names = ", ".join(file["name"] for file in message.files or [])
        attached = f"\nAttached: {names}" if names else ""
        sources = f"\nAdditional sources: {dumps(message.sources, ensure_ascii=False)}" if message.sources else ""
        parts.append(tagged("earlier", f"Question: {message.question}{attached}\nAnswer: {message.answer}{sources}"))
    parts += [tagged("attachment", file.text, name=file.name) for file in files]
    if reply_to:
        sources = f"\nAdditional sources: {dumps(reply_to.sources, ensure_ascii=False)}" if reply_to.sources else ""
        parts.append(tagged("reply_to", f"Question: {reply_to.question}\nAnswer: {reply_to.answer}{sources}"))
    if selected_result:
        parts.append(selected_result)
    parts.append(tagged("question", question))
    return "\n\n".join(parts)


def answer_followup(
    check: models.Check,
    question: str,
    llm: LLM,
    settings: Settings,
    files: Sequence[AttachedFile] = (),
    model: str | None = None,
    *,
    reply_to: models.CheckMessage | None = None,
    selected_result: str | None = None,
    search: Search | None = None,
    fetch: Callable[[str], Page] | None = None,
) -> tuple[str, str, list[dict]]:
    """Returns the answer and the model that gave it. Raises `LLMError` when the model fails.

    `model` is the reader's pick from the judge list; without one, `followup_model` answers.
    """
    prompt = followup_prompt(check, question, files, reply_to=reply_to, selected_result=selected_result)
    pages: dict[str, dict] = {}

    def run_search(
        query: str, election_results_only: bool = False, *, data_tables_only: bool = False, advanced: bool = False,
    ) -> str:
        # Nothing searches before the selected model explicitly calls this tool.
        if search is None or fetch is None:
            raise LLMError("Follow-up search is unavailable.")
        election_domains = CHART_DOMAINS["elections"] if election_results_only else None
        try:
            search_hits = getattr(search, "search_hits", None)
            scope = {}
            if election_domains:
                scope["domains"] = election_domains
            elif data_tables_only:
                scope["domains"] = data_table_domains(query)
            if advanced:
                scope["advanced"] = True
            hits = search_hits(query, newest_first=False, max_results=2, include_images=False, **scope) if search_hits else [
                SearchHit(url) for url in search.search(query)
            ]
        except SearchError as error:
            raise LLMError(f"Follow-up search failed: {error}", "Web search failed. Please try again later.") from error
        if election_domains:
            hits = [hit for hit in hits if within_domains(hit.url, election_domains)]
        results = []
        fetched = False
        for hit in hits[:2]:
            if not is_allowed_source(hit.url):
                continue
            # Tavily already supplies page text. Avoid downloading every result again for a chat reply.
            text, title = hit.raw_content or "", hit.title or hit.url
            if not text and not fetched:
                fetched = True
                page = read_hit(hit, fetch, settings)
                if page:
                    text, title = page.text, page.title or title
            if text:
                pages[hit.url] = {"url": hit.url, "title": title}
                results.append({**pages[hit.url], "text": text[:3000]})
        return dumps(results, ensure_ascii=False)

    system = FOLLOWUP_SYSTEM + f"\n\nToday's UTC date is {datetime.now(UTC).date().isoformat()}."
    answer, model, sources = llm.followup(model or settings.followup_model, system, prompt, FollowUpAnswer, run_search)
    # Native citations come from the provider; Tavily citations must have been returned by the actual tool.
    sources = sources or [pages[url] for url in dict.fromkeys(answer.source_urls) if url in pages]
    return answer.answer.strip(), model, sources
