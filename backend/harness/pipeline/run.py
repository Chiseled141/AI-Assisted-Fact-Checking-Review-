"""The check pipeline: extract claims, retrieve evidence, then judge."""

import logging
import re
from collections.abc import Callable
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, as_completed, wait
from dataclasses import dataclass, replace
from functools import partial
from queue import SimpleQueue
from typing import TypeVar

from sqlalchemy.orm import Session, sessionmaker

from config.labels import InputCategory
from config.settings import Settings
from database.models import Check, Claim, Evidence, Source, User, Verdict, utcnow

from ..charts.bar_chart import build_bar_chart
from ..charts.chart_research import make_chart_finder
from ..charts.chart_triggers import add_chart_requests
from ..charts.country_map import build_country_map, build_population_pyramid
from ..charts.data_sources import CountryData, MarketData, StateData
from ..charts.election_map import build_election_visuals, election_focus, election_window
from ..charts.incident_map import build_incident_map, is_incident_claim
from ..charts.location_map import build_location_map, build_map_details
from ..charts.match_result import build_match_result
from ..charts.pie_chart import build_pie_chart
from ..charts.price_chart import build_price_chart, build_sjc_chart, price_table
from ..charts.route_map import build_route_map
from ..providers.llm import LLM, LLMError
from ..search.fetcher import FetchError, Page
from ..search.social import account_for_claim, read_x_post, x_post_id
from ..search.tavily import (
    PUBLIC_PROFILE_DOMAINS,
    VIETNAMESE_SEARCH_DOMAINS,
    Search,
    SearchError,
    SearchHit,
    TimeWindow,
    apple_vietnam_price_page,
    data_table_domains,
    election_sources,
    is_allowed_source,
    is_discovery_source,
    is_vietnamese_source,
    manufacturer_price_domains,
    norway_car_registration_excerpt,
    norway_car_registration_page,
    norway_car_registration_period,
    norway_car_registration_query,
    page_date,
    read_hit,
    source_domain,
    source_url_key,
    sport_organizers,
    worldwide_box_office_page,
    worldwide_box_office_year,
)
from .passages import quote_in_text, source_passages, top_passages
from .people import names_person, person_query, wants_public_profile
from .progress import NO_READABLE_SOURCE, NO_TASKS, ONLY_OLDER_PAGES, TaskLog, closed_tasks
from .prompts import (
    CONTEXT_NOTE_SYSTEM,
    EXTERNAL_RESEARCH_SYSTEM,
    EXTRACT_SYSTEM,
    JUDGE_SYSTEM,
    QUESTION_SYSTEM,
    ContextNote,
    ExtractedClaim,
    ExtractedClaims,
    JudgeAnswer,
    MapChoice,
    tagged,
)
from .research import Research, research_sources
from .review import answered_claims, ask_questions, needs_choice, saved_review

logger = logging.getLogger(__name__)

SEARCH_FAILED = "Evidence could not be retrieved, so there is no verdict."
JUDGES_FAILED = "The AI judges could not assess this claim, so there is no verdict."
NO_EVIDENCE = "No relevant source was found for this claim, so it cannot be verified."
# Used when a source about the person the claim names was found, but none addresses the claim itself.
NO_CLAIM_SOURCE = "No source directly addresses this claim. The sources below are about the person it names."
PERSON_SOURCE_LIMIT = 2
DATA_ID ="D1"  # The claim's own price data, which judges may cite beside the passages.
STOPPED = "You stopped this check."
FINISHED = ("completed", "failed", "stopped")

# Checks the reader has asked to stop. Checks run inside this process, so a set is enough, like the rate limits.
stop_requests: set[str] = set()

VisualResult = TypeVar("VisualResult")


class CheckStopped(Exception):
    pass


def _stop_if_asked(check: Check) -> None:
    """Called each time the check saves, so it ends at its next step without paying for the ones after it."""
    if check.id in stop_requests:
        raise CheckStopped


@dataclass
class Providers:
    llm: LLM
    search: Search
    fetch: Callable[[str], Page]
    market: MarketData | None = None
    country_data: CountryData | None = None
    state_data: StateData | None = None


def _input_text(check: Check, providers: Providers) -> tuple[str, Page | None]:
    if check.input_type == "url":
        page = providers.fetch(check.input_url or "")
        return page.text, page
    parts = [check.input_text or ""] + [file["text"] for file in check.files or []]
    return "\n\n".join(part for part in parts if part.strip()), None


def _today() -> str:
    """Models don't know today's date, and they need it to tell old news from current facts."""
    return f"Today's date: {utcnow().date().isoformat()}"


def _election_key(item: ExtractedClaim) -> tuple | None:
    if not item.election_map or not item.election_map.year:
        return None
    chamber = item.seat_chart.body if item.seat_chart else None
    return item.election_map.office, item.election_map.year, election_focus(item), chamber


def _map_options(item: ExtractedClaim) -> list[MapChoice]:
    return [
        name for name, available in (
            ("location", item.map_places), ("incident", is_incident_claim(item.text)),
            ("route", item.route_map), ("country", item.country_stat), ("election", item.election_map),
        ) if available
    ]


def _election_search_window(item: ExtractedClaim) -> TimeWindow | None:
    """When reports of a claim's election can be expected, if it names one."""
    if item.election_map and item.election_map.year:
        return election_window(item.election_map.year, us=True)
    return election_window(item.seat_chart.year) if item.seat_chart else None


def _claim_search_window(item: ExtractedClaim) -> TimeWindow | None:
    if item.event_date and item.event_date <= utcnow().date():
        return TimeWindow(start=item.event_date.isoformat())
    return _election_search_window(item)


def _states_a_period(item: ExtractedClaim) -> bool:
    """A claim naming a year asks about that time, so the newest reports aren't the best ones for it."""
    return bool(re.search(r"(?<!\d)(19|20)\d{2}(?!\d)", f"{item.text} {item.time_context or ''}"))


def _search_query(item: ExtractedClaim, query: str | None = None) -> str:
    """Keep explicit figures in evidence queries, even if the extraction model omitted them."""
    query = query or item.search_query or item.text
    if item.seat_chart:
        query = f"{item.seat_chart.body} {item.seat_chart.year or ''} final election results {query}"
    missing = [number for number in dict.fromkeys(re.findall(r"\b\d+(?:[.,]\d+)*\b", item.text))
               if number not in re.findall(r"\b\d+(?:[.,]\d+)*\b", query)]
    suffix = (" " + " ".join(missing))[:400] if missing else ""
    return (query[:400 - len(suffix)].strip() + suffix).strip()


def _event_query(item: ExtractedClaim, query: str) -> str:
    day = item.event_date.isoformat() if item.event_date else None
    return f"{day} {query}" if day and day not in query else query


def _dates(published_at: str | None) -> list[str]:
    return [_today(), *([f"Article date: {published_at}"] if published_at else [])]


def _extract_claims(
    text: str, article: Page | None, providers: Providers, settings: Settings
) -> tuple[list[ExtractedClaim], str, InputCategory | None]:
    lines = _dates(article.published_at if article else None)
    answer, model = providers.llm.complete(
        settings.extraction_model, EXTRACT_SYSTEM, "\n\n".join([*lines, tagged("input", text)]), ExtractedClaims
    )
    # Checkworthiness ranks factual claims; it is not a truth or eligibility score.
    ranked = sorted(answer.claims, key=lambda claim: claim.checkworthiness, reverse=True)
    claims = [add_chart_requests(item) for item in ranked[: settings.max_claims_per_check]]
    return claims, model, answer.input_category if not ranked else None


