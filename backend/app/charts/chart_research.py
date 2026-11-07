"""Finds a chart's own sources. The research model searches for what the chart still needs, and judges never see the pages."""

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from ..core.config import Settings
from ..pipeline.progress import TaskLog
from ..pipeline.prompts import CHART_RESEARCH_SYSTEM
from ..pipeline.research import research_sources
from ..search.fetcher import Page
from ..search.tavily import CHART_DOMAINS, SearchHit, TimeWindow, page_date, read_hit, source_url_key, within_domains

# Given what the chart still needs, the round's number and its task log, returns new readable pages.
Finder = Callable[[str, int, TaskLog], list[Page]]


def make_chart_finder(
    search_hits, research, fetch: Callable[[str], Page], settings: Settings, pool: ThreadPoolExecutor,
    window: TimeWindow | None, skip_url: str | None, claim_text: str, known_pages: tuple[str, ...] | list[str] = (),
    domains: tuple[str, ...] | list[str] | None = None,
) -> Finder | None:
    if not search_hits or not research:
        return None
    domains = list(domains or CHART_DOMAINS["elections"])
    skip_key = source_url_key(skip_url) if skip_url else None
    tried: set[str] = set()

    def usable(url: str, published_at: str | None = None) -> bool:
        if not within_domains(url, domains) or source_url_key(url) == skip_key:
            return False
        date = page_date(url, published_at)
        return not (window and date and (date < window.start or (window.end and date > window.end)))

    def find(needs: str, number: int, tasks: TaskLog) -> list[Page]:
        # These pages are explicitly registered for this country, chamber and year. A later publication/update
        # date does not change which historical election they document. Readers still verify the stated results.
        if number == 1 and known_pages:
            direct_task = tasks.chart_data("election", "ClaimTrace")
            hits = [SearchHit(url) for url in known_pages if within_domains(url, domains) and source_url_key(url) != skip_key]
            pages = [page for page in pool.map(lambda hit: read_hit(hit, fetch, settings), hits)
                     if page and within_domains(page.url, domains) and source_url_key(page.url) != skip_key
                     and len(page.text.split()) >= settings.min_source_words]
            direct_task.finish(sourceCount=len(pages), searchCount=0)
            if pages:
                tried.update(source_url_key(page.url) for page in pages)
                return pages
        model_task = tasks.model(f"chart-research-{number}", "researching_chart", settings.research_model, settings)
        search_task = tasks.search(f"chart-search-{number}", "chart_sources", chart="election")
        found = research_sources(
            claim_text, needs, search_hits, research, settings, window, False,
            system=CHART_RESEARCH_SYSTEM,
            max_searches=settings.chart_research_searches_per_round,
            max_picks=settings.chart_research_pages_per_round,
            domains=domains,
        )
        if found.llm_error:
            model_task.fail(found.llm_error)
            search_task.fail(found.llm_error)
            return []
        if found.hits is None:
            model_task.fail(found.search_error or "No candidate page could be read.")
            search_task.fail(found.search_error or "No candidate page could be read.")
            return []
        model_task.finish_model(found.reported_model, settings)
        new: list[SearchHit] = []
        for hit in found.hits:
            key = source_url_key(hit.url)
            if key not in tried and usable(hit.url):
                tried.add(key)
                new.append(hit)
        pages = [
            page for page in pool.map(lambda hit: read_hit(hit, fetch, settings), new)
            if page and usable(page.url, page.published_at) and len(page.text.split()) >= settings.min_source_words
        ]
        search_task.finish(sourceCount=len(pages), searchCount=found.searches)
        return pages

    return find
