import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from access import require_competition_access
from auth import get_current_user_id, require_auth, require_staff, is_end_user, get_current_user_optional
from database import get_session
from models import Competition, CompetitionCategory, CompetitionParticipant, CompetitionPaymentIntent, OpenEntry, Participant, EnrollmentAnswerItem
from services.open_qualifier import config_for, entry_state, final_price, category_final_price, utc

router = APIRouter(prefix="/api", tags=["open"])
UPLOADS = Path(__file__).resolve().parents[1] / "uploads" / "open_videos"


class OpenField(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,50}$")
    label: str = Field(min_length=1, max_length=150)
    field_type: str = Field(default="text", pattern="^(text|number)$")
    required: bool = True


class OpenConfig(BaseModel):
    enabled: bool = False
    price: int = Field(default=0, ge=0, le=100000000)
    deadline: datetime | None = None
    submissions_open_at: datetime | None = None
    instructions: str = Field(default="", max_length=10000)
    final_payment: str = Field(default="full", pattern="^(full|difference|discount|none|pending)$")
    discount_percent: float = Field(default=0, ge=0, le=100)
    fields: list[OpenField] = Field(default_factory=list, max_length=30)


class Checkout(BaseModel):
    categoria: str = ""
    terms_accepted: bool = False
    final: bool = False
    stage_test: bool = False
    answers: list[EnrollmentAnswerItem] = Field(default_factory=list)


class Submission(BaseModel):
    video_url: str = Field(min_length=1, max_length=2000)
    answers: dict[str, str | int | float] = Field(default_factory=dict)


class Decision(BaseModel):
    qualify: bool


def locked_comp(session, competition_id):
    comp = session.exec(select(Competition).where(Competition.id == competition_id).with_for_update()).first()
    if not comp:
        raise HTTPException(404, "Competencia no encontrada")
    return comp


def enabled_config(comp):
    cfg = config_for(comp)
    if not cfg.get("enabled"):
        raise HTTPException(409, "Esta competencia no tiene Open")
    return cfg


def serialize_entry(entry, cfg):
    if not entry:
        return None
    # Access mapped attributes first: commit may have expired the ORM instance.
    state = entry_state(entry, cfg)
    return {**entry.model_dump(), "status": state, "answers": json.loads(entry.answers)}


@router.get("/competitions/{competition_id}/open")
def get_open(competition_id: int, session: Session = Depends(get_session), user=Depends(get_current_user_optional)):
    from routers.competitions import _require_public_competition_access
    comp = _require_public_competition_access(session, str(competition_id), user)
    return config_for(comp)


