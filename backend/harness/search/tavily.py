"""Web evidence. Search stays in our pipeline; judges never open links."""

import logging
import re
import unicodedata
from calendar import month_name
from collections.abc import Callable
from dataclasses import dataclass, replace
from email.utils import parsedate_to_datetime
from hashlib import sha256
from typing import Protocol
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

from config.settings import Settings, load_data

from ..providers.errors import service_failure
from .fetcher import FetchError, Page, clean_page_text
from .social import X_ACCOUNTS, x_post_id

logger = logging.getLogger(__name__)

# One list for both sides: the frontend reads the same file for names, logos and descriptions.
SOURCE_RATINGS: dict[str, str] = {
    domain: entry["trust"] for domain, entry in load_data("source_ratings.json")["sources"].items()
}
# The initial search and ordinary backfill use the project's green allowlist.
SEARCH_DOMAINS = sorted(domain for domain, rating in SOURCE_RATINGS.items() if rating == "green")
TAVILY_DOMAIN_LIMIT = 300
DISCOVERY_BLOCKED_DOMAINS = (
    "facebook.com", "instagram.com", "x.com", "twitter.com", "t.co", "tiktok.com", "youtube.com", "youtu.be",
    "reddit.com", "threads.net", "threads.com", "snapchat.com", "twitch.tv", "linkedin.com", "telegram.org", "t.me",
    "pinterest.com", "medium.com", "blogspot.com", "wordpress.com", "tmz.com", "pagesix.com", "radaronline.com",
    "mirror.co.uk", "dailystar.co.uk", "dailymail.com", "dailymail.co.uk", "the-sun.com", "thesun.co.uk", "nypost.com",
)
NORWEGIAN_MONTHS = ("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")


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
PUBLIC_PROFILE_DOMAINS = [domain for domain in CHART_SOURCES["public_profiles"] if SOURCE_RATINGS.get(domain) == "green"]


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
    snippet: str | None = None
    reviewed_external: bool = False
    x_handle: str | None = None


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


def _rated_host(url: str) -> tuple[str, str | None] | None:
    try:
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https") or parts.username or parts.password:
            return None
        host = (parts.hostname or "").lower().removeprefix("www.").rstrip(".")
        if not host or parts.port not in (None, 80, 443):
            return None
    except ValueError:
        return None
    parts = host.split(".")
    for index in range(len(parts) - 1):
        rating = SOURCE_RATINGS.get(".".join(parts[index:]))
        if rating:
            return host, rating
    return host, None


def is_allowed_source(url: str) -> bool:
    rated = _rated_host(url)
    return bool(rated and rated[1] == "green")


def is_discovery_source(url: str) -> bool:
    if not (rated := _rated_host(url)):
        return False
    host, rating = rated
    return rating in (None, "green") and not any(
        host == domain or host.endswith(f".{domain}") for domain in DISCOVERY_BLOCKED_DOMAINS
    )


