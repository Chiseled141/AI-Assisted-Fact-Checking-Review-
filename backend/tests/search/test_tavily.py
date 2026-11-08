import httpx
import pytest

from app.core.config import Settings
from app.search.tavily import (
    CHART_DOMAINS,
    CHART_SOURCES,
    SEARCH_DOMAINS,
    SJC_DOMAINS,
    SJC_PAGES,
    SOURCE_RATINGS,
    election_sources,
    is_allowed_source,
    within_domains,
)


def test_only_green_domains_can_be_sources():
    assert is_allowed_source("https://www.reuters.com/world/a")
    assert is_allowed_source("https://e.vnexpress.net/a")
    assert not is_allowed_source("https://not-in-the-list.example/a")
    assert not is_allowed_source("https://en.wikipedia.org/wiki/Texas")
    assert not is_allowed_source("https://youtube.com/watch?v=example")
    assert not is_allowed_source("https://reuters.com.evil.example/a")
    assert "reuters.com" in SEARCH_DOMAINS
    assert "wikipedia.org" not in SEARCH_DOMAINS
    assert len(SEARCH_DOMAINS) <= 300


def test_official_domains_cover_every_visual_and_requested_data_category():
    for domain in (
        'wmo.int', 'ecmwf.int', 'copernicus.eu', 'open-meteo.com', 'nchmf.gov.vn',
        'fec.gov', 'eci.gov.in', 'ipu.org', 'parliament.uk', 'quochoi.vn',
        'eia.gov', 'lbma.org.uk', 'gold.org', 'sjc.com.vn', 'finance.yahoo.com',
        'abs.gov.au', 'statcan.gc.ca', 'datausa.io', 'worldbank.org', 'nso.gov.vn',
        'population.un.org', 'unstats.un.org', 'comtradeplus.un.org', 'undp.org',
        'usgs.gov', 'gdacs.org', 'reliefweb.int', 'emdat.be',
    ):
        assert is_allowed_source(f'https://{domain}/data')


def test_tavily_strictly_limits_search_and_backfill_to_green_publishers(monkeypatch):
    from app.search.tavily import TavilySearch
    payloads = []
    def post(url, **kwargs):
        payloads.append(kwargs['json'])
        return httpx.Response(200, json={'results': [
            {'url': 'https://en.wikipedia.org/wiki/Test'},
            {'url': 'https://reuters.com/already-found'},
            {'url': 'https://bbc.com/new'},
        ]}, request=httpx.Request('POST', url))
    monkeypatch.setattr(httpx, 'post', post)
    hits = TavilySearch(Settings()).search_more('neutral query', ['reuters.com'])
    assert [hit.url for hit in hits] == ['https://bbc.com/new']
    assert payloads[0]['include_domains_mode'] == 'restrict'
    assert 'wikipedia.org' not in payloads[0]['include_domains']
    assert 'reuters.com' not in payloads[0]['include_domains']
    assert payloads[0]['exclude_domains'] == ['reuters.com']


def test_red_sources_are_never_searched_or_allowed():
    from app.search.tavily import SOURCE_RATINGS

    red = [domain for domain, rating in SOURCE_RATINGS.items() if rating == "red"]
    assert red
    assert not set(red) & set(SEARCH_DOMAINS)
    assert not is_allowed_source(f"https://{red[0]}/a")


def test_tavily_keeps_source_images_separate_from_query_images(monkeypatch):
    from app.search.tavily import TavilySearch

    requests = []
    body = {
        'images': [{'url': 'https://images.example/unrelated.jpg'}],
        'results': [
            {'url': 'https://reuters.com/a', 'images': [{'url': 'https://cdn.reuters.com/article.jpg'}]},
            {'url': 'https://bbc.com/b'},
            {'url': 'https://reuters.com/a', 'images': ['https://images.example/duplicate.jpg']},
            {'url': 'https://not-in-the-list.example/a'},
            {'title': 'Missing URL'},
            None,
        ],
    }

    def post(url, **kwargs):
        requests.append(kwargs)
        return httpx.Response(200, json=body, request=httpx.Request('POST', url))

    monkeypatch.setattr(httpx, 'post', post)
    hits = TavilySearch(Settings(tavily_api_key='test')).search_hits('A dated claim')
    assert [hit.url for hit in hits] == ['https://reuters.com/a', 'https://bbc.com/b']
    assert hits[0].image_url == 'https://cdn.reuters.com/article.jpg'
    assert hits[1].image_url is None
    payload = requests[0]['json']
    assert payload['include_images'] is True
    assert payload['include_answer'] is False
    assert payload['include_raw_content'] == 'text'
    assert payload['auto_parameters'] is False
    assert payload['search_depth'] == 'basic'
    assert payload['include_domains'] == SEARCH_DOMAINS
    assert requests[0]['headers']['Authorization'] == 'Bearer test'


