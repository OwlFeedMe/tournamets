import json
import io
import base64
import hashlib
import hmac
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import uuid
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, text
from sqlmodel import Session, select

from access import require_competition_access
from auth import get_current_user, get_current_user_id, is_end_user, require_admin, require_auth, require_staff
from database import get_session
from models import (
    Competition, Participant, CompetitionParticipant, CompetitionCategory, CompetitionPaymentIntent,
    CompetitionCheckinPhase, CompetitionCheckinUsage, EnrollBody, SelfEnrollRequest, EnrollStatusUpdate,
    EnrollCategoriaUpdate, CompetitionPaymentIntentActivateRequest, CompetitionDiscountUsage,
)
from routers.discounts import validate_discount_for_checkout
from routers.config import get_pricing_config
from services.emailer import send_email
from services.email_templates import (
    render_payment_approved,
    render_payment_rejected,
    render_enrollment_confirmed,
)
from services.leaderboard_cache import invalidate_leaderboard_results_snapshot
from routers.ticketing import apply_spectator_bold_notification

logger = logging.getLogger(__name__)

router = APIRouter(tags=["enrollments"])
ENROLLMENT_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "enrollment_answers"
ENROLLMENT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_ENROLLMENT_IMAGE_SIDE = 1600
BOLD_PLATFORM_FEE_RATE_DEFAULT = 0.05
PAYMENT_PENDING_STATE = "pago_pendiente"
PENDING_VERIFICATION_STATE = "pago_en_verificacion"
SYSTEM_CHECKIN_PHASE_CODE = "check_in"


def _parse_enrollment_questions(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    out = []
    for idx, item in enumerate(parsed):
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        out.append({
            "id": str(item.get("id") or f"q_{idx + 1}").strip() or f"q_{idx + 1}",
            "label": label,
            "field_type": str(item.get("field_type") or "text").strip().lower() or "text",
            "required": 1 if item.get("required") else 0,
            "placeholder": str(item.get("placeholder") or "").strip() or None,
        })
    return out


def _process_enrollment_image(file: UploadFile, user_id: int) -> str:
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "El archivo debe ser una imagen")
    try:
        raw = file.file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "No se pudo procesar la imagen")

    width, height = image.size
    max_side = max(width, height)
    if max_side > MAX_ENROLLMENT_IMAGE_SIDE:
        scale = MAX_ENROLLMENT_IMAGE_SIDE / max_side
        image = image.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.Resampling.LANCZOS)

    filename = f"enrollment_{user_id}_{uuid.uuid4().hex}.jpg"
    image.save(ENROLLMENT_UPLOAD_DIR / filename, format="JPEG", quality=86, optimize=True)
    return f"/uploads/enrollment_answers/{filename}"


def _with_user_id(payload: dict, user_id: int) -> dict:
    return {**payload, "user_id": user_id}


def _get_checkin_usage_by_participant(session: Session, competition_id: int) -> dict[int, datetime]:
    rows = session.exec(
        select(CompetitionCheckinUsage.user_id, func.min(CompetitionCheckinUsage.used_at))
        .join(CompetitionCheckinPhase, CompetitionCheckinPhase.id == CompetitionCheckinUsage.phase_id)
        .where(CompetitionCheckinUsage.competition_id == competition_id)
        .where(CompetitionCheckinPhase.competition_id == competition_id)
        .where(CompetitionCheckinPhase.code == SYSTEM_CHECKIN_PHASE_CODE)
        .group_by(CompetitionCheckinUsage.user_id)
    ).all()
    return {
        int(user_id): used_at
        for user_id, used_at in rows
        if user_id is not None and used_at is not None
    }


def _serialize_enrolled_rows(rows, checkin_usage_by_participant: dict[int, datetime]) -> list[dict]:
    items = []
    for cp, p in rows:
        checkin_used_at = checkin_usage_by_participant.get(int(p.id))
        items.append(
            {
                **p.model_dump(),
                "user_id": p.id,
                "categoria_competencia": cp.categoria,
                "estado": cp.estado,
                "enrollment_answers": cp.enrollment_answers,
                "payment_status": cp.payment_status,
                "payment_reference": cp.payment_reference,
                "payment_transaction_id": cp.payment_transaction_id,
                "payment_processor_fee": cp.payment_processor_fee,
                "payment_platform_net": cp.payment_platform_net,
                "payment_amount_total": cp.payment_amount_total,
                "payment_processed_at": cp.payment_processed_at,
                "inscrito_at": cp.inscrito_at,
                "check_in_done": bool(checkin_used_at),
                "check_in_used_at": checkin_used_at,
            }
        )
    return items


def _serialize_enrollment_answers(questions: list[dict], answers: list | None, extra_items: list[dict] | None = None) -> str | None:
    answer_map = {}
    for item in answers or []:
        if item is None:
            continue
        question_id = str(getattr(item, "question_id", None) or "").strip()
        value = str(getattr(item, "answer", "") or "").strip()
        if question_id:
            answer_map[question_id] = value

    normalized = []
    missing_required = []
    for question in questions:
        question_id = question["id"]
        value = answer_map.get(question_id, "").strip()
        if question.get("required") and not value:
            missing_required.append(question["label"])
        normalized.append({
            "question_id": question_id,
            "question_label": question["label"],
            "question_type": question.get("field_type") or "text",
            "answer": value,
        })
    if missing_required:
        raise HTTPException(400, f"Responde las preguntas obligatorias: {', '.join(missing_required)}")
    for item in extra_items or []:
        label = str((item or {}).get("question_label") or "").strip()
        value = str((item or {}).get("answer") or "").strip()
        if not label and not value:
            continue
        normalized.append({
            "question_id": str((item or {}).get("question_id") or "").strip() or f"extra_{len(normalized) + 1}",
            "question_label": label,
            "question_type": str((item or {}).get("question_type") or "text").strip().lower() or "text",
            "answer": value,
        })
    return json.dumps(normalized, ensure_ascii=False) if normalized else None


def _normalize_platform_fee_rate(raw: object) -> float:
    try:
        value = float(raw if raw is not None else BOLD_PLATFORM_FEE_RATE_DEFAULT)
    except Exception:
        value = BOLD_PLATFORM_FEE_RATE_DEFAULT
    if value < 0:
        value = 0.0
    if value > 1:
        value = 1.0
    return round(value, 4)


