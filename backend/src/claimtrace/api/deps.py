"""Shared route helpers: the signed-in user, and rows that user owns.

A check, claim or follow-up that belongs to someone else answers 404, the same as one that doesn't exist,
so ids can't be probed. Checks with no owner (saved before accounts) are hidden from everyone.
"""

import hashlib
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from claimtrace.config.settings import Settings, get_settings
from claimtrace.db import models
from claimtrace.db.session import get_session


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def optional_user(
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> models.User | None:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    signed_in = session.scalar(select(models.UserSession).where(models.UserSession.token_hash == token_hash(token)))
    if signed_in is None or _aware(signed_in.expires_at) <= datetime.now(UTC):
        return None
    return signed_in.user


def current_user(user: models.User | None = Depends(optional_user)) -> models.User:
    if user is None:
        raise HTTPException(401, "Log in to continue.")
    return user


def owned_check(session: Session, check_id: str, user: models.User) -> models.Check:
    check = session.get(models.Check, check_id)
    if check is None or check.user_id != user.id:
        raise HTTPException(404, "Not found.")
    return check


def owned_claim(session: Session, claim_id: str, user: models.User) -> models.Claim:
    claim = session.get(models.Claim, claim_id)
    if claim is None or claim.check.user_id != user.id:
        raise HTTPException(404, "Not found.")
    return claim