def _claims_from_question(
    text: str, providers: Providers, settings: Settings, tasks: TaskLog
) -> tuple[list[ExtractedClaim], InputCategory | None]:
    """A short input with no claims is often a question. The research model writes the claim it asks about, or nothing."""
    task = tasks.model("question", "rephrasing", settings.research_model, settings)
    try:
        answer, model = providers.llm.complete(
            settings.research_model, QUESTION_SYSTEM, "\n\n".join([_today(), tagged("input", text)]), ExtractedClaims
        )
    except LLMError as error:
        task.fail(error.public_message)  # The check still ends as having no claims, which is true.
        return [], None
    claims = answer.claims[: settings.max_claims_per_check]
    category = answer.input_category if not claims else None
    task.finish_model(model, settings, claimCount=len(claims), inputCategory=category)
    return [add_chart_requests(item) for item in claims], category


def _save_progress(check: Check, session: Session, event: dict) -> None:
    """Persist public task status and finished explanations, never a model's private reasoning stream."""
    _stop_if_asked(check)
    events = [dict(item) for item in check.progress or []]
    for item in events:
        if item["id"] == event["id"]:
            item.update(event)
            break
    else:
        events.append(event)
    check.progress = events
    session.commit()


def _run_visuals(
    jobs: list[tuple[int, Callable[[TaskLog], VisualResult]]], tasks: TaskLog, settings: Settings
) -> list[VisualResult]:
    """One job per claim, all at once, with results in the order given.

    Jobs get their own threads because they wait on the shared pool, and doing that from inside it could deadlock.
    They can't touch the database session, so their task updates come back on a queue, and this thread saves them.
    """
    updates: SimpleQueue[dict] = SimpleQueue()
    with ThreadPoolExecutor(settings.max_parallel_calls) as workers:
        futures = [workers.submit(job, TaskLog(updates.put, position)) for position, job in jobs]
        pending = set(futures)
        while pending:
            _, pending = wait(pending, timeout=0.1, return_when=FIRST_COMPLETED)
            while not updates.empty():
                tasks.save(updates.get())
    return [future.result() for future in futures]


def _fetch_visuals(
    item: ExtractedClaim, providers: Providers, settings: Settings, pool: ThreadPoolExecutor, tasks: TaskLog
) -> tuple[dict | None, dict | None, dict | None]:
    """The charts that need no evidence from the claim's own search. One map per claim, so each of these rules out the next."""
    price_chart = build_price_chart(item, providers.market, settings, tasks) or build_sjc_chart(
        item, providers.search, providers.fetch, providers.llm, settings, pool, tasks
    )
    pyramid = build_population_pyramid(item, providers.country_data, settings, tasks)
    country_map = (
        None if pyramid else build_country_map(item, providers.country_data, settings, providers.state_data, tasks)
    )
    return price_chart, country_map, pyramid


def _read_visual_figures(
    item: ExtractedClaim, location_map: dict | None, evidence: list[Evidence], skip_url: str | None, providers: Providers,
    settings: Settings, pool: ThreadPoolExecutor, tasks: TaskLog, *,
    search_model: str | None = None, map_choice: MapChoice | None = None,
) -> tuple[dict | None, list[dict], dict | None, dict | None]:
    """Read the election, incident or location details for the selected map and any seat chart."""
    if map_choice not in (None, "election"):
        item = item.model_copy(update={"election_map": None})
    request = item.election_map or item.seat_chart
    sources = election_sources(
        item.text, item.seat_chart.body if item.seat_chart else "", request.year if request else None,
        item.election_map.office if item.election_map else None,
    )
    finder = make_chart_finder(
        getattr(providers.search, "search_hits", None), getattr(providers.llm, "research", None), providers.fetch, settings, pool,
        _election_search_window(item), skip_url, item.text,
        sources.pages, sources.domains,
        search_model=search_model,
    )
    seat_chart, election_map = build_election_visuals(item, evidence, providers.llm, settings, tasks, finder)
    if election_map or map_choice in ("country", "none") or (seat_chart and map_choice is None):
        return seat_chart, [], election_map, None
    incident = (
        build_incident_map(item.text, evidence, providers.llm, settings, tasks)
        if map_choice in (None, "incident") else None
    )
    details = (
        build_map_details(item.text, location_map, evidence, providers.llm, settings, tasks)
        if location_map and not incident else []
    )
    return seat_chart, details, None, incident


def _read_tabular_chart(
    chart: str, claim: str, evidence: list[Evidence], providers: Providers, settings: Settings, pool: ThreadPoolExecutor,
    tasks: TaskLog, *, skip_url: str | None, search_model: str | None, period: str | None,
    reading_query: str | None, search_query: str,
) -> dict | None:
    builder = build_pie_chart if chart == "pie" else partial(build_bar_chart, period=period)
    result = builder(claim, [entry.source for entry in evidence], providers.llm, settings, tasks, reading_query=reading_query)
    if (result and not result.get("derivedRemainder")) or settings.chart_research_rounds < 1:
        return result

    table_query = "complete distribution table with totals" if chart == "pie" else "comparison data table"
    finder = make_chart_finder(
        getattr(providers.search, "search_hits", None), getattr(providers.llm, "research", None), providers.fetch,
        settings, pool, None, skip_url, claim, domains=data_table_domains(reading_query or claim), search_model=search_model,
        chart=chart, seen_urls=[entry.source.url for entry in evidence], first_query=f"{search_query} {table_query}",
    )
    if finder is None:
        return result
    needs = (
        "One source with the complete distribution, including the denominator and all non-overlapping categories."
        if chart == "pie" else "One table with figures for all the compared entities on the same reporting basis."
    )
    brief = f"The chart still needs: {needs}"
    if period:
        brief += f"\nPeriod measured: {period}"
    if reading_query:
        brief += f"\nSearch terms: {reading_query}"
    pages = finder(brief, 1, tasks)
    return builder(claim, pages, providers.llm, settings, tasks, reading_query=reading_query, retry=True) or result


def _finish_research(task, research: Research, settings: Settings) -> None:
    if research.llm_error:
        task.fail(research.llm_error)
    elif research.hits is None:
        task.fail(research.search_error or NO_READABLE_SOURCE)
    else:
        task.finish_model(
            research.reported_model, settings, sourceCount=len(research.hits), searchCount=research.searches,
            candidateCount=research.candidate_count, pickedCount=research.picked_count,
        )


def _reader_settings(check: Check, settings: Settings) -> Settings:
    """The server's settings with the owner's search limits, saved on the check, applied. `SearchOptions` bounds them."""
    options = check.search_options or {}
    changes: dict = {}
    if sources := options.get("sources_per_claim"):
        changes["target_publishers_per_claim"] = sources
        # Keep the same spare picks as the server's numbers, because some pages turn out unreadable.
        spare = max(0, settings.research_max_picks - settings.target_publishers_per_claim)
        changes["research_max_picks"] = sources + spare
    if searches := options.get("searches_per_claim"):
        changes["research_max_searches_per_claim"] = searches
    if options.get("search_outside_list") is False:
        changes["external_research_max_searches"] = 0
    return settings.model_copy(update=changes) if changes else settings


