import base64
import hashlib
import hmac
import io
import json
import os
import re
import uuid
from datetime import datetime, timezone

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, SQLModel, select

from access import require_competition_access, require_competition_operator_access
from auth import get_current_user_id, is_end_user, require_auth, require_staff
from database import get_session
from models import (
    CompetitionCheckinAudit,
    CompetitionCheckinPhase,
    CompetitionCheckinUsage,
    CompetitionParticipant,
    CompetitionQrIdentity,
    Participant,
)
from routers.judges import append_judge_action_audit

router = APIRouter(tags=["checkin_qr"])

SYSTEM_PHASE_CODE = "check_in"
PHASE_CODE_RE = re.compile(r"^[a-z0-9_]{2,32}$")
QR_STATUS_ACTIVE = "active"


class CheckinPhaseCreate(SQLModel):
    code: str
    label: str
    description: str | None = None
    order_index: int = 10
    enabled: int = 1
    max_uses: int = 1


class CheckinPhaseUpdate(SQLModel):
    label: str | None = None
    description: str | None = None
    order_index: int | None = None
    enabled: int | None = None
    max_uses: int | None = None


class CheckinScanBody(SQLModel):
    token: str
    phase_code: str = SYSTEM_PHASE_CODE
    station: str | None = None
    device_id: str | None = None
    idempotency_key: str | None = None


class ReissueQrBody(SQLModel):
    reason: str | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _get_qr_secret() -> str:
    value = (os.getenv("CHECKIN_QR_SECRET") or os.getenv("SECRET_KEY") or "").strip()
    if not value:
        raise HTTPException(500, "Falta CHECKIN_QR_SECRET en el servidor")
    return value


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(raw: str) -> bytes:
    padded = raw + "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _token_fingerprint(token: str | None) -> str | None:
    value = str(token or "").strip()
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _make_qr_token(identity: CompetitionQrIdentity) -> str:
    payload = {
        "q": identity.qr_uid,
        "c": int(identity.competition_id),
        "v": int(identity.version or 1),
        "iat": int(_utcnow().timestamp()),
    }
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(_get_qr_secret().encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64url_encode(signature)}"


def _parse_qr_token(token: str) -> dict | None:
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
    if not payload.get("q") or not payload.get("c") or not payload.get("v"):
        return None
    return payload


