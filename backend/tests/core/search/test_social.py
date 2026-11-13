import httpx
import pytest

from claimtrace.config.settings import Settings
from claimtrace.core.search.social import account_for_claim, read_x_post, x_post_id

URL = "https://x.com/NASA/status/1362900021386104838"


def test_only_statements_attributed_to_the_registered_owner_get_social_search():
    assert account_for_claim("NASA announced a briefing.") == "nasa"
    assert account_for_claim("Taylor Swift đã công bố album mới.") == "taylorswift13"
    assert account_for_claim("A fan said NASA will hold a briefing.") is None
    assert account_for_claim("Taylor Swift lives in Miami.") is None
    assert account_for_claim("NASA Fan announced a briefing.") is None
    assert x_post_id(URL.replace("/NASA/", "/NASA_Official/"), "nasa") is None
    assert x_post_id(URL.replace("x.com/", "x.com.example.org/"), "nasa") is None
    assert x_post_id("https://x.com/i/web/status/1362900021386104838", "nasa") is None


@pytest.mark.parametrize("author, canonical, accepted", [
    ("https://x.com/NASA", URL, True),
    ("https://x.com/NASA_Official", URL, False),
    ("https://x.com/NASA", URL.replace("1362900021386104838", "1"), False),
])
def test_x_post_must_match_the_embed_author_and_post_id(monkeypatch, author, canonical, accepted):
    def get(endpoint, **options):
        return httpx.Response(200, request=httpx.Request("GET", endpoint), json={
            "author_url": author,
            "html": f'<blockquote><p>Save the date.</p><a href="{canonical}">February 19, 2021</a></blockquote>',
        })

    monkeypatch.setattr(httpx, "get", get)
    page = read_x_post(URL, "nasa", Settings())
    assert bool(page) is accepted
    if page:
        assert page.text == "Save the date."
        assert page.published_at == "2021-02-19"