def _research_brief(item: ExtractedClaim, window: TimeWindow | None) -> str:
    """What the research model should look for. The server applies the period itself, so this only explains it."""
    lines = [_today(), f"Suggested query: {item.search_query or item.text}"]
    if names_person(item.text, item.person_name):
        lines.append(f"Person to identify exactly: {item.person_name}. Reject unrelated namesakes and generic topic pages.")
    if window:
        end = f" to {window.end}" if window.end else ""
        lines.append(f"Reports confirming this event can appear from {window.start}{end}.")
    elif item.time_context:
        lines.append(f"Period the claim refers to: {item.time_context}")
    if item.seat_chart:
        lines.append(f"The chart needs: final seats for every party in {item.seat_chart.body} and the chamber's size.")
    if item.election_map:
        focus = election_focus(item)
        if focus:
            lines.append("An election map could show the final results for the states named in the claim.")
        else:
            lines.append("An election map could show the state-by-state results if a national table is available.")
    if item.pie_chart:
        lines.append(
            "For a pie chart, prefer a complete distribution from one source, or an explicit share of the whole "
            "when the claim is about one category."
        )
    if item.bar_chart:
        lines.append("Look for one source with directly comparable figures for the claim's categories, measure and period.")
    if item.country_stat or item.population_pyramid or item.pie_chart or item.bar_chart:
        lines.append("A data_tables_only search can find statistical releases or a table covering the full comparison.")
    if item.price_asset:
        lines.append(
            "Find prices for the exact asset, unit, market and dates. Distinguish closing, intraday and buy/sell prices."
        )
    if item.route_map:
        lines.append("Look for one source that names the route's stops in order and gives any reported schedule.")
    if item.match_result:
        lines.append("Look for the final score on an official result page, with any available match events or map scores.")
    if options := _map_options(item):
        lines.append(f"Available map options: {', '.join(options)}. You can also choose none.")
    return "\n".join(lines)