def _price_breakdown(base_price: int, fee_rate: float, processor_rate: float = 0.0269, processor_fixed: int = 300, min_platform_fee: int = 5000) -> dict:
    organizer_price = max(0, int(base_price or 0))
    platform_fee = int(round(organizer_price * fee_rate))
    if organizer_price > 0 and platform_fee < min_platform_fee:
        platform_fee = min_platform_fee
    total_price = organizer_price + platform_fee
    processor_fee = _bold_processor_fee(total_price, processor_rate, processor_fixed)
    return {
        "organizer_price": organizer_price,
        "platform_fee": platform_fee,
        "processor_fee": processor_fee,
        "platform_net": platform_fee - processor_fee,
        "total_price": total_price,
        "fee_rate": fee_rate,
    }


def _bold_processor_fee(total_amount: int, processor_rate: float = 0.0269, processor_fixed: int = 300) -> int:
    gross = max(0, int(total_amount or 0))
    if gross <= 0:
        return 0
    return int(round(gross * processor_rate)) + processor_fixed


def _platform_net_amount(platform_fee: int, total_amount: int, processor_rate: float = 0.0269, processor_fixed: int = 300) -> int:
    return int(platform_fee or 0) - _bold_processor_fee(total_amount, processor_rate, processor_fixed)


def _bold_integrity_signature(order_id: str, amount: int, currency: str, secret_key: str) -> str:
    payload = f"{order_id}{amount}{currency}{secret_key}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _ensure_competition_open(comp: Competition) -> None:
    if not comp.enrollment_open:
        raise HTTPException(403, "Las inscripciones para esta competencia estan cerradas")
    now = datetime.now(timezone.utc)
    if comp.enrollment_start and now < comp.enrollment_start.replace(tzinfo=timezone.utc):
        raise HTTPException(403, "El periodo de inscripcion aun no ha comenzado")
    if comp.enrollment_end and now > comp.enrollment_end.replace(tzinfo=timezone.utc):
        raise HTTPException(403, "El periodo de inscripcion ha finalizado")


def _payment_status_from_event_type(event_type: str | None) -> str:
    value = str(event_type or "").strip().upper()
    if value == "SALE_APPROVED":
        return "approved"
    if value == "SALE_REJECTED":
        return "rejected"
    if value == "VOID_APPROVED":
        return "voided"
    if value == "VOID_REJECTED":
        return "void_rejected"
    return "unknown"


