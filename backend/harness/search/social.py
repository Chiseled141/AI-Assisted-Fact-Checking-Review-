"""First-party posts from accounts linked by the owner, with author checks at read time."""

import re
from datetime import datetime
from urllib.parse import urlsplit

import httpx
from lxml import html

from config.settings import Settings, load_data

from .fetcher import Page

ACCOUNTS = load_data("social_accounts.json")["accounts"]
X_ACCOUNTS = {entry["x"].casefold(): entry for entry in ACCOUNTS if entry.get("x")}
X_HOSTS = {"x.com", "www.x.com", "twitter.com", "www.twitter.com"}
ATTRIBUTION = r"(?:said|announced|posted|confirmed|denied|published|stated|công bố|thông báo|đăng|xác nhận|phủ nhận|nói)\b"


def account_for_claim(claim: str) -> str | None:
    matches = [
        (len(name), handle) for handle, entry in X_ACCOUNTS.items()
        for name in (entry["name"], *entry.get("aliases", []))
        if re.search(rf"(?<!\w){re.escape(name)}\s+(?:(?:officially|publicly|đã|vừa)\s+)?{ATTRIBUTION}", claim, re.IGNORECASE)
    ]
    return max(matches)[1] if matches else None


def x_post_id(url: str, handle: str) -> str | None:
    try:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.netloc.lower() not in X_HOSTS:
            return None
    except ValueError:
        return None
    match = re.fullmatch(rf"/{re.escape(handle)}/status/(\d+)/?", parsed.path, re.IGNORECASE | re.ASCII)
    return match[1] if match else None


def read_x_post(url: str, handle: str, settings: Settings) -> Page | None:
    if handle not in X_ACCOUNTS or not (post_id := x_post_id(url, handle)):
        return None
    try:
        response = httpx.get(
            "https://publish.x.com/oembed",
            params={"url": f"https://x.com/{handle}/status/{post_id}", "omit_script": "true"},
            timeout=settings.fetch_timeout_seconds,
        )
        response.raise_for_status()
        result = response.json()
        author = urlsplit(result["author_url"])
        if author.scheme != "https" or author.netloc.lower() not in X_HOSTS or author.path.strip("/").casefold() != handle:
            return None
        embed = html.fromstring(result["html"])
        bodies = embed.xpath("//blockquote/p")
        links = [link for link in embed.xpath("//blockquote/a[@href]") if x_post_id(link.get("href"), handle) == post_id]
        if not bodies or not links:
            return None
        for body in bodies:
            for line_break in body.iter("br"):
                line_break.tail = "\n" + (line_break.tail or "")
        text = "\n".join(body.text_content().strip() for body in bodies).strip()
        if not text:
            return None
        date_text = links[-1].text_content().strip()
        published_at = datetime.strptime(date_text, "%B %d, %Y").date().isoformat()
        publisher = f"{X_ACCOUNTS[handle]['name']} (@{handle})"
        return Page(url=url, title=f"{publisher} on X", text=text, publisher=publisher, published_at=published_at)
    except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError, html.etree.ParserError):
        return None
