import json
import logging
import os
from urllib import error as urlerror
from urllib import request as urlrequest

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
DEFAULT_FROM_EMAIL = "support@finalrep.co"
DEFAULT_FROM_NAME = "FinalRep"


def email_is_configured() -> bool:
    api_key = os.getenv("BREVO_API_KEY", "").strip()
    return bool(api_key)


def send_email(*, to_email: str, subject: str, body: str, html_body: str | None = None) -> bool:
    target = to_email.strip()
    if not target or not email_is_configured():
        return False

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
        "textContent": body,
    }
    html = (html_body or "").strip()
    if html:
        payload["htmlContent"] = html

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
