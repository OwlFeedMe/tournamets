import base64
import hashlib
import hmac
import io
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import func
from sqlmodel import Session, select

from access import require_competition_access
from auth import get_current_user_id, get_current_user_optional, require_staff
from database import get_session
from models import (
    Competition,
    CompetitionSpectatorTicketingConfig,
    SpectatorCheckoutRequest,
    SpectatorPaymentStatusSyncRequest,
    SpectatorTicket,
    SpectatorTicketCheckinAudit,
    SpectatorTicketOrder,
    SpectatorTicketProductItem,
    SpectatorTicketScanRequest,
    SpectatorTicketTierItem,
    SpectatorTicketingConfigOut,
    SpectatorTicketingConfigUpdate,
)
from routers.config import get_pricing_config
from services.email_templates import render_spectator_tickets_approved
from services.emailer import send_email

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ticketing"])

_STATUS_DRAFT = "draft"
_STATUS_ACTIVE = "active"
_PAYMENT_FINAL_STATES = {"approved", "rejected", "failed", "voided", "void_rejected", "approved_no_capacity"}
_QR_VERSION = 1
_DOC_RE = re.compile(r"[^0-9A-Za-z]")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"[^0-9+]")
_TICKETS_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "spectator_tickets"
_TICKETS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _clean_text(raw: object, *, field_name: str, max_len: int = 3000) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    if len(value) > max_len:
        raise HTTPException(400, f"{field_name} supera el maximo de {max_len} caracteres")
    return value


def _normalize_non_negative_int(raw: object, *, field_name: str) -> int:
    try:
        value = int(raw)
    except Exception:
        raise HTTPException(400, f"{field_name} debe ser un numero entero")
    if value < 0:
        raise HTTPException(400, f"{field_name} no puede ser negativo")
    return value


def _normalize_positive_int(raw: object, *, field_name: str) -> int:
    value = _normalize_non_negative_int(raw, field_name=field_name)
    if value <= 0:
        raise HTTPException(400, f"{field_name} debe ser mayor a 0")
    return value


def _normalize_optional_positive_int(raw: object, *, field_name: str) -> int | None:
    if raw is None or str(raw).strip() == "":
        return None
    return _normalize_positive_int(raw, field_name=field_name)


def _normalize_limit_per_identity(raw: object) -> int:
    if raw is None:
        return 1
    return 1 if int(raw) else 0


def _normalize_bulk_pricing_tiers(
    tiers: list[SpectatorTicketTierItem] | None,
    *,
    base_price: int | None,
) -> list[dict]:
    if not tiers:
        return []
    normalized: list[dict] = []
    seen_min_qty: set[int] = set()
    for idx, tier in enumerate(tiers):
        min_qty = _normalize_positive_int(getattr(tier, "min_quantity", None), field_name=f"bulk_pricing_tiers[{idx}].min_quantity")
        if min_qty < 2:
            raise HTTPException(400, f"bulk_pricing_tiers[{idx}].min_quantity debe ser >= 2")
        unit_price = _normalize_positive_int(getattr(tier, "unit_price", None), field_name=f"bulk_pricing_tiers[{idx}].unit_price")
        if base_price is not None and base_price > 0 and unit_price > base_price:
            raise HTTPException(400, f"bulk_pricing_tiers[{idx}].unit_price no puede ser mayor al precio unitario base")
        if min_qty in seen_min_qty:
            raise HTTPException(400, f"bulk_pricing_tiers tiene min_quantity duplicado ({min_qty})")
        seen_min_qty.add(min_qty)
        normalized.append({
            "min_quantity": min_qty,
            "unit_price": unit_price,
        })
    normalized.sort(key=lambda item: (item["min_quantity"], item["unit_price"]))
    return normalized


def _parse_bulk_tiers(raw: str | None) -> list[SpectatorTicketTierItem]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    out: list[SpectatorTicketTierItem] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            out.append(
                SpectatorTicketTierItem(
                    min_quantity=int(item.get("min_quantity") or 0),
                    unit_price=int(item.get("unit_price") or 0),
                )
            )
        except Exception:
            continue
    return out


def _serialize_bulk_tiers(items: list[dict]) -> str | None:
    if not items:
        return None
    return json.dumps(items, ensure_ascii=False)


def _parse_ticket_products(raw: str | None) -> list[SpectatorTicketProductItem]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    out: list[SpectatorTicketProductItem] = []
    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        try:
            price_unit = int(item.get("price_unit") or 0)
        except Exception:
            continue
        access_days_raw = item.get("access_days")
        access_days = []
        if isinstance(access_days_raw, list):
            for day in access_days_raw:
                day_label = str(day or "").strip()
                if day_label:
                    access_days.append(day_label)
        out.append(
            SpectatorTicketProductItem(
                id=str(item.get("id") or f"product_{idx + 1}").strip() or f"product_{idx + 1}",
                label=label,
                price_unit=price_unit,
                access_days=access_days,
                is_all_days=1 if int(item.get("is_all_days") or 0) else 0,
            )
        )
    return out


def _serialize_ticket_products(items: list[dict]) -> str | None:
    if not items:
        return None
    return json.dumps(items, ensure_ascii=False)


