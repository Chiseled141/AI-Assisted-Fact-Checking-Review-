"""Builds a claim's US election map, only for a claim about the result of a US presidential, House or Senate election.

No service we can reach without a key covers every election, so the research model reads who won each state from the
sources it chose, and each result must be found in the source's own words to be kept. States with no verified result
stay grey. The map is context, so judges never see it.
"""

import logging
import re
from collections import Counter
from datetime import date, timedelta

from config.settings import Settings
from database.models import Evidence, Source, utcnow

from ..pipeline.passages import page_for_reading, quote_in_text
from ..pipeline.progress import CHART_INCOMPLETE, NO_TASKS, TaskLog
from ..pipeline.prompts import (
    ELECTION_MAP_SYSTEM,
    ELECTION_RESULTS_SYSTEM,
    SEAT_CHART_SYSTEM,
    ElectionMapRequest,
    ExtractedClaim,
    ReportedElection,
    ReportedSeats,
    ReportedState,
    ReportedStates,
    tagged,
)
from ..providers.llm import LLM, LLMError
from ..search.fetcher import Page
from ..search.tavily import TimeWindow, source_url_key
from .chart_research import Finder
from .location_map import PLACES, STATE_BY_NAME, _folded
from .seat_chart import (
    UNFINISHED_WORDS,
    _party_key,
    _verified_chart,
    complete_chart,
    is_election_claim,
    is_verified_total,
)

logger = logging.getLogger(__name__)

US_WORDS = re.compile(r"(?<!\w)(us|u\.s\.|usa|united states|american?|mỹ|hoa kỳ)(?!\w)", re.IGNORECASE)
ELECTION_WORDS = re.compile(r"\b(elections?|elected|won|win|wins|carried|midterms?|bầu cử|tuyển cử|thắng)\b", re.IGNORECASE)
MIDTERM_WORDS = re.compile(r"\b(midterms?|giữa k[ỳì])\b", re.IGNORECASE)
BOTH_CHAMBERS = re.compile(r"\b(both (?:houses|chambers)|(?:cả )?(?:hai|2) viện)\b", re.IGNORECASE)
CONTROL_WORDS = re.compile(r"\b(control|majorit(?:y|ies)|won|wins|swept|kiểm soát|chiếm ưu thế|đa số|thắng)\b", re.IGNORECASE)
FUTURE_WORDS = re.compile(r"\b(will|sẽ)\b", re.IGNORECASE)
OFFICE_WORDS = {
    "president": re.compile(r"(?<!\w)(president|presidential|presidency|electoral|tổng thống)(?!\w)", re.IGNORECASE),
    "house": re.compile(r"(?<!\w)(house|hạ viện|congress|quốc hội)(?!\w)", re.IGNORECASE),
    "senate": re.compile(r"(?<!\w)(senate|thượng viện|congress|quốc hội)(?!\w)", re.IGNORECASE),
}
NOT_US_WORDS = re.compile(r"(?<!\w)(parliament|lok sabha|commons|bundestag|quốc hội)(?!\w)", re.IGNORECASE)
OFFICE_QUERY = {"president": "presidential", "house": "House of Representatives", "senate": "Senate"}


def is_us_election_claim(text: str, office: str, year: int | None = None, *, topic: str | None = None) -> bool:
    """Check the claim's wording, using its topic to disambiguate the country for midterm results."""
    if office not in OFFICE_WORDS or not ELECTION_WORDS.search(text):
        return False
    # "Biden won the 2020 election" names no office or country, but the model's reading of it fits a presidential year.
    if office == "president" and year and year % 4 == 0 and re.search(r"(?<!\w)(election|bầu cử)(?!\w)", text, re.IGNORECASE):
        if not NOT_US_WORDS.search(text):
            return True
    names_office = OFFICE_WORDS[office].search(text)
    names_us = US_WORDS.search(text)
    if names_office and (names_us or any(_names_state(name, text) for name in PLACES["us_states"].values())):
        return True
    # A midterm result may refer to "both chambers" and name the US only in the extracted topic.
    return bool(
        office in ("house", "senate")
        and (names_office or BOTH_CHAMBERS.search(text))
        and CONTROL_WORDS.search(text)
        and not (UNFINISHED_WORDS.search(text) or FUTURE_WORDS.search(text))
        and (names_us or (MIDTERM_WORDS.search(text) and US_WORDS.search(topic or "")))
    )