def test_bad_optional_images_do_not_break_search_and_url_api_still_works(monkeypatch):
    from app.search.tavily import TavilySearch

    body = {'results': [
        {'url': 'https://reuters.com/a', 'images': [None, {'url': 1}, 'https://[broken', 'javascript:bad',
                                                  'https://user:password@images.example/a', 'https://images.example/a.jpg']},
        {'url': 'https://bbc.com/b', 'images': 'not-a-list'},
        {'url': 'https://[broken'},
    ]}
    monkeypatch.setattr(httpx, 'post', lambda url, **kwargs: httpx.Response(200, json=body, request=httpx.Request('POST', url)))
    provider = TavilySearch(Settings())
    assert provider.search_hits('claim')[0].image_url == 'https://images.example/a.jpg'
    assert provider.search('claim') == ['https://reuters.com/a', 'https://bbc.com/b']


def test_invalid_tavily_response_is_a_search_failure(monkeypatch):
    import pytest

    from app.search.tavily import SearchError, TavilySearch

    for body in ([], {}, {'results': None}, {'results': 'not-a-list'}):
        monkeypatch.setattr(httpx, 'post', lambda url, body=body, **kwargs: httpx.Response(200, json=body, request=httpx.Request('POST', url)))
        with pytest.raises(SearchError):
            TavilySearch(Settings()).search('claim')


def test_tavily_uses_extra_candidates_to_replace_duplicate_links_and_same_site_copies(monkeypatch):
    from app.search.tavily import TavilySearch
    raw = 'Full article content, distinct from the short search snippet.'
    body = {'results': [
        {'url': 'http://www.reuters.com/a?utm_source=x', 'raw_content': raw},
        {'url': 'https://reuters.com/a#top', 'raw_content': raw},
        {'url': 'https://reuters.com/alias', 'raw_content': raw},
        {'url': 'https://bbc.com/b', 'raw_content': 'Another complete article.', 'content': 'Snippet only'},
    ]}
    payloads = []
    def post(url, **kwargs):
        payloads.append(kwargs['json'])
        return httpx.Response(200, json=body, request=httpx.Request('POST', url))
    monkeypatch.setattr(httpx, 'post', post)
    hits = TavilySearch(Settings()).search_hits('neutral evidence query')
    assert len(payloads) == 1
    assert payloads[0]['max_results'] == 20
    assert len(hits) == 2
    assert hits[0].raw_content == raw
    assert hits[1].raw_content == 'Another complete article.'