def _normalize_ticket_products(products: list[SpectatorTicketProductItem] | None) -> list[dict]:
    if not products:
        return []
    normalized: list[dict] = []
    seen_ids: set[str] = set()
    for idx, product in enumerate(products):
        raw_id = str(getattr(product, "id", "") or "").strip()
        safe_id = re.sub(r"[^A-Za-z0-9_-]", "_", raw_id).strip("_").lower()
        if not safe_id:
            safe_id = f"product_{idx + 1}"
        if safe_id in seen_ids:
            raise HTTPException(400, f"ticket_products[{idx}].id duplicado ({safe_id})")
        seen_ids.add(safe_id)
        label = _clean_text(getattr(product, "label", None), field_name=f"ticket_products[{idx}].label", max_len=120)
        if not label:
            raise HTTPException(400, f"ticket_products[{idx}].label es obligatorio")
        price_unit = _normalize_positive_int(
            getattr(product, "price_unit", None),
            field_name=f"ticket_products[{idx}].price_unit",
        )
        is_all_days = 1 if int(getattr(product, "is_all_days", 0) or 0) else 0
        raw_days = getattr(product, "access_days", None) or []
        if not isinstance(raw_days, list):
            raise HTTPException(400, f"ticket_products[{idx}].access_days debe ser una lista")
        access_days: list[str] = []
        seen_days: set[str] = set()
        for day_idx, day in enumerate(raw_days):
            day_label = _clean_text(day, field_name=f"ticket_products[{idx}].access_days[{day_idx}]", max_len=80)
            if not day_label:
                continue
            day_key = day_label.lower()
            if day_key in seen_days:
                continue
            seen_days.add(day_key)
            access_days.append(day_label)
        if not is_all_days and not access_days:
            raise HTTPException(400, f"ticket_products[{idx}] debe definir access_days o marcar is_all_days")
        normalized.append(
            {
                "id": safe_id,
                "label": label,
                "price_unit": price_unit,
                "access_days": access_days,
                "is_all_days": is_all_days,
            }
        )
    return normalized


def _normalize_document(value: str) -> str:
    raw = str(value or "").strip()
    normalized = _DOC_RE.sub("", raw).upper()
    if not normalized:
        raise HTTPException(400, "Ingresa un documento de identidad valido")
    if len(normalized) > 40:
        raise HTTPException(400, "El documento de identidad es demasiado largo")
    return normalized


