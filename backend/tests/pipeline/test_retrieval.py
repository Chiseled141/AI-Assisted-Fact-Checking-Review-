from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

from app.core.config import Settings
from app.db.models import Claim
from app.pipeline.run import _retrieve
from app.search.fetcher import FetchError, Page
from app.search.tavily import SearchHit, TimeWindow

ARTICLE = ("The report describes the route opening and provides details about its stations, passengers, first day of service and the approved transport plan. " * 4).strip()


def retrieve(hits, fetch=None, skip_url=None, query=None, more=None, settings=None):
    asked = []
    claim = Claim(id="c", text="A short factual claim.", position=1)
    def search(value):
        asked.append(value)
        return hits
    def blocked(url):
        raise FetchError("The page returned status 403.")
    search_provider = SimpleNamespace(search_hits=search)
    if more:
        search_provider.search_more = more
    providers = SimpleNamespace(search=search_provider, fetch=fetch or blocked)
    with ThreadPoolExecutor(2) as pool:
        result = _retrieve([claim], skip_url, providers, settings or Settings(), pool, {"c": query} if query else None)
    return result, asked


def test_full_tavily_page_survives_a_blocked_local_reader_and_uses_neutral_query():
    hit = SearchHit("https://reuters.com/a", "https://images.example/a.jpg", "Opening report", ARTICLE)
    (pages, urls, failed), asked = retrieve([hit], query="route opening date")
    assert asked == ["route opening date"]
    assert pages[hit.url].text == ARTICLE
    assert pages[hit.url].image_url == hit.image_url
    assert pages[hit.url].published_at is None
    assert urls == {"c": [hit.url]}
    assert not failed


def test_an_image_or_short_content_is_not_evidence_and_reader_failure_is_unavailable():
    for content in (None, "A short search summary."):
        (pages, urls, failed), _ = retrieve([SearchHit("https://reuters.com/a", "https://images.example/a.jpg", raw_content=content)])
        assert not pages and urls == {"c": []}
        assert failed == {"c"}


def test_successful_search_with_no_matches_is_not_a_technical_failure():
    (pages, urls, failed), _ = retrieve([])
    assert not pages and urls == {"c": []} and not failed


def test_input_article_tracking_variants_are_never_used_as_evidence():
    (pages, urls, _), _ = retrieve(
        [SearchHit("http://www.reuters.com/a?utm_source=search", raw_content=ARTICLE)], skip_url="https://reuters.com/a",
    )
    assert not pages and urls == {"c": []}


def test_readable_publisher_page_takes_priority_over_cached_search_content():
    hit = SearchHit("https://reuters.com/a", raw_content=ARTICLE)
    direct = Page(url=hit.url, title="Live article", text=ARTICLE + " Extra publisher context.")
    (pages, _, failed), _ = retrieve([hit], fetch=lambda url: direct)
    assert pages[hit.url] is direct
    assert not failed


def test_redirect_aliases_do_not_count_as_independent_evidence():
    hits = [SearchHit("https://reuters.com/a"), SearchHit("https://reuters.com/alias")]
    (pages, urls, _), _ = retrieve(hits, fetch=lambda url: Page(url="https://reuters.com/a", title="Article", text=ARTICLE))
    assert len(pages) == 1
    assert urls == {"c": ["https://reuters.com/a"]}


def test_reads_later_candidates_until_five_different_publishers_are_kept():
    domains = ['reuters.com', 'reuters.com', 'bbc.com', 'apnews.com', 'cnn.com', 'npr.org', 'theguardian.com']
    hits = [SearchHit(f'https://{domain}/{index}') for index, domain in enumerate(domains)]
    reads = []
    def fetch(url):
        reads.append(url)
        if 'bbc.com' in url:
            raise FetchError('403')
        return Page(url=url, title='Report', text=ARTICLE)
    (pages, urls, failed), _ = retrieve(hits, fetch=fetch)
    assert len(pages) == len(urls['c']) == 5
    assert 'https://reuters.com/1' not in reads
    assert not failed


def test_one_backfill_search_excludes_earlier_publishers_and_fills_the_target():
    first = SearchHit('https://reuters.com/a', raw_content=ARTICLE)
    calls = []
    def more(query, excluded):
        calls.append((query, excluded))
        return [SearchHit(f'https://{domain}/b', raw_content=ARTICLE)
                for domain in ['bbc.com', 'apnews.com', 'cnn.com', 'npr.org', 'theguardian.com']]
    (pages, urls, failed), asked = retrieve([first], more=more)
    assert len(asked) == len(calls) == 1
    assert calls[0][1] == ['reuters.com']
    assert len(pages) == len(urls['c']) == 5
    assert not failed


