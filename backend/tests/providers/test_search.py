import httpx

from app.core.config import Settings
from app.providers.search import SEARCH_DOMAINS, GoogleFactChecks, is_allowed_source


def test_only_rated_non_red_domains_can_be_sources():
    assert is_allowed_source("https://www.reuters.com/world/a")
    assert is_allowed_source("https://e.vnexpress.net/a")
    assert not is_allowed_source("https://not-in-the-list.example/a")
    assert not is_allowed_source("https://reuters.com.evil.example/a")
    assert "reuters.com" in SEARCH_DOMAINS


def test_red_sources_are_never_searched_or_allowed():
    from app.providers.search import SOURCE_RATINGS

    red = [domain for domain, rating in SOURCE_RATINGS.items() if rating == "red"]
    assert red
    assert not set(red) & set(SEARCH_DOMAINS)
    assert not is_allowed_source(f"https://{red[0]}/a")


def test_fact_check_lookup_needs_a_close_match_and_survives_errors(monkeypatch):
    lookup = GoogleFactChecks(Settings(google_factcheck_api_key="k"))
    review = {"url": "https://africacheck.org/x", "textualRating": "False", "publisher": {"name": "Africa Check"}}

    def reply(items):
        monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, json={"claims": items}, request=httpx.Request("GET", "https://x")))

    reply([{"text": "the metro line opened in hanoi during 2021", "claimReview": [review]}])
    assert lookup.lookup("The metro line opened in Hanoi in 2021")["publisher"] == "Africa Check"
    reply([{"text": "completely different statement about cheese", "claimReview": [review]}])
    assert lookup.lookup("The metro line opened in Hanoi in 2021") is None

    def fail(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "get", fail)
    assert lookup.lookup("Anything") is None
    assert GoogleFactChecks(Settings(google_factcheck_api_key="")).lookup("Anything") is None