def _retrieve(
    claims: list[Claim], skip_url: str | None, providers: Providers, settings: Settings, pool: ThreadPoolExecutor,
    queries: dict[str, str] | None = None, tasks: TaskLog = NO_TASKS, windows: dict[str, TimeWindow] | None = None,
    dated_claims: set[str] | None = None, briefs: dict[str, str] | None = None,
    english_queries: dict[str, str] | None = None,
    people: dict[str, str] | None = None,
    preferred_source_language: str | None = None,
    vietnamese_queries: dict[str, str] | None = None,
    *, search_model: str | None = None, map_choices: dict[str, MapChoice] | None = None,
) -> tuple[dict[str, Page], dict[str, list[str]], set[str]]:
    """Target five readable publishers per claim, within search, page-read and saved-source budgets."""
    pages: dict[str, Page] = {}
    selected: dict[str, list[str]] = {claim.id: [] for claim in claims}
    candidates: dict[str, list[SearchHit]] = {claim.id: [] for claim in claims}
    domains_seen: dict[str, set[str]] = {claim.id: set() for claim in claims}
    had_candidates: set[str] = set()
    identity_rejected: set[str] = set()
    unreadable_people: set[str] = set()
    search_failed: set[str] = set()
    attempted: dict[str, Page | None] = {}
    saved_keys: dict[str, str] = {}
    skip_key = source_url_key(skip_url) if skip_url else None
    target = settings.target_publishers_per_claim
    search_errors: dict[str, str] = {}
    windows = windows or {}
    # A claim about a stated period wants what is relevant to it. Only an undated claim wants the newest reports.
    relevance_first = set(windows) | (dated_claims or set())
    only_older: set[str] = set()
    wrong_table_period: set[str] = set()
    primary_tables = {
        claim.id: (worldwide_box_office_page(year), f"{year} Worldwide Box Office")
        for claim in claims if claim.id not in windows
        and (year := worldwide_box_office_year(f"{claim.text} {claim.time_context or ''}", utcnow().year))
    }
    norway_periods = {
        claim.id: period for claim in claims
        if (period := norway_car_registration_period(f"{claim.text} {claim.time_context or ''}"))
    }
    norway_page = norway_car_registration_page()
    store_pages = {claim.id: url for claim in claims if (url := apple_vietnam_price_page(claim.text))}
    primary_urls = {claim_id: info[0] for claim_id, info in primary_tables.items()} | dict.fromkeys(norway_periods, norway_page)
    primary_urls.update(store_pages)
    later_pages: dict[str, list[tuple[SearchHit, Page]]] = {claim.id: [] for claim in claims}
    searches = {claim.id: 1 for claim in claims}
    finished_searches: set[str] = set()
    search_tasks = {
        claim.id: tasks.for_claim(claim.position).search(
            "search", "searching", phase="searching", searchCount=1, sourceCount=0, sourceTarget=target,
        )
        for claim in claims
    }

    # The research model chooses the sources. Without it, or if it fails, the query goes straight to Tavily.
    search_hits_call = getattr(providers.search, "search_hits", None)
    research_call = getattr(providers.llm, "research", None) if briefs and search_hits_call else None
    discovery_call = getattr(providers.search, "discover_hits", None)
    social_call = getattr(providers.search, "search_x_posts", None)
    social_accounts = {claim.id: handle for claim in claims if (handle := account_for_claim(claim.text))}
    research_tasks = {
        claim.id: tasks.for_claim(claim.position).model(
            "research", "researching", search_model or settings.research_model, settings,
        )
        for claim in claims
    } if research_call else {}
    researched: set[str] = set()
    # Research looked and kept nothing. News rarely covers general knowledge, so reference sites get one search.
    nothing_kept: set[str] = set()
    vietnamese_queries = vietnamese_queries or {}

    def show_reading():
        for claim in claims:
            if claim.id in finished_searches:
                continue
            saved = len(selected[claim.id])
            if saved >= target:  # This claim is done, even while other claims are still reading.
                finished_searches.add(claim.id)
                search_tasks[claim.id].finish(
                    sourceCount=saved, searchCount=searches[claim.id], summary=search_errors.get(claim.id)
                )
            else:
                search_tasks[claim.id].update(phase="reading", searchCount=searches[claim.id], sourceCount=saved)

    def search(claim: Claim, more: bool = False):
        query = person_query((queries or {}).get(claim.id) or claim.text, (people or {}).get(claim.id), claim.text)
        english_query = (english_queries or {}).get(claim.id)
        vietnamese_query = vietnamese_queries.get(claim.id)
        language = "vi" if vietnamese_query else preferred_source_language
        organizers = sport_organizers(claim.text)
        table_domains = data_table_domains(f"{claim.text} {english_query or query}", fallback=False)
        price_domains = manufacturer_price_domains(claim.text)
        research = None
        if research_call and not more:
            brief = briefs[claim.id]
            first_query, first_domains, first_scope = english_query, None, "English"
            if language == "vi":
                first_query, first_domains = vietnamese_query or query, VIETNAMESE_SEARCH_DOMAINS
                first_scope = "Vietnamese-source"
                brief += (
                    "\nPrefer reliable Vietnamese news outlets when equally relevant. "
                    "Keep stronger primary evidence and use other publishers to fill gaps."
                )
                if english_query:
                    brief += f"\nEnglish query for broader coverage: {english_query}"
            elif language == "en":
                brief += "\nPrefer English sources when equally relevant and reliable. Keep stronger evidence in other languages."
            if organizers:
                first_query, first_domains, first_scope = english_query or query, organizers, "official competition source"
            elif price_domains:
                first_query = (vietnamese_query or query) if language == "vi" else (english_query or query)
                first_domains, first_scope = price_domains, "official manufacturer pricing"
                brief += (
                    "\nPrefer the exact market and configuration on the manufacturer's site, "
                    "or the named seller for its own offer."
                )
            elif table_domains:
                first_query = english_query or vietnamese_query or query
                first_domains, first_scope = table_domains, "primary data source"
                brief += (
                    "\nStart with the supplied publisher results. Keep the matching table or release first. "
                    "Broaden the search if it leaves gaps."
                )
                if period := norway_periods.get(claim.id):
                    first_query, first_domains = norway_car_registration_query(period), ["ofv.no", "ssb.no"]
            elif wants_public_profile(claim.text, (people or {}).get(claim.id)):
                first_query = f"{english_query or query} profile interview"
                first_domains, first_scope = PUBLIC_PROFILE_DOMAINS, "public-profile publisher"
                brief += "\nBroaden to other approved local or specialist publishers if these results are incomplete."
            research = research_sources(
                claim.text, brief, search_hits_call, research_call, settings,
                windows.get(claim.id), claim.id not in relevance_first,
                first_query=first_query, first_domains=first_domains, first_scope=first_scope,
                search_model=search_model,
                table_snippets=bool((table_domains or price_domains) and not organizers),
            )
            if research.hits is not None:
                return claim.id, research.hits, None, research
        since = {"newest_first": False} if claim.id in relevance_first else {}
        if window := windows.get(claim.id):
            since["start_date"] = window.start
            if window.end and not more:  # The backfill may reach later reports, which only count if nothing better is found.
                since["end_date"] = window.end
        if more and claim.id in nothing_kept:
            query = english_query or query
            since = {"newest_first": False, "domains": settings.reference_domains}
        elif language == "en" or (more and language == "vi"):
            query = english_query or query
        elif vietnamese_query:
            query = vietnamese_query
        try:
            if more:
                hits = providers.search.search_more(query, sorted(domains_seen[claim.id]), **since)
            else:
                search_hits = getattr(providers.search, "search_hits", None)
                hits = search_hits(query, **since) if search_hits else [SearchHit(url) for url in providers.search.search(query)]
            return claim.id, hits, None, research
        except SearchError as error:
            logger.warning("Search failed: %s", error)
            return claim.id, None, str(error), research

    def add_candidates(results, *, initial: bool = False):
        for claim_id, hits, error, research in results:
            if research:
                _finish_research(research_tasks[claim_id], research, settings)
                if map_choices is not None and research.map_choice is not None:
                    map_choices[claim_id] = research.map_choice
                # When research fails, the search that replaces it counts too.
                searches[claim_id] = research.searches + (research.hits is None)
                # A successful selection/rejection must not be undone by an unreviewed backfill.
                # Generic reference sites cannot replace rejected evidence for a specific data period.
                strict = claim_id in windows or claim_id in norway_periods or (people or {}).get(claim_id)
                if research.hits or (research.hits is not None and research.candidate_count and strict):
                    researched.add(claim_id)
                elif research.hits is not None and research.candidate_count:
                    nothing_kept.add(claim_id)
            if hits is None:
                search_failed.add(claim_id)
                search_errors[claim_id] = error
            accepted = [
                hit for hit in hits or [] if (
                    is_allowed_source(hit.url) or (hit.reviewed_external and is_discovery_source(hit.url))
                    or (hit.x_handle and hit.x_handle == social_accounts.get(claim_id) and x_post_id(hit.url, hit.x_handle))
                )
                and source_url_key(hit.url) != skip_key
            ]
            language = "vi" if claim_id in vietnamese_queries else preferred_source_language
            if language and (not research or research.hits is None):
                accepted.sort(key=lambda hit: is_vietnamese_source(hit.url) != (language == "vi"))
            if initial and (url := primary_urls.get(claim_id)):
                key = source_url_key(url)
                if key != skip_key:
                    hit = next((hit for hit in accepted if source_url_key(hit.url) == key), SearchHit(url))
                    accepted = [hit, *(other for other in accepted if source_url_key(other.url) != key)]
            for hit in accepted:
                candidates[claim_id].append(hit)
                domains_seen[claim_id].add(source_domain(hit.url))
                had_candidates.add(claim_id)

    def fetch(hit: SearchHit):
        if hit.x_handle:
            return read_x_post(hit.url, hit.x_handle, settings)
        # An unfamiliar publisher must have a readable live page. Search snippets and cached text cannot vet it.
        return read_hit(replace(hit, raw_content=None) if hit.reviewed_external else hit, providers.fetch, settings)

    def keep(claim_id: str, hit: SearchHit, page: Page | None, allow_later: bool = False):
        verified_post = page and hit.x_handle and hit.x_handle == social_accounts.get(claim_id) and page.url == hit.url
        allowed = page and (
            is_discovery_source(page.url) and source_url_key(page.url) == source_url_key(hit.url)
            if hit.reviewed_external else is_allowed_source(page.url)
        )
        if not (allowed or verified_post) or source_url_key(page.url) == skip_key:
            if (people or {}).get(claim_id):
                unreadable_people.add(claim_id)
            return
        if not verified_post and len(page.text.split()) < settings.min_source_words:
            if (people or {}).get(claim_id):
                unreadable_people.add(claim_id)
            return
        if (primary := primary_tables.get(claim_id)) and source_url_key(hit.url) == source_url_key(primary[0]):
            if primary[1].casefold() not in f"{page.title}\n{page.text}".casefold() or not re.search(r"\|\s*1\s*\|", page.text):
                return  # Reject the wrong year and pages without readable ranking rows.
            if page.published_at and page.published_at[:4] < primary[1][:4]:
                page = replace(page, published_at=None)  # A date before the ranking year belongs to the site, not the table.
        if (period := norway_periods.get(claim_id)) and source_url_key(page.url) == source_url_key(norway_page):
            if not norway_car_registration_excerpt(page.text, period):
                wrong_table_period.add(claim_id)
                return
        if (store := store_pages.get(claim_id)) and source_url_key(hit.url) == source_url_key(store):
            if source_url_key(page.url) != source_url_key(store) or not re.search(r"(?mi)^\d+\s*GB\b[^\n]+\d\s*[₫đ]", page.text):
                return
        person = (people or {}).get(claim_id)
        if person and not verified_post and not names_person(page.text, person):
            identity_rejected.add(claim_id)
            return  # A general article about the topic cannot establish a fact about this person.
        window, date = windows.get(claim_id), page_date(page.url, page.published_at)
        if window and date:
            if date < window.start:
                only_older.add(claim_id)
                return
            if window.end and date > window.end and not allow_later:
                later_pages[claim_id].append((hit, page))
                return
        publisher = source_domain(page.url)
        if any(source_domain(pages[url].url) == publisher for url in selected[claim_id]):
            return
        key = source_url_key(page.url)
        original = saved_keys.get(key)
        if original is None:
            if len(pages) >= settings.max_sources_per_check:
                return
            original = hit.url
            pages[original] = page
            saved_keys[key] = original
        selected[claim_id].append(original)

    def read_candidates():
        # Round-robin reads let every claim receive candidates before the check's global budget runs out.
        while True:
            batch: dict[str, tuple[SearchHit, list[str]]] = {}
            for claim in claims:
                if len(selected[claim.id]) >= settings.target_publishers_per_claim:
                    continue
                while candidates[claim.id]:
                    hit = candidates[claim.id].pop(0)
                    if any(source_domain(pages[url].url) == source_domain(hit.url) for url in selected[claim.id]):
                        continue
                    key = source_url_key(hit.url)
                    if key in attempted:
                        keep(claim.id, hit, attempted[key])
                        if len(selected[claim.id]) >= settings.target_publishers_per_claim:
                            break
                        continue
                    if key in batch:
                        batch[key][1].append(claim.id)
                        break
                    if len(attempted) + len(batch) >= settings.max_page_reads_per_check:
                        break
                    if len(pages) >= settings.max_sources_per_check:
                        break
                    batch[key] = (hit, [])
                    batch[key][1].append(claim.id)
                    break
            if not batch:
                return
            fetched = pool.map(fetch, [hit for hit, _ in batch.values()])
            for (key, (hit, owners)), page in zip(batch.items(), fetched, strict=True):
                attempted[key] = page
                for claim_id in owners:
                    keep(claim_id, hit, page)
            show_reading()

    add_candidates(pool.map(search, claims), initial=True)
    show_reading()
    read_candidates()
    # One bounded backfill query by default, excluding publishers that already occupied the result set.
    if callable(getattr(providers.search, "search_more", None)):
        for _ in range(1, settings.tavily_max_searches_per_claim):
            short = [
                claim for claim in claims
                if len(selected[claim.id]) < settings.target_publishers_per_claim
                and (claim.id not in researched or (claim.id in only_older and not selected[claim.id]))
            ]
            if not short or len(pages) >= settings.max_sources_per_check or len(attempted) >= settings.max_page_reads_per_check:
                break
            for claim in short:
                searches[claim.id] += 1
                search_tasks[claim.id].update(phase="searching", searchCount=searches[claim.id])
            add_candidates(pool.map(lambda claim: search(claim, more=True), short))
            show_reading()
            read_candidates()
    # Later reports only fill the places that reports from the period itself left empty, the closest to it first.
    for claim_id, later in later_pages.items():
        for hit, page in sorted(later, key=lambda pair: page_date(pair[1].url, pair[1].published_at) or ""):
            if len(selected[claim_id]) < settings.target_publishers_per_claim:
                keep(claim_id, hit, page, allow_later=True)

    if research_call and callable(discovery_call) and settings.external_research_max_searches:
        missing = [claim for claim in claims if not selected[claim.id]]
        if missing and len(pages) < settings.max_sources_per_check and len(attempted) < settings.max_page_reads_per_check:
            def discover(claim: Claim):
                query = (english_queries or {}).get(claim.id) or (queries or {}).get(claim.id) or claim.text
                return research_sources(
                    claim.text, briefs[claim.id], discovery_call, research_call, settings,
                    windows.get(claim.id), newest_first=False, system=EXTERNAL_RESEARCH_SYSTEM,
                    max_searches=settings.external_research_max_searches, max_picks=target,
                    first_query=person_query(query, (people or {}).get(claim.id), claim.text),
                    first_scope="outside the approved list", search_model=search_model, external=True,
                )

            discovery_tasks = [
                tasks.for_claim(claim.position).model(
                    "research-outside", "researching", search_model or settings.research_model, settings,
                )
                for claim in missing
            ]
            for claim, task, found in zip(missing, discovery_tasks, pool.map(discover, missing), strict=True):
                _finish_research(task, found, settings)
                searches[claim.id] += found.searches
                researched.add(claim.id)
                add_candidates([(claim.id, found.hits or [], None, None)])
            read_candidates()

    if (callable(social_call) and len(pages) < settings.max_sources_per_check
            and len(attempted) < settings.max_page_reads_per_check):
        def search_social(claim: Claim):
            query = (english_queries or {}).get(claim.id) or (queries or {}).get(claim.id) or claim.text
            options = {"start_date": windows[claim.id].start} if claim.id in windows else {}
            try:
                return claim.id, social_call(query, social_accounts[claim.id], max_results=10, **options), None, None
            except SearchError as error:
                return claim.id, None, str(error), None

        social_claims = [claim for claim in claims if claim.id in social_accounts and not selected[claim.id]]
        for claim in social_claims:
            searches[claim.id] += 1
        add_candidates(pool.map(search_social, social_claims))
        read_candidates()

    show_reading()
    # Preserve the researcher's evidence order. Only unreviewed current results use publication dates.
    for claim_id, urls in selected.items():
        if claim_id not in relevance_first and claim_id not in researched and claim_id not in primary_urls:
            urls.sort(key=lambda url: pages[url].published_at or "", reverse=True)
    failed = {claim.id for claim in claims if not selected[claim.id]
              and (claim.id in search_failed or (claim.id in had_candidates and claim.id not in only_older | wrong_table_period
                   and (claim.id not in identity_rejected or claim.id in unreadable_people)))}
    for claim in claims:
        if claim.id in finished_searches:
            continue
        task, saved = search_tasks[claim.id], len(selected[claim.id])
        if claim.id in failed:
            task.fail(search_errors.get(claim.id, NO_READABLE_SOURCE), sourceCount=saved, searchCount=searches[claim.id])
        else:
            # A later search can fail after an earlier one found sources, so the failure stays on screen.
            older = ONLY_OLDER_PAGES if not saved and claim.id in only_older else None
            task.finish(sourceCount=saved, searchCount=searches[claim.id], summary=search_errors.get(claim.id) or older)
    return pages, selected, failed