def _payment_status_label(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == "approved":
        return "approved"
    if normalized in {"rejected", "failed", "voided", "void_rejected"}:
        return normalized
    if normalized == "prepared":
        return "prepared"
    if normalized in {"created", "processing", "pending"}:
        return normalized
    if normalized == "free":
        return "free"
    return "unknown"


_CREATED_INTENT_TIMEOUT_MINUTES = 15


def _is_payment_intent_blocking(intent) -> bool:
    """
    Determina si un CompetitionPaymentIntent existente debe bloquear un nuevo intento de pago.

    Reglas:
    - Sin intent → no bloquea.
    - Estado 'processing' o 'pending' → siempre bloquea (Bold tiene el pago activo).
    - Estado 'approved' → siempre bloquea (ya existe un pago aprobado).
    - Estado 'prepared' → no bloquea (el checkout se preparó, pero aun no hay click real en Bold).
    - Estado 'created' → bloquea solo si fue actualizado hace menos de
      _CREATED_INTENT_TIMEOUT_MINUTES minutos. Si el usuario abandonó la
      pestaña, el intent queda en 'created' indefinidamente y expira por timeout.
    - Cualquier otro estado (rejected, failed, prepared, unknown) → no bloquea.
    """
    if intent is None:
        return False
    state = _payment_status_label(intent.payment_status)
    if state in {"processing", "pending", "approved"}:
        return True
    if state == "created":
        age = datetime.now(timezone.utc) - intent.payment_updated_at
        return age.total_seconds() < _CREATED_INTENT_TIMEOUT_MINUTES * 60
    return False


def _should_show_pending_intent(intent_row: dict) -> bool:
    payment_status = _payment_status_label(intent_row.get("payment_status"))
    if payment_status == "approved":
        return True
    if payment_status in {"processing", "pending"}:
        return True
    if payment_status != "created":
        return False
    updated_at = intent_row.get("payment_updated_at")
    if not isinstance(updated_at, datetime):
        return False
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    return _is_payment_intent_blocking(SimpleNamespace(payment_status=payment_status, payment_updated_at=updated_at))


def _merge_participant_competition_rows(enrollment_rows: list[dict], intent_rows: list[dict]) -> list[dict]:
    merged_by_competition: dict[int, dict] = {}
    for row in enrollment_rows:
        item = dict(row)
        competition_id = int(item.get("id") or 0)
        if competition_id:
            merged_by_competition[competition_id] = item

    for row in intent_rows:
        item = dict(row)
        competition_id = int(item.get("id") or 0)
        if not competition_id or competition_id in merged_by_competition:
            continue
        if not _should_show_pending_intent(item):
            continue
        item["enrollment_estado"] = PENDING_VERIFICATION_STATE
        merged_by_competition[competition_id] = item

    return sorted(merged_by_competition.values(), key=lambda item: int(item.get("id") or 0), reverse=True)


def _verify_bold_webhook_signature(raw_body: bytes, signature: str | None) -> bool:
    received_signature = str(signature or "").strip()
    if not received_signature:
        return False
    encoded = base64.b64encode(raw_body)
    secrets_to_try: list[str] = []
    secret_key = (os.getenv("BOLD_SECRET_KEY") or "").strip()
    if secret_key:
        secrets_to_try.append(secret_key)
    if str(os.getenv("BOLD_WEBHOOK_TEST_MODE") or "").strip().lower() in {"1", "true", "yes", "on"}:
        secrets_to_try.append("")
    for candidate in secrets_to_try:
        hashed = hmac.new(candidate.encode("utf-8"), encoded, hashlib.sha256).hexdigest()
        if hmac.compare_digest(hashed, received_signature):
            return True
    return False


def _confirm_discount_usage(session: Session, discount_id: int, user_id: int) -> None:
    usage = session.exec(
        select(CompetitionDiscountUsage)
        .where(CompetitionDiscountUsage.discount_id == discount_id)
        .where(CompetitionDiscountUsage.user_id == user_id)
        .where(CompetitionDiscountUsage.enrollment_status == "pending")
        .order_by(CompetitionDiscountUsage.id.desc())
    ).first()
    if usage:
        usage.enrollment_status = "confirmed"
        session.add(usage)


def _cancel_discount_usage(session: Session, discount_id: int, user_id: int) -> None:
    from sqlalchemy import update as sa_update
    from models import CompetitionDiscount
    usage = session.exec(
        select(CompetitionDiscountUsage)
        .where(CompetitionDiscountUsage.discount_id == discount_id)
        .where(CompetitionDiscountUsage.user_id == user_id)
        .where(CompetitionDiscountUsage.enrollment_status == "pending")
        .order_by(CompetitionDiscountUsage.id.desc())
    ).first()
    if usage:
        usage.enrollment_status = "cancelled"
        session.add(usage)
        # Devolver el uso al contador
        session.execute(
            sa_update(CompetitionDiscount)
            .where(CompetitionDiscount.id == discount_id)
            .values(uses_count=CompetitionDiscount.uses_count - 1)
        )


def _apply_bold_notification(session: Session, payload: dict) -> dict:
    data = payload.get("data") if isinstance(payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    reference = str(metadata.get("reference") or data.get("reference") or "").strip()
    transaction_id = str(data.get("payment_id") or payload.get("subject") or "").strip() or None
    payment_status = _payment_status_from_event_type(payload.get("type"))
    amount = data.get("amount") if isinstance(data.get("amount"), dict) else {}
    total_amount = int((amount.get("total") or 0) if isinstance(amount, dict) else 0)

    if not reference:
        return {"matched": False, "reason": "missing_reference", "payment_status": payment_status}

    pricing_cfg = get_pricing_config(session)
    proc_rate = pricing_cfg["bold_processor_rate"]
    proc_fixed = pricing_cfg["bold_processor_fixed_fee"]

    enrollment = session.exec(
        select(CompetitionParticipant).where(CompetitionParticipant.payment_reference == reference)
    ).first()
    now = datetime.now(timezone.utc)
    if enrollment:
        enrollment.payment_status = payment_status
        enrollment.payment_transaction_id = transaction_id
        enrollment.payment_updated_at = now
        if total_amount > 0:
            enrollment.payment_amount_total = total_amount
            enrollment.payment_processor_fee = _bold_processor_fee(total_amount, proc_rate, proc_fixed)
            enrollment.payment_platform_net = _platform_net_amount(enrollment.payment_platform_fee, total_amount, proc_rate, proc_fixed)
        if payment_status == "approved":
            enrollment.payment_processed_at = now
            if enrollment.estado in {PAYMENT_PENDING_STATE, "pendiente"}:
                enrollment.estado = "confirmado"
        session.add(enrollment)
        if payment_status == "approved":
            invalidate_leaderboard_results_snapshot(enrollment.competition_id)
            if enrollment.discount_id:
                _confirm_discount_usage(session, enrollment.discount_id, enrollment.user_id)
        elif payment_status in {"rejected", "failed", "voided", "void_rejected"}:
            if enrollment.discount_id:
                _cancel_discount_usage(session, enrollment.discount_id, enrollment.user_id)
        _try_send_payment_email(
            session,
            user_id=enrollment.user_id,
            competition_id=enrollment.competition_id,
            categoria=enrollment.categoria,
            payment_status=payment_status,
            order_id=reference,
        )
        return {
            "matched": True,
            "reference": reference,
            "estado": enrollment.estado,
            "payment_status": enrollment.payment_status,
            "transaction_id": enrollment.payment_transaction_id,
        }

    intent = session.exec(
        select(CompetitionPaymentIntent).where(CompetitionPaymentIntent.payment_reference == reference)
    ).first()
    if not intent:
        return {"matched": False, "reason": "reference_not_found", "reference": reference, "payment_status": payment_status}

    intent_fee_rate = float(getattr(intent, "payment_platform_fee_rate", 0) or 0)
    intent.payment_status = payment_status
    intent.payment_transaction_id = transaction_id
    intent.payment_updated_at = now
    if total_amount > 0:
        intent.payment_amount_total = total_amount
        intent.payment_processor_fee = _bold_processor_fee(total_amount, proc_rate, proc_fixed)
        intent.payment_platform_net = _platform_net_amount(intent.payment_platform_fee, total_amount, proc_rate, proc_fixed)
    if payment_status == "approved":
        intent.payment_processed_at = now
        existing = session.get(CompetitionParticipant, (intent.competition_id, intent.user_id))
        if existing:
            existing.categoria = intent.categoria
            existing.estado = "confirmado"
            existing.enrollment_answers = intent.enrollment_answers
            existing.payment_provider = intent.payment_provider
            existing.payment_reference = intent.payment_reference
            existing.payment_order_id = intent.payment_order_id
            existing.payment_status = payment_status
            existing.payment_transaction_id = transaction_id
            existing.payment_base_amount = intent.payment_base_amount
            existing.payment_platform_fee = intent.payment_platform_fee
            existing.payment_platform_fee_rate = intent_fee_rate
            existing.payment_processor_fee = intent.payment_processor_fee
            existing.payment_platform_net = intent.payment_platform_net
            existing.payment_amount_total = intent.payment_amount_total
            existing.discount_id = intent.discount_id
            existing.discount_amount = intent.discount_amount
            existing.payment_processed_at = now
            existing.payment_updated_at = now
            session.add(existing)
        else:
            session.add(CompetitionParticipant(
                competition_id=intent.competition_id,
                user_id=intent.user_id,
                categoria=intent.categoria,
                estado="confirmado",
                enrollment_answers=intent.enrollment_answers,
                payment_provider=intent.payment_provider,
                payment_reference=intent.payment_reference,
                payment_order_id=intent.payment_order_id,
                payment_status=payment_status,
                payment_transaction_id=transaction_id,
                payment_base_amount=intent.payment_base_amount,
                payment_platform_fee=intent.payment_platform_fee,
                payment_platform_fee_rate=intent_fee_rate,
                payment_processor_fee=intent.payment_processor_fee,
                payment_platform_net=intent.payment_platform_net,
                payment_amount_total=intent.payment_amount_total,
                discount_id=intent.discount_id,
                discount_amount=intent.discount_amount,
                payment_processed_at=now,
                payment_updated_at=now,
            ))
        invalidate_leaderboard_results_snapshot(intent.competition_id)
        # Marcar el uso del descuento como confirmado
        if intent.discount_id:
            _confirm_discount_usage(session, intent.discount_id, intent.user_id)
    elif payment_status in {"rejected", "failed", "voided", "void_rejected"}:
        # Liberar el slot del descuento si el pago no prosperó
        if intent.discount_id:
            _cancel_discount_usage(session, intent.discount_id, intent.user_id)
    session.add(intent)
    _try_send_payment_email(
        session,
        user_id=intent.user_id,
        competition_id=intent.competition_id,
        categoria=intent.categoria,
        payment_status=payment_status,
        order_id=reference,
    )
    return {
        "matched": True,
        "reference": reference,
        "estado": "confirmado" if payment_status == "approved" else None,
        "payment_status": payment_status,
        "transaction_id": transaction_id,
    }


def _try_send_payment_email(
    session: Session,
    *,
    user_id: int,
    competition_id: int,
    categoria: str | None,
    payment_status: str,
    order_id: str,
) -> None:
    if payment_status not in {"approved", "rejected"}:
        return
    try:
        participant = session.get(Participant, user_id)
        competition = session.get(Competition, competition_id)
        email = str(getattr(participant, "email", "") or "").strip()
        if not email:
            return
        nombre = f"{str(getattr(participant, 'nombre', '') or '').strip()} {str(getattr(participant, 'apellido', '') or '').strip()}".strip()
        comp_name = str(getattr(competition, "nombre", "") or competition_id)
        cat_name = str(categoria or "")
        if payment_status == "approved":
            subject, body, html = render_payment_approved(
                nombre=nombre,
                competition_name=comp_name,
                category_name=cat_name,
                order_id=order_id,
            )
        else:
            subject, body, html = render_payment_rejected(
                nombre=nombre,
                competition_name=comp_name,
                category_name=cat_name,
            )
        send_email(to_email=email, subject=subject, body=body, html_body=html)
    except Exception:
        logger.exception("Failed to send payment email (user_id=%s, status=%s)", user_id, payment_status)


_BOLD_STATUS_TO_EVENT_TYPE = {
    "APPROVED": "SALE_APPROVED",
    "REJECTED": "SALE_REJECTED",
    "FAILED": "SALE_REJECTED",
    "VOIDED": "VOID_APPROVED",
}


def _voucher_to_notification(voucher: dict, reference: str) -> dict | None:
    if not isinstance(voucher, dict):
        return None
    status = str(voucher.get("payment_status") or "").strip().upper()
    event_type = _BOLD_STATUS_TO_EVENT_TYPE.get(status)
    if not event_type:
        return None
    metadata = {
        "reference": voucher.get("reference_id") or reference,
    }
    total = voucher.get("total")
    if total is not None:
        metadata["amount"] = {"total": total, "currency": voucher.get("currency") or "COP"}
    tx_id = voucher.get("transaction_id")
    if tx_id:
        metadata["payment_id"] = tx_id
    return {
        "type": event_type,
        "data": {
            "metadata": metadata,
            "payment_method": voucher.get("payment_method"),
            "card": voucher.get("card"),
        },
    }


def _bold_get(url: str, identity_key: str) -> dict | None:
    req = urllib_request.Request(url, headers={"Authorization": f"x-api-key {identity_key}"}, method="GET")
    try:
        with urllib_request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        if exc.code == 404:
            return None
        detail = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(exc.code, detail or "No se pudo consultar el estado del pago en Bold")
    except urllib_error.URLError:
        raise HTTPException(502, "No se pudo conectar con Bold para consultar el pago")


def _sync_bold_notification_by_reference(reference: str) -> dict | None:
    identity_key = (os.getenv("BOLD_IDENTITY_KEY") or "").strip()
    if not identity_key:
        raise HTTPException(500, "Falta la llave de identidad de Bold en el servidor")
    encoded_reference = urllib_parse.quote(reference, safe="")

    voucher_url = f"https://payments.api.bold.co/v2/payment-voucher/{encoded_reference}"
    voucher_payload = _bold_get(voucher_url, identity_key)
    if isinstance(voucher_payload, dict):
        voucher = voucher_payload.get("payload") if isinstance(voucher_payload.get("payload"), dict) else voucher_payload
        notif = _voucher_to_notification(voucher, reference)
        if notif:
            return notif

    fallback_url = f"https://integrations.api.bold.co/payments/webhook/notifications/{encoded_reference}?is_external_reference=true"
    fallback_payload = _bold_get(fallback_url, identity_key)
    notifications = fallback_payload.get("notifications") if isinstance(fallback_payload, dict) else None
    if not isinstance(notifications, list) or not notifications:
        return None
    return notifications[0] if isinstance(notifications[0], dict) else None


@router.post("/api/enrollment-answers/upload")
def upload_enrollment_answer_image(
    file: UploadFile = File(...),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")
    return {"url": _process_enrollment_image(file, user_id)}


@router.get("/api/competitions/{competition_id}/participants")
def list_enrolled(competition_id: int, session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)

    rows = session.exec(
        select(CompetitionParticipant, Participant)
        .join(Participant, Participant.id == CompetitionParticipant.user_id)
        .where(CompetitionParticipant.competition_id == competition_id)
        .order_by(CompetitionParticipant.estado, Participant.apellido, Participant.nombre)
    ).all()
    checkin_usage_by_participant = _get_checkin_usage_by_participant(session, competition_id)
    return _serialize_enrolled_rows(rows, checkin_usage_by_participant)


@router.post("/api/competitions/{competition_id}/participants", status_code=201)
def set_enrolled(
    competition_id: int,
    body: EnrollBody,
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    require_competition_access(session, competition_id, user)

    existing_confirmed = session.exec(
        select(CompetitionParticipant)
        .where(CompetitionParticipant.competition_id == competition_id)
        .where(CompetitionParticipant.estado == "confirmado")
    ).all()
    for cp in existing_confirmed:
        session.delete(cp)
    session.flush()

    for entry in body.participants:
        target_user_id = int(entry.user_id)
        if not session.get(Participant, target_user_id):
            raise HTTPException(404, f"Usuario {target_user_id} no encontrado")
        existing = session.get(CompetitionParticipant, (competition_id, target_user_id))
        if existing:
            existing.estado = "confirmado"
            existing.categoria = entry.categoria
            session.add(existing)
        else:
            session.add(CompetitionParticipant(
                competition_id=competition_id,
                user_id=target_user_id,
                categoria=entry.categoria,
                estado="confirmado",
            ))

    session.commit()
    invalidate_leaderboard_results_snapshot(competition_id)
    return {"enrolled": len(body.participants)}


@router.put("/api/competitions/{competition_id}/users/{user_id}/status")
def update_enrollment_status(
    competition_id: int,
    user_id: int,
    body: EnrollStatusUpdate,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    if body.estado != "confirmado":
        raise HTTPException(400, "Solo se permite confirmar la inscripcion")
    cp = session.get(CompetitionParticipant, (competition_id, user_id))
    if not cp:
        raise HTTPException(404, "Inscripción no encontrada")
    cp.estado = body.estado
    session.add(cp)
    session.commit()
    invalidate_leaderboard_results_snapshot(competition_id)

    try:
        participant = session.get(Participant, user_id)
        competition = session.get(Competition, competition_id)
        email = str(getattr(participant, "email", "") or "").strip()
        if email:
            nombre = f"{str(getattr(participant, 'nombre', '') or '').strip()} {str(getattr(participant, 'apellido', '') or '').strip()}".strip()
            comp_name = str(getattr(competition, "nombre", "") or competition_id)
            subject, mail_body, html = render_enrollment_confirmed(
                nombre=nombre,
                competition_name=comp_name,
                category_name=str(cp.categoria or ""),
            )
            send_email(to_email=email, subject=subject, body=mail_body, html_body=html)
    except Exception:
        logger.exception("Failed to send enrollment status email (user_id=%s, estado=%s)", user_id, body.estado)

    return {"ok": True, "estado": cp.estado, "user_id": user_id}


@router.patch("/api/competitions/{competition_id}/users/{user_id}/categoria")
def update_participant_categoria(
    competition_id: int,
    user_id: int,
    body: EnrollCategoriaUpdate,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    cp = session.get(CompetitionParticipant, (competition_id, user_id))
    if not cp:
        raise HTTPException(404, "Inscripción no encontrada")
    cp.categoria = str(body.categoria or "").strip() or None
    session.add(cp)
    session.commit()
    invalidate_leaderboard_results_snapshot(competition_id)
    return {"ok": True, "categoria": cp.categoria, "user_id": user_id}


@router.delete("/api/competitions/{competition_id}/users/{user_id}", status_code=204)
def unenroll(
    competition_id: int,
    user_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    cp = session.get(CompetitionParticipant, (competition_id, user_id))
    if cp:
        session.delete(cp)
        session.commit()
        invalidate_leaderboard_results_snapshot(competition_id)


@router.post("/api/competitions/{competition_id}/free-enroll", status_code=201)
def free_enroll(
    competition_id: int,
    body: SelfEnrollRequest,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")

    comp = session.get(Competition, competition_id)
    if not comp:
        raise HTTPException(404, "Competencia no encontrada")
    _ensure_competition_open(comp)

    if not getattr(comp, "allow_free_categories", 0):
        raise HTTPException(403, "Las inscripciones gratuitas no estan habilitadas para esta competencia. Contacta al administrador.")

    category_name = str(body.categoria or "").strip()
    if not category_name:
        raise HTTPException(400, "Selecciona una categoria para continuar")

    category = session.exec(
        select(CompetitionCategory)
        .where(CompetitionCategory.competition_id == competition_id)
        .where(CompetitionCategory.nombre == category_name)
    ).first()
    if not category:
        raise HTTPException(404, "Categoria no encontrada")

    applied_discount = None
    discount_id = None
    discount_amount = 0
    raw_discount_code = str(body.discount_code or "").strip()
    if raw_discount_code:
        applied_discount, discount_amount = validate_discount_for_checkout(
            raw_discount_code, competition_id, user_id, category, session
        )
        discount_id = applied_discount.id if applied_discount else None

    pricing_cfg = get_pricing_config(session)
    fee_rate = _normalize_platform_fee_rate(pricing_cfg["default_platform_fee_rate"])
    base_price = getattr(category, "enrollment_price", 0)
    effective_base = max(0, base_price - discount_amount)
    breakdown = _price_breakdown(
        effective_base,
        fee_rate,
        pricing_cfg["bold_processor_rate"],
        pricing_cfg["bold_processor_fixed_fee"],
        pricing_cfg["min_platform_fee"],
    )
    if breakdown["total_price"] > 0:
        raise HTTPException(400, "Esta categoria tiene un costo. Usa el flujo de pago con Bold.")

    questions = _parse_enrollment_questions(comp.enrollment_questions)
    extra_items = []
    if comp.enrollment_terms_text and not body.terms_accepted:
        raise HTTPException(400, "Debes aceptar los terminos y condiciones del evento")
    if comp.enrollment_terms_text:
        extra_items.append({
            "question_id": "__terms_acceptance__",
            "question_label": "Aceptacion de terminos y condiciones",
            "question_type": "text",
            "answer": "Aceptado",
        })
    serialized_answers = _serialize_enrollment_answers(questions, body.answers, extra_items)

    existing = session.get(CompetitionParticipant, (competition_id, user_id))
    if existing and existing.estado in ("confirmado", "pendiente"):
        raise HTTPException(409, f"Ya tienes una inscripcion con estado: {existing.estado}")

    now = datetime.now(timezone.utc)
    if existing:
        existing.categoria = category_name
        existing.estado = "confirmado"
        existing.enrollment_answers = serialized_answers
        existing.payment_status = "free"
        existing.payment_amount_total = 0
        existing.payment_base_amount = 0
        existing.payment_platform_fee = 0
        existing.payment_processor_fee = 0
        existing.payment_platform_net = 0
        existing.discount_id = discount_id
        existing.discount_amount = discount_amount
        existing.payment_processed_at = now
        existing.payment_updated_at = now
        session.add(existing)
    else:
        session.add(CompetitionParticipant(
            competition_id=competition_id,
            user_id=user_id,
            categoria=category_name,
            estado="confirmado",
            enrollment_answers=serialized_answers,
            payment_status="free",
            payment_amount_total=0,
            payment_base_amount=0,
            payment_platform_fee=0,
            payment_processor_fee=0,
            payment_platform_net=0,
            discount_id=discount_id,
            discount_amount=discount_amount,
            payment_processed_at=now,
            payment_updated_at=now,
        ))

    if applied_discount:
        _confirm_discount_usage(session, applied_discount.id, user_id)

    session.commit()
    invalidate_leaderboard_results_snapshot(competition_id)
    return {"ok": True, "estado": "confirmado", "user_id": user_id}


@router.post("/api/competitions/{competition_id}/enroll", status_code=201)
def self_enroll(
    competition_id: int,
    body: SelfEnrollRequest,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")

    comp = session.get(Competition, competition_id)
    if not comp:
        raise HTTPException(404, "Competencia no encontrada")
    _ensure_competition_open(comp)

    existing = session.get(CompetitionParticipant, (competition_id, user_id))
    if not existing:
        raise HTTPException(409, "Debes iniciar el pago antes de completar la inscripcion")
    if _payment_status_label(existing.payment_status) != "approved":
        raise HTTPException(409, "El pago aun no ha sido aprobado por Bold")
    if existing.estado in ("confirmado", "pendiente"):
        raise HTTPException(409, f"Ya tienes una inscripcion con estado: {existing.estado}")

    questions = _parse_enrollment_questions(comp.enrollment_questions)
    extra_items = []
    if comp.enrollment_terms_text and not body.terms_accepted:
        raise HTTPException(400, "Debes aceptar los terminos y condiciones del evento")
    if comp.enrollment_terms_text:
        extra_items.append({
            "question_id": "__terms_acceptance__",
            "question_label": "Aceptacion de terminos y condiciones",
            "question_type": "text",
            "answer": "Aceptado",
        })
    serialized_answers = _serialize_enrollment_answers(questions, body.answers, extra_items)

    existing.categoria = body.categoria
    existing.estado = "confirmado"
    existing.enrollment_answers = serialized_answers
    existing.payment_processed_at = existing.payment_processed_at or datetime.now(timezone.utc)
    existing.payment_updated_at = datetime.now(timezone.utc)
    session.add(existing)
    session.commit()
    invalidate_leaderboard_results_snapshot(competition_id)
    return {"ok": True, "estado": "confirmado", "user_id": user_id}

@router.post("/api/competitions/{competition_id}/bold-checkout")
def create_bold_checkout(
    competition_id: int,
    body: SelfEnrollRequest,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")

    comp = session.get(Competition, competition_id)
    if not comp:
        raise HTTPException(404, "Competencia no encontrada")
    _ensure_competition_open(comp)

    category_name = str(body.categoria or "").strip()
    if not category_name:
        raise HTTPException(400, "Selecciona una categoria para continuar")

    category = session.exec(
        select(CompetitionCategory)
        .where(CompetitionCategory.competition_id == competition_id)
        .where(CompetitionCategory.nombre == category_name)
    ).first()
    if not category:
        raise HTTPException(404, "Categoria no encontrada")

    questions = _parse_enrollment_questions(comp.enrollment_questions)
    extra_items = []
    if comp.enrollment_terms_text and not body.terms_accepted:
        raise HTTPException(400, "Debes aceptar los terminos y condiciones del evento")
    if comp.enrollment_terms_text:
        extra_items.append({
            "question_id": "__terms_acceptance__",
            "question_label": "Aceptacion de terminos y condiciones",
            "question_type": "text",
            "answer": "Aceptado",
        })
    serialized_answers = _serialize_enrollment_answers(questions, body.answers, extra_items)

    pricing_cfg = get_pricing_config(session)
    fee_rate = _normalize_platform_fee_rate(pricing_cfg["default_platform_fee_rate"])

    # ── Descuento ────────────────────────────────────────────────────────────
    applied_discount = None
    discount_amount = 0
    raw_discount_code = str(body.discount_code or "").strip()
    if raw_discount_code:
        applied_discount, discount_amount = validate_discount_for_checkout(
            raw_discount_code, competition_id, user_id, category, session
        )

    base_price = getattr(category, "enrollment_price", 0)
    effective_base = max(0, base_price - discount_amount)

    breakdown = _price_breakdown(
        effective_base,
        fee_rate,
        pricing_cfg["bold_processor_rate"],
        pricing_cfg["bold_processor_fixed_fee"],
        pricing_cfg["min_platform_fee"],
    )
    if breakdown["total_price"] <= 0:
        raise HTTPException(400, "Esta categoria no tiene un valor de inscripcion valido")

    identity_key = (os.getenv("BOLD_IDENTITY_KEY") or "").strip()
    secret_key = (os.getenv("BOLD_SECRET_KEY") or "").strip()
    if not identity_key or not secret_key:
        raise HTTPException(500, "Faltan las credenciales de Bold en el servidor")

    participant = session.get(Participant, user_id)
    order_id = f"FR-C{competition_id}-U{user_id}-{int(datetime.now(timezone.utc).timestamp())}"
    existing = session.get(CompetitionParticipant, (competition_id, user_id))
    if existing and existing.estado in ("confirmado", "pendiente", PAYMENT_PENDING_STATE):
        raise HTTPException(409, f"Ya tienes una inscripcion con estado: {existing.estado}")

    latest_intent = session.exec(
        select(CompetitionPaymentIntent)
        .where(CompetitionPaymentIntent.competition_id == competition_id)
        .where(CompetitionPaymentIntent.user_id == user_id)
        .order_by(CompetitionPaymentIntent.payment_updated_at.desc(), CompetitionPaymentIntent.id.desc())
    ).first()
    if _is_payment_intent_blocking(latest_intent):
        latest_payment_state = _payment_status_label(latest_intent.payment_status if latest_intent else None)
        if latest_payment_state == "approved":
            raise HTTPException(
                409,
                "Tu ultimo pago ya aparece aprobado. Espera unos segundos y vuelve a consultar el estado.",
            )
        raise HTTPException(
            409,
            "Ya tienes un pago en progreso. Espera la confirmacion de Bold antes de intentar de nuevo.",
        )

    now = datetime.now(timezone.utc)
    intent = CompetitionPaymentIntent(
        competition_id=competition_id,
        user_id=user_id,
        categoria=category_name,
        enrollment_answers=serialized_answers,
        payment_provider="bold",
        payment_reference=order_id,
        payment_order_id=order_id,
        payment_status="prepared",
        payment_transaction_id=None,
        payment_base_amount=breakdown["organizer_price"],
        payment_platform_fee=breakdown["platform_fee"],
        payment_platform_fee_rate=breakdown["fee_rate"],
        payment_processor_fee=breakdown["processor_fee"],
        payment_platform_net=breakdown["platform_net"],
        payment_amount_total=breakdown["total_price"],
        discount_id=applied_discount.id if applied_discount else None,
        discount_amount=discount_amount,
        payment_processed_at=None,
        payment_updated_at=now,
    )
    session.add(intent)
    session.flush()  # obtener intent.id antes del commit

    # Registrar uso del descuento (pending) y reservar el slot
    if applied_discount:
        usage = CompetitionDiscountUsage(
            discount_id=applied_discount.id,
            competition_id=competition_id,
            user_id=user_id,
            discount_code=applied_discount.code,
            discount_type=applied_discount.discount_type,
            discount_value=applied_discount.discount_value,
            base_price_before=base_price,
            discount_amount_applied=discount_amount,
            final_base_price=effective_base,
            payment_intent_id=intent.id,
            enrollment_status="pending",
        )
        session.add(usage)
        # Incremento atómico del contador de usos
        from sqlalchemy import update as sa_update
        from models import CompetitionDiscount
        session.execute(
            sa_update(CompetitionDiscount)
            .where(CompetitionDiscount.id == applied_discount.id)
            .values(uses_count=CompetitionDiscount.uses_count + 1)
        )

    session.commit()

    redirection_base = (os.getenv("LEADERBOARD_BASE_URL") or "http://localhost:5173/").strip()
    if not redirection_base.endswith("/"):
        redirection_base += "/"
    redirection_url = f"{redirection_base}competitions/{competition_id}/payment-result"

    customer_data = {
        "email": str(getattr(participant, "email", "") or "").strip(),
        "fullName": f"{str(getattr(participant, 'nombre', '') or '').strip()} {str(getattr(participant, 'apellido', '') or '').strip()}".strip(),
        "phone": str(getattr(participant, "celular", "") or "").strip(),
        "dialCode": "+57",
        "documentNumber": str(getattr(participant, "cedula", "") or "").strip(),
        "documentType": "CC",
    }
    customer_data = {key: value for key, value in customer_data.items() if value}

    return {
        "user_id": user_id,
        "order_id": order_id,
        "api_key": identity_key,
        "amount": str(breakdown["total_price"]),
        "currency": "COP",
        "description": f"Inscripcion {comp.nombre} - {category.nombre}",
        "redirection_url": redirection_url,
        "integrity_signature": _bold_integrity_signature(order_id, breakdown["total_price"], "COP", secret_key),
        "customer_data": customer_data,
        "pricing": {
            **breakdown,
            "original_base_price": base_price,
            "discount_amount": discount_amount,
            "discount_code": applied_discount.code if applied_discount else None,
        },
    }


@router.post("/api/competitions/{competition_id}/bold-intent/activate")
def activate_bold_intent(
    competition_id: int,
    body: CompetitionPaymentIntentActivateRequest,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")

    reference = str(body.reference or "").strip()
    if not reference:
        raise HTTPException(400, "Referencia de pago invalida")

    intent = session.exec(
        select(CompetitionPaymentIntent)
        .where(CompetitionPaymentIntent.competition_id == competition_id)
        .where(CompetitionPaymentIntent.user_id == user_id)
        .where(CompetitionPaymentIntent.payment_reference == reference)
        .order_by(CompetitionPaymentIntent.id.desc())
    ).first()
    if not intent:
        raise HTTPException(404, "No existe un intento de pago para esa referencia")

    status = _payment_status_label(intent.payment_status)
    if status in {"approved", "processing", "pending", "rejected", "failed", "voided", "void_rejected"}:
        return _with_user_id({"ok": True, "payment_status": intent.payment_status, "reference": reference}, user_id)
    if status == "created":
        intent.payment_updated_at = datetime.now(timezone.utc)
        session.add(intent)
        session.commit()
        return _with_user_id({"ok": True, "payment_status": intent.payment_status, "reference": reference}, user_id)
    if status != "prepared":
        return _with_user_id({"ok": True, "payment_status": intent.payment_status, "reference": reference}, user_id)

    intent.payment_status = "created"
    intent.payment_updated_at = datetime.now(timezone.utc)
    session.add(intent)
    session.commit()
    return _with_user_id({"ok": True, "payment_status": intent.payment_status, "reference": reference}, user_id)


@router.post("/api/competitions/{competition_id}/payment-status/sync")
def sync_payment_status(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")

    enrollment = session.get(CompetitionParticipant, (competition_id, user_id))
    intent = session.exec(
        select(CompetitionPaymentIntent)
        .where(CompetitionPaymentIntent.competition_id == competition_id)
        .where(CompetitionPaymentIntent.user_id == user_id)
        .order_by(CompetitionPaymentIntent.payment_updated_at.desc(), CompetitionPaymentIntent.id.desc())
    ).first()
    reference = (
        enrollment.payment_reference if enrollment and enrollment.payment_reference
        else intent.payment_reference if intent and intent.payment_reference
        else None
    )
    if not reference:
        raise HTTPException(404, "No existe una referencia de pago en proceso para esta competencia")

    local_payment_status = (
        enrollment.payment_status if enrollment and enrollment.payment_status
        else intent.payment_status if intent and intent.payment_status
        else None
    )
    local_transaction_id = (
        enrollment.payment_transaction_id if enrollment and enrollment.payment_transaction_id
        else intent.payment_transaction_id if intent and intent.payment_transaction_id
        else None
    )
    if str(local_payment_status or "").strip().lower() in {"approved", "rejected", "failed", "voided"}:
        return _with_user_id({
            "ok": True,
            "result": {
                "matched": True,
                "reference": reference,
                "estado": enrollment.estado if enrollment else None,
                "payment_status": local_payment_status,
                "transaction_id": local_transaction_id,
                "source": "local",
            },
            "estado": enrollment.estado if enrollment else None,
            "payment_status": local_payment_status,
            "payment_reference": enrollment.payment_reference if enrollment else reference,
            "payment_transaction_id": local_transaction_id,
        }, user_id)

    notification = _sync_bold_notification_by_reference(reference)
    if notification:
        result = _apply_bold_notification(session, notification)
        session.commit()
        enrollment = session.get(CompetitionParticipant, (competition_id, user_id))
    else:
        result = {
            "matched": True,
            "reference": reference,
            "estado": enrollment.estado if enrollment else None,
            "payment_status": enrollment.payment_status if enrollment else (intent.payment_status if intent else None),
            "transaction_id": enrollment.payment_transaction_id if enrollment else (intent.payment_transaction_id if intent else None),
        }
    return _with_user_id({
        "ok": True,
        "result": result,
        "estado": enrollment.estado if enrollment else None,
        "payment_status": enrollment.payment_status if enrollment else (intent.payment_status if intent else None),
        "payment_reference": enrollment.payment_reference if enrollment else reference,
        "payment_transaction_id": enrollment.payment_transaction_id if enrollment else (intent.payment_transaction_id if intent else None),
    }, user_id)


@router.post("/api/payments/bold/webhook")
async def bold_webhook(
    request: Request,
    session: Session = Depends(get_session),
):
    raw_body = await request.body()
    if not _verify_bold_webhook_signature(raw_body, request.headers.get("x-bold-signature")):
        raise HTTPException(400, "Firma de webhook invalida")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "Payload de webhook invalido")

    result = _apply_bold_notification(session, payload)
    if not result.get("matched"):
        result = apply_spectator_bold_notification(session, payload)
    session.commit()
    return {"ok": True, "result": result}


@router.delete("/api/competitions/{competition_id}/enroll", status_code=204)
def cancel_self_enroll(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")
    cp = session.get(CompetitionParticipant, (competition_id, user_id))
    if not cp:
        return
    payment_state = _payment_status_label(cp.payment_status)
    is_invitation = cp.payment_provider == "invitation"
    if not is_invitation and payment_state not in {"unknown", "free", "rejected", "failed", "voided", "void_rejected"}:
        raise HTTPException(
            409,
            "No puedes cancelar esta inscripcion porque el pago ya fue procesado o esta en curso. Si deseas devolucion, debes solicitarla directamente al organizador despues del cierre de inscripciones.",
        )
    session.delete(cp)
    if is_invitation:
        from models import CompetitionCompetitorInvitation
        invitation = session.exec(
            select(CompetitionCompetitorInvitation)
            .where(CompetitionCompetitorInvitation.competition_id == competition_id)
            .where(CompetitionCompetitorInvitation.user_id == user_id)
            .where(CompetitionCompetitorInvitation.status == "accepted")
        ).first()
        if invitation:
            invitation.status = "pending"
            invitation.accepted_at = None
            session.add(invitation)
    session.commit()
    invalidate_leaderboard_results_snapshot(competition_id)


@router.get("/api/competitions/{competition_id}/enrolled-list")
def enrolled_list(competition_id: int, session: Session = Depends(get_session)):
    rows = session.execute(text("""
        SELECT p.nombre, p.apellido, COALESCE(p.genero, p.sexo) AS sexo, cp.categoria
        FROM competition_participants cp
        JOIN participants p ON p.id = cp.user_id
        WHERE cp.competition_id = :cid AND cp.estado = 'confirmado'
        ORDER BY cp.categoria, p.apellido, p.nombre
    """), {"cid": competition_id}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/api/users/{user_id}/competitions")
def participant_competitions(
    user_id: int,
    session: Session = Depends(get_session),
    user=Depends(get_current_user),
):
    user_sub = get_current_user_id(user)
    if is_end_user(user) and user_sub != user_id:
        raise HTTPException(403, "Sin permiso")

    rows = session.execute(text("""
        SELECT c.*, cp.estado AS enrollment_estado, cp.categoria AS enrollment_categoria, cp.enrollment_answers,
               cp.payment_provider, cp.payment_reference, cp.payment_order_id, cp.payment_status,
               cp.payment_transaction_id, cp.payment_base_amount, cp.payment_platform_fee, cp.payment_amount_total,
               cp.payment_processed_at, cp.payment_updated_at
        FROM competitions c
        JOIN competition_participants cp ON cp.competition_id = c.id
        WHERE cp.user_id = :uid
        ORDER BY c.id DESC
    """), {"uid": user_id}).mappings().all()
    intent_rows = session.execute(text("""
        SELECT c.*, :pending_state AS enrollment_estado, i.categoria AS enrollment_categoria, NULL AS enrollment_answers,
               i.payment_provider, i.payment_reference, i.payment_order_id, i.payment_status,
               i.payment_transaction_id, i.payment_base_amount, i.payment_platform_fee, i.payment_amount_total,
               i.payment_processed_at, i.payment_updated_at
        FROM competitions c
        JOIN competition_payment_intents i ON i.competition_id = c.id
        WHERE i.user_id = :uid
        ORDER BY
            CASE WHEN i.payment_updated_at IS NULL THEN 1 ELSE 0 END,
            i.payment_updated_at DESC,
            i.id DESC,
            c.id DESC
    """), {"uid": user_id, "pending_state": PENDING_VERIFICATION_STATE}).mappings().all()
    merged_rows = _merge_participant_competition_rows([dict(r) for r in rows], [dict(r) for r in intent_rows])
    return [_with_user_id(row, user_id) for row in merged_rows]

