import re
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from access import require_competition_access, get_user_id
from auth import require_admin, require_auth, require_staff
from database import get_session
from models import (
    Competition,
    CompetitionCategory,
    CompetitionCompetitorInvitation,
    CompetitionParticipant,
    Participant,
    SelfEnrollRequest,
)
from services.emailer import send_email
from services.email_templates import render_competitor_invitation

router = APIRouter(tags=["competitor_invitations"])

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
FRONTEND_BASE_URL = "https://app.finalrep.com"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(value: str | None) -> str:
    email = str(value or "").strip().lower()
    if not email or not EMAIL_REGEX.fullmatch(email):
        raise HTTPException(400, "Ingresa un email valido")
    return email


def _current_user_emails(session: Session, user) -> set[str]:
    emails: set[str] = set()
    user_id = get_user_id(user)
    if user_id:
        participant = session.get(Participant, user_id)
        if participant and participant.email:
            emails.add(participant.email.strip().lower())
    raw_email = getattr(user, "email", None) or (user.get("email") if isinstance(user, dict) else None)
    if raw_email:
        emails.add(str(raw_email).strip().lower())
    return emails


def _resolve_my_invitation(session: Session, invitation_id: int, user) -> CompetitionCompetitorInvitation:
    invitation = session.get(CompetitionCompetitorInvitation, invitation_id)
    if not invitation:
        raise HTTPException(404, "Invitacion no encontrada")
    user_id = get_user_id(user)
    current_emails = _current_user_emails(session, user)
    if user_id is not None and invitation.user_id is not None and int(invitation.user_id) == int(user_id):
        return invitation
    if invitation.invited_email and invitation.invited_email.lower() in current_emails:
        return invitation
    raise HTTPException(403, "No tienes acceso a esta invitacion")


def _invitation_payload(session: Session, inv: CompetitionCompetitorInvitation) -> dict:
    comp = session.get(Competition, inv.competition_id)
    inviter = session.get(Participant, inv.invited_by_user_id) if inv.invited_by_user_id else None
    return {
        "id": inv.id,
        "competition_id": inv.competition_id,
        "competition_name": comp.nombre if comp else None,
        "competition_image_url": (comp.profile_image_url or comp.banner_image_url) if comp else None,
        "user_id": inv.user_id,
        "invited_email": inv.invited_email,
        "categoria": inv.categoria,
        "note": inv.note,
        "status": inv.status,
        "invited_by_display_name": inviter.display_name if inviter else None,
        "accepted_at": inv.accepted_at,
        "rejected_at": inv.rejected_at,
        "revoked_at": inv.revoked_at,
        "created_at": inv.created_at,
    }


# ── Admin: toggle invitations_enabled ────────────────────────────────────────