def _distinct_titles(pages: dict[str, Page]) -> dict[str, str]:
    """A site can give many pages one title, such as a weather service's reports, so the pages' own words tell them apart."""
    titles = {url: page.title for url, page in pages.items()}
    lines = {url: [line.strip() for line in page.text.splitlines() if line.strip()] for url, page in pages.items()}
    for url, title in titles.copy().items():
        others = {line for other, page in pages.items() if other != url and page.title == title for line in lines[other]}
        if others:
            line = next((line for line in lines[url] if line not in others and len(line) <= 80), None)
            titles[url] = f"{title}: {line}" if line else title
    return titles


def _figures(text: str) -> set[str]:
    return set(re.findall(r"\d+", re.sub(r"(?<=\d)[.,](?=\d)", "", text)))


_MONTHS = "january february march april may june july august september october november december".split()


def _months(text: str) -> set[str]:
    """Months a translation writes as words, as numbers, so "tháng 11/2020" and "November 2020" hold the same figures."""
    return {str(number) for number, month in enumerate(_MONTHS, start=1) if re.search(rf"\b{month}\b", text, re.IGNORECASE)}


def _translations(original: str, **versions: str | None) -> dict[str, str]:
    """A model's own translations. One that loses a figure of the original is dropped, and the reader gets the original."""
    wanted = _figures(original)
    return {
        language: text.strip()
        for language, text in versions.items()
        if text and text.strip() and wanted <= _figures(text) | _months(text)
    }


