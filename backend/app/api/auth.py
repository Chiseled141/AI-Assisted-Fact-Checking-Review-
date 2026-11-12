"""Accounts: sign up with a username and password, log in, log out. No email and no outside sign-in.

Passwords are hashed with Argon2id. A session is a random token in an HttpOnly cookie; the database keeps only its
SHA-256, so the token can't be read back. SameSite=Lax keeps other sites from sending the cookie with their requests.
"""

import re
import secrets
import time
from base64 import b64decode, b64encode
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from io import BytesIO
from threading import Lock

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from PIL import Image, ImageOps
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from config.settings import Settings, get_settings
from database import models
from database.session import get_session

from . import schemas
from .deps import current_user, token_hash

router = APIRouter(prefix="/auth")

hasher = PasswordHasher()
# Checked when a username doesn't exist, so a wrong name takes as long as a wrong password.
_DUMMY_HASH = hasher.hash("not a real password")
USERNAME = re.compile(r"[a-z0-9._-]+")

_failed: dict[str, deque[float]] = defaultdict(deque)
_failed_lock = Lock()


def _address(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _check_attempts(address: str, settings: Settings, now: float | None = None) -> None:
    limit = settings.max_login_attempts_per_hour
    if not limit:
        return
    now = time.monotonic() if now is None else now
    with _failed_lock:
        recent = _failed[address]
        while recent and recent[0] <= now - 3600:
            recent.popleft()
        if len(recent) >= limit:
            raise HTTPException(429, "Too many attempts. Please try again later.")


def _count_failure(address: str) -> None:
    with _failed_lock:
        _failed[address].append(time.monotonic())


def _start_session(response: Response, user: models.User, session: Session, settings: Settings) -> None:
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    expired = delete(models.UserSession).where(models.UserSession.user_id == user.id, models.UserSession.expires_at <= now)
    session.execute(expired)
    expires_at = now + timedelta(days=settings.session_days)
    session.add(models.UserSession(user_id=user.id, token_hash=token_hash(token), expires_at=expires_at))
    session.commit()
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )


def _account(user: models.User) -> schemas.AccountOut:
    return schemas.AccountOut(
        id=user.id, username=user.username, avatar=user.avatar, preferred_source_language=user.preferred_source_language,
        preferred_search_model_id=user.preferred_search_model_id, search_instructions=user.search_instructions,
        search_options=schemas.SearchOptions(**(user.search_options or {})),
    )


def _username(value: str, settings: Settings) -> str:
    username = value.strip().lower()
    shortest, longest = settings.username_min_length, settings.username_max_length
    if not shortest <= len(username) <= longest or not USERNAME.fullmatch(username):
        raise HTTPException(422, f"Use {shortest} to {longest} letters, numbers, dots, dashes or underscores.")
    return username


def _validate_password(password: str, confirmation: str, settings: Settings) -> None:
    shortest, longest = settings.password_min_length, settings.password_max_length
    if not shortest <= len(password) <= longest:
        raise HTTPException(422, f"Use a password of {shortest} to {longest} characters.")
    if password != confirmation:
        raise HTTPException(422, "The passwords do not match.")


def _avatar(encoded: str) -> str:
    """Decode and re-encode a small raster thumbnail, without the uploaded file's metadata."""
    try:
        raw = b64decode(encoded, validate=True)
        if len(raw) > schemas.MAX_AVATAR_BYTES:
            raise ValueError
        with Image.open(BytesIO(raw), formats=["JPEG", "PNG", "WEBP"]) as source:
            if source.width * source.height > 20_000_000:
                raise ValueError
            thumbnail = ImageOps.fit(ImageOps.exif_transpose(source).convert("RGBA"), (192, 192), Image.Resampling.LANCZOS)
            output = BytesIO()
            thumbnail.save(output, "WEBP", quality=85)
    except (ValueError, OSError, Image.DecompressionBombError):
        raise HTTPException(422, "Choose a JPEG, PNG, or WebP image up to 4 MB and 20 megapixels.") from None
    return "data:image/webp;base64," + b64encode(output.getvalue()).decode("ascii")