@router.post("/api/competitions/{competition_id}/invitations/enable", status_code=200)
def enable_competitor_invitations(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    comp = session.get(Competition, competition_id)
    if not comp:
        raise HTTPException(404, "Competencia no encontrada")
    comp.invitations_enabled = 1
    session.add(comp)
    session.commit()
    return {"ok": True, "invitations_enabled": 1}


@router.delete("/api/competitions/{competition_id}/invitations/enable", status_code=200)
def disable_competitor_invitations(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    comp = session.get(Competition, competition_id)
    if not comp:
        raise HTTPException(404, "Competencia no encontrada")
    comp.invitations_enabled = 0
    session.add(comp)
    session.commit()
    return {"ok": True, "invitations_enabled": 0}


# ── Organizer: CRUD invitations ───────────────────────────────────────────────

@router.post("/api/competitions/{competition_id}/competitor-invitations", status_code=201)
def create_competitor_invitation(
    competition_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    if not competition.invitations_enabled:
        raise HTTPException(403, "Las invitaciones de competidores no estan habilitadas para esta competencia")

    inviter_user_id = get_user_id(user)
    if inviter_user_id is None:
        raise HTTPException(403, "No se pudo resolver el organizador actual")

    invited_email = _normalize_email(body.get("invited_email"))
    categoria = str(body.get("categoria") or "").strip() or None
    note = str(body.get("note") or "").strip() or None

    if categoria:
        cat_exists = session.exec(
            select(CompetitionCategory)
            .where(CompetitionCategory.competition_id == competition_id)
            .where(CompetitionCategory.nombre == categoria)
        ).first()
        if not cat_exists:
            raise HTTPException(400, "La categoria indicada no existe en esta competencia")

    existing = session.exec(
        select(CompetitionCompetitorInvitation)
        .where(CompetitionCompetitorInvitation.competition_id == competition_id)
        .where(CompetitionCompetitorInvitation.invited_email == invited_email)
    ).first()

    if existing:
        if existing.status == "revoked":
            existing.status = "pending"
            existing.categoria = categoria
            existing.note = note
            existing.invited_by_user_id = inviter_user_id
            existing.accepted_at = None
            existing.rejected_at = None
            existing.revoked_at = None
            session.add(existing)
            invitation = existing
        elif existing.status == "pending":
            raise HTTPException(409, "Ya existe una invitacion pendiente para este correo")
        elif existing.status in {"accepted"}:
            raise HTTPException(409, "Este competidor ya acepto una invitacion para esta competencia")
        else:
            raise HTTPException(409, "Ya existe una invitacion para este correo en esta competencia")
    else:
        matched_user = session.exec(
            select(Participant).where(Participant.email == invited_email)
        ).first()

        invitation = CompetitionCompetitorInvitation(
            competition_id=competition_id,
            user_id=matched_user.id if matched_user else None,
            invited_email=invited_email,
            categoria=categoria,
            note=note,
            status="pending",
            invited_by_user_id=inviter_user_id,
        )
        session.add(invitation)

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe una invitacion para este correo en esta competencia")

    session.refresh(invitation)

    inviter = session.get(Participant, inviter_user_id)
    inviter_name = (inviter.display_name or inviter.nombre or invited_email) if inviter else "El organizador"
    invitation_url = f"{FRONTEND_BASE_URL}/competitions/{competition_id}/invitation/{invitation.id}"
    try:
        subject, text_body, html_body = render_competitor_invitation(
            nombre=invited_email,
            competition_name=competition.nombre,
            invited_by_name=inviter_name,
            categoria=categoria,
            note=note,
            invitation_url=invitation_url,
        )
        send_email(to_email=invited_email, subject=subject, text_body=text_body, html_body=html_body)
    except Exception:
        pass

    return _invitation_payload(session, invitation)


@router.get("/api/competitions/{competition_id}/competitor-invitations")
def list_competitor_invitations(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    rows = session.exec(
        select(CompetitionCompetitorInvitation)
        .where(CompetitionCompetitorInvitation.competition_id == competition_id)
        .order_by(CompetitionCompetitorInvitation.created_at.desc(), CompetitionCompetitorInvitation.id.desc())
    ).all()
    return [_invitation_payload(session, row) for row in rows]


@router.delete("/api/competitions/{competition_id}/competitor-invitations/{invitation_id}", status_code=200)
def revoke_competitor_invitation(
    competition_id: int,
    invitation_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    invitation = session.get(CompetitionCompetitorInvitation, invitation_id)
    if not invitation or invitation.competition_id != competition_id:
        raise HTTPException(404, "Invitacion no encontrada")
    if invitation.status == "accepted":
        raise HTTPException(409, "No se puede revocar una invitacion ya aceptada")
    if invitation.status == "revoked":
        return {"ok": True, "status": "revoked"}
    invitation.status = "revoked"
    invitation.revoked_at = _utcnow()
    session.add(invitation)
    session.commit()
    return {"ok": True, "status": "revoked"}


# ── Participant: own invitations ──────────────────────────────────────────────

@router.get("/api/me/competitor-invitations")
def list_my_competitor_invitations(
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    current_emails = list(_current_user_emails(session, user))
    if user_id is None and not current_emails:
        return []
    from sqlalchemy import or_
    filters = []
    if user_id is not None:
        filters.append(CompetitionCompetitorInvitation.user_id == user_id)
    if current_emails:
        filters.append(CompetitionCompetitorInvitation.invited_email.in_(current_emails))
    rows = session.exec(
        select(CompetitionCompetitorInvitation)
        .where(or_(*filters))
        .order_by(CompetitionCompetitorInvitation.created_at.desc(), CompetitionCompetitorInvitation.id.desc())
    ).all()
    return [_invitation_payload(session, row) for row in rows]


@router.post("/api/competitor-invitations/{invitation_id}/reject", status_code=200)
def reject_competitor_invitation(
    invitation_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    invitation = _resolve_my_invitation(session, invitation_id, user)
    if invitation.status == "revoked":
        raise HTTPException(409, "Esta invitacion ya fue revocada")
    if invitation.status == "rejected":
        return {"ok": True, "status": "rejected"}
    if invitation.status == "accepted":
        raise HTTPException(409, "Esta invitacion ya fue aceptada")
    invitation.status = "rejected"
    invitation.rejected_at = _utcnow()
    session.add(invitation)
    session.commit()
    return {"ok": True, "status": "rejected"}


@router.post("/api/competitor-invitations/{invitation_id}/complete", status_code=201)
def complete_competitor_invitation(
    invitation_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    """
    Called from the acceptance form. Receives profile fields + enrollment answers + terms.
    Creates CompetitionParticipant with payment_provider='invitation' and all fees = 0.
    """
    import json as _json
    invitation = _resolve_my_invitation(session, invitation_id, user)
    if invitation.status == "revoked":
        raise HTTPException(409, "Esta invitacion ya fue revocada")
    if invitation.status == "rejected":
        raise HTTPException(409, "Esta invitacion fue rechazada")
    if invitation.status == "accepted":
        existing = session.get(CompetitionParticipant, (invitation.competition_id, invitation.user_id))
        if existing:
            return {"ok": True, "status": "accepted", "already_enrolled": True}

    user_id = get_user_id(user)
    if user_id is None:
        raise HTTPException(403, "Necesitas una cuenta para aceptar esta invitacion")

    competition = session.get(Competition, invitation.competition_id)
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")

    terms_accepted = int(body.get("terms_accepted") or 0)
    if not terms_accepted:
        raise HTTPException(400, "Debes aceptar los terminos para completar la inscripcion")

    categoria = str(invitation.categoria or body.get("categoria") or "").strip() or None

    raw_answers = body.get("answers") or []
    enrollment_answers_json: str | None = None
    if raw_answers:
        from routers.enrollments import _parse_enrollment_questions, _serialize_enrollment_answers
        from models import EnrollmentAnswerItem
        questions = _parse_enrollment_questions(competition.enrollment_questions)
        answer_items = []
        for a in raw_answers:
            if isinstance(a, dict):
                answer_items.append(EnrollmentAnswerItem(
                    question_id=str(a.get("question_id") or ""),
                    question_label=a.get("question_label"),
                    question_type=a.get("question_type"),
                    answer=str(a.get("answer") or ""),
                ))
        enrollment_answers_json = _serialize_enrollment_answers(questions, answer_items)

    profile_fields = body.get("profile") or {}
    if isinstance(profile_fields, dict) and profile_fields:
        participant = session.get(Participant, user_id)
        if participant:
            updatable = ["nombre", "apellido", "celular", "sexo", "genero", "categoria",
                         "box", "talla_camiseta", "ciudad_pais"]
            for field in updatable:
                if field in profile_fields and profile_fields[field] is not None:
                    setattr(participant, field, profile_fields[field])
            if "fecha_nacimiento" in profile_fields and profile_fields["fecha_nacimiento"]:
                from datetime import date
                raw_dob = profile_fields["fecha_nacimiento"]
                try:
                    if isinstance(raw_dob, str):
                        participant.fecha_nacimiento = date.fromisoformat(raw_dob)
                except ValueError:
                    pass
            session.add(participant)

    existing_enrollment = session.get(CompetitionParticipant, (invitation.competition_id, user_id))
    if existing_enrollment:
        if existing_enrollment.estado == "confirmado":
            invitation.status = "accepted"
            invitation.user_id = user_id
            invitation.accepted_at = _utcnow()
            session.add(invitation)
            session.commit()
            return {"ok": True, "status": "accepted", "already_enrolled": True}
        existing_enrollment.estado = "confirmado"
        existing_enrollment.categoria = categoria
        existing_enrollment.enrollment_answers = enrollment_answers_json
        existing_enrollment.payment_provider = "invitation"
        existing_enrollment.payment_status = "approved"
        session.add(existing_enrollment)
    else:
        enrollment = CompetitionParticipant(
            competition_id=invitation.competition_id,
            user_id=user_id,
            categoria=categoria,
            estado="confirmado",
            enrollment_answers=enrollment_answers_json,
            payment_provider="invitation",
            payment_status="approved",
            payment_base_amount=0,
            payment_platform_fee=0,
            payment_platform_fee_rate=0,
            payment_processor_fee=0,
            payment_platform_net=0,
            payment_amount_total=0,
        )
        session.add(enrollment)

    invitation.status = "accepted"
    invitation.user_id = user_id
    invitation.accepted_at = _utcnow()
    session.add(invitation)

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya estas inscrito en esta competencia")

    from services.leaderboard_cache import invalidate_leaderboard_results_snapshot
    invalidate_leaderboard_results_snapshot(invitation.competition_id)

    return {"ok": True, "status": "accepted"}