def _person_sources(check: Check, person: str, providers: Providers, settings: Settings) -> list[Source]:
    """Pages about the named person, for a claim that no source addresses. They are context only and never decide the verdict."""
    search_hits = getattr(providers.search, "search_hits", None)
    if search_hits is None:
        return []
    try:
        hits = search_hits(f'"{person}"', discover=True, newest_first=False, max_results=8, include_images=False)
    except SearchError as error:
        logger.warning("Person search failed for %s: %s", person, error)
        return []
    sources: list[Source] = []
    for hit in hits:
        if len(sources) >= PERSON_SOURCE_LIMIT:
            break
        # Discovery keeps unrated publishers out of verdicts but lets them show as context; the page must name the person.
        if not is_discovery_source(hit.url) or not names_person(f"{hit.title or ''} {hit.snippet or ''}", person):
            continue
        page = read_hit(hit, providers.fetch, settings)
        if page is None or not names_person(page.text, person):
            continue
        sources.append(Source(
            check_id=check.id,
            url=page.url,
            title=page.title or hit.title or page.url,
            publisher=page.publisher,
            published_at=page.published_at,
            image_url=page.image_url,
            text=page.text,
        ))
    return sources


def _context_note(
    claim_text: str, person: str, sources: list[Source], check: Check, providers: Providers, settings: Settings,
) -> ContextNote | None:
    """A short note on what the person's sources say, for a claim none of them addresses. None keeps the plain text."""
    passages = [
        tagged("source", f"{source.title} ({source.publisher or 'unknown publisher'}, {source.published_at or 'undated'})\n"
                         f"{top_passages(source.text, person, 2)[:800]}")
        for source in sources
    ]
    user = "\n\n".join([tagged("claim", claim_text), f"Person named in the claim: {person}", *passages])
    try:
        note, _ = providers.llm.complete(check.search_model or settings.research_model, CONTEXT_NOTE_SYSTEM, user, ContextNote)
    except LLMError as error:
        logger.warning("Context note failed: %s", error)
        return None
    return note if note.en.strip() else None


def _judge_claim(
    claim: Claim,
    evidence: list[Evidence],
    check: Check,
    providers: Providers,
    settings: Settings,
    pool: ThreadPoolExecutor,
    tasks: TaskLog = NO_TASKS,
    reading_query: str | None = None,
) -> Verdict | None:
    """Both judges read the same passages. Returns None when neither gives a valid answer."""
    labels = {f"E{index + 1}": item for index, item in enumerate(evidence)}
    passages = {
        label: source_passages(
            item.source.text, item.source.url, claim.text, reading_query or claim.text, settings.passages_per_source,
        )
        for label, item in labels.items()
    }
    match = claim.match_result
    match_label = next((label for label, item in labels.items() if match and item.source.url == match["url"]), None)
    match_context = []
    if match and match_label:
        passages[match_label] = f"{match['quote']}\n\n{passages[match_label]}"
        details = ", ".join(match[key] for key in ("competition", "stage", "dateLabel") if match.get(key))
        scores = " – ".join(f"{team} {score}" for team, score in zip(match["teams"], match["scores"], strict=True))
        shootout = f"\nSeparate shootout, same team order: {match['shootout']}" if match.get("shootout") else ""
        match_context.append(tagged("match_result", f"Final score: {scores}\n{details}{shootout}", evidence_id=match_label))
    prices = price_table(claim.price_chart)
    data = [tagged("data", prices, evidence_id=DATA_ID, kind="prices")] if prices else []
    prompt = "\n\n".join(
        [_today(), tagged("input", claim.text, type="claim")]
        + ([f"Period the claim refers to: {claim.time_context}"] if claim.time_context else [])
        + [
            tagged(
                "passage",
                passages[label],
                evidence_id=label,
                title=item.source.title.replace('"', "'"),
                publisher=(item.source.publisher or "unknown").replace('"', "'"),
                published=item.source.published_at or "unknown",
                retrieved=item.source.retrieved_at.date().isoformat() if item.source.retrieved_at else "unknown",
            )
            for label, item in labels.items()
        ]
        + match_context
        + data
    )
    citable = {**passages, **({DATA_ID: prices} if prices else {})}

    def check_answer(answer: JudgeAnswer) -> None:
        unknown = [citation.evidence_id for citation in answer.citations if citation.evidence_id not in citable]
        if unknown:
            raise ValueError(f"Unknown evidence ids: {unknown}. Use only: {', '.join(citable)}")
        by_id = {citation.evidence_id: citation for citation in answer.citations}
        if missing := passages.keys() - by_id.keys():
            raise ValueError(f"Missing source entries: {', '.join(sorted(missing))}. Include every numbered passage.")
        if len(by_id) != len(answer.citations):
            raise ValueError("Give exactly one citation per evidence id.")
        invalid = [
            key for key, citation in by_id.items()
            if not quote_in_text(citation.quote, citable[key])
            or (key in labels and not quote_in_text(citation.quote, labels[key].source.text))
        ]
        if invalid:
            raise ValueError(f"Quotes for {', '.join(invalid)} must be exact copies of their supplied passages.")
        decisive = {"supported": "supporting", "contradicted": "contradicting"}.get(answer.verdict)
        if decisive and not any(c.relation == decisive and c.freshness != "outdated" for c in by_id.values()):
            raise ValueError("The verdict needs a matching citation that applies to the claim's period.")
        if answer.verdict == "outdated" and not any(c.relation != "contextual" for c in by_id.values()):
            raise ValueError("The outdated verdict needs evidence of the change.")

    def ask(judge_id: str):
        option = settings.judges[judge_id]
        try:
            answer, model = providers.llm.complete(option.model, JUDGE_SYSTEM, prompt, JudgeAnswer, check_answer)
            return option, answer, model, None
        except LLMError as error:
            logger.warning("Judge %s failed: %s", judge_id, error)
            return option, None, "", error.public_message

    claim_tasks = tasks.for_claim(claim.position)
    futures = {}
    for index, judge_id in enumerate(check.judge_ids):
        task = claim_tasks.model(f"judge-{judge_id}", "judging", settings.judges[judge_id].model, settings)
        futures[pool.submit(ask, judge_id)] = (index, task)

    ordered = {}
    for future in as_completed(futures):
        index, task = futures[future]
        option, answer, reported_model, error = future.result()
        # A saved verdict always names a model. If the provider didn't report one, that is the one we asked for.
        ordered[index] = (option, answer, reported_model or option.model)
        if answer:
            task.finish_model(
                reported_model, settings, summary=answer.review, verdict=answer.verdict,
                translations=_translations(answer.review, en=answer.review_en, vi=answer.review_vi),
            )
        else:
            task.fail(error)
    # Finishing first never changes which selected judge supplies the headline.
    results = [ordered[index] for index in range(len(check.judge_ids))]
    answered = [result for result in results if result[1] is not None]
    if not answered:
        return None

    # The first judge that answered is shown as the claim's verdict. Disagreement is kept, never voted away.
    option, primary, model = answered[0]
    citations_by_judge = {}
    for judge_index, (_, answer, _) in reversed(list(enumerate(answered))):
        citations_by_judge[judge_index] = saved_citations = []
        for citation in answer.citations:
            if citation.evidence_id not in labels:
                continue  # The price data is shown as the claim's chart, not as a source.
            item = labels[citation.evidence_id]
            item.relation = citation.relation
            quote = citation.quote
            translations = _translations(quote, en=citation.quote_en, vi=citation.quote_vi)
            item.excerpt = quote
            item.translations = translations
            saved_citations.append({
                "evidence_id": item.id, "quote": quote, "translations": translations,
                "relation": citation.relation, "freshness": citation.freshness,
            })
    source_citations = [
        citation for citation in primary.citations
        if citation.evidence_id in labels and citation.relation != "contextual"
    ]
    cited = [labels[citation.evidence_id].id for citation in source_citations]
    return Verdict(
        claim_id=claim.id,
        version=1,
        kind="ai_assessment",
        label=primary.verdict,
        explanation=primary.review,
        evidence_ids=list(dict.fromkeys(cited)),
        citation_freshness={
            labels[citation.evidence_id].id: {"status": citation.freshness, "reason": citation.freshness_reason}
            for citation in source_citations
        },
        model={"name": model, "promptVersion": settings.prompt_version},
        judges=[
            {
                "judge": settings.model_display_name(result_model),
                "model": result_model,
                "verdict": answer.verdict,
                "confidence": answer.confidence,
                "review": answer.review,
                "translations": _translations(answer.review, en=answer.review_en, vi=answer.review_vi),
                "primary": result_option is option,
                "citations": citations_by_judge[index],
            }
            for index, (result_option, answer, result_model) in enumerate(answered)
        ],
        author=f"AI · {settings.model_display_name(model)}",
    )


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
        except CheckStopped:
            session.rollback()
            pool.shutdown(wait=False, cancel_futures=True)  # Calls still queued are never made, or paid for.
            _end(check, session, "stopped", STOPPED)
        except (FetchError, LLMError) as error:
            session.rollback()
            logger.warning("Check %s failed: %s", check_id, error)
            _fail(check, session, str(error) if isinstance(error, FetchError) else "The claims could not be extracted.")
        except Exception:
            session.rollback()
            logger.exception("Check %s failed", check_id)
            _fail(check, session, "Something went wrong while running this check.")
        finally:
            stop_requests.discard(check_id)


