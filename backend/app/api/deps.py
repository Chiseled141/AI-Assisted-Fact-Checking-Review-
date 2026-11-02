from fastapi import HTTPException
from sqlalchemy.orm import Session


def get_or_404(session: Session, model, item_id: str):
    item = session.get(model, item_id)
    if item is None:
        raise HTTPException(404, "Not found.")
    return item
