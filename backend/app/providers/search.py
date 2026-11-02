"""Web evidence and published fact-checks. Search stays in our pipeline; judges never open links."""

import json
import logging
import re
from pathlib import Path
from typing import Protocol
from urllib.parse import urlsplit

import httpx

from ..core.config import Settings

logger = logging.getLogger(__name__)

SOURCE_RATINGS: dict[str, str] = json.loads(
    (Path(__file__).parent.parent / "data" / "source_ratings.json").read_text(encoding="utf-8")
)
# Unreliable sources are never searched, and never count as evidence.
SEARCH_DOMAINS = sorted(domain for domain, rating in SOURCE_RATINGS.items() if rating != "red")


class SearchError(Exception):
    pass


class Search(Protocol):
    def search(self, query: str) -> list[str]:
        """Returns result URLs, best first."""
        ...


class FactChecks(Protocol):
    def lookup(self, claim: str) -> dict | None: ...


def is_allowed_source(url: str) -> bool:
    host = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    parts = host.split(".")
    for index in range(len(parts) - 1):
        rating = SOURCE_RATINGS.get(".".join(parts[index:]))
        if rating:
            return rating != "red"
    return False


class TavilySearch:
    def __init__(self, settings: Settings):
        self.settings = settings

    def search(self, query: str) -> list[str]:
        try:
            response = httpx.post(
                "https://api.tavily.com/search",
                headers={"Authorization": f"Bearer {self.settings.tavily_api_key}"},
                json={
                    "query": query[:400],
                    "max_results": self.settings.search_results_per_claim,
                    "include_domains": SEARCH_DOMAINS,
                    "search_depth": "basic",
                },
                timeout=20,
            )
            response.raise_for_status()
            results = response.json().get("results", [])
        except (httpx.HTTPError, ValueError) as error:
            raise SearchError(f"Web search failed: {type(error).__name__}") from error
        return [result["url"] for result in results if is_allowed_source(result.get("url", ""))]


def _words(text: str) -> set[str]:
    return {word for word in re.findall(r"\w+", text.lower()) if len(word) > 2}


NEGATIONS = {"not", "never", "no", "none", "without", "didn", "doesn", "isn", "wasn", "aren", "weren", "won"}
TRUE_RATINGS = {"true", "correct", "accurate"}
FALSE_RATINGS = {"false", "incorrect", "fake", "fabricated", "not true", "pants on fire", "pants on fire!"}


def fast_path_verdict(claim: str, match: dict) -> str | None:
    """A verdict from a published fact-check, only when it is plainly the same claim with a plain rating.

    Anything else, such as "Misleading" or "Half true", goes through the judges. The match is still shown.
    """
    rating = match.get("rating", "").strip().lower().rstrip(".")
    verdict = "supported" if rating in TRUE_RATINGS else "contradicted" if rating in FALSE_RATINGS else None
    reviewed = match.get("claim_reviewed", "")
    if verdict is None or not reviewed:
        return None
    first, second = _words(claim), _words(reviewed)
    similarity = len(first & second) / max(len(first | second), 1)
    # "The law did not pass" and "The law passed" share most words but mean the opposite.
    if similarity < 0.7 or bool(first & NEGATIONS) != bool(second & NEGATIONS):
        return None
    return verdict


class GoogleFactChecks:
    """The fast path. Without a key, or when Google fails, the check simply carries on without it."""

    MIN_OVERLAP = 0.6

    def __init__(self, settings: Settings):
        self.key = settings.google_factcheck_api_key

    def lookup(self, claim: str) -> dict | None:
        if not self.key:
            return None
        try:
            response = httpx.get(
                "https://factchecktools.googleapis.com/v1alpha1/claims:search",
                params={"query": claim[:300], "key": self.key, "pageSize": 5},
                timeout=10,
            )
            response.raise_for_status()
            found = response.json().get("claims", [])
        except (httpx.HTTPError, ValueError) as error:
            logger.warning("Fact check lookup failed: %s", type(error).__name__)
            return None
        words = _words(claim)
        for item in found:
            overlap = len(words & _words(item.get("text", ""))) / max(len(words), 1)
            reviews = item.get("claimReview") or []
            if overlap >= self.MIN_OVERLAP and reviews and reviews[0].get("url"):
                review = reviews[0]
                return {
                    "publisher": (review.get("publisher") or {}).get("name") or urlsplit(review["url"]).hostname,
                    "rating": review.get("textualRating") or "",
                    "url": review["url"],
                    "claim_reviewed": item.get("text", ""),
                }
        return None