def _names_state(name: str, text: str) -> bool:
    """Whole words only: Arkansas is not Kansas, and West Virginia is not Virginia."""
    before = r"(?<!\w)(?<!west )" if name.lower() == "virginia" else r"(?<!\w)"
    return bool(re.search(rf"{before}{re.escape(name)}(?!\w)", text, re.IGNORECASE))


def election_focus(item: ExtractedClaim) -> tuple[str, ...]:
    """States named in the claim can be mapped without nationwide results."""
    return tuple(code for code, name in PLACES["us_states"].items() if _names_state(name, item.text))


def is_verified_state(report: ReportedState, source_text: str) -> bool:
    """A model read this result, so it only counts if the source's own words show it. Anything doubtful is dropped."""
    key = _party_key(report.winner)
    quote = report.quote
    if not key or _folded(report.state) not in STATE_BY_NAME or not quote or not quote_in_text(quote, source_text):
        return False
    if UNFINISHED_WORDS.search(quote) or not _names_state(report.state.strip(), quote) or key not in _folded(quote):
        return False
    return not report.detail or report.detail.lower() in quote.lower()


# Results pages write "Donald J. Trump wins Ohio 17 electoral votes". A model reading dozens of them can miss one.
STATE_WIN = re.compile(
    r"([A-Z][\w.'’-]*(?:\s+[A-Z][\w.'’-]*){0,3})\s+wins\s+("
    + "|".join(sorted((re.escape(name) for name in PLACES["us_states"].values()), key=len, reverse=True))
    + r")\s+(\d+\s+electoral\s+votes?)"
)


def states_written_as_results(labels: dict[str, Source | Page]) -> list[ReportedState]:
    """Results a page states in a fixed form, read by code. They go through the same checks as a model's."""
    found = []
    for label, source in labels.items():
        text = " ".join(source.text.split())
        for match in STATE_WIN.finditer(text):
            found.append(ReportedState(
                evidence_id=label, state=match.group(2), winner=match.group(1), detail=match.group(3), quote=match.group(0),
            ))
    return found


def _stated_party(report: ReportedState, source_text: str) -> str | None:
    """Only colors the map, but the model must not bring it from memory, so the source has to use the word."""
    word = {"republican": "republican", "democratic": "democrat"}.get(report.party or "")
    return report.party if word and word in source_text.lower() else None


def _map_from(
    request: ElectionMapRequest, states: list[dict], settings: Settings, focus: tuple[str, ...],
) -> dict | None:
    covered = {state["code"] for state in states}
    if not covered or (focus and not covered.issuperset(focus)):
        return None
    if request.office == "president" and not focus and len(states) < settings.election_map_min_states:
        return None
    return {"office": request.office, "year": request.year, "retrievedAt": utcnow().isoformat(), "states": states}


def _wants(item: ExtractedClaim) -> tuple[bool, bool]:
    seats, election = item.seat_chart, item.election_map
    return (
        seats is not None and is_election_claim(item.text, seats.body),
        election is not None and bool(election.year)
        and is_us_election_claim(item.text, election.office, election.year, topic=item.topic),
    )


