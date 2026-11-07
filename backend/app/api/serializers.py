"""Turns database rows into the JSON shapes in `schemas.py`."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import models
from . import schemas


def check_out(check: models.Check, session: Session) -> schemas.CheckOut:
    count = session.scalar(select(func.count()).where(models.Claim.check_id == check.id))
    return schemas.CheckOut(
        id=check.id,
        title=check.title,
        input_type=check.input_type,
        input_text=check.input_text,
        input_url=check.input_url,
        files=check.files,
        article=check.article,
        status=check.status,
        created_at=check.created_at,
        updated_at=check.updated_at,
        claim_count=count if check.status == "completed" else None,
        error_message=check.error_message,
        judge_ids=check.judge_ids,
        input_category=next((event["inputCategory"] for event in reversed(check.progress or [])
                             if event.get("inputCategory")), None) if check.status == "completed" and not count else None,
    )


def revision_out(verdict: models.Verdict) -> schemas.RevisionOut:
    return schemas.RevisionOut(
        id=verdict.id,
        claim_id=verdict.claim_id,
        version=verdict.version,
        kind=verdict.kind,
        verdict=verdict.label,
        rationale=verdict.explanation,
        cited_evidence_ids=verdict.evidence_ids or [],
        citation_freshness=verdict.citation_freshness,
        attachments=verdict.attachments,
        model=verdict.model,
        judges=verdict.judges,
        author=verdict.author,
        created_at=verdict.created_at,
    )


def claim_out(claim: models.Claim) -> schemas.ClaimOut:
    latest = claim.verdicts[-1] if claim.verdicts else None
    return schemas.ClaimOut(
        id=claim.id,
        check_id=claim.check_id,
        position=claim.position,
        text=claim.text,
        topic=claim.topic,
        time_context=claim.time_context,
        status=claim.status,
        evidence_ids=[item.id for item in claim.evidence],
        current_version=latest.version if latest else 0,
        current=revision_out(latest) if latest else None,
        unavailable_reason=claim.unavailable_reason,
        price_chart=claim.price_chart,
        location_map=claim.location_map,
        heat_map=claim.heat_map,
        country_map=claim.country_map,
        seat_chart=claim.seat_chart,
        election_map=claim.election_map,
        rephrased_from=claim.rephrased_from,
    )