def _end(check: Check, session: Session, status: str, message: str) -> None:
    check.progress = closed_tasks(check.progress, message)
    check.status = status
    check.error_message = message
    session.commit()


def _fail(check: Check, session: Session, message: str) -> None:
    _end(check, session, "failed", message)


def _set_status(check: Check, session: Session, status: str) -> None:
    _stop_if_asked(check)
    check.status = status
    session.commit()


def _run(
    check: Check,
    session: Session,
    providers: Providers,
    settings: Settings,
    pool: ThreadPoolExecutor,
    given_claims: list[str] | None = None,
) -> None:
    settings = _reader_settings(check, settings)
    tasks = TaskLog(lambda event: _save_progress(check, session, event))
    rephrased_from = None
    _set_status(check, session, "extracting")
    review = check.review or {}
    if review.get("answer") and "extracted" in review:
        context = _dates((check.article or {}).get("publishedAt"))
        extracted = answered_claims(review, context, providers.llm, settings, pool, tasks)
        rephrased_from = review["rephrased_from"]
        check.review = {key: value for key, value in review.items() if key not in ("extracted", "rephrased_from")}
    elif given_claims is None:
        text, article = _input_text(check, providers)
        if article:
            check.article = {"title": article.title, "publisher": article.publisher, "publishedAt": article.published_at}
            check.title = article.title
        task = tasks.model("extraction", "extracting", settings.extraction_model, settings)
        try:
            extracted, model, category = _extract_claims(text, article, providers, settings)
        except LLMError as error:
            task.fail(error.public_message)
            raise
        task.finish_model(model, settings, claimCount=len(extracted), inputCategory=category)
        if not extracted and category is None and text.strip() and len(text) <= settings.question_max_chars:
            extracted, category = _claims_from_question(text, providers, settings, tasks)
            rephrased_from = text.strip() if extracted else None
        if extracted:
            questions = ask_questions(extracted, text, providers.llm, settings, tasks)
            choose = needs_choice(check, text, len(extracted), settings)
            if questions or choose:
                check.review = saved_review(extracted, questions, choose, rephrased_from)
                _set_status(check, session, "awaiting_input")
                return
    else:
        extracted = [ExtractedClaim(text=claim, checkworthiness=1) for claim in given_claims]
    claims = [
        Claim(
            check_id=check.id,
            position=index + 1,
            text=item.text,
            topic=item.topic,
            time_context=item.event_date.isoformat() if item.event_date else item.time_context,
            checkworthy_score=item.checkworthiness,
            location_map=build_location_map(item, settings),
            stock_heatmap_markets=list(dict.fromkeys(item.stock_heatmap_markets)) or None,
            rephrased_from=rephrased_from,
            translations=_translations(item.text, en=item.text_en, vi=item.text_vi) or None,
        )
        for index, item in enumerate(extracted)
    ]
    session.add_all(claims)
    session.flush()

    _set_status(check, session, "retrieving")
    visuals = _run_visuals(
        [(claim.position, partial(_fetch_visuals, item, providers, settings, pool))
         for claim, item in zip(claims, extracted, strict=True)],
        tasks, settings,
    )
    for claim, (price_chart, country_map, pyramid) in zip(claims, visuals, strict=True):
        claim.price_chart, claim.country_map = price_chart, country_map
        claim.population_pyramid = pyramid
        # One map per claim, and each of these already shows the place.
        if pyramid:
            claim.location_map = None
    queries = {claim.id: _event_query(item, _search_query(item)) for claim, item in zip(claims, extracted, strict=True)}
    windows = {
        claim.id: window for claim, item in zip(claims, extracted, strict=True) if (window := _claim_search_window(item))
    }
    dated_claims = {claim.id for claim, item in zip(claims, extracted, strict=True) if _states_a_period(item)}
    briefs = {claim.id: _research_brief(item, windows.get(claim.id)) for claim, item in zip(claims, extracted, strict=True)}
    # Only the research model reads the reader's note. Judges never see it, so it can't steer a verdict.
    if (check.search_options or {}).get("sources_per_claim"):
        target = f"For this check, aim for {settings.target_publishers_per_claim} publishers instead of five."
        briefs = {claim_id: f"{brief}\n{target}" for claim_id, brief in briefs.items()}
    if check.search_instructions:
        guidance = tagged("reader_guidance", check.search_instructions)
        briefs = {claim_id: f"{brief}\n\n{guidance}" for claim_id, brief in briefs.items()}
    people = {claim.id: item.person_name for claim, item in zip(claims, extracted, strict=True)
              if names_person(item.text, item.person_name)}
    english_queries = {
        claim.id: person_query(_event_query(item, item.search_query_en), people.get(claim.id), item.text)
        for claim, item in zip(claims, extracted, strict=True) if item.search_query_en
    }
    vietnamese_queries = {
        claim.id: person_query(_event_query(item, _search_query(item, item.search_query_vi)), people.get(claim.id), item.text)
        for claim, item in zip(claims, extracted, strict=True) if item.search_query_vi and item.search_query_vi.strip()
    }
    # A translated query helps pick the right passage when the page and the claim use different languages.
    reading_queries = {
        claim.id: " ".join(dict.fromkeys(
            query for query in (english_queries.get(claim.id), vietnamese_queries.get(claim.id), claim.text) if query
        ))
        for claim in claims if claim.id in english_queries or claim.id in vietnamese_queries
    }
    for claim in claims:
        if period := norway_car_registration_period(f"{claim.text} {claim.time_context or ''}"):
            reading_queries[claim.id] = f"{reading_queries.get(claim.id, claim.text)} {norway_car_registration_query(period)}"
    owner = session.get(User, check.user_id) if check.user_id else None
    map_choices: dict[str, MapChoice] = {}
    pages, urls_by_claim, failed = _retrieve(
        claims, check.input_url, providers, settings, pool, queries, tasks, windows, dated_claims, briefs,
        english_queries, people,
        preferred_source_language=owner.preferred_source_language if owner else None,
        vietnamese_queries=vietnamese_queries,
        search_model=check.search_model,
        map_choices=map_choices,
    )

    for claim, item in zip(claims, extracted, strict=True):
        options = _map_options(item)
        choice = map_choices.get(claim.id)
        if not options or (choice != "none" and choice not in options):
            choice = None
        if (choice == "country" and not claim.country_map) or (choice == "location" and not claim.location_map):
            choice = None
        if choice is None and claim.country_map:
            choice = "country"
        if choice is not None:
            map_choices[claim.id] = choice
        else:
            map_choices.pop(claim.id, None)
        if choice in ("country", "none"):
            claim.location_map = None
        if choice in ("location", "none"):
            claim.country_map = None

    titles = _distinct_titles(pages)
    sources = {
        url: Source(
            check_id=check.id,
            url=page.url,
            title=titles[url],
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
                excerpt=top_passages(sources[url].text, reading_queries.get(claim.id, claim.text), 1)[:280].strip(),
                source=sources[url],
            )
            for index, url in enumerate(urls_by_claim.get(claim.id, []))
        ]
        session.add_all(items)
        evidence_by_claim[claim.id] = items
    session.flush()

    _set_status(check, session, "assessing")
    matches = [(claim, item.match_result) for claim, item in zip(claims, extracted, strict=True) if item.match_result]
    results = _run_visuals([
        (claim.position, partial(build_match_result, claim.text, kind, evidence_by_claim[claim.id], providers.llm, settings,
                                 period=claim.time_context))
        for claim, kind in matches
    ], tasks, settings)
    for (claim, _), result in zip(matches, results, strict=True):
        claim.match_result = result

    for claim in claims:
        items = evidence_by_claim[claim.id]
        prices = price_table(claim.price_chart)
        if claim.id in failed and not prices:
            claim.status, claim.unavailable_reason = "unavailable", SEARCH_FAILED
        elif not items and not prices:
            # Context about the named person is kept beside the verdict, so the reader can see what was found.
            person = (people or {}).get(claim.id)
            context = _person_sources(check, person, providers, settings) if person else []
            session.add_all(context)
            session.flush()
            context_evidence = [
                Evidence(
                    claim_id=claim.id,
                    source_id=source.id,
                    position=index,
                    excerpt=top_passages(source.text, person, 1)[:280].strip(),
                    relation="contextual",
                    source=source,
                )
                for index, source in enumerate(context)
            ]
            session.add_all(context_evidence)
            session.flush()
            context_note = _context_note(claim.text, person, context, check, providers, settings) if context else None
            session.add(
                Verdict(
                    claim_id=claim.id,
                    version=1,
                    kind="ai_assessment",
                    label="insufficient_evidence",
                    explanation=context_note.en.strip() if context_note else (
                        NO_CLAIM_SOURCE if context_evidence else NO_EVIDENCE
                    ),
                    translations=(
                        _translations(context_note.en.strip(), en=context_note.en, vi=context_note.vi) or None
                    ) if context_note else None,
                    evidence_ids=[item.id for item in context_evidence],
                    author="ClaimTrace",
                )
            )
        else:
            verdict = _judge_claim(claim, items, check, providers, settings, pool, tasks, reading_queries.get(claim.id))
            if verdict:
                session.add(verdict)
            else:
                claim.status, claim.unavailable_reason = "unavailable", JUDGES_FAILED
    session.commit()

    # Claims with the same election and map scope can share a search, reader and map.
    groups: dict[object, list[int]] = {}
    for index, (claim, item) in enumerate(zip(claims, extracted, strict=True)):
        choice = map_choices.get(claim.id)
        election_key = _election_key(item) if choice in (None, "election") else None
        groups.setdefault((election_key, choice) if election_key else claim.id, []).append(index)
    jobs = [
        (claims[members[0]].position, partial(
            _read_visual_figures, extracted[members[0]], claims[members[0]].location_map,
            [entry for index in members for entry in evidence_by_claim[claims[index].id]], check.input_url,
            providers, settings, pool,
            search_model=check.search_model,
            map_choice=map_choices.get(claims[members[0]].id),
        ))
        for members in groups.values()
    ]
    results = _run_visuals(jobs, tasks, settings)
    figures = [None] * len(claims)
    for members, result in zip(groups.values(), results, strict=True):
        for index in members:
            figures[index] = result
    for claim, (seat_chart, details, election_map, incident_map) in zip(claims, figures, strict=True):
        claim.seat_chart, claim.election_map = seat_chart, election_map
        claim.incident_map = incident_map
        if election_map or incident_map:
            claim.location_map = None
            claim.country_map = None
        elif seat_chart and claim.id not in map_choices:
            claim.location_map = None
        elif details:
            claim.location_map = {**claim.location_map, "details": details}

    pie_claims = [claim for claim, item in zip(claims, extracted, strict=True) if item.pie_chart and not claim.seat_chart]
    pies = _run_visuals([
        (claim.position, partial(
            _read_tabular_chart, "pie", claim.text, evidence_by_claim[claim.id], providers, settings, pool,
            skip_url=check.input_url, search_model=check.search_model, period=claim.time_context,
            reading_query=reading_queries.get(claim.id), search_query=english_queries.get(claim.id) or queries[claim.id],
        ))
        for claim in pie_claims
    ], tasks, settings)
    for claim, pie in zip(pie_claims, pies, strict=True):
        claim.pie_chart = pie

    bar_claims = [
        claim for claim, item in zip(claims, extracted, strict=True)
        if item.bar_chart and not any((
            item.country_stat, item.population_pyramid, item.price_asset, item.stock_heatmap_markets,
            claim.seat_chart, claim.election_map, claim.pie_chart, claim.match_result,
        ))
    ]
    bars = _run_visuals([
        (claim.position, partial(
            _read_tabular_chart, "bar", claim.text, evidence_by_claim[claim.id], providers, settings, pool,
            skip_url=check.input_url, search_model=check.search_model, period=claim.time_context,
            reading_query=reading_queries.get(claim.id), search_query=english_queries.get(claim.id) or queries[claim.id],
        ))
        for claim in bar_claims
    ], tasks, settings)
    for claim, bar in zip(bar_claims, bars, strict=True):
        claim.bar_chart = bar

    route_claims = [
        claim for claim, item in zip(claims, extracted, strict=True)
        if item.route_map and not (claim.incident_map or claim.election_map)
        and map_choices.get(claim.id) in (None, "route")
    ]
    routes = _run_visuals([
        (claim.position, partial(build_route_map, claim.text, evidence_by_claim[claim.id], providers.llm, settings))
        for claim in route_claims
    ], tasks, settings)
    for claim, route in zip(route_claims, routes, strict=True):
        claim.route_map = route
        if route:
            claim.location_map = None
            claim.country_map = None

    for claim in claims:
        if claim.country_map:
            claim.location_map = None

    check.completed_at = utcnow()
    _set_status(check, session, "completed")