def build_election_visuals(
    item: ExtractedClaim,
    evidence: list[Evidence],
    llm: LLM,
    settings: Settings,
    tasks: TaskLog = NO_TASKS,
    finder: Finder | None = None,
) -> tuple[dict | None, dict | None]:
    """A claim's parliament chart and US election map, from their own sources where research is available."""
    wants_seats, wants_map = _wants(item)
    if not wants_seats and not wants_map:
        if item.seat_chart or item.election_map:
            tasks.chart_skipped("election")
        return None, None
    # Without a research model, only the claim's own sources can be read.
    def own_sources(_: str, number: int, __: TaskLog) -> list[Source]:
        return [entry.source for entry in evidence] if number == 1 else []

    focus = election_focus(item) if wants_map else ()
    initial = [entry.source for entry in evidence] if focus and finder else []
    return _research_visuals(item, llm, settings, tasks, finder or own_sources, wants_seats, wants_map, focus, initial)


def _needs(
    item: ExtractedClaim, wants_seats: bool, wants_map: bool, seat_chart: dict | None, states: list[dict],
    focus: tuple[str, ...],
) -> str:
    """What the chart still lacks, in words for the research model. Empty when it is complete."""
    lines = []
    if wants_map:
        office = item.election_map.office
        covered = {state["code"] for state in states}
        if office != "president":
            covered.add("us-dc")
        missing = [PLACES["us_states"][code] for code in (focus or PLACES["us_states"]) if code not in covered]
        if missing:
            qualifier = " where a Senate race took place" if office == "senate" else ""
            lines.append(f"Who won these US states{qualifier}: {', '.join(missing)}.")
    if wants_seats:
        body = item.seat_chart.body
        if seat_chart is None:
            lines.append(f"Final seats for every party in {body}, and the chamber's size.")
        else:
            listed = sum(party["seats"] for party in seat_chart["parties"])
            if listed < seat_chart["total"]:
                named = ", ".join(party["name"] for party in seat_chart["parties"])
                unaccounted = seat_chart["total"] - listed
                lines.append(f"Final seats in {body} for parties other than {named}. {unaccounted} seats are unaccounted for.")
    return " ".join(lines)


def _research_visuals(
    item: ExtractedClaim,
    llm: LLM,
    settings: Settings,
    tasks: TaskLog,
    finder: Finder,
    wants_seats: bool,
    wants_map: bool,
    focus: tuple[str, ...],
    initial: list[Source],
) -> tuple[dict | None, dict | None]:
    """Searches for what the chart lacks, reads it, and repeats until it is complete, nothing new is found, or rounds run out."""
    election = item.election_map
    if wants_map and wants_seats:
        system, schema, task_name = ELECTION_RESULTS_SYSTEM, ReportedElection, "reading_election"
    elif wants_map:
        system, schema, task_name = ELECTION_MAP_SYSTEM, ReportedStates, "reading_states"
    else:
        system, schema, task_name = SEAT_CHART_SYSTEM, ReportedSeats, "reading_seats"
    year = (election and election.year) or item.seat_chart.year
    office = f"US {OFFICE_QUERY[election.office]}" if wants_map else item.seat_chart.body
    labels: dict[str, Source | Page] = {}
    merged = ReportedElection()
    seat_chart, states, task = None, [], None
    needs = _needs(item, wants_seats, wants_map, None, [], focus)

    for number in range(0 if initial else 1, settings.chart_research_rounds + 1):
        pages = initial if number == 0 else finder(
            f"Election: {year or ''} {office}\nThe chart still needs: {needs}", number, tasks,
        )
        known = {source_url_key(source.url) for source in labels.values()}
        new = list({source_url_key(page.url): page for page in pages if source_url_key(page.url) not in known}.values())
        if not new:
            break
        fresh = {f"E{len(labels) + index + 1}": source for index, source in enumerate(new)}
        labels |= fresh
        prompt = "\n\n".join(
            [tagged("input", item.text, type="claim"), f"Election: {year or ''} {office}", f"The chart still needs: {needs}"]
            + [
                tagged(
                    "passage",
                    page_for_reading(source.text, f"{item.text} {office} {needs}", settings.chart_research_max_chars_per_source),
                    evidence_id=label,
                    published=source.published_at or "unknown",
                )
                for label, source in fresh.items()
            ]
        )
        task = tasks.model(f"chart-read-{number}", task_name, settings.research_model, settings)
        try:
            answer, model = llm.complete(settings.research_model, system, prompt, schema)
        except LLMError as error:
            logger.warning("Election results failed: %s", error)
            task.fail(error.public_message)
            break
        task.finish_model(model, settings)
        merged.states += getattr(answer, "states", [])
        merged.parties += getattr(answer, "parties", [])
        total = getattr(answer, "total", None)
        source = labels.get(total.evidence_id) if total else None
        if merged.total is None and source is not None and is_verified_total(total, source.text):
            merged.total = total

        if wants_map and election.office == "president":
            merged.states += states_written_as_results(fresh)
        seat_chart = _verified_chart(item.seat_chart, merged, labels) if wants_seats else None
        states = _verified_states(merged, labels) if wants_map else []
        if wants_map and election.office != "president":
            states = [state for state in states if state["code"] != "us-dc"]
        needs = _needs(item, wants_seats, wants_map, seat_chart, states, focus)
        task.update(stateCount=len(states)) if wants_map else None
        # A round that found nothing still leaves the next one to look elsewhere, until `new` above runs dry.
        if not needs:
            break

    election_map = _map_from(election, states, settings, focus) if wants_map else None
    seat_chart = complete_chart(seat_chart, settings)
    if task and ((wants_map and not election_map) or (wants_seats and not seat_chart)):
        task.update(summary=CHART_INCOMPLETE)
    return seat_chart, election_map