def _qr_data_url(token: str) -> str:
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=9, border=2)
    qr.add_data(token)
    qr.make(fit=True)
    image = qr.make_image(fill_color="#0D0F12", back_color="#F5F7FA")
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _sanitize_phase_code(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if not PHASE_CODE_RE.fullmatch(normalized):
        raise HTTPException(400, "code invalido. Usa minusculas, numeros y guion bajo (2-32)")
    return normalized


def _sanitize_enabled(value: int | None, fallback: int = 1) -> int:
    if value is None:
        return fallback
    return 1 if int(value) else 0


def _sanitize_max_uses(value: int | None, fallback: int = 1) -> int:
    if value is None:
        return fallback
    normalized = int(value)
    if normalized < 1 or normalized > 20:
        raise HTTPException(400, "max_uses invalido. Usa un valor entre 1 y 20")
    return normalized


def _ensure_system_phase(session: Session, competition_id: int) -> CompetitionCheckinPhase:
    phase = session.exec(
        select(CompetitionCheckinPhase)
        .where(CompetitionCheckinPhase.competition_id == competition_id)
        .where(CompetitionCheckinPhase.code == SYSTEM_PHASE_CODE)
    ).first()
    if phase:
        return phase
    phase = CompetitionCheckinPhase(
        competition_id=competition_id,
        code=SYSTEM_PHASE_CODE,
        label="Check-in",
        description="Ingreso oficial al evento",
        order_index=0,
        enabled=1,
        max_uses=1,
        is_system=1,
    )
    session.add(phase)
    session.commit()
    session.refresh(phase)
    return phase


def _get_confirmed_enrollment(session: Session, competition_id: int, user_id: int) -> CompetitionParticipant:
    cp = session.get(CompetitionParticipant, (competition_id, user_id))
    if not cp:
        raise HTTPException(404, "Inscripcion no encontrada")
    if cp.estado != "confirmado":
        raise HTTPException(409, "Tu inscripcion aun no esta confirmada para usar check-in")
    return cp


def _user_payload(user_id: int, participant: Participant | None, categoria: str | None = None) -> dict:
    return {
        "id": user_id,
        "user_id": user_id,
        "nombre": str(getattr(participant, "nombre", "") or "").strip(),
        "apellido": str(getattr(participant, "apellido", "") or "").strip(),
        "categoria": categoria,
    }


def _get_or_create_identity(
    session: Session,
    *,
    competition_id: int,
    user_id: int,
    actor_user_id: int | None = None,
) -> CompetitionQrIdentity:
    identity = session.exec(
        select(CompetitionQrIdentity)
        .where(CompetitionQrIdentity.competition_id == competition_id)
        .where(CompetitionQrIdentity.user_id == user_id)
    ).first()
    if identity:
        return identity
    identity = CompetitionQrIdentity(
        competition_id=competition_id,
        user_id=user_id,
        qr_uid=uuid.uuid4().hex,
        version=1,
        status=QR_STATUS_ACTIVE,
        issued_at=_utcnow(),
        created_by_user_id=actor_user_id,
    )
    session.add(identity)
    session.commit()
    session.refresh(identity)
    return identity


def _append_audit(
    session: Session,
    *,
    competition_id: int,
    action: str,
    result: str,
    user_id: int | None = None,
    qr_identity_id: int | None = None,
    phase_id: int | None = None,
    reason: str | None = None,
    token: str | None = None,
    station: str | None = None,
    device_id: str | None = None,
    idempotency_key: str | None = None,
    actor_user_id: int | None = None,
    meta: dict | None = None,
) -> None:
    session.add(
        CompetitionCheckinAudit(
            competition_id=competition_id,
            user_id=user_id,
            qr_identity_id=qr_identity_id,
            phase_id=phase_id,
            action=action,
            result=result,
            reason=reason,
            token_fingerprint=_token_fingerprint(token),
            station=(station or "").strip() or None,
            device_id=(device_id or "").strip() or None,
            idempotency_key=(idempotency_key or "").strip() or None,
            actor_user_id=actor_user_id,
            meta_json=json.dumps(meta or {}, ensure_ascii=False) if meta else None,
        )
    )


def _phase_usage_count(session: Session, identity_id: int, phase_id: int) -> int:
    value = session.exec(
        select(func.count(CompetitionCheckinUsage.id))
        .where(CompetitionCheckinUsage.qr_identity_id == identity_id)
        .where(CompetitionCheckinUsage.phase_id == phase_id)
    ).one()
    return int(value or 0)


@router.get("/api/competitions/{competition_id}/my-checkin-qr")
def my_checkin_qr(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")
    _get_confirmed_enrollment(session, competition_id, user_id)
    _ensure_system_phase(session, competition_id)
    identity = _get_or_create_identity(session, competition_id=competition_id, user_id=user_id)
    token = _make_qr_token(identity)

    checkin_usage = session.exec(
        select(CompetitionCheckinUsage)
        .join(CompetitionCheckinPhase, CompetitionCheckinPhase.id == CompetitionCheckinUsage.phase_id)
        .where(CompetitionCheckinUsage.qr_identity_id == identity.id)
        .where(CompetitionCheckinPhase.code == SYSTEM_PHASE_CODE)
        .order_by(CompetitionCheckinUsage.used_at.asc())
    ).first()
    return {
        "competition_id": competition_id,
        "user_id": user_id,
        "status": identity.status,
        "version": identity.version,
        "short_code": f"{identity.qr_uid[:8].upper()}-{identity.version}",
        "token": token,
        "qr_image_data_url": _qr_data_url(token),
        "check_in_used": bool(checkin_usage),
        "check_in_used_at": checkin_usage.used_at if checkin_usage else None,
    }


@router.get("/api/competitions/{competition_id}/checkin/phases")
def list_checkin_phases(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    require_competition_operator_access(session, competition_id, user)
    _ensure_system_phase(session, competition_id)
    rows = session.exec(
        select(CompetitionCheckinPhase)
        .where(CompetitionCheckinPhase.competition_id == competition_id)
        .order_by(CompetitionCheckinPhase.order_index.asc(), CompetitionCheckinPhase.id.asc())
    ).all()
    return [item.model_dump() for item in rows]


@router.post("/api/competitions/{competition_id}/checkin/phases", status_code=201)
def create_checkin_phase(
    competition_id: int,
    body: CheckinPhaseCreate,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    _ensure_system_phase(session, competition_id)
    code = _sanitize_phase_code(body.code)
    if code == SYSTEM_PHASE_CODE:
        raise HTTPException(400, "El code check_in ya existe como fase del sistema")
    phase = CompetitionCheckinPhase(
        competition_id=competition_id,
        code=code,
        label=str(body.label or "").strip() or "Fase",
        description=str(body.description or "").strip() or None,
        order_index=int(body.order_index or 10),
        enabled=_sanitize_enabled(body.enabled),
        max_uses=_sanitize_max_uses(body.max_uses),
        is_system=0,
    )
    session.add(phase)
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise HTTPException(409, "Ya existe una fase con ese code")
    session.refresh(phase)
    _append_audit(
        session,
        competition_id=competition_id,
        action="phase_create",
        result="accepted",
        phase_id=phase.id,
        actor_user_id=get_current_user_id(user),
        meta={"code": phase.code, "max_uses": phase.max_uses},
    )
    session.commit()
    return phase.model_dump()


@router.put("/api/competitions/{competition_id}/checkin/phases/{phase_id}")
def update_checkin_phase(
    competition_id: int,
    phase_id: int,
    body: CheckinPhaseUpdate,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    phase = session.get(CompetitionCheckinPhase, phase_id)
    if not phase or phase.competition_id != competition_id:
        raise HTTPException(404, "Fase no encontrada")
    if body.label is not None:
        phase.label = str(body.label).strip() or phase.label
    if body.description is not None:
        phase.description = str(body.description).strip() or None
    if body.order_index is not None:
        phase.order_index = int(body.order_index)
    if body.enabled is not None:
        phase.enabled = _sanitize_enabled(body.enabled, fallback=phase.enabled)
    if body.max_uses is not None:
        if phase.is_system and phase.code == SYSTEM_PHASE_CODE and int(body.max_uses) != 1:
            raise HTTPException(400, "La fase check_in siempre usa max_uses=1")
        phase.max_uses = _sanitize_max_uses(body.max_uses, fallback=phase.max_uses)
    session.add(phase)
    _append_audit(
        session,
        competition_id=competition_id,
        action="phase_update",
        result="accepted",
        phase_id=phase.id,
        actor_user_id=get_current_user_id(user),
    )
    session.commit()
    session.refresh(phase)
    return phase.model_dump()


@router.delete("/api/competitions/{competition_id}/checkin/phases/{phase_id}")
def delete_checkin_phase(
    competition_id: int,
    phase_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    phase = session.get(CompetitionCheckinPhase, phase_id)
    if not phase or phase.competition_id != competition_id:
        raise HTTPException(404, "Fase no encontrada")
    if phase.is_system:
        raise HTTPException(400, "No puedes eliminar una fase del sistema")
    usage_count = int(session.exec(
        select(func.count(CompetitionCheckinUsage.id)).where(CompetitionCheckinUsage.phase_id == phase.id)
    ).one() or 0)
    if usage_count > 0:
        raise HTTPException(409, "No puedes eliminar esta fase porque ya tiene usos registrados")
    session.delete(phase)
    _append_audit(
        session,
        competition_id=competition_id,
        action="phase_delete",
        result="accepted",
        phase_id=phase_id,
        actor_user_id=get_current_user_id(user),
    )
    session.commit()
    return {"ok": True}


@router.get("/api/competitions/{competition_id}/users/{user_id}/checkin-qr")
def participant_checkin_qr(
    competition_id: int,
    user_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    _get_confirmed_enrollment(session, competition_id, user_id)
    _ensure_system_phase(session, competition_id)
    identity = _get_or_create_identity(
        session,
        competition_id=competition_id,
        user_id=user_id,
        actor_user_id=get_current_user_id(user),
    )
    token = _make_qr_token(identity)
    return {
        "competition_id": competition_id,
        "user_id": user_id,
        "status": identity.status,
        "version": identity.version,
        "short_code": f"{identity.qr_uid[:8].upper()}-{identity.version}",
        "token": token,
        "qr_image_data_url": _qr_data_url(token),
    }


@router.post("/api/competitions/{competition_id}/users/{user_id}/checkin-qr/reissue")
def reissue_checkin_qr(
    competition_id: int,
    user_id: int,
    body: ReissueQrBody,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    _get_confirmed_enrollment(session, competition_id, user_id)
    identity = _get_or_create_identity(
        session,
        competition_id=competition_id,
        user_id=user_id,
        actor_user_id=get_current_user_id(user),
    )
    identity.version = int(identity.version or 1) + 1
    identity.status = QR_STATUS_ACTIVE
    identity.last_reissued_at = _utcnow()
    identity.revoked_at = None
    identity.revoked_reason = None
    identity.revoked_by_user_id = None
    session.add(identity)
    _append_audit(
        session,
        competition_id=competition_id,
        action="qr_reissue",
        result="accepted",
        user_id=user_id,
        qr_identity_id=identity.id,
        actor_user_id=get_current_user_id(user),
        reason=str(body.reason or "").strip() or None,
    )
    session.commit()
    session.refresh(identity)
    token = _make_qr_token(identity)
    return {
        "ok": True,
        "competition_id": competition_id,
        "user_id": user_id,
        "version": identity.version,
        "short_code": f"{identity.qr_uid[:8].upper()}-{identity.version}",
        "token": token,
        "qr_image_data_url": _qr_data_url(token),
    }


@router.post("/api/competitions/{competition_id}/checkin/scan")
def scan_checkin_qr(
    competition_id: int,
    body: CheckinScanBody,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    require_competition_operator_access(session, competition_id, user)
    phase_code = _sanitize_phase_code(body.phase_code or SYSTEM_PHASE_CODE)
    _ensure_system_phase(session, competition_id)
    phase = session.exec(
        select(CompetitionCheckinPhase)
        .where(CompetitionCheckinPhase.competition_id == competition_id)
        .where(CompetitionCheckinPhase.code == phase_code)
    ).first()
    if not phase:
        raise HTTPException(404, "Fase de check-in no encontrada")
    if not int(phase.enabled or 0):
        append_judge_action_audit(
            session,
            competition_id=competition_id,
            user=user,
            action="qr_scan",
            result="phase_disabled",
            target_type="checkin_phase",
            target_id=str(phase.id),
            meta={"phase_code": phase_code},
        )
        _append_audit(
            session,
            competition_id=competition_id,
            action="scan",
            result="phase_disabled",
            phase_id=phase.id,
            token=body.token,
            station=body.station,
            device_id=body.device_id,
            idempotency_key=body.idempotency_key,
            actor_user_id=get_current_user_id(user),
        )
        session.commit()
        return {"ok": False, "status": "phase_disabled", "phase_code": phase_code}

    payload = _parse_qr_token(body.token)
    if not payload:
        append_judge_action_audit(
            session,
            competition_id=competition_id,
            user=user,
            action="qr_scan",
            result="invalid_token",
            target_type="checkin_phase",
            target_id=str(phase.id),
            meta={"phase_code": phase_code},
        )
        _append_audit(
            session,
            competition_id=competition_id,
            action="scan",
            result="invalid_token",
            phase_id=phase.id,
            token=body.token,
            station=body.station,
            device_id=body.device_id,
            idempotency_key=body.idempotency_key,
            actor_user_id=get_current_user_id(user),
        )
        session.commit()
        return {"ok": False, "status": "invalid_token", "phase_code": phase_code}
    if int(payload.get("c")) != competition_id:
        append_judge_action_audit(
            session,
            competition_id=competition_id,
            user=user,
            action="qr_scan",
            result="competition_mismatch",
            target_type="checkin_phase",
            target_id=str(phase.id),
            meta={"phase_code": phase_code},
        )
        return {"ok": False, "status": "competition_mismatch", "phase_code": phase_code}

    identity = session.exec(
        select(CompetitionQrIdentity)
        .where(CompetitionQrIdentity.competition_id == competition_id)
        .where(CompetitionQrIdentity.qr_uid == str(payload.get("q")))
        .with_for_update()
    ).first()
    if not identity:
        append_judge_action_audit(
            session,
            competition_id=competition_id,
            user=user,
            action="qr_scan",
            result="identity_not_found",
            target_type="checkin_phase",
            target_id=str(phase.id),
            meta={"phase_code": phase_code},
        )
        _append_audit(
            session,
            competition_id=competition_id,
            action="scan",
            result="identity_not_found",
            phase_id=phase.id,
            token=body.token,
            station=body.station,
            device_id=body.device_id,
            idempotency_key=body.idempotency_key,
            actor_user_id=get_current_user_id(user),
        )
        session.commit()
        return {"ok": False, "status": "invalid_qr", "phase_code": phase_code}

    if int(identity.version or 1) != int(payload.get("v")):
        append_judge_action_audit(
            session,
            competition_id=competition_id,
            user=user,
            action="qr_scan",
            result="stale_token",
            target_type="user",
            target_id=str(identity.user_id),
            meta={"phase_code": phase.code},
        )
        _append_audit(
            session,
            competition_id=competition_id,
            action="scan",
            result="stale_token",
            user_id=identity.user_id,
            qr_identity_id=identity.id,
            phase_id=phase.id,
            token=body.token,
            station=body.station,
            device_id=body.device_id,
            idempotency_key=body.idempotency_key,
            actor_user_id=get_current_user_id(user),
        )
        session.commit()
        return {"ok": False, "status": "stale_token", "phase_code": phase_code}
    if identity.status != QR_STATUS_ACTIVE:
        append_judge_action_audit(
            session,
            competition_id=competition_id,
            user=user,
            action="qr_scan",
            result="revoked",
            target_type="user",
            target_id=str(identity.user_id),
            meta={"phase_code": phase.code},
        )
        _append_audit(
            session,
            competition_id=competition_id,
            action="scan",
            result="revoked",
            user_id=identity.user_id,
            qr_identity_id=identity.id,
            phase_id=phase.id,
            token=body.token,
            station=body.station,
            device_id=body.device_id,
            idempotency_key=body.idempotency_key,
            actor_user_id=get_current_user_id(user),
        )
        session.commit()
        return {"ok": False, "status": "revoked", "phase_code": phase_code}

    cp = session.get(CompetitionParticipant, (competition_id, identity.user_id))
    if not cp or cp.estado != "confirmado":
        append_judge_action_audit(
            session,
            competition_id=competition_id,
            user=user,
            action="qr_scan",
            result="not_confirmed",
            target_type="user",
            target_id=str(identity.user_id),
            meta={"phase_code": phase.code},
        )
        _append_audit(
            session,
            competition_id=competition_id,
            action="scan",
            result="not_confirmed",
            user_id=identity.user_id,
            qr_identity_id=identity.id,
            phase_id=phase.id,
            token=body.token,
            station=body.station,
            device_id=body.device_id,
            idempotency_key=body.idempotency_key,
            actor_user_id=get_current_user_id(user),
        )
        session.commit()
        return {"ok": False, "status": "not_confirmed", "phase_code": phase_code}

    idempotency_key = str(body.idempotency_key or "").strip() or None
    if idempotency_key:
        existing_by_idempotency = session.exec(
            select(CompetitionCheckinUsage)
            .where(CompetitionCheckinUsage.qr_identity_id == identity.id)
            .where(CompetitionCheckinUsage.phase_id == phase.id)
            .where(CompetitionCheckinUsage.idempotency_key == idempotency_key)
        ).first()
        if existing_by_idempotency:
            participant = session.get(Participant, identity.user_id)
            user_payload = _user_payload(identity.user_id, participant, cp.categoria)
            return {
                "ok": True,
                "status": "accepted",
                "idempotent": True,
                "phase_code": phase.code,
                "used_at": existing_by_idempotency.used_at,
                "user_id": identity.user_id,
                "user": user_payload,
                "participant": user_payload,
            }

    usage_count = _phase_usage_count(session, identity.id, phase.id)
    if usage_count >= int(phase.max_uses or 1):
        first_usage = session.exec(
            select(CompetitionCheckinUsage)
            .where(CompetitionCheckinUsage.qr_identity_id == identity.id)
            .where(CompetitionCheckinUsage.phase_id == phase.id)
            .order_by(CompetitionCheckinUsage.used_at.asc())
        ).first()
        append_judge_action_audit(
            session,
            competition_id=competition_id,
            user=user,
            action="qr_scan",
            result="already_used",
            target_type="user",
            target_id=str(identity.user_id),
            meta={"phase_code": phase.code},
        )
        _append_audit(
            session,
            competition_id=competition_id,
            action="scan",
            result="already_used",
            user_id=identity.user_id,
            qr_identity_id=identity.id,
            phase_id=phase.id,
            reason=f"max_uses={phase.max_uses}",
            token=body.token,
            station=body.station,
            device_id=body.device_id,
            idempotency_key=idempotency_key,
            actor_user_id=get_current_user_id(user),
        )
        session.commit()
        participant = session.get(Participant, identity.user_id)
        user_payload = _user_payload(identity.user_id, participant, cp.categoria)
        return {
            "ok": False,
            "status": "already_used",
            "phase_code": phase.code,
            "used_at": first_usage.used_at if first_usage else None,
            "user_id": identity.user_id,
            "user": user_payload,
            "participant": user_payload,
        }

    usage = CompetitionCheckinUsage(
        competition_id=competition_id,
        user_id=identity.user_id,
        qr_identity_id=identity.id,
        phase_id=phase.id,
        use_number=usage_count + 1,
        idempotency_key=idempotency_key,
        station=str(body.station or "").strip() or None,
        device_id=str(body.device_id or "").strip() or None,
        used_by_user_id=get_current_user_id(user),
    )
    session.add(usage)
    append_judge_action_audit(
        session,
        competition_id=competition_id,
        user=user,
        action="qr_scan",
        result="accepted",
        target_type="user",
        target_id=str(identity.user_id),
        meta={"phase_code": phase.code},
    )
    _append_audit(
        session,
        competition_id=competition_id,
        action="scan",
        result="accepted",
        user_id=identity.user_id,
        qr_identity_id=identity.id,
        phase_id=phase.id,
        token=body.token,
        station=body.station,
        device_id=body.device_id,
        idempotency_key=idempotency_key,
        actor_user_id=get_current_user_id(user),
    )
    session.commit()
    session.refresh(usage)
    participant = session.get(Participant, identity.user_id)
    user_payload = _user_payload(identity.user_id, participant, cp.categoria)
    return {
        "ok": True,
        "status": "accepted",
        "phase_code": phase.code,
        "used_at": usage.used_at,
        "user_id": identity.user_id,
        "user": user_payload,
        "participant": user_payload,
    }
