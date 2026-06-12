import json
import logging
import os
import base64
from functools import lru_cache
from urllib import error as urlerror
from urllib import request as urlrequest

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
DEFAULT_FROM_EMAIL = "support@finalrep.co"
DEFAULT_FROM_NAME = "FinalRep"
STAGE_SUBJECT_PREFIX = "[PRUEBA STAGE]"


def _is_stage_environment() -> bool:
    value = (
        os.getenv("APP_ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("FINALREP_ENV")
        or ""
    ).strip().lower()
    return value in {"stage", "staging"}


def _split_email_list(value: str) -> set[str]:
    return {
        item.strip().lower()
        for item in value.replace(";", ",").split(",")
        if item.strip()
    }


@lru_cache(maxsize=1)
def _stage_allowed_static_emails() -> set[str]:
    configured = set()
    for env_name in (
        "STAGE_EMAIL_ALLOWED_EMAILS",
        "STAGE_EMAIL_ALLOWED_RECIPIENTS",
        "ADMIN_NOTIFICATION_EMAIL",
    ):
        configured.update(_split_email_list(os.getenv(env_name, "")))
    return configured


def _is_stage_allowed_recipient(email: str) -> bool:
    normalized = email.strip().lower()
    if not normalized:
        return False
    if normalized in _stage_allowed_static_emails():
        return True

    try:
        from sqlalchemy import func, or_
        from sqlmodel import Session, select

        from constants import Role
        from database import engine
        from models import Participant

        with Session(engine) as session:
            user = session.exec(
                select(Participant).where(
                    func.lower(func.coalesce(Participant.email, "")) == normalized,
                    Participant.is_active == 1,
                    or_(
                        Participant.role.in_((Role.ADMIN, Role.ORGANIZER)),
                        Participant.admin_enabled == 1,
                        Participant.organizer_enabled == 1,
                    ),
                )
            ).first()
            return user is not None
    except Exception:
        logger.exception("Could not validate stage email recipient %s", normalized)
        return False


def _stage_subject(subject: str) -> str:
    clean = subject.strip()
    if clean.startswith(STAGE_SUBJECT_PREFIX):
        return clean
    return f"{STAGE_SUBJECT_PREFIX} {clean}"


def _stage_text_body(body: str) -> str:
    notice = (
        "Correo de prueba enviado desde stage.finalrep.co. "
        "Si lo recibiste por error, ignora este mensaje.\n\n"
    )
    return notice + body


def _stage_html_body(html_body: str | None) -> str | None:
    if not html_body:
        return html_body
    banner = (
        '<div style="background:#F59E0B;color:#090B0E;padding:10px 14px;'
        'font-family:Arial,sans-serif;font-weight:700;text-align:center">'
        'PRUEBA STAGE - stage.finalrep.co'
        "</div>"
    )
    if "<body" in html_body:
        return html_body.replace("<body>", f"<body>{banner}", 1)
    return banner + html_body


def email_is_configured() -> bool:
    api_key = os.getenv("BREVO_API_KEY", "").strip()
    return bool(api_key)


def send_email(
    *,
    to_email: str,
    subject: str,
    body: str | None = None,
    text_body: str | None = None,
    html_body: str | None = None,
    attachments: list[dict] | None = None,
) -> bool:
    target = to_email.strip()
    if not target or not email_is_configured():
        return False
    mail_body = body if body is not None else (text_body or "")

    if _is_stage_environment():
        if os.getenv("STAGE_EMAIL_GUARD_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}:
            if not _is_stage_allowed_recipient(target):
                logger.warning("Stage email blocked for non-organizer recipient %s", target)
                return False
        subject = _stage_subject(subject)
        mail_body = _stage_text_body(mail_body)
        html_body = _stage_html_body(html_body)

    api_key = os.getenv("BREVO_API_KEY", "").strip()
    from_email = (
        os.getenv("BREVO_FROM_EMAIL", "").strip()
        or os.getenv("EMAIL_FROM", "").strip()
        or DEFAULT_FROM_EMAIL
    )
    from_name = (
        os.getenv("BREVO_FROM_NAME", "").strip()
        or os.getenv("EMAIL_FROM_NAME", "").strip()
        or DEFAULT_FROM_NAME
    )
    endpoint = os.getenv("BREVO_API_URL", BREVO_API_URL).strip() or BREVO_API_URL
    try:
        timeout = max(int(os.getenv("BREVO_TIMEOUT_SECONDS", "15")), 3)
    except Exception:
        timeout = 15

    payload: dict[str, object] = {
        "sender": {"email": from_email, "name": from_name},
        "to": [{"email": target}],
        "subject": subject,
        "textContent": mail_body,
    }
    html = (html_body or "").strip()
    if html:
        payload["htmlContent"] = html
    normalized_attachments = []
    for item in attachments or []:
        if not isinstance(item, dict):
            continue
        filename = str(item.get("filename") or "").strip()
        content = item.get("content")
        mime_type = str(item.get("mime_type") or "application/octet-stream").strip() or "application/octet-stream"
        if not filename or not isinstance(content, (bytes, bytearray)) or len(content) == 0:
            continue
        normalized_attachments.append({
            "name": filename,
            "content": base64.b64encode(bytes(content)).decode("ascii"),
            "contentType": mime_type,
        })
    if normalized_attachments:
        payload["attachment"] = normalized_attachments

    req = urlrequest.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "api-key": api_key,
        },
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=timeout) as response:
            status = int(getattr(response, "status", 0) or 0)
            return 200 <= status < 300
    except urlerror.URLError:
        logger.exception("Brevo send failed for %s", target)
        return False
    except Exception:
        logger.exception("Unexpected Brevo error for %s", target)
        return False