def test_a_start_date_is_only_sent_when_a_claim_has_one(monkeypatch):
    from app.core.config import Settings
    from app.search.tavily import TavilySearch

    payloads = []

    def post(url, **kwargs):
        payloads.append(kwargs["json"])
        return httpx.Response(200, json={"results": []}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", post)
    search = TavilySearch(Settings(tavily_api_key="test"))
    search.search_hits("query")
    search.search_hits("query", start_date="2026-01-01")
    search.search_more("query", ["bbc.com"], start_date="2026-01-01")
    assert "start_date" not in payloads[0]
    assert payloads[1]["start_date"] == payloads[2]["start_date"] == "2026-01-01"


def test_results_go_newest_first_with_undated_ones_last_except_for_a_period_search(monkeypatch):
    from app.core.config import Settings
    from app.search.tavily import TavilySearch

    results = [
        {"url": "https://reuters.com/undated", "published_date": None},
        {"url": "https://bbc.com/old", "published_date": "Tue, 11 Mar 2022 17:00:00 GMT"},
        {"url": "https://apnews.com/new", "published_date": "Tue, 03 Nov 2026 17:00:00 GMT"},
        {"url": "https://france24.com/garbled", "published_date": "not a date"},
        {"url": "https://aljazeera.com/same-day", "published_date": "Tue, 03 Nov 2026 09:00:00 GMT"},
    ]
    payloads = []

    def post(url, **kwargs):
        payloads.append(kwargs["json"])
        return httpx.Response(200, json={"results": results}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", post)
    search = TavilySearch(Settings(tavily_api_key="test"))
    hosts = [hit.url.split("/")[2] for hit in search.search_hits("query")]
    assert hosts == ["apnews.com", "aljazeera.com", "bbc.com", "reuters.com", "france24.com"]
    assert payloads[0]["include_published_date"] is True
    assert [url.split("/")[2] for url in search.search("query")][0] == "reuters.com"


def test_every_chart_domain_is_green_and_an_election_search_asks_for_only_those(monkeypatch):
    from app.core.config import Settings
    from app.search.tavily import CHART_DOMAINS, TavilySearch

    assert CHART_DOMAINS["elections"]
    assert set(CHART_DOMAINS["elections"]) <= set(SEARCH_DOMAINS)
    payloads = []

    def post(url, **kwargs):
        payloads.append(kwargs["json"])
        return httpx.Response(200, json={"results": []}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", post)
    search = TavilySearch(Settings(tavily_api_key="test"))
    search.search_hits("query", domains=CHART_DOMAINS["elections"], start_date="2024-01-01", end_date="2025-06-30")
    search.search_hits("query")
    assert set(payloads[0]["include_domains"]) == set(CHART_DOMAINS["elections"])
    assert (payloads[0]["start_date"], payloads[0]["end_date"]) == ("2024-01-01", "2025-06-30")
    assert payloads[1]["include_domains"] == SEARCH_DOMAINS


@pytest.mark.parametrize(("claim", "body", "country", "domain"), [
    ("BJP giành 240 ghế Lok Sabha năm 2024.", "Lok Sabha", "IN", "eci.gov.in"),
    ("Labour won seats in the UK House of Commons in 2024.", "House of Commons", "GB", "parliament.uk"),
    ("Canada elected its House of Commons in 2025.", "House of Commons", "CA", "elections.ca"),
    ("Bầu cử Hạ viện Úc năm 2025.", "Hạ viện", "AU", "aec.gov.au"),
    ("New Zealand election seats in 2023.", "Parliament", "NZ", "elections.nz"),
])
def test_a_country_gets_its_own_election_sources(claim, body, country, domain):
    selected = election_sources(claim, body, 2024)
    assert selected.country == country
    assert domain in selected.domains
    assert "sjc.com.vn" not in selected.domains


def test_pinned_pages_match_the_year_and_chamber_not_just_the_country():
    claim = "India's Lok Sabha election"
    assert election_sources(claim, "Lok Sabha", 2024).pages
    assert not election_sources(claim, "Lok Sabha", 2019).pages
    assert not election_sources("India election", "Rajya Sabha", 2024).pages
    assert not election_sources("Canada election", "House of Commons", 2024).pages
    assert election_sources("UK election", "House of Commons", 2024).pages
    assert election_sources("US election", year=2024, office="president").pages
    assert not election_sources("US election", year=2024, office="senate").pages
    assert not election_sources("US election", office="president").pages


def test_unknown_or_ambiguous_countries_do_not_get_another_countrys_pages():
    for text in ("A parliament won seats", "India and the UK held elections", "South Africa election"):
        selected = election_sources(text, "House of Commons", 2024)
        assert selected.country is None
        assert not selected.pages
        assert selected.domains == tuple(CHART_DOMAINS["elections"])


def test_all_registry_domains_and_pinned_pages_stay_within_the_green_list():
    assert all(SOURCE_RATINGS.get(domain) == "green" for domain in SJC_DOMAINS)
    assert all(within_domains(url, SJC_DOMAINS) for url in SJC_PAGES)
    for profile in CHART_SOURCES["countries"].values():
        assert all(SOURCE_RATINGS.get(domain) == "green" for domain in profile["domains"])
        for pages in profile["results"].values():
            assert all(within_domains(url, profile["domains"]) for url in pages)
    assert not within_domains("https://sjc.com.vn.evil.example/price", SJC_DOMAINS)
    assert not within_domains("https://nasa.gov/price", SJC_DOMAINS)


def test_quick_chat_can_request_two_text_results_without_changing_check_defaults(monkeypatch):
    from app.search.tavily import TavilySearch

    payloads = []

    def post(url, **kwargs):
        payloads.append(kwargs['json'])
        return httpx.Response(200, json={'results': []}, request=httpx.Request('POST', url))

    monkeypatch.setattr(httpx, 'post', post)
    settings = Settings()
    provider = TavilySearch(settings)
    provider.search_hits('quick question', max_results=2, include_images=False)
    provider.search_hits('normal check')
    assert payloads[0]['max_results'] == 2 and payloads[0]['include_images'] is False
    assert payloads[1]['max_results'] == min(20, max(
        settings.tavily_candidates_per_search, settings.target_publishers_per_claim,
    ))
    assert payloads[1]['include_images'] is True