def _normalize_email(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if not normalized or not _EMAIL_RE.fullmatch(normalized):
        raise HTTPException(400, "Ingresa un correo electronico valido")
    return normalized


def _normalize_phone(value: str) -> str:
    normalized = _PHONE_RE.sub("", str(value or "").strip())
    if len(normalized) < 7:
        raise HTTPException(400, "Ingresa un numero de telefono valido")
    return normalized[:30]


def _get_or_create_config(session: Session, competition_id: int) -> CompetitionSpectatorTicketingConfig:
    config = session.exec(
        select(CompetitionSpectatorTicketingConfig).where(
            CompetitionSpectatorTicketingConfig.competition_id == competition_id
        )
    ).first()
    if config:
        return config
    config = CompetitionSpectatorTicketingConfig(
        competition_id=competition_id,
        status=_STATUS_DRAFT,
        enabled=0,
        activated_at=None,
        max_capacity=0,
        product_title=None,
        product_description=None,
        benefits_text=None,
        access_text=None,
        price_unit=0,
        ticket_products=None,
        bulk_pricing_tiers=None,
        limit_per_identity=1,
        max_tickets_per_person=None,
        max_tickets_per_transaction=None,
    )
    session.add(config)
    session.commit()
    session.refresh(config)
    return config


def _to_out(config: CompetitionSpectatorTicketingConfig) -> SpectatorTicketingConfigOut:
    return SpectatorTicketingConfigOut(
        competition_id=int(config.competition_id),
        status=str(config.status or _STATUS_DRAFT),
        enabled=1 if int(config.enabled or 0) else 0,
        activated_at=config.activated_at,
        max_capacity=int(config.max_capacity or 0),
        product_title=config.product_title,
        product_description=config.product_description,
        benefits_text=config.benefits_text,
        access_text=config.access_text,
        price_unit=int(config.price_unit or 0),
        ticket_products=_parse_ticket_products(config.ticket_products),
        bulk_pricing_tiers=_parse_bulk_tiers(config.bulk_pricing_tiers),
        limit_per_identity=1 if int(config.limit_per_identity or 0) else 0,
        max_tickets_per_person=config.max_tickets_per_person,
        max_tickets_per_transaction=config.max_tickets_per_transaction,
    )


def _validate_activation(config: CompetitionSpectatorTicketingConfig) -> None:
    if int(config.max_capacity or 0) <= 0:
        raise HTTPException(400, "Define un aforo maximo mayor a 0 antes de activar la boleteria")
    products = _parse_ticket_products(config.ticket_products)
    if int(config.price_unit or 0) <= 0 and not products:
        raise HTTPException(400, "Define un precio unitario base o al menos un producto de boleteria antes de activar")
    description = str(config.product_description or "").strip()
    if not description:
        raise HTTPException(400, "Agrega una descripcion del producto antes de activar la boleteria")
    if int(config.limit_per_identity or 0):
        max_per_person = config.max_tickets_per_person
        if max_per_person is not None and int(max_per_person) <= 0:
            raise HTTPException(400, "max_tickets_per_person debe ser mayor a 0 cuando el limite por documento esta activo")
    max_per_tx = config.max_tickets_per_transaction
    if max_per_tx is not None and int(max_per_tx) <= 0:
        raise HTTPException(400, "max_tickets_per_transaction debe ser mayor a 0")


def _bold_processor_fee(total_amount: int, processor_rate: float = 0.0269, processor_fixed: int = 300) -> int:
    gross = max(0, int(total_amount or 0))
    if gross <= 0:
        return 0
    return int(round(gross * processor_rate)) + processor_fixed


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


def _bold_integrity_signature(order_id: str, amount: int, currency: str, secret_key: str) -> str:
    payload = f"{order_id}{amount}{currency}{secret_key}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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
    if normalized in {"rejected", "failed", "voided", "void_rejected", "approved_no_capacity"}:
        return normalized
    if normalized in {"created", "processing", "pending"}:
        return normalized
    return "unknown"


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


def verify_bold_webhook_signature(raw_body: bytes, signature: str | None) -> bool:
    return _verify_bold_webhook_signature(raw_body, signature)


def _sync_bold_notification_by_reference(reference: str) -> dict | None:
    identity_key = (os.getenv("BOLD_IDENTITY_KEY") or "").strip()
    if not identity_key:
        raise HTTPException(500, "Falta la llave de identidad de Bold en el servidor")
    encoded_reference = urllib_parse.quote(reference, safe="")
    url = f"https://integrations.api.bold.co/payments/webhook/notifications/{encoded_reference}?is_external_reference=true"
    req = urllib_request.Request(
        url,
        headers={"Authorization": f"x-api-key {identity_key}"},
        method="GET",
    )
    try:
        with urllib_request.urlopen(req, timeout=15) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else None
    except urllib_error.HTTPError as exc:
        detail = None
        try:
            raw_detail = exc.read().decode("utf-8")
            parsed = json.loads(raw_detail)
            detail = parsed.get("message") if isinstance(parsed, dict) else None
        except Exception:
            detail = None
        raise HTTPException(exc.code, detail or "No se pudo consultar el estado del pago en Bold")
    except urllib_error.URLError:
        raise HTTPException(502, "No se pudo conectar con Bold para consultar el pago")


def _get_qr_secret() -> str:
    value = (os.getenv("CHECKIN_QR_SECRET") or os.getenv("SECRET_KEY") or "").strip()
    if not value:
        raise HTTPException(500, "Falta CHECKIN_QR_SECRET o SECRET_KEY en el servidor")
    return value


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(raw: str) -> bytes:
    padded = raw + "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _make_ticket_token(ticket: SpectatorTicket) -> str:
    payload = {
        "t": ticket.ticket_uid,
        "c": int(ticket.competition_id),
        "v": _QR_VERSION,
        "iat": int(_utcnow().timestamp()),
    }
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(_get_qr_secret().encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64url_encode(signature)}"


def _parse_ticket_token(token: str) -> dict | None:
    raw = str(token or "").strip()
    if "." not in raw:
        return None
    payload_b64, signature_b64 = raw.split(".", 1)
    expected_sig = hmac.new(_get_qr_secret().encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    try:
        received_sig = _b64url_decode(signature_b64)
    except Exception:
        return None
    if not hmac.compare_digest(expected_sig, received_sig):
        return None
    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    if not payload.get("t") or not payload.get("c"):
        return None
    return payload


def _ticket_qr_png(token: str) -> Image.Image:
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
    qr.add_data(token)
    qr.make(fit=True)
    image = qr.make_image(fill_color="#0D0F12", back_color="#F5F7FA").convert("RGB")
    return image


def _build_ticket_pdf_bytes(
    *,
    competition: Competition,
    order: SpectatorTicketOrder,
    ticket: SpectatorTicket,
    token: str,
) -> bytes:
    canvas = Image.new("RGB", (1240, 1754), "#0D0F12")
    draw = ImageDraw.Draw(canvas)
    font_title = ImageFont.load_default()
    font_body = ImageFont.load_default()
    font_small = ImageFont.load_default()

    draw.rectangle((40, 40, 1200, 1714), outline="#252A33", width=4, fill="#171B21")
    draw.rectangle((40, 40, 1200, 210), fill="#090B0E")
    draw.text((70, 82), "FINALREP - BOLETA ESPECTADOR", fill="#F5F7FA", font=font_title)
    draw.text((70, 128), f"COMPETENCIA: {str(competition.nombre or '').upper()}", fill="#FF9A3D", font=font_body)
    draw.text((70, 244), f"Comprador: {order.buyer_full_name}", fill="#F5F7FA", font=font_body)
    draw.text((70, 286), f"Documento: {order.buyer_document}", fill="#AAB2C0", font=font_body)
    draw.text((70, 328), f"Correo: {order.buyer_email}", fill="#AAB2C0", font=font_body)
    draw.text((70, 370), f"Telefono: {order.buyer_phone}", fill="#AAB2C0", font=font_body)
    draw.text((70, 430), f"Boleta #{ticket.ticket_number} de {order.quantity}", fill="#00C2A8", font=font_body)
    draw.text((70, 472), f"Orden: {order.payment_reference}", fill="#F5F7FA", font=font_body)
    if str(order.product_label or "").strip():
        draw.text((70, 514), f"Tipo: {order.product_label}", fill="#F5F7FA", font=font_body)
    access_days = []
    if order.access_days:
        try:
            parsed_days = json.loads(order.access_days)
            if isinstance(parsed_days, list):
                access_days = [str(day).strip() for day in parsed_days if str(day).strip()]
        except Exception:
            access_days = []
    if access_days:
        draw.text((70, 556), f"Acceso: {', '.join(access_days)}", fill="#AAB2C0", font=font_body)
    draw.text((70, 598), f"Ticket UID: {ticket.ticket_uid}", fill="#6B7280", font=font_small)
    draw.text((70, 1490), "Presenta este QR para ingreso. Una sola validacion por boleta.", fill="#AAB2C0", font=font_small)

    qr_img = _ticket_qr_png(token).resize((520, 520))
    canvas.paste(qr_img, (360, 690))
    draw.rectangle((350, 680, 890, 1220), outline="#252A33", width=3)

    buf = io.BytesIO()
    canvas.save(buf, format="PDF", resolution=100.0)
    return buf.getvalue()


def _save_ticket_pdf(
    *,
    competition_id: int,
    order_id: int,
    ticket_number: int,
    content: bytes,
) -> str:
    filename = f"finalrep_ticket_c{competition_id}_o{order_id}_t{ticket_number}.pdf"
    target = _TICKETS_UPLOAD_DIR / filename
    target.write_bytes(content)
    return f"/uploads/spectator_tickets/{filename}"


def _sold_tickets_count(session: Session, competition_id: int) -> int:
    count = session.exec(
        select(func.count(SpectatorTicket.id))
        .where(SpectatorTicket.competition_id == competition_id)
        .where(SpectatorTicket.status.in_(["active", "used"]))
    ).one()
    return int(count or 0)


def _approved_tickets_by_document(
    session: Session,
    *,
    competition_id: int,
    document: str,
    exclude_order_id: int | None = None,
) -> int:
    statement = (
        select(func.coalesce(func.sum(SpectatorTicketOrder.quantity), 0))
        .where(SpectatorTicketOrder.competition_id == competition_id)
        .where(SpectatorTicketOrder.buyer_document == document)
        .where(SpectatorTicketOrder.payment_status == "approved")
    )
    if exclude_order_id is not None:
        statement = statement.where(SpectatorTicketOrder.id != exclude_order_id)
    value = session.exec(statement).one()
    return int(value or 0)


def _pick_unit_price(quantity: int, config: CompetitionSpectatorTicketingConfig) -> int:
    return _pick_unit_price_from_base(quantity=quantity, base_price=int(config.price_unit or 0), config=config)


def _pick_unit_price_from_base(quantity: int, base_price: int, config: CompetitionSpectatorTicketingConfig) -> int:
    base = int(base_price or 0)
    tiers = _parse_bulk_tiers(config.bulk_pricing_tiers)
    if not tiers:
        return base
    selected = base
    for tier in sorted(tiers, key=lambda item: item.min_quantity):
        if quantity >= int(tier.min_quantity):
            selected = int(tier.unit_price)
    return max(0, selected)


def _resolve_product_selection(
    *,
    config: CompetitionSpectatorTicketingConfig,
    requested_product_id: str | None,
) -> dict:
    products = _parse_ticket_products(config.ticket_products)
    if not products:
        return {
            "product_id": None,
            "product_label": str(config.product_title or "Boleta espectador").strip() or "Boleta espectador",
            "access_days": [],
            "base_price": int(config.price_unit or 0),
        }

    product_id = str(requested_product_id or "").strip()
    if not product_id:
        raise HTTPException(400, "Selecciona el tipo de boleta que quieres comprar")

    selected = next((item for item in products if str(item.id or "").strip() == product_id), None)
    if not selected:
        raise HTTPException(400, "El tipo de boleta seleccionado no existe")

    return {
        "product_id": str(selected.id or "").strip() or None,
        "product_label": str(selected.label or "").strip() or "Boleta espectador",
        "access_days": [str(day).strip() for day in list(selected.access_days or []) if str(day).strip()],
        "base_price": int(selected.price_unit or 0),
    }


def _ensure_ticketing_active(config: CompetitionSpectatorTicketingConfig | None) -> CompetitionSpectatorTicketingConfig:
    if not config:
        raise HTTPException(403, "La boleteria de espectadores no esta activa para esta competencia")
    products = _parse_ticket_products(config.ticket_products)
    if not products:
        raise HTTPException(403, "La boleteria de espectadores no esta activa para esta competencia")
    return config


def _append_checkin_audit(
    session: Session,
    *,
    competition_id: int,
    ticket_id: int | None,
    order_id: int | None,
    result: str,
    reason: str | None,
    station: str | None,
    device_id: str | None,
    actor_user_id: int | None,
) -> None:
    session.add(
        SpectatorTicketCheckinAudit(
            competition_id=competition_id,
            ticket_id=ticket_id,
            order_id=order_id,
            action="scan",
            result=result,
            reason=reason,
            station=(station or "").strip() or None,
            device_id=(device_id or "").strip() or None,
            actor_user_id=actor_user_id,
        )
    )


def _sync_order_amounts_from_notification(order: SpectatorTicketOrder, payload_data: dict, processor_rate: float, processor_fixed: int) -> None:
    amount = payload_data.get("amount") if isinstance(payload_data.get("amount"), dict) else {}
    total_amount = int((amount.get("total") or 0) if isinstance(amount, dict) else 0)
    if total_amount > 0:
        order.payment_amount_total = total_amount
        order.payment_processor_fee = _bold_processor_fee(total_amount, processor_rate, processor_fixed)
        order.payment_platform_net = int(order.payment_platform_fee or 0) - order.payment_processor_fee


def _ensure_order_tickets_and_email(
    session: Session,
    *,
    competition: Competition,
    config: CompetitionSpectatorTicketingConfig,
    order: SpectatorTicketOrder,
) -> None:
    existing_tickets = session.exec(
        select(SpectatorTicket)
        .where(SpectatorTicket.order_id == order.id)
        .order_by(SpectatorTicket.ticket_number.asc())
    ).all()
    if not existing_tickets:
        sold = _sold_tickets_count(session, competition.id)
        if sold + int(order.quantity or 0) > int(config.max_capacity or 0):
            order.payment_status = "approved_no_capacity"
            order.updated_at = _utcnow()
            session.add(order)
            return

        if int(config.limit_per_identity or 0) and config.max_tickets_per_person is not None:
            approved_so_far = _approved_tickets_by_document(
                session,
                competition_id=competition.id,
                document=order.buyer_document,
                exclude_order_id=order.id,
            )
            if approved_so_far + int(order.quantity or 0) > int(config.max_tickets_per_person or 0):
                order.payment_status = "approved_no_capacity"
                order.updated_at = _utcnow()
                session.add(order)
                return

        now = _utcnow()
        for number in range(1, int(order.quantity or 0) + 1):
            ticket = SpectatorTicket(
                competition_id=competition.id,
                order_id=order.id,
                ticket_number=number,
                ticket_uid=uuid.uuid4().hex,
                status="active",
            )
            session.add(ticket)
        session.flush()
        existing_tickets = session.exec(
            select(SpectatorTicket)
            .where(SpectatorTicket.order_id == order.id)
            .order_by(SpectatorTicket.ticket_number.asc())
        ).all()
        order.paid_at = order.paid_at or now
        order.updated_at = now
        session.add(order)

    if order.tickets_email_sent_at is not None:
        return

    attachments = []
    stored_urls = []
    for ticket in existing_tickets:
        token = _make_ticket_token(ticket)
        pdf_bytes = _build_ticket_pdf_bytes(
            competition=competition,
            order=order,
            ticket=ticket,
            token=token,
        )
        pdf_url = _save_ticket_pdf(
            competition_id=competition.id,
            order_id=order.id,
            ticket_number=ticket.ticket_number,
            content=pdf_bytes,
        )
        stored_urls.append(pdf_url)
        attachments.append({
            "filename": f"finalrep_boleta_{competition.id}_{order.id}_{ticket.ticket_number}.pdf",
            "content": pdf_bytes,
            "mime_type": "application/pdf",
        })

    subject, body, html = render_spectator_tickets_approved(
        buyer_name=order.buyer_full_name,
        competition_name=competition.nombre,
        quantity=int(order.quantity or 0),
        order_id=order.payment_reference,
    )
    sent = send_email(
        to_email=order.buyer_email,
        subject=subject,
        body=body,
        html_body=html,
        attachments=attachments,
    )
    if sent:
        order.tickets_email_sent_at = _utcnow()
        order.tickets_pdf_url = json.dumps(stored_urls, ensure_ascii=False)
        order.updated_at = _utcnow()
        session.add(order)


def apply_spectator_bold_notification(session: Session, payload: dict) -> dict:
    data = payload.get("data") if isinstance(payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    reference = str(metadata.get("reference") or data.get("reference") or "").strip()
    transaction_id = str(data.get("payment_id") or payload.get("subject") or "").strip() or None
    payment_status = _payment_status_from_event_type(payload.get("type"))

    if not reference:
        return {"matched": False, "reason": "missing_reference", "payment_status": payment_status}

    order = session.exec(
        select(SpectatorTicketOrder).where(SpectatorTicketOrder.payment_reference == reference)
    ).first()
    if not order:
        return {"matched": False, "reason": "reference_not_found", "reference": reference, "payment_status": payment_status}

    pricing_cfg = get_pricing_config(session)
    order.payment_status = payment_status
    order.payment_transaction_id = transaction_id
    order.updated_at = _utcnow()
    _sync_order_amounts_from_notification(order, data, pricing_cfg["bold_processor_rate"], pricing_cfg["bold_processor_fixed_fee"])

    if payment_status == "approved":
        comp = session.get(Competition, int(order.competition_id))
        config = session.exec(
            select(CompetitionSpectatorTicketingConfig).where(
                CompetitionSpectatorTicketingConfig.competition_id == order.competition_id
            )
        ).first()
        if comp and config:
            _ensure_order_tickets_and_email(session, competition=comp, config=config, order=order)
        else:
            order.payment_status = "approved_no_capacity"
            order.updated_at = _utcnow()
            session.add(order)

    session.add(order)
    return {
        "matched": True,
        "reference": reference,
        "payment_status": order.payment_status,
        "transaction_id": order.payment_transaction_id,
        "order_id": order.id,
    }


@router.get("/api/competitions/{competition_id}/ticketing-config")
def get_ticketing_config(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    config = _get_or_create_config(session, competition_id)
    return _to_out(config)


@router.put("/api/competitions/{competition_id}/ticketing-config")
def update_ticketing_config(
    competition_id: int,
    body: SpectatorTicketingConfigUpdate,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    config = _get_or_create_config(session, competition_id)

    payload = body.model_dump(exclude_unset=True)
    if "max_capacity" in payload:
        config.max_capacity = _normalize_non_negative_int(payload.get("max_capacity"), field_name="max_capacity")
    if "product_title" in payload:
        config.product_title = _clean_text(payload.get("product_title"), field_name="product_title", max_len=160)
    if "product_description" in payload:
        config.product_description = _clean_text(payload.get("product_description"), field_name="product_description")
    if "benefits_text" in payload:
        config.benefits_text = _clean_text(payload.get("benefits_text"), field_name="benefits_text")
    if "access_text" in payload:
        config.access_text = _clean_text(payload.get("access_text"), field_name="access_text")
    if "price_unit" in payload:
        config.price_unit = _normalize_non_negative_int(payload.get("price_unit"), field_name="price_unit")
    if "ticket_products" in payload:
        normalized_products = _normalize_ticket_products(payload.get("ticket_products"))
        config.ticket_products = _serialize_ticket_products(normalized_products)
    if "limit_per_identity" in payload:
        config.limit_per_identity = _normalize_limit_per_identity(payload.get("limit_per_identity"))
    if "max_tickets_per_person" in payload:
        config.max_tickets_per_person = _normalize_optional_positive_int(
            payload.get("max_tickets_per_person"),
            field_name="max_tickets_per_person",
        )
    if "max_tickets_per_transaction" in payload:
        config.max_tickets_per_transaction = _normalize_optional_positive_int(
            payload.get("max_tickets_per_transaction"),
            field_name="max_tickets_per_transaction",
        )
    if "bulk_pricing_tiers" in payload:
        has_products = bool(_parse_ticket_products(config.ticket_products))
        normalized_tiers = _normalize_bulk_pricing_tiers(
            payload.get("bulk_pricing_tiers"),
            base_price=int(config.price_unit or 0) if int(config.price_unit or 0) > 0 and not has_products else None,
        )
        config.bulk_pricing_tiers = _serialize_bulk_tiers(normalized_tiers)

    if not int(config.limit_per_identity or 0):
        config.max_tickets_per_person = None

    has_products = bool(_parse_ticket_products(config.ticket_products))
    if has_products:
        config.enabled = 1
        config.status = _STATUS_ACTIVE
        if not config.activated_at:
            config.activated_at = _utcnow()
    else:
        config.enabled = 0
        config.status = _STATUS_DRAFT

    config.updated_at = _utcnow()
    session.add(config)
    session.commit()
    session.refresh(config)
    return _to_out(config)


@router.post("/api/competitions/{competition_id}/ticketing-activate")
def activate_ticketing(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    config = _get_or_create_config(session, competition_id)
    if int(config.enabled or 0):
        raise HTTPException(409, "La boleteria ya fue activada y no se puede desactivar")

    _validate_activation(config)
    now = _utcnow()
    config.enabled = 1
    config.status = _STATUS_ACTIVE
    config.activated_at = now
    config.updated_at = now
    session.add(config)
    session.commit()
    session.refresh(config)
    return _to_out(config)


@router.get("/api/competitions/{competition_id}/ticketing-public")
def get_ticketing_public(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    _ = user
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")
    config = session.exec(
        select(CompetitionSpectatorTicketingConfig).where(
            CompetitionSpectatorTicketingConfig.competition_id == competition_id
        )
    ).first()
    if not config:
        return {
            "competition_id": competition_id,
            "enabled": 0,
            "status": _STATUS_DRAFT,
        }

    products = _parse_ticket_products(config.ticket_products)
    has_products = bool(products)

    sold = _sold_tickets_count(session, competition_id)
    out = _to_out(config).model_dump()
    out["enabled"] = 1 if has_products else 0
    out["competition_name"] = competition.nombre
    out["remaining_capacity"] = max(0, int(config.max_capacity or 0) - sold)
    out["sold_tickets"] = sold
    return out


@router.post("/api/competitions/{competition_id}/spectator-checkout")
def spectator_checkout(
    competition_id: int,
    body: SpectatorCheckoutRequest,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    _ = user
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")

    config = session.exec(
        select(CompetitionSpectatorTicketingConfig).where(
            CompetitionSpectatorTicketingConfig.competition_id == competition_id
        )
    ).first()
    config = _ensure_ticketing_active(config)

    quantity = _normalize_positive_int(body.quantity, field_name="quantity")
    if config.max_tickets_per_transaction is not None and quantity > int(config.max_tickets_per_transaction or 0):
        raise HTTPException(400, f"El maximo por transaccion es {int(config.max_tickets_per_transaction)} boletas")

    buyer_full_name = _clean_text(body.buyer_full_name, field_name="buyer_full_name", max_len=180)
    if not buyer_full_name:
        raise HTTPException(400, "Ingresa el nombre completo del comprador")
    buyer_email = _normalize_email(body.buyer_email)
    buyer_phone = _normalize_phone(body.buyer_phone)
    buyer_document = _normalize_document(body.buyer_document)

    if int(config.limit_per_identity or 0) and config.max_tickets_per_person is not None:
        approved_tickets = _approved_tickets_by_document(
            session,
            competition_id=competition_id,
            document=buyer_document,
        )
        if approved_tickets + quantity > int(config.max_tickets_per_person or 0):
            raise HTTPException(409, "La compra excede el limite de boletas por documento de identidad")

    sold = _sold_tickets_count(session, competition_id)
    if sold + quantity > int(config.max_capacity or 0):
        raise HTTPException(409, "No hay aforo disponible para esa cantidad de boletas")

    selected_product = _resolve_product_selection(
        config=config,
        requested_product_id=body.product_id,
    )
    unit_price = _pick_unit_price_from_base(
        quantity=quantity,
        base_price=int(selected_product["base_price"] or 0),
        config=config,
    )
    if unit_price <= 0:
        raise HTTPException(400, "La boleteria no tiene precio valido")

    pricing_cfg = get_pricing_config(session)
    fee_rate = float(pricing_cfg["default_platform_fee_rate"])
    fee_rate = max(0.0, min(round(fee_rate, 4), 1.0))
    breakdown = _price_breakdown(
        base_price=unit_price * quantity,
        fee_rate=fee_rate,
        processor_rate=pricing_cfg["bold_processor_rate"],
        processor_fixed=pricing_cfg["bold_processor_fixed_fee"],
        min_platform_fee=pricing_cfg["min_platform_fee"],
    )
    if breakdown["total_price"] <= 0:
        raise HTTPException(400, "No se pudo calcular el total de la compra")

    identity_key = (os.getenv("BOLD_IDENTITY_KEY") or "").strip()
    secret_key = (os.getenv("BOLD_SECRET_KEY") or "").strip()
    if not identity_key or not secret_key:
        raise HTTPException(500, "Faltan las credenciales de Bold en el servidor")

    order_id = f"FRS-C{competition_id}-{uuid.uuid4().hex[:12].upper()}"
    now = _utcnow()
    order = SpectatorTicketOrder(
        competition_id=competition_id,
        buyer_full_name=buyer_full_name,
        buyer_email=buyer_email,
        buyer_phone=buyer_phone,
        buyer_document=buyer_document,
        product_id=selected_product["product_id"],
        product_label=selected_product["product_label"],
        access_days=json.dumps(selected_product["access_days"], ensure_ascii=False) if selected_product["access_days"] else None,
        quantity=quantity,
        unit_price_applied=unit_price,
        payment_provider="bold",
        payment_reference=order_id,
        payment_order_id=order_id,
        payment_status="created",
        payment_transaction_id=None,
        payment_base_amount=breakdown["organizer_price"],
        payment_platform_fee=breakdown["platform_fee"],
        payment_platform_fee_rate=breakdown["fee_rate"],
        payment_processor_fee=breakdown["processor_fee"],
        payment_platform_net=breakdown["platform_net"],
        payment_amount_total=breakdown["total_price"],
        paid_at=None,
        tickets_pdf_url=None,
        tickets_email_sent_at=None,
        updated_at=now,
    )
    session.add(order)
    session.commit()
    session.refresh(order)

    redirection_base = (os.getenv("LEADERBOARD_BASE_URL") or "http://localhost:5173/").strip()
    if not redirection_base.endswith("/"):
        redirection_base += "/"
    redirection_url = f"{redirection_base}competitions/{competition_id}/tickets/payment-result"

    return {
        "order_id": order_id,
        "api_key": identity_key,
        "amount": str(breakdown["total_price"]),
        "currency": "COP",
        "description": f"{selected_product['product_label']} - {competition.nombre} - {quantity} boleta(s)",
        "redirection_url": redirection_url,
        "integrity_signature": _bold_integrity_signature(order_id, breakdown["total_price"], "COP", secret_key),
        "customer_data": {
            "email": buyer_email,
            "fullName": buyer_full_name,
            "phone": buyer_phone,
            "dialCode": "+57",
            "documentNumber": buyer_document,
            "documentType": "CC",
        },
        "pricing": {
            **breakdown,
            "quantity": quantity,
            "unit_price": unit_price,
            "product_id": selected_product["product_id"],
            "product_label": selected_product["product_label"],
            "access_days": selected_product["access_days"],
        },
    }


@router.post("/api/competitions/{competition_id}/spectator-payment-status/sync")
def spectator_payment_status_sync(
    competition_id: int,
    body: SpectatorPaymentStatusSyncRequest,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    _ = user
    reference = str(body.reference or "").strip()
    if not reference:
        raise HTTPException(400, "Debes indicar la referencia de pago")

    order = session.exec(
        select(SpectatorTicketOrder)
        .where(SpectatorTicketOrder.competition_id == competition_id)
        .where(SpectatorTicketOrder.payment_reference == reference)
    ).first()
    if not order:
        raise HTTPException(404, "No existe una compra con esa referencia para esta competencia")

    local_state = _payment_status_label(order.payment_status)
    if local_state in _PAYMENT_FINAL_STATES:
        return {
            "ok": True,
            "payment_status": local_state,
            "payment_reference": order.payment_reference,
            "payment_transaction_id": order.payment_transaction_id,
            "tickets_email_sent": bool(order.tickets_email_sent_at),
        }

    notification = _sync_bold_notification_by_reference(reference)
    if notification:
        apply_spectator_bold_notification(session, notification)
        session.commit()
        session.refresh(order)

    return {
        "ok": True,
        "payment_status": _payment_status_label(order.payment_status),
        "payment_reference": order.payment_reference,
        "payment_transaction_id": order.payment_transaction_id,
        "tickets_email_sent": bool(order.tickets_email_sent_at),
    }


@router.get("/api/competitions/{competition_id}/ticketing-orders")
def list_ticketing_orders(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    orders = session.exec(
        select(SpectatorTicketOrder)
        .where(SpectatorTicketOrder.competition_id == competition_id)
        .order_by(SpectatorTicketOrder.id.desc())
    ).all()
    results = []
    for order in orders:
        tickets_total = session.exec(
            select(func.count(SpectatorTicket.id))
            .where(SpectatorTicket.order_id == order.id)
        ).one()
        tickets_used = session.exec(
            select(func.count(SpectatorTicket.id))
            .where(SpectatorTicket.order_id == order.id)
            .where(SpectatorTicket.status == "used")
        ).one()
        results.append({
            "id": order.id,
            "buyer_full_name": order.buyer_full_name,
            "buyer_email": order.buyer_email,
            "buyer_phone": order.buyer_phone,
            "buyer_document": order.buyer_document,
            "product_id": order.product_id,
            "product_label": order.product_label,
            "access_days": order.access_days,
            "quantity": order.quantity,
            "payment_status": order.payment_status,
            "payment_reference": order.payment_reference,
            "payment_transaction_id": order.payment_transaction_id,
            "payment_amount_total": order.payment_amount_total,
            "tickets_total": int(tickets_total or 0),
            "tickets_used": int(tickets_used or 0),
            "tickets_email_sent_at": order.tickets_email_sent_at,
            "created_at": order.created_at,
            "updated_at": order.updated_at,
        })
    return results


@router.post("/api/competitions/{competition_id}/ticketing/scan")
def scan_ticket(
    competition_id: int,
    body: SpectatorTicketScanRequest,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    token = str(body.token or "").strip()
    actor_user_id = get_current_user_id(user)
    station = str(body.station or "").strip() or None
    device_id = str(body.device_id or "").strip() or None

    parsed = _parse_ticket_token(token)
    if not parsed:
        _append_checkin_audit(
            session,
            competition_id=competition_id,
            ticket_id=None,
            order_id=None,
            result="invalid",
            reason="invalid_token",
            station=station,
            device_id=device_id,
            actor_user_id=actor_user_id,
        )
        session.commit()
        return {"status": "invalid", "label": "Boleta invalida", "message": "El QR no es valido para esta boleteria."}

    token_competition_id = int(parsed.get("c") or 0)
    if token_competition_id != competition_id:
        _append_checkin_audit(
            session,
            competition_id=competition_id,
            ticket_id=None,
            order_id=None,
            result="null",
            reason="wrong_competition",
            station=station,
            device_id=device_id,
            actor_user_id=actor_user_id,
        )
        session.commit()
        return {"status": "null", "label": "Boleta nula", "message": "La boleta pertenece a otra competencia."}

    ticket_uid = str(parsed.get("t") or "").strip()
    ticket = session.exec(
        select(SpectatorTicket)
        .where(SpectatorTicket.competition_id == competition_id)
        .where(SpectatorTicket.ticket_uid == ticket_uid)
    ).first()
    if not ticket:
        _append_checkin_audit(
            session,
            competition_id=competition_id,
            ticket_id=None,
            order_id=None,
            result="null",
            reason="ticket_not_found",
            station=station,
            device_id=device_id,
            actor_user_id=actor_user_id,
        )
        session.commit()
        return {"status": "null", "label": "Boleta nula", "message": "No existe una boleta activa con ese QR."}

    order = session.get(SpectatorTicketOrder, int(ticket.order_id))
    if ticket.status == "used":
        _append_checkin_audit(
            session,
            competition_id=competition_id,
            ticket_id=ticket.id,
            order_id=ticket.order_id,
            result="used",
            reason="already_used",
            station=station,
            device_id=device_id,
            actor_user_id=actor_user_id,
        )
        session.commit()
        return {
            "status": "used",
            "label": "Boleta ya usada",
            "message": "Esta boleta ya fue validada en ingreso.",
            "buyer_full_name": order.buyer_full_name if order else None,
            "buyer_document": order.buyer_document if order else None,
        }

    if ticket.status not in {"active"}:
        _append_checkin_audit(
            session,
            competition_id=competition_id,
            ticket_id=ticket.id,
            order_id=ticket.order_id,
            result="invalid",
            reason=f"status_{ticket.status}",
            station=station,
            device_id=device_id,
            actor_user_id=actor_user_id,
        )
        session.commit()
        return {"status": "invalid", "label": "Boleta invalida", "message": "La boleta no esta habilitada para ingreso."}

    now = _utcnow()
    ticket.status = "used"
    ticket.scanned_at = now
    ticket.scanned_station = station
    ticket.scanned_device_id = device_id
    session.add(ticket)
    _append_checkin_audit(
        session,
        competition_id=competition_id,
        ticket_id=ticket.id,
        order_id=ticket.order_id,
        result="valid",
        reason="accepted",
        station=station,
        device_id=device_id,
        actor_user_id=actor_user_id,
    )
    session.commit()

    return {
        "status": "valid",
        "label": "Boleta valida",
        "message": "Ingreso confirmado.",
        "scanned_at": now.isoformat(),
        "ticket_number": ticket.ticket_number,
        "buyer_full_name": order.buyer_full_name if order else None,
        "buyer_document": order.buyer_document if order else None,
    }
