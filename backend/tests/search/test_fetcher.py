import httpx
import pytest

from app.core.config import Settings
from app.search import fetcher
from app.search.fetcher import FetchError, check_url_allowed, page_from_html


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/admin",
        "http://localhost/admin",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "file:///etc/passwd",
        "ftp://example.org/a",
        "http://user:pass@example.org/",
        "http://example.org:8080/",
    ],
)
def test_private_and_unusual_addresses_are_blocked(url):
    with pytest.raises(FetchError):
        check_url_allowed(url)


def test_a_redirect_to_a_private_address_is_blocked(monkeypatch):
    settings = Settings()
    monkeypatch.setattr(fetcher, "_is_public", lambda host: host == "public.example")

    def respond(request):
        return httpx.Response(302, headers={"location": "http://internal.example/secret"})

    real_client = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs))
    with pytest.raises(FetchError, match="public website"):
        fetcher.fetch_page("http://public.example/a", settings)


def test_large_pages_and_endless_redirects_are_refused(monkeypatch):
    settings = Settings(fetch_max_bytes=10)
    monkeypatch.setattr(fetcher, "_is_public", lambda host: True)
    real_client = httpx.Client

    def use(respond):
        monkeypatch.setattr(httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs))

    use(lambda request: httpx.Response(200, headers={"content-type": "text/html"}, content=b"x" * 100))
    with pytest.raises(FetchError, match="too large"):
        fetcher.fetch_page("http://a.example/", settings)
    use(lambda request: httpx.Response(302, headers={"location": "http://a.example/again"}))
    with pytest.raises(FetchError, match="redirects"):
        fetcher.fetch_page("http://a.example/", settings)


def test_page_text_and_metadata_are_extracted():
    body = "<p>" + "The metro line opened to passengers in Hanoi on Saturday morning after years of delays. " * 6 + "</p>"
    html = f"""<html><head><title>Metro opens | Example</title>
      <meta property="og:site_name" content="Example News">
      <meta property="og:image" content="https://example.org/photo.jpg">
      <meta property="article:published_time" content="2021-11-06T08:00:00Z"></head>
      <body><article><h1>Metro opens</h1>{body}</article></body></html>"""
    page = page_from_html(html, "https://example.org/a")
    assert "opened to passengers" in page.text
    assert page.publisher == "Example News"
    assert page.published_at == "2021-11-06"
    assert page.image_url == "https://example.org/photo.jpg"


def test_a_page_with_no_article_text_is_not_readable():
    with pytest.raises(FetchError):
        page_from_html("<html><body><nav>Home</nav></body></html>", "https://example.org/")


def test_a_pages_tables_are_kept_so_their_figures_can_be_read():
    words = "The climate of the state varies a great deal from one region to the next every year. " * 3
    html = f"<html><body><article><p>{words}</p><table><tr><th>Month</th><th>Record</th></tr><tr><td>November</td><td>102 °F</td></tr></table><ul><li>↑ A reference to a book about the weather.</li></ul></article></body></html>"
    text = page_from_html(html, "https://example.org/a").text
    assert "102 °F" in text
    assert "---" not in text
    assert "↑" not in text
