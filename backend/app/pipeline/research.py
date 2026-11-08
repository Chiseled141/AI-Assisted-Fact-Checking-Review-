"""The research model: searches with Tavily, and chooses the sources the two judges will read.

The server holds the rules. The model only writes queries, so it can't widen the green list or the period, and it can only
choose addresses a search really returned. Its choices are still read, dated and checked by the pipeline afterwards.
"""

import json
import logging
from dataclasses import dataclass

from ..core.config import Settings
from ..providers.llm import LLMError
from ..search.tavily import CHART_DOMAINS, SearchError, SearchHit, TimeWindow, source_url_key
from .prompts import RESEARCH_SYSTEM, ResearchPicks, tagged

logger = logging.getLogger(__name__)

SNIPPET_CHARS = 700


@dataclass
class Research:
    hits: list[SearchHit] | None  # None when nothing could be searched, which isn't the same as choosing nothing.
    reported_model: str = ""
    searches: int = 0
    llm_error: str | None = None
    search_error: str | None = None
    candidate_count: int = 0
    picked_count: int = 0  # What the model chose, before any address no search returned is dropped.


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
) -> Research:
    """Runs on a pool worker, so it saves nothing itself."""
    seen: dict[str, SearchHit] = {}
    result = Research(hits=None)

    def run_search(query: str, election_results_only: bool = False) -> str:
        options: dict = {} if newest_first else {"newest_first": False}
        if window:
            options["start_date"] = window.start
            if window.end:
                options["end_date"] = window.end
        if domains or election_results_only:
            options["domains"] = domains or CHART_DOMAINS["elections"]
        result.searches += 1
        try:
            hits = search_hits(query, **options)
        except SearchError as error:
            logger.warning("Research search failed: %s", error)
            result.search_error = str(error)
            return json.dumps({"error": str(error)})
        for hit in hits:
            seen.setdefault(hit.url, hit)
        return json.dumps(
            [
                {"url": hit.url, "title": hit.title, "date": hit.published_at, "text": (hit.raw_content or "")[:SNIPPET_CHARS]}
                for hit in hits
            ],
            ensure_ascii=False,
        )

    # Most sources are in English, so that search always happens, whatever the model would have chosen to do.
    first = f"Results of the English query \"{first_query}\":\n{run_search(first_query)}" if first_query else None
    prompt = "\n\n".join([tagged("input", claim_text, type="claim"), brief, *([first] if first else [])])
    try:
        answer, result.reported_model = research(
            settings.research_model, system, prompt, ResearchPicks, run_search,
            (max_searches or settings.research_max_searches_per_claim) - result.searches,
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
    chosen = list({key: by_key[key] for key in map(source_url_key, answer.urls) if key in by_key}.values())
    # Never fill a short choice with pages the researcher did not select just to reach a source target.
    result.hits = chosen[: max_picks or settings.research_max_picks]
    if not result.hits:
        logger.warning(
            "Research kept none of %d results (%d chosen) after %d searches for: %s",
            result.candidate_count, result.picked_count, result.searches, claim_text[:120],
        )
    return result