def test_inadequate_results_stay_honest_and_never_trigger_unbounded_searches():
    hit = SearchHit('https://reuters.com/a', raw_content=ARTICLE)
    calls = []
    def more(query, excluded):
        calls.append(query)
        return [hit]
    (pages, urls, failed), _ = retrieve([hit], more=more)
    assert len(calls) == 1
    assert len(pages) == len(urls['c']) == 1
    assert not failed


def test_yellow_sources_and_redirects_to_them_are_never_evidence():
    hits = [SearchHit('https://en.wikipedia.org/wiki/Test', raw_content=ARTICLE), SearchHit('https://reuters.com/redirect')]
    (pages, urls, failed), _ = retrieve(hits, fetch=lambda url: Page(url='https://en.wikipedia.org/wiki/Test', title='Wiki', text=ARTICLE))
    assert not pages and urls == {'c': []} and failed == {'c'}


def test_failed_reads_and_saved_pages_obey_their_separate_budgets():
    hits = [SearchHit(f'https://{domain}/a') for domain in ['reuters.com', 'bbc.com', 'apnews.com', 'cnn.com']]
    reads = []
    def blocked(url):
        reads.append(url)
        raise FetchError('403')
    (pages, _, failed), _ = retrieve(hits, fetch=blocked, settings=Settings(max_page_reads_per_check=2))
    assert len(reads) == 2 and not pages and failed == {'c'}
    (pages, urls, _), _ = retrieve(hits, fetch=lambda url: Page(url=url, title='Report', text=ARTICLE),
                                 settings=Settings(max_sources_per_check=2))
    assert len(pages) == len(urls['c']) == 2


def test_a_claim_with_enough_publishers_stops_showing_as_running_while_another_keeps_reading():
    from concurrent.futures import ThreadPoolExecutor
    from types import SimpleNamespace

    from app.core.config import Settings
    from app.db.models import Claim
    from app.pipeline.progress import TaskLog
    from app.pipeline.run import _retrieve
    from app.search.fetcher import FetchError, Page
    from app.search.tavily import SearchHit

    settings = Settings(target_publishers_per_claim=1)
    full, short = Claim(id="full", text="Full.", position=1), Claim(id="short", text="Short.", position=2)
    answers = {"Full.": [SearchHit("https://reuters.com/a")], "Short.": [SearchHit("https://bbc.com/b"), SearchHit("https://apnews.com/c")]}

    def fetch(url):
        if "reuters" not in url:
            raise FetchError("unreadable")
        return Page(url=url, title="Report", text="words " * 80, publisher="Reuters")

    events = []
    providers = SimpleNamespace(search=SimpleNamespace(search=lambda query: [hit.url for hit in answers[query]], search_hits=lambda query: answers[query]), fetch=fetch)
    with ThreadPoolExecutor(2) as pool:
        _retrieve([full, short], None, providers, settings, pool, None, TaskLog(events.append))
    finished = [event["id"] for event in events if event.get("status") in ("completed", "failed")]
    assert finished == ["claim-1:search", "claim-2:search"]  # Each ends once, and the full claim ends first.
    assert [event["status"] for event in events if event.get("status") in ("completed", "failed")] == ["completed", "failed"]


def _dated_retrieve(window, published, later_answers=None):
    from concurrent.futures import ThreadPoolExecutor
    from types import SimpleNamespace

    from app.core.config import Settings
    from app.db.models import Claim
    from app.pipeline.progress import TaskLog
    from app.pipeline.run import _retrieve
    from app.search.fetcher import Page
    from app.search.tavily import SearchHit

    claim = Claim(id="c", text="A claim about an election.", position=1)
    asked = []

    def search_hits(query, **kwargs):
        asked.append(kwargs)
        return [SearchHit(url) for url in published]

    def search_more(query, exclude, **kwargs):
        asked.append(kwargs)
        return [SearchHit(url) for url in later_answers or []]

    def fetch(url):
        return Page(url=url, title=url, text="words " * 80, publisher=url, published_at=published[url])

    events = []
    providers = SimpleNamespace(search=SimpleNamespace(search_hits=search_hits, search_more=search_more), fetch=fetch)
    with ThreadPoolExecutor(2) as pool:
        _, selected, failed = _retrieve([claim], None, providers, Settings(), pool, None, TaskLog(events.append), {"c": window})
    return selected["c"], failed, asked, events


