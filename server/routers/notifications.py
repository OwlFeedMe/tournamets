from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from auth import get_current_user_id, require_auth
from database import get_session
from models import AppNotification

router = APIRouter(prefix="/api/me/notifications", tags=["notifications"])


def _notification_payload(item: AppNotification) -> dict:
    return {
        "id": item.id,
        "type": item.notification_type,
        "title": item.title,
        "body": item.body,
        "action_url": item.action_url,
        "data_json": item.data_json,
        "read_at": item.read_at,
        "created_at": item.created_at,
    }


@router.get("")
def list_my_notifications(
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    rows = session.exec(
        select(AppNotification)
        .where(AppNotification.user_id == user_id)
        .order_by(AppNotification.created_at.desc(), AppNotification.id.desc())
        .limit(50)
    ).all()
    unread = session.exec(
        select(func.count(AppNotification.id)).where(
            AppNotification.user_id == user_id,
            AppNotification.read_at.is_(None),
        )
    ).one()
    return {
        "items": [_notification_payload(item) for item in rows],
        "unread_count": int(unread or 0),
    }


@router.post("/read")
def mark_my_notifications_read(
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    now = datetime.now(timezone.utc)
    rows = session.exec(
        select(AppNotification).where(
            AppNotification.user_id == user_id,
            AppNotification.read_at.is_(None),
        )
    ).all()
    for item in rows:
        item.read_at = now
        session.add(item)
    session.commit()
    return {"updated": len(rows)}
