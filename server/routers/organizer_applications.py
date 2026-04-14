import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from auth import get_effective_participant_id, require_admin, require_auth
from constants import Role
from database import get_session
from models import (
    AppUser,
    OrganizerApplication,
    OrganizerApplicationCreate,
    OrganizerApplicationReview,
    Participant,
)

router = APIRouter(prefix="/api/organizer-applications", tags=["organizer-applications"])

APPLICATION_STATUS = {"pending", "approved", "rejected"}
PENDING_CEDULA_PREFIX = "pending:"


def _profile_missing_fields(participant: Participant | None) -> list[str]:
    if not participant:
        return ["perfil"]
    checks = {
        "cedula": str(getattr(participant, "cedula", "") or "").strip() and not str(getattr(participant, "cedula", "") or "").startswith(PENDING_CEDULA_PREFIX),
        "nombre": str(getattr(participant, "nombre", "") or "").strip(),
        "apellido": str(getattr(participant, "apellido", "") or "").strip(),
        "email": str(getattr(participant, "email", "") or "").strip(),
        "celular": str(getattr(participant, "celular", "") or "").strip(),
        "genero": str((getattr(participant, "genero", None) or getattr(participant, "sexo", None) or "")).strip(),
        "fecha_nacimiento": getattr(participant, "fecha_nacimiento", None),
        "ciudad_pais": str(getattr(participant, "ciudad_pais", "") or "").strip(),
    }
    return [field for field, ok in checks.items() if not ok]


def _profile_snapshot(participant: Participant) -> dict:
    return {
        "participant_id": participant.id,
        "cedula": participant.cedula,
        "nombre": participant.nombre,
        "apellido": participant.apellido,
        "email": participant.email,
        "celular": participant.celular,
        "genero": participant.genero or participant.sexo,
        "categoria": participant.categoria,
        "box": participant.box,
        "fecha_nacimiento": participant.fecha_nacimiento.isoformat() if participant.fecha_nacimiento else None,
        "ciudad_pais": participant.ciudad_pais,
        "profile_photo_url": participant.profile_photo_url,
    }


def _serialize_application(item: OrganizerApplication, *, app_user: AppUser | None = None, participant: Participant | None = None) -> dict:
    payload = item.model_dump()
    try:
        payload["profile_snapshot"] = json.loads(item.profile_snapshot_json or "{}")
    except Exception:
        payload["profile_snapshot"] = {}
    payload.pop("profile_snapshot_json", None)
    if app_user:
        payload["app_user"] = {
            "id": app_user.id,
            "username": app_user.username,
            "display_name": app_user.display_name,
            "role": app_user.role,
        }
    if participant:
        payload["participant"] = {
            "id": participant.id,
            "nombre": participant.nombre,
            "apellido": participant.apellido,
            "email": participant.email,
            "celular": participant.celular,
        }
    return payload


