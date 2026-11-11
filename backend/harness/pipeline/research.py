"""The research model searches with Tavily, picks sources for the judges and can recommend a map.

The server keeps the source and date rules. The model can only choose addresses a search returned,
and the pipeline checks the pages and verifies any map data afterwards.
"""

import json
import logging
from dataclasses import dataclass, replace

from config.settings import Settings

from ..providers.llm import LLMError
from ..search.tavily import (
    CHART_DOMAINS,
    SearchError,
    SearchHit,
    TimeWindow,
    data_table_domains,
    is_allowed_source,
    is_discovery_source,
    source_url_key,
)
from .passages import top_passages
from .prompts import RESEARCH_SYSTEM, ExternalResearchPicks, MapChoice, ResearchPicks, tagged

logger = logging.getLogger(__name__)

SNIPPET_CHARS = 1200


@dataclass
class Research:
    hits: list[SearchHit] | None  # None when nothing could be searched, which isn't the same as choosing nothing.
    reported_model: str = ""
    searches: int = 0
    llm_error: str | None = None
    search_error: str | None = None
    candidate_count: int = 0
    picked_count: int = 0  # What the model chose, before any address no search returned is dropped.
    map_choice: MapChoice | None = None


def research_sources(
    claim_text: str,
    brief: str,
    search_hits,
    research,
    settings: Settings,
    window: TimeWindow | None,
    newest_first: bool,
    system: str = RESEARCH_SYSTEM,
    max_searches: int | None = None,
    max_picks: int | None = None,
    domains: list[str] | None = None,
    first_query: str | None = None,
    first_domains: list[str] | None = None,
    first_scope: str = "English",
    search_model: str | None = None,
    table_snippets: bool = False,
    external: bool = False,
) -> Research:
    """Runs on a pool worker, so it saves nothing itself."""
    seen: dict[str, SearchHit] = {}
    result = Research(hits=None)
    used_advanced = False
    budget = max_searches if max_searches is not None else settings.research_max_searches_per_claim

    def search_with_domains(query: str, scoped_domains: list[str] | None, *, tables: bool = False, advanced: bool = False) -> str:
        nonlocal used_advanced
        options: dict = {} if newest_first else {"newest_first": False}
        if window:
            options["start_date"] = window.start
            if window.end:
                options["end_date"] = window.end
        if scoped_domains:
            options["domains"] = scoped_domains
        if advanced and result.searches and not used_advanced:
            options["advanced"] = used_advanced = True
        result.searches += 1
        try:
            hits = search_hits(query, **options)
        except SearchError as error:
            logger.warning("Research search failed: %s", error)
            result.search_error = str(error)
            return json.dumps({"error": str(error)})
        hits = [hit for hit in hits if admissible(hit.url)]
        for hit in hits:
            if hit.url not in seen or (not seen[hit.url].raw_content and hit.raw_content):
                seen[hit.url] = hit
        return json.dumps(
            [
                {
                    "url": hit.url, "title": hit.title, "date": hit.published_at,
                    "text": "\n\n".join(dict.fromkeys(filter(None, (
                        hit.snippet,
                        top_passages(hit.raw_content, f"{claim_text} {query}", 1)
                        if hit.raw_content and (tables or table_snippets or not hit.snippet) else None,
                    ))))[:SNIPPET_CHARS],
                }
                for hit in hits
            ],
            ensure_ascii=False,
        )

    def run_search(
        query: str, election_results_only: bool = False, *, data_tables_only: bool = False, advanced: bool = False,
    ) -> str:
        scoped = domains
        if not external and not scoped and election_results_only:
            scoped = CHART_DOMAINS["elections"]
        if not external and not scoped and data_tables_only:
            scoped = data_table_domains(f"{claim_text} {query}")
        return search_with_domains(query, scoped, tables=data_tables_only, advanced=advanced)

    admissible = is_discovery_source if external else is_allowed_source
    first = (
        f"Results of the {first_scope} query \"{first_query}\":\n{search_with_domains(first_query, first_domains or domains)}"
        if first_query else None
    )
    remaining = max(0, budget - result.searches)
    prompt = "\n\n".join([
        tagged("input", claim_text, type="claim"), brief, *([first] if first else []),
        f"Additional searches available: {remaining}. Stop early when you have usable evidence.",
    ])
    try:
        answer, result.reported_model = research(
            search_model or settings.research_model, system, prompt, ExternalResearchPicks if external else ResearchPicks,
            run_search, remaining,
        )
    except LLMError as error:
        logger.warning("Research failed: %s", error)
        result.llm_error = error.public_message
        return result
    result.candidate_count = len(seen)
    if not seen and result.search_error:
        return result
    result.picked_count = len(answer.urls)
    # An address no search returned is dropped, so a model can't add a source of its own. A model copying one
    # with another scheme or a trailing slash still means that page.
    by_key = {source_url_key(hit.url): hit for hit in seen.values()}
    keys = (source_url_key(url) for url in answer.urls if admissible(url))
    chosen = list({key: by_key[key] for key in keys if key in by_key}.values())
    if external:
        bases = answer.publisher_basis if isinstance(answer, ExternalResearchPicks) else {}
        reviewed = {source_url_key(url) for url, basis in bases.items() if basis.strip() and admissible(url)}
        chosen = [
            hit if is_allowed_source(hit.url) else replace(hit, reviewed_external=True)
            for hit in chosen if source_url_key(hit.url) in reviewed
        ]
    # Never fill a short choice with pages the researcher did not select just to reach a source target.
    result.hits = chosen[: max_picks or settings.research_max_picks]
    if result.hits and isinstance(answer, ResearchPicks):
        result.map_choice = answer.map_choice
    if not result.hits:
        logger.warning(
            "Research kept none of %d results (%d chosen) after %d searches for: %s",
            result.candidate_count, result.picked_count, result.searches, claim_text[:120],
        )
    return result
