"""Web evidence. Search stays in our pipeline; judges never open links."""

import logging
import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, replace
from email.utils import parsedate_to_datetime
from hashlib import sha256
from typing import Protocol
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

from ..core.config import Settings, load_data
from ..providers.errors import service_failure
from .fetcher import FetchError, Page, clean_page_text

logger = logging.getLogger(__name__)

SOURCE_RATINGS: dict[str, str] = load_data("source_ratings.json")
# Only the project's green allowlist is searched and accepted as evidence.
SEARCH_DOMAINS = sorted(domain for domain, rating in SOURCE_RATINGS.items() if rating == "green")
TAVILY_DOMAIN_LIMIT = 300


def _result_score(result: dict) -> float:
    score = result.get("score")
    return score if isinstance(score, (int, float)) else 0.0


def _vietnamese_domain(host: str) -> bool:
    return host == "vnexpress.net" or (
        host.endswith(".vn") and not host.startswith(("en.", "english.")) and host != "vietnamnews.vn"
    )


VIETNAMESE_SEARCH_DOMAINS = [domain for domain in SEARCH_DOMAINS if _vietnamese_domain(domain)]


def is_vietnamese_source(url: str) -> bool:
    try:
        host = (urlsplit(url).hostname or "").lower().removeprefix("www.").rstrip(".")
    except ValueError:
        return False
    return _vietnamese_domain(host)


# What a chart read from sources searches instead of the whole list: official results, then outlets with results desks.
CHART_SOURCES = load_data("chart_sources.json")
CHART_DOMAINS: dict[str, list[str]] = {"elections": CHART_SOURCES["elections"]}


class SearchError(Exception):
    pass


@dataclass(frozen=True)
class SearchHit:
    url: str
    image_url: str | None = None
    title: str | None = None
    raw_content: str | None = None
    # Tavily's own estimate, only good for ordering. It never becomes a source's date, which judges rely on.
    published_at: str | None = None


def _hit_date(value: object) -> str | None:
    """Tavily writes dates like "Tue, 11 Mar 2025 17:00:00 GMT". Anything else counts as undated."""
    if not isinstance(value, str):
        return None
    if re.match(r"\d{4}-\d{2}-\d{2}", value):
        return value[:10]
    try:
        return parsedate_to_datetime(value).date().isoformat()
    except (TypeError, ValueError, IndexError):
        return None


@dataclass(frozen=True)
class TimeWindow:
    """When reports of an event can be expected. `end` is None while that period is still running."""

    start: str
    end: str | None = None


URL_DATE = re.compile(r"(?<!\d)(20\d{2})[/-](\d{2})[/-](\d{2})(?!\d)")


def page_date(url: str, published_at: str | None) -> str | None:
    """A date in the address is fixed when a page is first published, while a page's stated date can be a later edit."""
    if found := URL_DATE.search(url):
        return "-".join(found.groups())
    return published_at[:10] if published_at and re.match(r"\d{4}-\d{2}-\d{2}", published_at) else None


def read_hit(hit: SearchHit, fetch: Callable[[str], Page], settings: Settings) -> Page | None:
    """The page behind a search result. Full-page raw_content may replace a blocked fetch; snippets and images never do."""
    try:
        page = fetch(hit.url)
        return replace(page, image_url=hit.image_url) if not page.image_url and hit.image_url else page
    except FetchError as error:
        logger.info("Article reader failed for %s: %s", hit.url, error)
    raw = clean_page_text(hit.raw_content) if hit.raw_content else None
    if raw and len(raw.split()) >= 20 and len(raw.encode()) <= settings.fetch_max_bytes:
        return Page(url=hit.url, title=hit.title or hit.url, text=raw,
                    publisher=urlsplit(hit.url).hostname, image_url=hit.image_url)
    return None