def _verified_states(answer: ReportedStates, labels: dict[str, Page | Source]) -> list[dict]:
    """When sources disagree about a state, the commonest winner is drawn and the others stay on screen."""
    reports: dict[str, list[tuple[ReportedState, Page | Source]]] = {}
    for report in answer.states:
        source = labels.get(report.evidence_id)
        if source is not None and is_verified_state(report, source.text):
            found = reports.setdefault(STATE_BY_NAME[_folded(report.state)], [])
            if all(earlier is not source for _, earlier in found):  # One article gives one result for a state.
                found.append((report, source))
    states = []
    for code, found in reports.items():
        counts = Counter(_party_key(report.winner) for report, _ in found)
        best, source = max(found, key=lambda pair: (counts[_party_key(pair[0].winner)], pair[1].published_at or ""))
        others = {}
        for report, other in found:
            if _party_key(report.winner) != _party_key(best.winner):
                others.setdefault(_party_key(report.winner), {
                    "winner": report.winner, "publisher": other.publisher or other.title, "url": other.url,
                })
        states.append({
            "code": code,
            "name": PLACES["us_states"][code],
            "winner": best.winner,
            "party": _stated_party(best, source.text),
            "detail": best.detail,
            "publisher": source.publisher or source.title,
            "url": source.url,
            "others": list(others.values()),
        })
    return sorted(states, key=lambda state: state["name"])


# ---------------------------------------------------------------------------------------------------------------------
# When reports of an election appear, for searching and for ruling pages out.
# ---------------------------------------------------------------------------------------------------------------------

def _us_election_day(year: int) -> date:
    """The Tuesday after the first Monday in November."""
    first = date(year, 11, 1)
    first_monday = first + timedelta(days=(7 - first.weekday()) % 7)
    return first_monday + timedelta(days=1)


def election_window(year: int | None, us: bool = False, today: date | None = None) -> TimeWindow | None:
    """Reports of an election's result: from election day where we know it, into the next year for late counts.

    Earlier pages can only be campaign coverage, and much later ones are mostly about later elections.
    """
    if not year:
        return None
    today = today or utcnow().date()
    start = _us_election_day(year).isoformat() if us and year % 2 == 0 else f"{year}-01-01"
    end = f"{year + 1}-06-30"
    return TimeWindow(start, end if end < today.isoformat() else None)