class TavilySearch:
    def __init__(self, settings: Settings):
        self.settings = settings

    def search(self, query: str) -> list[str]:
        # A caller of this asks about one period in its query, so relevance decides, not age.
        return [hit.url for hit in self.search_hits(query, newest_first=False)]

    def search_more(self, query: str, exclude_domains: list[str], **options) -> list[SearchHit]:
        return self.search_hits(query, exclude_domains=exclude_domains, **options)

    def discover_hits(self, query: str, **options) -> list[SearchHit]:
        """Open-web candidates for a second editorial review, never for direct use as evidence."""
        return self.search_hits(query, **options, discover=True, include_images=False)

    def search_x_posts(self, query: str, handle: str, **options) -> list[SearchHit]:
        if handle not in X_ACCOUNTS:
            return []
        return self.search_hits(
            f"@{handle} {query}", domains=["x.com", "twitter.com"], x_handle=handle, include_images=False, **options,
        )

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
        advanced: bool = False,
        discover: bool = False,
        x_handle: str | None = None,
    ) -> list[SearchHit]:
        """Keep images attributed to a specific result; query-wide images aren't article previews."""
        if x_handle and x_handle not in X_ACCOUNTS:
            return []
        excluded = list(dict.fromkeys([*(exclude_domains or []), *(DISCOVERY_BLOCKED_DOMAINS if discover else ())]))
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
            "exclude_domains": excluded,
            "search_depth": "advanced" if advanced else "basic",
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
            batches = [{}] if discover else [
                {"include_domains": included[offset:offset + TAVILY_DOMAIN_LIMIT], "include_domains_mode": "restrict"}
                for offset in range(0, len(included), TAVILY_DOMAIN_LIMIT)
            ]
            for scope in batches:
                response = httpx.post(
                    "https://api.tavily.com/search",
                    headers={"Authorization": f"Bearer {self.settings.tavily_api_key}"},
                    json={**payload, **scope},
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
        admissible = is_discovery_source if discover else is_allowed_source
        for result in results:
            url = result.get("url")
            if not isinstance(url, str) or not (x_post_id(url, x_handle) if x_handle else admissible(url)):
                continue
            if source_domain(url) in excluded:
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
            snippet = result.get("content")
            hits[key] = SearchHit(
                url=url,
                image_url=image_url,
                title=title if isinstance(title, str) else None,
                raw_content=raw,
                published_at=_hit_date(result.get("published_date")),
                snippet=clean_page_text(snippet) if isinstance(snippet, str) else None,
                x_handle=x_handle,
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


def data_table_domains(text: str, *, fallback: bool = True) -> list[str]:
    """Match a claim or query to approved publishers with tables for its subject."""
    words = f" {_words(text)} "
    profiles = CHART_SOURCES["data_profiles"]
    matched = [
        domain for profile in profiles.values()
        if any(f" {_words(term)} " in words for term in profile.get("terms", ()))
        for domain in profile["domains"]
    ]
    domains = [*sport_organizers(text), *matched] or (profiles["general"]["domains"] if fallback else [])
    return [domain for domain in dict.fromkeys(domains) if SOURCE_RATINGS.get(domain) == "green"]


def manufacturer_price_domains(text: str) -> list[str]:
    words = _words(text)
    if not re.search(r"\b(gia|prices?|priced|costs?|msrp|rrp)\b", words):
        return []
    if re.search(r"\b(gia co phieu|share price|stock price|resale|second hand|da qua su dung|xe cu)\b", words):
        return []
    vietnam = bool(re.search(r"\b(viet nam|vietnam|vnd|dong)\b", words) or re.search(r"\d\s*[₫đ]\b", text))
    united_states = bool(re.search(r"\b(united states|usa|u s|in the us|thi truong my|tai my)\b", words))
    domains = dict.fromkeys(
        domain for profile in CHART_SOURCES["manufacturer_prices"]
        if any(_mentions(text, term) for term in profile["terms"])
        for domain in (profile.get("vn", profile["domains"]) if vietnam else profile["domains"])
        if vietnam or not united_states or domain not in profile.get("vn", [])
    )
    return [domain for domain in domains if SOURCE_RATINGS.get(domain) == "green"]


def apple_vietnam_price_page(text: str) -> str | None:
    words = _words(text)
    if not re.search(r"\bapple store (?:viet nam|vietnam)\b", words):
        return None
    if not re.search(r"\b(hien|hien tai|currently|today)\b", words) or "apple.com" not in manufacturer_price_domains(text):
        return None
    model = re.search(r"\b(iphone \d+)\b(?!\s+(?:pro|max|plus|mini|air|e|duo)\b)", words)
    return CHART_SOURCES["apple_vietnam_store_pages"].get(model[1]) if model else None


def worldwide_box_office_year(text: str, current_year: int) -> int | None:
    """A full-year worldwide ranking, including year-to-date for the current year."""
    words = _words(text)
    years = set(re.findall(r"\b(?:19|20)\d{2}\b", words))
    if len(years) != 1:
        return None
    year = int(years.pop())
    if year > current_year or not re.search(r"\b(worldwide|global|toan cau|the gioi)\b", words):
        return None
    if not re.search(r"\b(box office|highest grossing|phong ve|doanh thu)\b", words):
        return None
    if not re.search(r"\b(rank(?:ed|ing)?|leads?|leading|top|highest|dan dau|cao nhat|hang nhat|so 1)\b", words):
        return None
    if re.search(r"\b(week(?:end|ly)?|month(?:ly)?|quarter|as of|tuan|thang|quy|tinh den ngay)\b", words):
        return None
    if re.search(r"\b(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{1,2}(?:-\d{1,2})?|\d{1,2}/\d{1,2})\b", text):
        return None
    return year


def worldwide_box_office_page(year: int) -> str:
    return CHART_SOURCES["data_profiles"]["box_office"]["worldwide_year_page"].format(year=year)


def norway_car_registration_period(text: str) -> tuple[int, int] | None:
    """Recognize a year-to-date share of new passenger-car registrations in Norway."""
    words = _words(text)
    if not re.search(r"\b(na uy|norway)\b", words):
        return None
    if not re.search(r"\b(xe dien|xe thuan dien|electric cars?|electric vehicles?)\b", words):
        return None
    if not re.search(r"\b(dang ky moi|new passenger cars?|new car registrations?)\b", words):
        return None
    if period := re.search(r"\bthang 1 den (?:het )?thang (\d{1,2}) (20\d{2})\b", words):
        month, year = map(int, period.groups())
        return (year, month) if 1 <= month <= 12 else None
    if period := re.search(r"\bjanuary (?:to |through )?([a-z]+) (20\d{2})\b", words):
        month, year = period.groups()
        months = {name.lower(): number for number, name in enumerate(month_name) if name}
        if month in months:
            return int(year), months[month]
    return None


def norway_car_registration_page() -> str:
    return CHART_SOURCES["data_profiles"]["transport"]["norway_registrations_page"]


def norway_car_registration_query(period: tuple[int, int]) -> str:
    year, month = period
    return (
        f"Norge elbilandel nye personbiler jan {NORWEGIAN_MONTHS[month - 1]} {year} "
        "Fordeling av drivlinjer Elektrisitet Bensin Diesel hybrid prosentpoeng"
    )


def norway_car_registration_excerpt(text: str, period: tuple[int, int]) -> str | None:
    year, month = period
    totals = re.search(
        r"(?m)^\| Registreringer og eierskifter[^\n]*(?:\n[^\n]*){0,12}?\n\| Førstegangsregistrerte nye \|[^\n]*",
        text,
    )
    mix = re.search(
        r"(?m)^\| Fordeling av drivlinjer[^\n]*\n\| Drivlinje[^\n]*\n(?:\|[^|\n]+\|[^|\n]+\|[^|\n]*%[^|\n]*\|[^\n]*(?:\n|$))+",
        text,
    )
    coverage = rf"jan {NORWEGIAN_MONTHS[month - 1]} {year}\b"
    if totals and mix and re.search(coverage, _words(totals[0])) and "| Elektrisitet |" in mix[0]:
        scope = "\n".join(line for line in totals[0].splitlines() if line.startswith("|"))
        return f"{scope}\n\n{mix[0].rstrip()}"
    return None


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