def source_url_key(url: str) -> str:
    """HTTP/HTTPS variants and tracking parameters must not consume separate source slots."""
    parts = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True)
             if not key.lower().startswith("utm_") and key.lower() not in {"fbclid", "gclid"}]
    return urlunsplit(("https", parts.netloc.lower().removeprefix("www."), parts.path.rstrip("/") or "/", urlencode(query), ""))


def source_domain(url: str) -> str:
    """Group rated subdomains under the same publisher when a parent is also rated."""
    host = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    parts = host.split(".")
    return next((".".join(parts[index:]) for index in range(len(parts) - 2, -1, -1)
                 if ".".join(parts[index:]) in SOURCE_RATINGS), host)


class Search(Protocol):
    def search(self, query: str) -> list[str]:
        """Returns result URLs, best first."""
        ...


def is_allowed_source(url: str) -> bool:
    try:
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https") or parts.username or parts.password:
            return False
        host = (parts.hostname or "").lower().removeprefix("www.")
    except ValueError:
        return False
    parts = host.split(".")
    for index in range(len(parts) - 1):
        rating = SOURCE_RATINGS.get(".".join(parts[index:]))
        if rating:
            return rating == "green"
    return False


class TavilySearch:
    def __init__(self, settings: Settings):
        self.settings = settings

    def search(self, query: str) -> list[str]:
        # A caller of this asks about one period in its query, so relevance decides, not age.
        return [hit.url for hit in self.search_hits(query, newest_first=False)]

    def search_more(self, query: str, exclude_domains: list[str], **options) -> list[SearchHit]:
        return self.search_hits(query, exclude_domains=exclude_domains, **options)

    def search_hits(
        self,
        query: str,
        *,
        exclude_domains: list[str] | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        newest_first: bool = True,
        domains: list[str] | None = None,
        max_results: int | None = None,
        include_images: bool = True,
    ) -> list[SearchHit]:
        """Keep images attributed to a specific result; query-wide images aren't article previews."""
        excluded = exclude_domains or []
        included = [
            domain for domain in (domains or SEARCH_DOMAINS)
            if not any(domain == host or domain.endswith(f".{host}") for host in excluded)
        ]
        limit = min(20, max(1, max_results)) if max_results is not None else min(20, max(
            self.settings.tavily_candidates_per_search, self.settings.target_publishers_per_claim,
        ))
        payload = {
            "query": query[:400],
            "max_results": limit,
            "include_domains_mode": "restrict",
            "exclude_domains": excluded,
            "search_depth": "basic",
            "auto_parameters": False,
            "include_answer": False,
            "include_raw_content": "text",
            "include_images": include_images,
            "include_published_date": True,
            # Tavily keeps undated results by default, which is what we want: they may still be current.
            **({"start_date": start_date} if start_date else {}),
            **({"end_date": end_date} if end_date else {}),
        }
        results: list[dict] = []
        try:
            for offset in range(0, len(included), TAVILY_DOMAIN_LIMIT):
                response = httpx.post(
                    "https://api.tavily.com/search",
                    headers={"Authorization": f"Bearer {self.settings.tavily_api_key}"},
                    json={**payload, "include_domains": included[offset:offset + TAVILY_DOMAIN_LIMIT]},
                    timeout=self.settings.tavily_timeout_seconds,
                )
                response.raise_for_status()
                body = response.json()
                if not isinstance(body, dict) or not isinstance(body.get("results"), list):
                    raise ValueError("Invalid search response")
                results.extend(result for result in body["results"] if isinstance(result, dict))
        except (httpx.HTTPError, ValueError) as error:
            raise SearchError(service_failure(error)) from error
        if len(included) > TAVILY_DOMAIN_LIMIT:
            results.sort(key=_result_score, reverse=True)
        hits: dict[str, SearchHit] = {}
        seen_content: set[str] = set()
        for result in results:
            url = result.get("url")
            if not isinstance(url, str) or not is_allowed_source(url) or source_domain(url) in excluded:
                continue
            key = source_url_key(url)
            raw = result.get("raw_content")
            raw = clean_page_text(raw) if isinstance(raw, str) else None
            if raw and len(raw.encode()) > self.settings.fetch_max_bytes:
                raw = None
            host = (urlsplit(url).hostname or "").lower().removeprefix("www.")
            content_key = f"{host}:{sha256(raw.encode()).hexdigest()}" if raw else None
            if key in hits or (content_key and content_key in seen_content):
                continue
            images = result.get("images")
            image_url = None
            for image in images if isinstance(images, list) else []:
                candidate = image.get("url") if isinstance(image, dict) else image
                if not isinstance(candidate, str):
                    continue
                try:
                    parts = urlsplit(candidate)
                except ValueError:
                    continue
                if parts.scheme == "https" and parts.hostname and not parts.username and not parts.password:
                    image_url = candidate
                    break
            title = result.get("title")
            hits[key] = SearchHit(
                url=url,
                image_url=image_url,
                title=title if isinstance(title, str) else None,
                raw_content=raw,
                published_at=_hit_date(result.get("published_date")),
            )
            if content_key:
                seen_content.add(content_key)
            if len(hits) >= min(limit, self.settings.tavily_candidates_per_search):
                break
        found = list(hits.values())
        if not newest_first:
            return found
        # Tavily only ranks by relevance, so age is ordered here among its results. Sources with no date go last,
        # and results of the same age keep Tavily's order.
        return sorted(found, key=lambda hit: hit.published_at or "", reverse=True)