@router.put("/competitions/{competition_id}/open")
def configure_open(competition_id: int, body: OpenConfig, session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    comp = locked_comp(session, competition_id)
    if body.enabled:
        if body.price <= 0 or not body.deadline or not body.instructions.strip():
            raise HTTPException(400, "Define un precio mayor a cero, instrucciones y fecha limite")
        if body.deadline.tzinfo is None or utc(body.deadline) <= datetime.now(timezone.utc):
            raise HTTPException(400, "La fecha limite debe ser futura e incluir zona horaria")
        if body.submissions_open_at and (body.submissions_open_at.tzinfo is None or utc(body.submissions_open_at) >= utc(body.deadline)):
            raise HTTPException(400, "La apertura de entregas debe incluir zona horaria y ser anterior al cierre")
        if len({field.id for field in body.fields}) != len(body.fields):
            raise HTTPException(400, "Los campos deben tener identificadores unicos")
    has_entries = session.exec(select(OpenEntry).where(OpenEntry.competition_id == competition_id)).first()
    has_intents = session.exec(select(CompetitionPaymentIntent).where(CompetitionPaymentIntent.competition_id == competition_id)).first()
    if has_entries or has_intents or config_for(comp).get("final_prices"):
        raise HTTPException(409, "El Open ya tiene preinscripciones o pagos iniciados; sus condiciones estan bloqueadas")
    if body.enabled and session.exec(select(CompetitionParticipant).where(CompetitionParticipant.competition_id == competition_id)).first():
        raise HTTPException(409, "Activa el Open antes de recibir inscripciones directas")
    comp.open_config = body.model_dump_json()
    session.add(comp)
    session.commit()
    return body


@router.get("/competitions/{competition_id}/open/me")
def my_open(competition_id: int, session: Session = Depends(get_session), user=Depends(require_auth)):
    comp = session.get(Competition, competition_id)
    if not comp:
        raise HTTPException(404, "Competencia no encontrada")
    cfg = enabled_config(comp)
    return serialize_entry(session.get(OpenEntry, (competition_id, get_current_user_id(user))), cfg)


@router.get("/competitions/{competition_id}/open/entries")
def list_entries(competition_id: int, session: Session = Depends(get_session), user=Depends(require_staff)):
    comp = require_competition_access(session, competition_id, user)
    cfg = enabled_config(comp)
    rows = session.exec(select(OpenEntry, Participant).join(Participant, OpenEntry.user_id == Participant.id).where(OpenEntry.competition_id == competition_id).order_by(OpenEntry.registered_at)).all()
    return [{**serialize_entry(entry, cfg), "name": f"{athlete.nombre or ''} {athlete.apellido or ''}".strip()} for entry, athlete in rows]


def confirm_final(session, entry, intent=None):
    cp = session.get(CompetitionParticipant, (entry.competition_id, entry.user_id))
    if not cp:
        cp = CompetitionParticipant(competition_id=entry.competition_id, user_id=entry.user_id, categoria=entry.categoria,
                                    estado="confirmado", enrollment_answers=entry.enrollment_answers)
    if intent:
        for name in ("payment_provider", "payment_reference", "payment_order_id", "payment_status", "payment_transaction_id", "payment_base_amount", "payment_platform_fee", "payment_platform_fee_rate", "payment_processor_fee", "payment_platform_net", "payment_amount_total", "payment_processed_at", "payment_updated_at"):
            setattr(cp, name, getattr(intent, name))
    entry.status = "confirmed"
    session.add(cp)
    session.add(entry)
    from services.leaderboard_cache import invalidate_leaderboard_results_snapshot
    invalidate_leaderboard_results_snapshot(entry.competition_id)


def apply_open_payment(session, intent, payment_status, transaction_id, total_amount):
    """Called only by verified provider notifications or stage-only simulation."""
    comp = locked_comp(session, intent.competition_id)
    session.refresh(intent)
    if intent.payment_status == "approved":
        return {"matched": True, "payment_status": "approved"}
    if payment_status == "approved" and total_amount != intent.payment_amount_total:
        raise HTTPException(400, "El valor pagado no coincide con el cobro")
    intent.payment_status = payment_status
    intent.payment_transaction_id = transaction_id
    intent.payment_updated_at = datetime.now(timezone.utc)
    if payment_status == "approved":
        intent.payment_processed_at = intent.payment_updated_at
        entry = session.get(OpenEntry, (intent.competition_id, intent.user_id))
        if intent.purpose == "open" and (not entry or entry.status == "preregistered"):
            snapshot = json.loads(intent.enrollment_answers)
            if not entry:
                entry = OpenEntry(competition_id=intent.competition_id, user_id=intent.user_id)
            entry.categoria = intent.categoria
            entry.open_price = intent.payment_base_amount
            entry.final_amount = snapshot["final_amount"]
            if entry.final_amount is None:
                entry.final_amount = config_for(comp).get("final_prices", {}).get(intent.categoria)
            entry.terms_snapshot = json.dumps(snapshot["config"])
            entry.enrollment_answers = snapshot.get("answers")
            entry.status = "paid"
            entry.paid_at = intent.payment_processed_at
            session.add(entry)
        elif intent.purpose == "open_final" and entry and entry.status == "qualified":
            confirm_final(session, entry, intent)
    session.add(intent)
    return {"matched": True, "payment_status": intent.payment_status, "reference": intent.payment_reference}


def registration_category(session, comp, cfg, category_name, already_registered=False):
    from routers.enrollments import _ensure_competition_open
    if not comp.activa or (not already_registered and not comp.enrollment_open) or datetime.now(timezone.utc) >= utc(cfg["deadline"]):
        raise HTTPException(409, "El registro al Open esta cerrado")
    if not already_registered:
        _ensure_competition_open(comp)
    category = session.exec(select(CompetitionCategory).where(CompetitionCategory.competition_id == comp.id, CompetitionCategory.nombre == category_name)).first()
    if not category or not category.registration_enabled:
        raise HTTPException(400, "Selecciona una categoria habilitada")
    if str(category.modality).lower() in {"team", "teams", "equipo", "equipos"}:
        raise HTTPException(400, "El Open esta disponible para categorias individuales")
    return category


class Preregistration(BaseModel):
    categoria: str
    terms_accepted: bool = False
    answers: list[EnrollmentAnswerItem] = Field(default_factory=list)


@router.post("/competitions/{competition_id}/open/preregister")
def preregister(competition_id: int, body: Preregistration, session: Session = Depends(get_session), user=Depends(require_auth)):
    from routers.enrollments import _serialize_enrollment_answers, _parse_enrollment_questions
    if not is_end_user(user):
        raise HTTPException(403, "Solo atletas")
    comp = locked_comp(session, competition_id)
    cfg = enabled_config(comp)
    uid = get_current_user_id(user)
    existing = session.get(OpenEntry, (competition_id, uid))
    if existing:
        return serialize_entry(existing, cfg)
    if not body.terms_accepted:
        raise HTTPException(400, "Debes aceptar las condiciones del Open y de la competencia")
    category = registration_category(session, comp, cfg, body.categoria)
    answers = _serialize_enrollment_answers(_parse_enrollment_questions(comp.enrollment_questions), body.answers)
    entry = OpenEntry(competition_id=competition_id, user_id=uid, categoria=category.nombre,
                      status="preregistered", paid_at=None, open_price=cfg["price"],
                      final_amount=category_final_price(cfg, category),
                      terms_snapshot=json.dumps({**cfg, "accepted_at": datetime.now(timezone.utc).isoformat(), "competition_terms": comp.enrollment_terms_text}),
                      enrollment_answers=answers)
    session.add(entry)
    session.commit()
    return serialize_entry(entry, cfg)


@router.post("/competitions/{competition_id}/open/checkout")
def checkout(competition_id: int, body: Checkout, session: Session = Depends(get_session), user=Depends(require_auth)):
    from routers.enrollments import (_ensure_stage_test_payments_enabled, _ensure_bold_payments_enabled,
                                    _price_breakdown, _bold_integrity_signature, _is_payment_intent_blocking,
                                    _serialize_enrollment_answers, _parse_enrollment_questions)
    from routers.config import get_pricing_config
    if not is_end_user(user):
        raise HTTPException(403, "Solo atletas")
    if body.stage_test:
        _ensure_stage_test_payments_enabled()
    else:
        _ensure_bold_payments_enabled()
    uid = get_current_user_id(user)
    comp = locked_comp(session, competition_id)
    cfg = enabled_config(comp)
    if not body.terms_accepted:
        raise HTTPException(400, "Debes aceptar las condiciones del Open y de la competencia")
    entry = session.get(OpenEntry, (competition_id, uid))
    purpose = "open_final" if body.final else "open"
    if body.final:
        if not entry or entry.status != "qualified":
            raise HTTPException(409, "No tienes un pago de clasificacion pendiente")
        if entry.final_amount is None:
            raise HTTPException(409, "El precio del Qualifier aun no ha sido publicado")
        base, category_name, snapshot = entry.final_amount, entry.categoria, None
    else:
        if entry and entry.status != "preregistered":
            raise HTTPException(409, "Ya tienes una inscripcion al Open")
        category = registration_category(session, comp, cfg, entry.categoria if entry else body.categoria, already_registered=bool(entry))
        base, category_name = cfg["price"], category.nombre
        snapshot = json.dumps({"config": cfg, "final_amount": entry.final_amount if entry else category_final_price(cfg, category),
                               "accepted_at": datetime.now(timezone.utc).isoformat(), "competition_terms": comp.enrollment_terms_text, "answers": entry.enrollment_answers if entry else _serialize_enrollment_answers(_parse_enrollment_questions(comp.enrollment_questions), body.answers)})
    latest = session.exec(select(CompetitionPaymentIntent).where(CompetitionPaymentIntent.competition_id == competition_id, CompetitionPaymentIntent.user_id == uid, CompetitionPaymentIntent.purpose == purpose).order_by(CompetitionPaymentIntent.id.desc())).first()
    if _is_payment_intent_blocking(latest):
        raise HTTPException(409, "Ya tienes un pago en proceso. Consulta su estado antes de intentar otra vez")
    if base <= 0:
        raise HTTPException(409, "No hay un pago adicional pendiente")
    pricing = get_pricing_config(session)
    breakdown = _price_breakdown(base, pricing["default_platform_fee_rate"], pricing["bold_processor_rate"], pricing["bold_processor_fixed_fee"], pricing["min_platform_fee"])
    reference = f"FR-OPEN-{uuid.uuid4().hex}"
    identity, secret = os.getenv("BOLD_IDENTITY_KEY", ""), os.getenv("BOLD_SECRET_KEY", "")
    if not body.stage_test and (not identity or not secret):
        raise HTTPException(503, "El medio de pago no esta disponible")
    intent = CompetitionPaymentIntent(competition_id=competition_id, user_id=uid, categoria=category_name,
        purpose=purpose, enrollment_answers=snapshot, payment_provider="stage_test" if body.stage_test else "bold",
        payment_reference=reference, payment_order_id=reference, payment_status="prepared",
        payment_base_amount=base, payment_platform_fee=breakdown["platform_fee"], payment_platform_fee_rate=breakdown["fee_rate"],
        payment_processor_fee=0 if body.stage_test else breakdown["processor_fee"],
        payment_platform_net=breakdown["platform_fee"] if body.stage_test else breakdown["platform_net"],
        payment_amount_total=breakdown["total_price"], payment_updated_at=datetime.now(timezone.utc))
    session.add(intent)
    session.flush()
    if body.stage_test:
        apply_open_payment(session, intent, "approved", f"stage-{uuid.uuid4().hex}", intent.payment_amount_total)
    session.commit()
    return {"stage_test": body.stage_test, "order_id": reference, "api_key": identity if not body.stage_test else None,
            "amount": str(intent.payment_amount_total), "currency": "COP", "pricing": breakdown,
            "description": f"{'Clasificacion' if body.final else 'Open'} - {comp.nombre}",
            "redirection_url": os.getenv("LEADERBOARD_BASE_URL", "http://localhost:5173").rstrip("/") + f"/competitions/{competition_id}/open",
            "integrity_signature": _bold_integrity_signature(reference, intent.payment_amount_total, "COP", secret) if not body.stage_test else None}


def editable_entry(session, competition_id, user):
    comp = locked_comp(session, competition_id)
    cfg = enabled_config(comp)
    entry = session.get(OpenEntry, (competition_id, get_current_user_id(user)))
    if not entry or entry.status == "preregistered":
        raise HTTPException(403, "Primero debes pagar el Open")
    if cfg.get("submissions_open_at") and datetime.now(timezone.utc) < utc(cfg["submissions_open_at"]):
        raise HTTPException(409, "Las entregas del Open aun no estan abiertas")
    if entry.status not in {"paid", "submitted"} or datetime.now(timezone.utc) >= utc(cfg["deadline"]):
        raise HTTPException(409, "La entrega esta cerrada")
    return entry, cfg


@router.put("/competitions/{competition_id}/open/submission")
def submit(competition_id: int, body: Submission, session: Session = Depends(get_session), user=Depends(require_auth)):
    entry, cfg = editable_entry(session, competition_id, user)
    parsed = urlparse(body.video_url)
    prefix = f"/uploads/open_videos/{competition_id}_{entry.user_id}_"
    local = body.video_url.startswith(prefix) and "/" not in body.video_url[len(prefix):] and ".." not in body.video_url
    if not local and (parsed.scheme not in {"https", "http"} or not parsed.netloc):
        raise HTTPException(400, "Agrega un enlace http/https o sube tu video")
    if local and not (UPLOADS / Path(body.video_url).name).is_file():
        raise HTTPException(400, "El video no existe")
    answers = {}
    for field in cfg["fields"]:
        value = str(body.answers.get(field["id"], "")).strip()
        if field["required"] and not value:
            raise HTTPException(400, f"Completa: {field['label']}")
        if len(value) > 2000:
            raise HTTPException(400, "El resultado es demasiado largo")
        if value and field["field_type"] == "number":
            import math
            try:
                if not math.isfinite(float(value)):
                    raise ValueError()
            except ValueError:
                raise HTTPException(400, f"Ingresa un numero valido: {field['label']}")
        answers[field["id"]] = value
    entry.video_url, entry.answers = body.video_url, json.dumps(answers)
    entry.status, entry.submitted_at = "submitted", datetime.now(timezone.utc)
    session.add(entry)
    session.commit()
    return serialize_entry(entry, cfg)


class FinalPrices(BaseModel):
    prices: dict[str, int]


class WorkoutDetails(BaseModel):
    instructions: str = Field(min_length=1, max_length=10000)
    fields: list[OpenField] = Field(default_factory=list, max_length=30)


@router.put("/competitions/{competition_id}/open/workout")
def update_workout(competition_id: int, body: WorkoutDetails, session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    comp = locked_comp(session, competition_id)
    cfg = enabled_config(comp)
    if not cfg.get("submissions_open_at") or datetime.now(timezone.utc) >= utc(cfg["submissions_open_at"]):
        raise HTTPException(409, "Las instrucciones y campos se bloquean al abrir las entregas")
    if not body.instructions.strip() or len({field.id for field in body.fields}) != len(body.fields):
        raise HTTPException(400, "Completa las instrucciones y usa identificadores unicos")
    cfg.update(body.model_dump())
    comp.open_config = json.dumps(cfg)
    session.add(comp)
    session.commit()
    return cfg


@router.post("/competitions/{competition_id}/open/final-prices")
def publish_final_prices(competition_id: int, body: FinalPrices, session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    comp = locked_comp(session, competition_id)
    cfg = enabled_config(comp)
    if cfg["final_payment"] != "pending" or cfg.get("final_prices"):
        raise HTTPException(409, "Los precios finales ya estan definidos")
    categories = session.exec(select(CompetitionCategory).where(CompetitionCategory.competition_id == competition_id, CompetitionCategory.modality == "individual")).all()
    if not categories or set(body.prices) != {c.nombre for c in categories}:
        raise HTTPException(400, "Define el precio de todas las categorias individuales")
    if any(price < 0 or price > 100000000 for price in body.prices.values()):
        raise HTTPException(400, "Los precios deben estar entre 0 y 100000000 COP")
    cfg["final_prices"] = body.prices
    cfg["final_prices_published_at"] = datetime.now(timezone.utc).isoformat()
    cfg["final_prices_published_by"] = get_current_user_id(user)
    comp.open_config = json.dumps(cfg)
    session.add(comp)
    for entry in session.exec(select(OpenEntry).where(OpenEntry.competition_id == competition_id)).all():
        if entry.final_amount is None:
            if entry.categoria not in body.prices:
                raise HTTPException(409, "Una inscripcion tiene una categoria que ya no existe")
            entry.final_amount = body.prices[entry.categoria]
            if entry.status == "qualified" and entry.final_amount == 0:
                confirm_final(session, entry)
            session.add(entry)
    session.commit()
    return cfg


@router.post("/competitions/{competition_id}/open/video")
def upload_video(competition_id: int, file: UploadFile = File(...), session: Session = Depends(get_session), user=Depends(require_auth)):
    entry, cfg = editable_entry(session, competition_id, user)
    extension = Path(file.filename or "").suffix.lower()
    if extension not in {".mp4", ".mov", ".webm"}:
        raise HTTPException(400, "Usa MP4, MOV o WebM (maximo 100 MB)")
    UPLOADS.mkdir(parents=True, exist_ok=True)
    path = UPLOADS / f"{competition_id}_{entry.user_id}_{uuid.uuid4().hex}{extension}"
    try:
        total = 0
        with path.open("wb") as out:
            while chunk := file.file.read(1024 * 1024):
                if total == 0 and not (chunk[4:8] == b"ftyp" or chunk[:4] == b"\x1aE\xdf\xa3"):
                    raise HTTPException(400, "El archivo no es un video compatible")
                total += len(chunk)
                if total > 100 * 1024 * 1024:
                    raise HTTPException(413, "Maximo 100 MB; puedes enviar un enlace para videos mas grandes")
                out.write(chunk)
        if total == 0:
            raise HTTPException(400, "El archivo esta vacio")
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return {"url": f"/uploads/open_videos/{path.name}"}


@router.post("/competitions/{competition_id}/open/entries/{user_id}/decision")
def decide(competition_id: int, user_id: int, body: Decision, session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, competition_id, user)
    comp = locked_comp(session, competition_id)
    cfg = enabled_config(comp)
    entry = session.get(OpenEntry, (competition_id, user_id))
    if not entry or entry.status != "submitted":
        raise HTTPException(409, "Solo puedes revisar entregas pendientes")
    if body.qualify:
        category = session.exec(select(CompetitionCategory).where(CompetitionCategory.competition_id == competition_id, CompetitionCategory.nombre == entry.categoria)).first()
        if not category:
            raise HTTPException(409, "La categoria ya no existe")
        if category.max_capacity:
            reserved = session.exec(select(OpenEntry).where(OpenEntry.competition_id == competition_id, OpenEntry.categoria == entry.categoria, OpenEntry.status.in_(["qualified", "confirmed"]))).all()
            if len(reserved) >= category.max_capacity:
                raise HTTPException(409, "La categoria ya tiene todos sus cupos asignados")
    entry.status = "qualified" if body.qualify else "rejected"
    entry.reviewed_at, entry.reviewed_by = datetime.now(timezone.utc), get_current_user_id(user)
    if body.qualify and entry.final_amount == 0:
        confirm_final(session, entry)
    session.add(entry)
    session.commit()
    return serialize_entry(entry, cfg)
