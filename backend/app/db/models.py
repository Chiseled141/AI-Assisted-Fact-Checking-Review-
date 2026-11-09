"""The database tables. `verdicts` is append-only: a correction adds a row.

Every check belongs to the user who started it. Checks saved before accounts existed have no owner and stay hidden
until `python -m app.db.transfer claim USERNAME` gives them one.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .session import Base


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("usr"))
    # Saved in lower case, so "Lan" and "lan" are the same account.
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)  # Argon2id, with its salt and settings.
    avatar: Mapped[str | None] = mapped_column(Text)
    preferred_source_language: Mapped[str | None] = mapped_column(String(2))
    preferred_search_model_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserSession(Base):
    """A signed-in browser. Only a hash of the cookie's token is saved, so a leaked table can't sign anyone in."""

    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("ses"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship()


class Check(Base):
    __tablename__ = "checks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("chk"))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(Text)
    input_type: Mapped[str] = mapped_column(String(8))
    input_text: Mapped[str | None] = mapped_column(Text)
    input_url: Mapped[str | None] = mapped_column(Text)
    files: Mapped[list | None] = mapped_column(JSON)
    article: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    error_message: Mapped[str | None] = mapped_column(Text)
    judge_ids: Mapped[list] = mapped_column(JSON)
    search_model: Mapped[str | None] = mapped_column(Text)  # Model resolved when this check was started.
    progress: Mapped[list | None] = mapped_column(JSON)
    input_suggestions: Mapped[list[str] | None] = mapped_column(JSON(none_as_null=True))
    review: Mapped[dict | None] = mapped_column(JSON)  # What the reader was asked before the search. See pipeline/review.py.
    cleared_followups: Mapped[int] = mapped_column(Integer, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    claims: Mapped[list["Claim"]] = relationship(back_populates="check", order_by="Claim.position")
    messages: Mapped[list["CheckMessage"]] = relationship(order_by="CheckMessage.created_at")


class Source(Base):
    """A fetched page shared by every claim that uses it."""

    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("src"))
    check_id: Mapped[str] = mapped_column(ForeignKey("checks.id"), index=True)
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    publisher: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[str | None] = mapped_column(String(10))
    image_url: Mapped[str | None] = mapped_column(Text)
    text: Mapped[str] = mapped_column(Text)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("clm"))
    check_id: Mapped[str] = mapped_column(ForeignKey("checks.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    topic: Mapped[str | None] = mapped_column(Text)
    time_context: Mapped[str | None] = mapped_column(Text)
    checkworthy_score: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(16), default="assessed")
    unavailable_reason: Mapped[str | None] = mapped_column(Text)
    price_chart: Mapped[dict | None] = mapped_column(JSON)
    stock_heatmap_markets: Mapped[list[str] | None] = mapped_column(JSON)
    location_map: Mapped[dict | None] = mapped_column(JSON)
    incident_map: Mapped[dict | None] = mapped_column(JSON)
    heat_map: Mapped[dict | None] = mapped_column(JSON)
    country_map: Mapped[dict | None] = mapped_column(JSON)
    population_pyramid: Mapped[dict | None] = mapped_column(JSON)
    seat_chart: Mapped[dict | None] = mapped_column(JSON)
    pie_chart: Mapped[dict | None] = mapped_column(JSON)
    bar_chart: Mapped[dict | None] = mapped_column(JSON)
    route_map: Mapped[dict | None] = mapped_column(JSON)
    match_result: Mapped[dict | None] = mapped_column(JSON)
    election_map: Mapped[dict | None] = mapped_column(JSON)
    rephrased_from: Mapped[str | None] = mapped_column(Text)

    check: Mapped[Check] = relationship(back_populates="claims")
    evidence: Mapped[list["Evidence"]] = relationship(order_by="Evidence.position")
    verdicts: Mapped[list["Verdict"]] = relationship(order_by="Verdict.version")


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("evd"))
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"))
    position: Mapped[int] = mapped_column(Integer)
    excerpt: Mapped[str] = mapped_column(Text)
    translations: Mapped[dict | None] = mapped_column(JSON)
    relation: Mapped[str] = mapped_column(String(16), default="contextual")

    source: Mapped[Source] = relationship()


class Verdict(Base):
    __tablename__ = "verdicts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("ver"))
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(20))
    label: Mapped[str] = mapped_column(String(24))
    explanation: Mapped[str] = mapped_column(Text)
    evidence_ids: Mapped[list] = mapped_column(JSON, default=list)
    citation_freshness: Mapped[dict | None] = mapped_column(JSON)
    attachments: Mapped[list | None] = mapped_column(JSON)
    model: Mapped[dict | None] = mapped_column(JSON)
    judges: Mapped[list | None] = mapped_column(JSON)
    author: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("fbk"))
    check_id: Mapped[str] = mapped_column(ForeignKey("checks.id"), index=True)
    helpful: Mapped[bool] = mapped_column(Boolean)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CheckMessage(Base):
    """A follow-up question about a finished check, and the answer from the selected model, with optional web search."""

    __tablename__ = "check_messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("msg"))
    check_id: Mapped[str] = mapped_column(ForeignKey("checks.id"), index=True)
    question: Mapped[str] = mapped_column(Text)
    files: Mapped[list | None] = mapped_column(JSON)
    reference: Mapped[dict | None] = mapped_column(JSON)
    sources: Mapped[list | None] = mapped_column(JSON)
    answer: Mapped[str] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
