"""A claim's saved evidence, its verdict history, and human corrections."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..db import models
from ..db.session import get_session
from . import schemas
from .deps import get_or_404
from .serializers import claim_out, revision_out

router = APIRouter()


@router.get("/claims/{claim_id}/evidence", response_model=list[schemas.EvidenceOut])
def claim_evidence(claim_id: str, session: Session = Depends(get_session)):
    claim = get_or_404(session, models.Claim, claim_id)
    return [
        schemas.EvidenceOut(
            id=item.id,
            claim_id=claim.id,
            source_title=item.source.title,
            publisher=item.source.publisher,
            url=item.source.url,
            excerpt=item.excerpt,
            published_at=item.source.published_at,
            retrieved_at=item.source.retrieved_at,
            image_url=item.source.image_url,
            relation=item.relation,
            analysis=item.source.analysis,
        )
        for item in claim.evidence
    ]


@router.get("/claims/{claim_id}/revisions", response_model=list[schemas.RevisionOut])
def claim_revisions(claim_id: str, session: Session = Depends(get_session)):
    return [revision_out(verdict) for verdict in get_or_404(session, models.Claim, claim_id).verdicts]


@router.post("/claims/{claim_id}/corrections", status_code=201, response_model=schemas.CorrectionOut)
def publish_correction(
    claim_id: str,
    body: schemas.CorrectionIn,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    claim = get_or_404(session, models.Claim, claim_id)
    current = claim.verdicts[-1].version if claim.verdicts else 0
    if body.expected_version != current:
        raise HTTPException(409, {"expectedVersion": body.expected_version, "currentVersion": current})
    reason = body.reason.strip()
    if not settings.min_correction_reason <= len(reason) <= settings.max_correction_reason:
        raise HTTPException(422, f"Explain why in at least {settings.min_correction_reason} characters.")
    if len(body.attachments) > settings.max_attachments or any(
        len(item.data_url) > settings.max_attachment_chars or not item.data_url.startswith("data:image/")
        for item in body.attachments
    ):
        raise HTTPException(422, f"Attach at most {settings.max_attachments} images, each within the size limit.")
    known = {item.id for item in claim.evidence}
    if not set(body.evidence_ids) <= known:
        raise HTTPException(422, "A correction can only cite evidence saved for this claim.")
    verdict = models.Verdict(
        claim_id=claim.id,
        version=current + 1,
        kind="human_correction",
        label=body.verdict,
        explanation=reason,
        evidence_ids=body.evidence_ids,
        citation_freshness={key: value.model_dump() for key, value in body.citation_freshness.items()},
        attachments=[item.model_dump(by_alias=True) for item in body.attachments] or None,
        author="Reviewer",
    )
    session.add(verdict)
    session.commit()
    session.refresh(claim)
    return schemas.CorrectionOut(claim=claim_out(claim), revision=revision_out(verdict))