@router.get("/me")
def get_my_organizer_application(
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    app_user_id = user.get("app_user_id")
    participant_id = get_effective_participant_id(user)
    if user.get("role") != Role.USER or app_user_id is None or participant_id is None:
        raise HTTPException(403, "Solo usuarios finales")

    participant = session.get(Participant, participant_id)
    missing = _profile_missing_fields(participant)
    item = session.exec(
        select(OrganizerApplication)
        .where(OrganizerApplication.app_user_id == int(app_user_id))
        .order_by(OrganizerApplication.created_at.desc(), OrganizerApplication.id.desc())
    ).first()
    return {
        "application": _serialize_application(item) if item else None,
        "missing_profile_fields": missing,
        "profile_complete": not missing,
    }


@router.post("", status_code=201)
def create_organizer_application(
    body: OrganizerApplicationCreate,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    app_user_id = user.get("app_user_id")
    participant_id = get_effective_participant_id(user)
    if user.get("role") != Role.USER or app_user_id is None or participant_id is None:
        raise HTTPException(403, "Solo usuarios finales")

    app_user = session.get(AppUser, int(app_user_id))
    if not app_user or app_user.role != Role.USER:
        raise HTTPException(403, "La cuenta no puede enviar esta solicitud")
    if int(app_user.organizer_enabled or 0):
        raise HTTPException(409, "Tu cuenta ya tiene acceso de organizador")

    participant = session.get(Participant, participant_id)
    missing = _profile_missing_fields(participant)
    if missing:
        raise HTTPException(400, f"Completa tu perfil antes de solicitar este acceso. Faltan: {', '.join(missing)}")

    existing_pending = session.exec(
        select(OrganizerApplication)
        .where(OrganizerApplication.app_user_id == int(app_user_id))
        .where(OrganizerApplication.status == "pending")
    ).first()
    if existing_pending:
        raise HTTPException(409, "Ya tienes una solicitud pendiente por revision")

    payload = body.model_dump()
    requested_event_name = str(payload.get("requested_event_name") or "").strip()
    why_organizer = str(payload.get("why_organizer") or "").strip()
    why_finalrep = str(payload.get("why_finalrep") or "").strip()
    if not requested_event_name or not why_organizer or not why_finalrep:
        raise HTTPException(400, "Completa los campos obligatorios de la solicitud")

    item = OrganizerApplication(
        app_user_id=int(app_user_id),
        participant_id=int(participant_id),
        status="pending",
        requested_event_name=requested_event_name,
        requested_event_location=str(payload.get("requested_event_location") or "").strip() or None,
        requested_event_date=payload.get("requested_event_date"),
        requested_event_description=str(payload.get("requested_event_description") or "").strip() or None,
        why_organizer=why_organizer,
        prior_events_summary=str(payload.get("prior_events_summary") or "").strip() or None,
        why_finalrep=why_finalrep,
        profile_snapshot_json=json.dumps(_profile_snapshot(participant), ensure_ascii=False),
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return {"ok": True, "application": _serialize_application(item, app_user=app_user, participant=participant)}


@router.get("")
def list_organizer_applications(
    status: str | None = None,
    session: Session = Depends(get_session),
    _=Depends(require_admin),
):
    query = select(OrganizerApplication).order_by(
        OrganizerApplication.created_at.desc(),
        OrganizerApplication.id.desc(),
    )
    normalized_status = str(status or "").strip().lower()
    if normalized_status:
        if normalized_status not in APPLICATION_STATUS:
            raise HTTPException(400, "Estado invalido")
        query = query.where(OrganizerApplication.status == normalized_status)

    items = session.exec(query).all()
    app_user_ids = {int(item.app_user_id) for item in items}
    participant_ids = {int(item.participant_id) for item in items}
    app_users = {
        item.id: item
        for item in session.exec(select(AppUser).where(AppUser.id.in_(app_user_ids))).all()
    } if app_user_ids else {}
    participants = {
        item.id: item
        for item in session.exec(select(Participant).where(Participant.id.in_(participant_ids))).all()
    } if participant_ids else {}

    return [
        _serialize_application(
            item,
            app_user=app_users.get(int(item.app_user_id)),
            participant=participants.get(int(item.participant_id)),
        )
        for item in items
    ]


@router.put("/{application_id}/review")
def review_organizer_application(
    application_id: int,
    body: OrganizerApplicationReview,
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    item = session.get(OrganizerApplication, application_id)
    if not item:
        raise HTTPException(404, "Solicitud no encontrada")

    next_status = str(body.status or "").strip().lower()
    if next_status not in {"approved", "rejected"}:
        raise HTTPException(400, "Estado invalido")

    app_user = session.get(AppUser, int(item.app_user_id))
    if not app_user:
        raise HTTPException(404, "Usuario de la solicitud no encontrado")

    item.status = next_status
    item.review_note = str(body.review_note or "").strip() or None
    item.reviewed_by_user_id = int(user.get("app_user_id") or 0) or None
    item.reviewed_at = datetime.now(timezone.utc)
    session.add(item)

    if next_status == "approved":
        app_user.organizer_enabled = 1
        session.add(app_user)

    session.commit()
    session.refresh(item)
    session.refresh(app_user)
    participant = session.get(Participant, int(item.participant_id))
    return {
        "ok": True,
        "application": _serialize_application(item, app_user=app_user, participant=participant),
    }
