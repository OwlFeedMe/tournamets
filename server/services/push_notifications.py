import json
import logging
import os
from datetime import datetime, timezone

from sqlmodel import Session, select

from models import PushSubscription

logger = logging.getLogger(__name__)


def push_is_configured() -> bool:
    return bool(os.getenv("VAPID_PUBLIC_KEY", "").strip() and os.getenv("VAPID_PRIVATE_KEY", "").strip())


def vapid_public_key() -> str:
    return os.getenv("VAPID_PUBLIC_KEY", "").strip()


def _vapid_claims() -> dict:
    subject = os.getenv("VAPID_SUBJECT", "").strip() or "mailto:support@finalrep.co"
    return {"sub": subject}


def send_push_to_user(
    session: Session,
    *,
    user_id: int,
    title: str,
    body: str,
    url: str,
    notification_id: int | None = None,
) -> None:
    if not push_is_configured():
        return

    try:
        from pywebpush import WebPushException, webpush
    except Exception:
        logger.exception("pywebpush is not available")
        return

    private_key = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    rows = session.exec(
        select(PushSubscription).where(
            PushSubscription.user_id == int(user_id),
            PushSubscription.disabled_at.is_(None),
        )
    ).all()
    if not rows:
        return

    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url,
        "icon": "/icons/finalrep-maskable-512.png",
        "badge": "/icons/finalrep-notification-badge.svg",
        "tag": f"finalrep-app-notification-{notification_id or 'result'}",
        "notification_id": notification_id,
    }, separators=(",", ":"))

    now = datetime.now(timezone.utc)
    for row in rows:
        try:
            webpush(
                subscription_info={
                    "endpoint": row.endpoint,
                    "keys": {
                        "p256dh": row.p256dh,
                        "auth": row.auth,
                    },
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims=_vapid_claims(),
            )
            row.failure_count = 0
            row.last_success_at = now
            session.add(row)
        except WebPushException as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            row.failure_count = int(row.failure_count or 0) + 1
            if status_code in {404, 410} or row.failure_count >= 5:
                row.disabled_at = now
            session.add(row)
            logger.warning("Push notification failed for subscription %s: %s", row.id, exc)
        except Exception:
            row.failure_count = int(row.failure_count or 0) + 1
            if row.failure_count >= 5:
                row.disabled_at = now
            session.add(row)
            logger.exception("Unexpected push notification error for subscription %s", row.id)