# ---------------------------------------------------------------------------------------------------------------------
# Chart source selection, independent of model guesses. URLs and domains live in one editable registry.
# ---------------------------------------------------------------------------------------------------------------------

def _words(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.casefold().replace("đ", "d"))
    return re.sub(r"[^\w]+", " ", "".join(char for char in text if not unicodedata.combining(char))).strip()


def _mentions(text: str, name: str) -> bool:
    return f" {_words(name)} " in f" {_words(text)} "


def sport_organizers(text: str) -> list[str]:
    """Use explicit competition names to scope an initial search to eligible organizers."""
    words = f" {_words(text)} "
    return [
        domain for domain, aliases in CHART_SOURCES["sport_organizers"].items()
        if SOURCE_RATINGS.get(domain) == "green" and any(f" {_words(alias)} " in words for alias in aliases)
    ]


def within_domains(url: str, domains: list[str] | tuple[str, ...]) -> bool:
    if not is_allowed_source(url):
        return False
    host = (urlsplit(url).hostname or "").lower()
    return any(host == domain or host.endswith(f".{domain}") for domain in domains)


@dataclass(frozen=True)
class ElectionSources:
    country: str | None
    year: int | None
    domains: tuple[str, ...]
    pages: tuple[str, ...] = ()


def election_sources(text: str, body: str = "", year: int | None = None, office: str | None = None) -> ElectionSources:
    countries = CHART_SOURCES["countries"]
    # The current state-result map is specifically US. A parliament chart needs one unambiguous country.
    matches = [code for code, profile in countries.items() if any(_mentions(text, name) for name in profile["aliases"])]
    country = "US" if office else matches[0] if len(matches) == 1 else None
    if country is None:
        return ElectionSources(None, year, tuple(CHART_DOMAINS["elections"]))
    profile = countries[country]
    domains = tuple(domain for domain in profile["domains"] if SOURCE_RATINGS.get(domain) == "green")
    chamber = office or ("lower" if any(_mentions(body, name) for name in profile.get("lower_house", [])) else None)
    pages = profile["results"].get(f"{chamber}-{year}", []) if chamber and year else []
    return ElectionSources(country, year, domains, tuple(url for url in pages if within_domains(url, domains)))


SJC_DOMAINS = tuple(CHART_SOURCES["sjc"]["domains"])
SJC_PAGES = tuple(CHART_SOURCES["sjc"]["official_pages"])
