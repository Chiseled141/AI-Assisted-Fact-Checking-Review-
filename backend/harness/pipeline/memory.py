"""Earlier checks of the same claim, so a reader can open a saved verdict instead of paying for a new check.

Matching is plain text comparison, with no model call. Wording may differ a little, but every number must match:
"passed 100,000" and "passed 90,000" are different claims however alike the rest reads.
"""

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from database import models

MIN_SIMILARITY = 0.75
SCAN_LIMIT = 500  # The most recent assessed claims. Enough for a course project's history, and fast.
MIN_LENGTH = 12


@dataclass
class EarlierClaim:
    check_id: str
    claim_id: str
    position: int
    text: str
    verdict: str
    checked_at: datetime
    similarity: float


@dataclass
class EarlierLink:
    check_id: str
    title: str
    claim_count: int
    checked_at: datetime


def _normal(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.casefold().replace("đ", "d"))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^\w]+", " ", text).split())


def _numbers(text: str) -> set[str]:
    """Figures as written, ignoring thousands separators: "100.000", "100,000" and "100000" are the same."""
    return {re.sub(r"[.,\s]", "", match) for match in re.findall(r"\d[\d.,\s]*\d|\d", text)}


def similarity(a: str, b: str) -> float:
    if _numbers(a) != _numbers(b):
        return 0.0
    na, nb = _normal(a), _normal(b)
    if not na or not nb:
        return 0.0
    words_a, words_b = set(na.split()), set(nb.split())
    overlap = len(words_a & words_b) / max(len(words_a), len(words_b))
    return max(SequenceMatcher(None, na, nb).ratio(), overlap)


def _sentences(text: str) -> list[str]:
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]
    return [text.strip(), *parts] if len(parts) > 1 else [text.strip()]


def similar_claims(session: Session, text: str, user_id: str, limit: int = 3) -> list[EarlierClaim]:
    """Assessed claims from the user's finished checks that say the same as `text`, or one of its sentences. Newest first."""
    if len(text.strip()) < MIN_LENGTH:
        return []
    candidates = session.scalars(
        select(models.Claim)
        .join(models.Check)
        .where(models.Check.user_id == user_id, models.Check.status == "completed", models.Claim.status == "assessed")
        .options(selectinload(models.Claim.verdicts))
        .order_by(models.Check.created_at.desc())
        .limit(SCAN_LIMIT)
    ).all()
    pieces = _sentences(text)
    found: dict[str, EarlierClaim] = {}
    for claim in candidates:
        if not claim.verdicts:
            continue
        score = max(similarity(piece, claim.text) for piece in pieces)
        if score < MIN_SIMILARITY:
            continue
        key = _normal(claim.text)
        latest = claim.verdicts[-1]
        # The same claim checked twice: keep the newest, which the query order puts first.
        if key in found:
            continue
        found[key] = EarlierClaim(
            check_id=claim.check_id,
            claim_id=claim.id,
            position=claim.position,
            text=claim.text,
            verdict=latest.label,
            checked_at=latest.created_at,
            similarity=round(score, 2),
        )
    # Newest first: a later check of the same claim used newer sources, so its verdict is the one to see first.
    return sorted(found.values(), key=lambda item: item.checked_at, reverse=True)[:limit]


def earlier_link(session: Session, url: str, user_id: str) -> EarlierLink | None:
    """The user's newest finished check of the same link, ignoring a trailing slash."""
    wanted = url.strip().rstrip("/")
    if not wanted:
        return None
    check = session.scalars(
        select(models.Check)
        .where(
            models.Check.user_id == user_id,
            models.Check.status == "completed",
            models.Check.input_url.in_([wanted, f"{wanted}/"]),
        )
        .options(selectinload(models.Check.claims))
        .order_by(models.Check.created_at.desc())
        .limit(1)
    ).first()
    if check is None or not check.claims:
        return None
    return EarlierLink(
        check_id=check.id,
        title=(check.article or {}).get("title") or check.title,
        claim_count=len(check.claims),
        checked_at=check.completed_at or check.updated_at,
    )
