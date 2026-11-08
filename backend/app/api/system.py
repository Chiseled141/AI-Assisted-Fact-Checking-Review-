"""Usage statistics and whether the server can run checks."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..db import models
from ..db.session import get_session
from . import schemas
from .deps import current_user

router = APIRouter()


@router.get("/stats", response_model=schemas.StatsOut)
def stats(session: Session = Depends(get_session), user: models.User = Depends(current_user)):
    """The signed-in user's own checks."""
    labels = session.execute(
        select(models.Verdict.label, func.count())
        .join(models.Claim, models.Claim.id == models.Verdict.claim_id)
        .join(models.Check, models.Check.id == models.Claim.check_id)
        .where(models.Verdict.version == 1, models.Check.user_id == user.id)
        .group_by(models.Verdict.label)
    ).all()
    finished = session.scalars(
        select(models.Check).where(models.Check.user_id == user.id, models.Check.completed_at.is_not(None))
    ).all()
    durations = [(check.completed_at - check.created_at).total_seconds() for check in finished]
    return schemas.StatsOut(
        checks=session.scalar(select(func.count()).select_from(models.Check).where(models.Check.user_id == user.id)) or 0,
        label_distribution={label: count for label, count in labels},
        average_seconds=sum(durations) / len(durations) if durations else None,
    )


@router.get("/health")
def health(request: Request, settings: Settings = Depends(get_settings)):
    return {
        "ok": True,
        "canRunChecks": request.app.state.start_check is not None,
    }