@router.post("/register", status_code=201, response_model=schemas.AccountOut)
def register(
    body: schemas.RegisterIn,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    address = _address(request)
    _check_attempts(address, settings)
    username = _username(body.username, settings)
    _validate_password(body.password, body.password_confirmation, settings)
    user = models.User(username=username, password_hash=hasher.hash(body.password))
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        _count_failure(address)
        raise HTTPException(409, "That username is taken.") from None
    _start_session(response, user, session, settings)
    return _account(user)


@router.post("/login", response_model=schemas.AccountOut)
def login(
    body: schemas.LoginIn,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    address = _address(request)
    _check_attempts(address, settings)
    user = session.scalar(select(models.User).where(models.User.username == body.username.strip().lower()).with_for_update())
    try:
        hasher.verify(user.password_hash if user else _DUMMY_HASH, body.password)
        if user is None:
            raise VerificationError
    except (VerificationError, InvalidHashError):
        _count_failure(address)
        raise HTTPException(401, "Wrong username or password.") from None
    if hasher.check_needs_rehash(user.password_hash):
        user.password_hash = hasher.hash(body.password)
    _start_session(response, user, session, settings)
    return _account(user)


@router.post("/logout", status_code=204)
def logout(request: Request, session: Session = Depends(get_session), settings: Settings = Depends(get_settings)):
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        session.execute(delete(models.UserSession).where(models.UserSession.token_hash == token_hash(token)))
        session.commit()
    response = Response(status_code=204)
    response.delete_cookie(
        settings.session_cookie_name, path="/", httponly=True, secure=settings.session_cookie_secure, samesite="lax"
    )
    return response


@router.get("/me", response_model=schemas.AccountOut)
def me(user: models.User = Depends(current_user)):
    return _account(user)


@router.patch("/me", response_model=schemas.AccountOut)
def update_profile(
    body: schemas.ProfileIn,
    user: models.User = Depends(current_user),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    search_model_id = body.preferred_search_model_id
    if search_model_id is not None and search_model_id not in settings.judges:
        raise HTTPException(422, "Choose a search model from the list.")
    if body.username is not None:
        user.username = _username(body.username, settings)
    if "avatar" in body.model_fields_set:
        user.avatar = _avatar(body.avatar) if body.avatar is not None else None
    if body.preferred_source_language is not None:
        user.preferred_source_language = body.preferred_source_language
    if "preferred_search_model_id" in body.model_fields_set:
        user.preferred_search_model_id = search_model_id
    if "search_instructions" in body.model_fields_set:
        user.search_instructions = (body.search_instructions or "").strip() or None
    if "search_options" in body.model_fields_set:
        options = body.search_options.model_dump(exclude_none=True) if body.search_options else {}
        user.search_options = options or None
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "That username is taken.") from None
    return _account(user)


@router.post("/me/password", response_model=schemas.AccountOut)
def change_password(
    body: schemas.ChangePasswordIn,
    request: Request,
    response: Response,
    user: models.User = Depends(current_user),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    address = _address(request)
    _check_attempts(address, settings)
    _validate_password(body.new_password, body.password_confirmation, settings)
    user = session.get(models.User, user.id, with_for_update=True, populate_existing=True)
    if user is None:
        raise HTTPException(401, "Log in to continue.")
    try:
        hasher.verify(user.password_hash, body.current_password)
    except (VerificationError, InvalidHashError):
        _count_failure(address)
        raise HTTPException(422, "The current password is incorrect.") from None
    user.password_hash = hasher.hash(body.new_password)
    session.execute(delete(models.UserSession).where(models.UserSession.user_id == user.id))
    _start_session(response, user, session, settings)
    return _account(user)
