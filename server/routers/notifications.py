from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import func
from sqlmodel import Session, select

from auth import get_current_user_id, require_auth
from database import get_session
from models import AppNotification, PushSubscription
from services.push_notifications import push_is_configured, vapid_public_key

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


@router.get("/push-public-key")
def get_push_public_key():
    return {
        "enabled": push_is_configured(),
        "public_key": vapid_public_key(),
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


@router.post("/push-subscriptions", status_code=201)
def save_push_subscription(
    request: Request,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    if user_id is None:
        raise HTTPException(401, "Sesion invalida")
    endpoint = str(body.get("endpoint") or "").strip()
    keys = body.get("keys") if isinstance(body.get("keys"), dict) else {}
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()
    if not endpoint or not p256dh or not auth:
        return {"saved": False, "reason": "invalid_subscription"}

    existing = session.exec(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint)
    ).first()
    user_agent = request.headers.get("user-agent", "")[:1000]
    if existing:
        existing.user_id = int(user_id)
        existing.p256dh = p256dh
        existing.auth = auth
        existing.user_agent = user_agent
        existing.failure_count = 0
        existing.disabled_at = None
        session.add(existing)
        session.commit()
        return {"saved": True, "id": existing.id}

    row = PushSubscription(
        user_id=int(user_id),
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        user_agent=user_agent,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return {"saved": True, "id": row.id}


@router.delete("/push-subscriptions")
def delete_push_subscription(
    body: dict = Body(default={}),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    if user_id is None:
        raise HTTPException(401, "Sesion invalida")
    endpoint = str(body.get("endpoint") or "").strip()
    if not endpoint:
        return {"deleted": 0}
    rows = session.exec(
        select(PushSubscription).where(
            PushSubscription.user_id == int(user_id),
            PushSubscription.endpoint == endpoint,
        )
    ).all()
    for row in rows:
        session.delete(row)
    session.commit()
    return {"deleted": len(rows)}
