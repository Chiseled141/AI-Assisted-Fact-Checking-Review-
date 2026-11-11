"""Fetches web pages for the pipeline. URLs can come from users, so only public addresses are allowed."""

import ipaddress
import re
import socket
from dataclasses import dataclass
from html import unescape
from urllib.parse import urljoin, urlsplit

import httpx
import trafilatura
from lxml import html as lxml_html

from config.settings import Settings


class FetchError(Exception):
    """The page could not be read. The message is safe to show to users."""


@dataclass
class Page:
    url: str
    title: str
    text: str
    publisher: str | None = None
    published_at: str | None = None
    image_url: str | None = None


def clean_page_text(text: str) -> str:
    """Keep article words, not Markdown image captions, navigation links or tracking URLs."""
    # FRED series pages wrap their actual observations in a large graph-editor interface.
    if "Permalink/Embed" in text and "\nObservations\n" in text:
        observations = text.index("\nObservations\n")
        header = next((line for line in reversed(text[:observations].splitlines())
                       if line.strip() and not re.fullmatch(r"[=\-\s]+", line)), "")
        text = header + text[observations:]
        end = re.search(r"\n(?:Updated:|Fullscreen|Notes|Suggested Citation:)", text)
        if end:
            text = text[:end.start()]
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if "![" in stripped or re.match(r"^\[?(?:Image|Photo)\s+\d+[:\]]", stripped):
            continue
        if re.search(r"select automatic updates|make it responsive|see fred help|back to top|skip to (?:main )?content|"
                     r"copy to clipboard|cookie settings|subscribe to (?:read|continue)|sign in to (?:read|continue)",
                     stripped, re.IGNORECASE):
            continue
        # Standalone links are navigation or related-story cards, not article paragraphs.
        if re.fullmatch(r"\[[^\n]+\]\(https?://[^\n]+\)", stripped):
            continue
        line = re.sub(r"\[([^\[\]\n]+)\]\([^\s\n]*\)", r"\1", line)
        line = re.sub(r"\[([^\[\]\n]+)\]\(#[^)]*\)", r"\1", line)
        line = re.sub(r"https?://\S+", "", line)
        line = re.sub(r"^\s{0,3}#{1,6}\s+", "", line)
        line = re.sub(r"(?<!\w)(\*\*|__)(.+?)\1(?!\w)", r"\2", line)
        if not re.fullmatch(r"[|\-:\s]*", line):
            lines.append(line.rstrip())
    return unescape("\n".join(lines)).strip()


def _is_global_address(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%")[0])
    mapped = getattr(ip, "ipv4_mapped", None)
    return (mapped or ip).is_global


def _is_public(host: str) -> bool:
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, None)}
    except socket.gaierror:
        return False
    return bool(addresses) and all(_is_global_address(address) for address in addresses)


def check_url_allowed(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise FetchError("Only http and https links can be checked.")
    if parts.username or parts.password or parts.port not in (None, 80, 443):
        raise FetchError("This link cannot be fetched.")
    if not _is_public(parts.hostname):
        raise FetchError("This link does not point to a public website.")


def _download(url: str, settings: Settings) -> tuple[str, str]:
    """Follows redirects by hand, because each hop has to be checked too."""
    with httpx.Client(timeout=settings.fetch_timeout_seconds, headers={"User-Agent": "ClaimTrace/0.1"}) as client:
        for _ in range(settings.fetch_max_redirects + 1):
            check_url_allowed(url)
            with client.stream("GET", url) as response:
                if response.is_redirect:
                    url = urljoin(url, response.headers.get("location", ""))
                    continue
                if response.status_code != 200:
                    raise FetchError(f"The page returned status {response.status_code}.")
                if "html" not in response.headers.get("content-type", "html").lower():
                    raise FetchError("This link is not a web page.")
                body = b""
                for chunk in response.iter_bytes():
                    body += chunk
                    if len(body) > settings.fetch_max_bytes:
                        raise FetchError("This page is too large to read.")
                return url, body.decode(response.encoding or "utf-8", errors="replace")
    raise FetchError("This link redirects too many times.")


def _apple_store_prices(html: str, url: str) -> str:
    parts = urlsplit(url)
    if parts.hostname not in {"apple.com", "www.apple.com"} or "/shop/buy-iphone/" not in parts.path:
        return ""
    try:
        page = lxml_html.fromstring(html)
    except (ValueError, lxml_html.etree.ParserError):
        return ""
    # The article reader skips the interactive product choices even when the prices are in the HTML.
    rows = page.xpath(
        '//*[contains(concat(" ", normalize-space(@class), " "), " current_price ")]'
        '/ancestor::div[contains(concat(" ", normalize-space(@class), " "), " details ")][1]'
    )
    return "\n".join(dict.fromkeys(" ".join(row.text_content().split()) for row in rows))


def page_from_html(html: str, url: str) -> Page:
    text = trafilatura.extract(html, include_comments=False, include_tables=True)
    # A table's ruled lines, empty rows and a reference list only take up room in what the models read.
    text = clean_page_text(re.sub(r"(?m)^([|\-:\s]+|- ↑.*)$\n?", "", text or ""))
    prices = _apple_store_prices(html, url)
    if prices:
        text = f"{prices}\n\n{text}".strip()
    if not text or len(text.split()) < 20:
        raise FetchError("No article text could be read from this page.")
    metadata = trafilatura.extract_metadata(html, default_url=url)
    published = getattr(metadata, "date", None) if not prices else None
    return Page(
        url=url,
        title=getattr(metadata, "title", None) or urlsplit(url).hostname or url,
        text=text,
        publisher=getattr(metadata, "sitename", None) or None,
        # Unknown stays unknown: only a full date is kept.
        published_at=published if published and re.fullmatch(r"\d{4}-\d{2}-\d{2}", published) else None,
        image_url=getattr(metadata, "image", None) or None,
    )


def fetch_page(url: str, settings: Settings) -> Page:
    try:
        final_url, html = _download(url, settings)
    except httpx.HTTPError as error:
        raise FetchError("The page could not be reached.") from error
    return page_from_html(html, final_url)
