import json
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from auth import get_current_user_id, invalidate_user, require_admin, require_auth
from constants import Role
from database import get_session
from models import (
    OrganizerApplication,
    OrganizerApplicationCreate,
    OrganizerApplicationReview,
    Participant,
)
from services.emailer import send_email
from services.email_templates import (
    render_organizer_application_received,
    render_organizer_application_admin_notice,
    render_organizer_application_approved,
    render_organizer_application_rejected,
)

logger = logging.getLogger(__name__)

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
        "user_id": participant.id,
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


def _can_request_organizer_access(user: Participant | None) -> bool:
    if not user:
        return False
    if user.role != Role.USER:
        return False
    if int(user.organizer_enabled or 0):
        return False
    if int(user.admin_enabled or 0):
        return False
    return True


def _serialize_application(item: OrganizerApplication, *, user: Participant | None = None, participant: Participant | None = None) -> dict:
    payload = item.model_dump()
    try:
        payload["profile_snapshot"] = json.loads(item.profile_snapshot_json or "{}")
    except Exception:
        payload["profile_snapshot"] = {}
    payload.pop("profile_snapshot_json", None)
    if user:
        payload["user"] = {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
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
    user_id = get_current_user_id(user)
    if user_id is None:
        raise HTTPException(403, "Solo usuarios finales")

    current_user = session.get(Participant, int(user_id))
    if not _can_request_organizer_access(current_user):
        raise HTTPException(403, "La cuenta no puede solicitar este acceso")

    missing = _profile_missing_fields(current_user)
    item = session.exec(
        select(OrganizerApplication)
        .where(OrganizerApplication.user_id == int(user_id))
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
    user_id = get_current_user_id(user)
    if user_id is None:
        raise HTTPException(403, "Solo usuarios finales")

    current_user = session.get(Participant, int(user_id))
    if not _can_request_organizer_access(current_user):
        raise HTTPException(403, "La cuenta no puede enviar esta solicitud")

    missing = _profile_missing_fields(current_user)
    if missing:
        raise HTTPException(400, f"Completa tu perfil antes de solicitar este acceso. Faltan: {', '.join(missing)}")

    existing_pending = session.exec(
        select(OrganizerApplication)
        .where(OrganizerApplication.user_id == int(user_id))
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
        user_id=int(user_id),
        status="pending",
        requested_event_name=requested_event_name,
        requested_event_location=str(payload.get("requested_event_location") or "").strip() or None,
        requested_event_date=payload.get("requested_event_date"),
        requested_event_description=str(payload.get("requested_event_description") or "").strip() or None,
        why_organizer=why_organizer,
        prior_events_summary=str(payload.get("prior_events_summary") or "").strip() or None,
        why_finalrep=why_finalrep,
        profile_snapshot_json=json.dumps(_profile_snapshot(current_user), ensure_ascii=False),
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    participant_email = str(getattr(current_user, "email", "") or "").strip()
    participant_name = f"{str(getattr(current_user, 'nombre', '') or '').strip()} {str(getattr(current_user, 'apellido', '') or '').strip()}".strip()
    if participant_email:
        try:
            subject, body, html = render_organizer_application_received(nombre=participant_name)
            send_email(to_email=participant_email, subject=subject, body=body, html_body=html)
        except Exception:
            logger.exception("Failed to send organizer application received email")

    admin_email = os.getenv("ADMIN_NOTIFICATION_EMAIL", "").strip()
    if admin_email:
        try:
            subject, body, html = render_organizer_application_admin_notice(
                nombre=participant_name,
                email=participant_email,
                requested_event_name=requested_event_name,
            )
            send_email(to_email=admin_email, subject=subject, body=body, html_body=html)
        except Exception:
            logger.exception("Failed to send organizer application admin notice email")

    return {"ok": True, "application": _serialize_application(item, user=current_user, participant=current_user)}


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
    user_ids = {int(item.user_id) for item in items}
    users = {
        item.id: item
        for item in session.exec(select(Participant).where(Participant.id.in_(user_ids))).all()
    } if user_ids else {}

    return [
        _serialize_application(
            item,
            user=users.get(int(item.user_id)),
            participant=users.get(int(item.user_id)),
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

    requested_user = session.get(Participant, int(item.user_id))
    if not requested_user:
        raise HTTPException(404, "Usuario de la solicitud no encontrado")

    item.status = next_status
    item.review_note = str(body.review_note or "").strip() or None
    item.reviewed_by_user_id = get_current_user_id(user)
    item.reviewed_at = datetime.now(timezone.utc)
    session.add(item)

    if next_status == "approved":
        requested_user.organizer_enabled = 1
        session.add(requested_user)

    session.commit()
    session.refresh(item)
    session.refresh(requested_user)
    if next_status == "approved":
        invalidate_user(requested_user.id)
    participant = session.get(Participant, int(item.user_id))

    if participant:
        participant_email = str(getattr(participant, "email", "") or "").strip()
        participant_name = f"{str(getattr(participant, 'nombre', '') or '').strip()} {str(getattr(participant, 'apellido', '') or '').strip()}".strip()
        if participant_email:
            try:
                if next_status == "approved":
                    subject, body, html = render_organizer_application_approved(nombre=participant_name)
                else:
                    subject, body, html = render_organizer_application_rejected(
                        nombre=participant_name,
                        review_note=str(item.review_note or "").strip() or None,
                    )
                send_email(to_email=participant_email, subject=subject, body=body, html_body=html)
            except Exception:
                logger.exception("Failed to send organizer application review email")

    return {
        "ok": True,
        "application": _serialize_application(item, user=requested_user, participant=participant),
    }