def test_a_page_from_before_the_election_does_not_count_and_a_second_search_runs():
    urls = {"https://reuters.com/old": "2022-11-16", "https://bbc.com/new": "2026-11-04", "https://apnews.com/undated": None}
    selected, failed, asked, _ = _dated_retrieve(TimeWindow("2026-01-01"), urls)
    assert selected == ["https://bbc.com/new", "https://apnews.com/undated"]
    assert not failed
    assert asked == [{"newest_first": False, "start_date": "2026-01-01"}] * 2


def test_only_older_pages_mean_no_evidence_not_a_failed_search():
    selected, failed, _, events = _dated_retrieve(TimeWindow("2026-01-01"), {"https://reuters.com/old": "2022-11-16"})
    assert selected == []
    assert not failed
    assert events[-1]["status"] == "completed"
    assert events[-1]["summary"] == "Only reports published before the claimed event were found."


def test_a_claims_sources_end_up_newest_first_by_the_pages_own_dates():
    urls = {"https://reuters.com/a": "2024-01-02", "https://bbc.com/b": None, "https://apnews.com/c": "2026-11-04"}
    selected = _undated_claim_retrieve(urls)
    assert selected == ["https://apnews.com/c", "https://reuters.com/a", "https://bbc.com/b"]


def _undated_claim_retrieve(published, dated=False):
    from concurrent.futures import ThreadPoolExecutor
    from types import SimpleNamespace

    from app.core.config import Settings
    from app.db.models import Claim
    from app.pipeline.run import _retrieve
    from app.search.fetcher import Page

    claim = Claim(id="c", text="A claim.", position=1)
    fetch = lambda url: Page(url=url, title=url, text="words " * 80, publisher=url, published_at=published[url])  # noqa: E731
    providers = SimpleNamespace(search=SimpleNamespace(search=lambda query: list(published)), fetch=fetch)
    with ThreadPoolExecutor(2) as pool:
        _, selected, _ = _retrieve([claim], None, providers, Settings(), pool, None, dated_claims={"c"} if dated else None)
    return selected["c"]


def test_a_claim_naming_a_year_keeps_the_search_order_instead_of_the_newest_first():
    urls = {"https://reuters.com/a": "2024-01-02", "https://apnews.com/c": "2026-11-04"}
    assert _undated_claim_retrieve(urls, dated=True) == list(urls)


def test_a_2024_election_claim_prefers_its_own_period_and_uses_later_pages_only_to_fill_up():
    window = TimeWindow("2024-11-05", "2025-06-30")
    urls = {
        "https://www.reuters.com/business/takeaways-2026-11-04": None,  # Undated, but the address says when.
        "https://www.npr.org/2026/11/03/florida-governor": "2026-11-03",
        "https://www.aljazeera.com/news/2024/12/4/final-seat": "2024-12-04",
        "https://www.nytimes.com/interactive/results-ohio": None,
        "https://www.cnn.com/2024/10/01/campaign": "2024-10-01",
    }
    selected, failed, asked, _ = _dated_retrieve(window, urls)
    assert selected[:2] == ["https://www.aljazeera.com/news/2024/12/4/final-seat", "https://www.nytimes.com/interactive/results-ohio"]
    assert "https://www.cnn.com/2024/10/01/campaign" not in selected  # During the campaign, so never.
    assert selected[2:] == ["https://www.npr.org/2026/11/03/florida-governor", "https://www.reuters.com/business/takeaways-2026-11-04"]
    assert not failed
    assert asked[0] == {"newest_first": False, "start_date": "2024-11-05", "end_date": "2025-06-30"}
    assert asked[1] == {"newest_first": False, "start_date": "2024-11-05"}


def test_a_page_too_thin_to_read_does_not_use_up_a_source():
    from concurrent.futures import ThreadPoolExecutor
    from types import SimpleNamespace

    from app.core.config import Settings
    from app.db.models import Claim
    from app.pipeline.run import _retrieve
    from app.search.fetcher import Page

    claim = Claim(id="c", text="A claim.", position=1)
    urls = ["https://lemonde.fr/thin", "https://bbc.com/full"]
    fetch = lambda url: Page(url=url, title=url, text="words " * (5 if "thin" in url else 80), publisher=url)  # noqa: E731
    providers = SimpleNamespace(search=SimpleNamespace(search=lambda query: urls), fetch=fetch)
    with ThreadPoolExecutor(2) as pool:
        _, selected, _ = _retrieve([claim], None, providers, Settings(), pool)
    assert selected["c"] == ["https://bbc.com/full"]
