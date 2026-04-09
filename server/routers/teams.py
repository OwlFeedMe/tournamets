from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from access import get_owned_competition_ids, require_competition_access
from auth import get_effective_participant_id, is_end_user, require_auth, require_staff
from database import MAX_TEAM_SIZE, get_session
from models import (
    Competition, CompetitionCategory, CompetitionParticipant,
    Participant, Team, TeamCreate, TeamMember, TeamUpdate,
    TeamInvitation, TeamInviteRequest, TeamRenameRequest,
)

router = APIRouter(prefix="/api/teams", tags=["teams"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _with_members(session: Session, team: Team) -> dict:
    member_rows = session.exec(
        select(Participant, CompetitionParticipant.categoria)
        .join(TeamMember, TeamMember.participant_id == Participant.id)
        .outerjoin(
            CompetitionParticipant,
            (CompetitionParticipant.participant_id == Participant.id)
            & (CompetitionParticipant.competition_id == team.competition_id),
        )
        .where(TeamMember.team_id == team.id)
    ).all()
    members = []
    member_ids: list[int] = []
    for participant, category in member_rows:
        member_ids.append(int(participant.id))
        members.append({
            "id": participant.id,
            "nombre": participant.nombre,
            "apellido": participant.apellido,
            "box": participant.box,
            "categoria": category or participant.categoria,
            "is_captain": participant.id == team.captain_id,
        })
    team_category = _team_category_payload(session, team, member_ids)
    return {
        **team.model_dump(),
        "team_category": team_category,
        "team_category_id": team.team_category_id,
        "members": [
            member
            for member in members
        ],
    }


def _clean_name(value: str | None) -> str:
    return (value or "").strip()


def _competition_team_size(session: Session, competition_id: int, fallback: int = 2) -> int:
    competition = session.get(Competition, competition_id)
    if competition is not None:
        return max(1, min(MAX_TEAM_SIZE, int(getattr(competition, "team_size", fallback) or fallback)))
    teams = session.exec(select(Team).where(Team.competition_id == competition_id)).all()
    for t in teams:
        count = session.exec(select(TeamMember).where(TeamMember.team_id == t.id)).all()
        if len(count) > 0:
            return len(count)
    return max(1, min(MAX_TEAM_SIZE, fallback))


def _competition_team_membership_rule(session: Session, competition_id: int) -> str:
    competition = session.get(Competition, competition_id)
    if not competition:
        return "free"
    value = (getattr(competition, "team_membership_rule", "free") or "free").strip().lower()
    return value if value in {"free", "same_category"} else "free"


def _competition_team_categories_enabled(session: Session, competition_id: int) -> bool:
    competition = session.get(Competition, competition_id)
    return bool(competition and getattr(competition, "team_categories_enabled", 1))


def _team_category(session: Session, team_category_id: int | None) -> CompetitionCategory | None:
    if team_category_id is None:
        return None
    return session.get(CompetitionCategory, team_category_id)


def _member_category_label(session: Session, competition_id: int, participant_id: int) -> str:
    enrollment = session.get(CompetitionParticipant, (competition_id, participant_id))
    if enrollment and (enrollment.categoria or "").strip():
        return (enrollment.categoria or "").strip()
    participant = session.get(Participant, participant_id)
    if participant and (participant.categoria or "").strip():
        return (participant.categoria or "").strip()
    return "Sin categoria"


def _team_member_categories(session: Session, competition_id: int, member_ids: list[int]) -> list[str]:
    return [_member_category_label(session, competition_id, pid) for pid in member_ids]


def _team_category_payload(session: Session, team: Team, member_ids: list[int]) -> dict | None:
    category = _team_category(session, getattr(team, "team_category_id", None))
    if category:
        return {
            "id": category.id,
            "nombre": category.nombre,
            "descripcion": category.descripcion,
            "modality": category.modality,
            "orden": category.orden,
        }
    member_categories = sorted({cat for cat in _team_member_categories(session, team.competition_id, member_ids) if cat})
    if len(member_categories) == 1:
        return {
            "id": None,
            "nombre": member_categories[0],
            "descripcion": None,
            "modality": "teams",
            "orden": 0,
        }
    if len(member_categories) > 1:
        return {
            "id": None,
            "nombre": "Mixta",
            "descripcion": None,
            "modality": "teams",
            "orden": 0,
        }
    return None


def _validate_team_membership(
    session: Session,
    *,
    competition_id: int,
    member_ids: list[int],
    team_category_id: int | None = None,
    current_team_id: int | None = None,
) -> None:
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")
    if not getattr(competition, "team_enabled", 0):
        raise HTTPException(400, "La competencia no tiene modalidad por equipos activa")
    if len(set(member_ids)) != len(member_ids):
        raise HTTPException(400, "El equipo no puede repetir participantes")
    team_size = _competition_team_size(session, competition_id, fallback=len(member_ids) or 2)
    if len(member_ids) != team_size:
        raise HTTPException(400, f"Cada equipo debe tener exactamente {team_size} miembros")

    category = _team_category(session, team_category_id)
    if team_category_id is not None and not category:
        raise HTTPException(404, "Categoria de equipo no encontrada")
    if category and category.competition_id != competition_id:
        raise HTTPException(400, "La categoria del equipo no pertenece a esta competencia")
    if category and (category.modality or "").strip().lower() not in {"teams", "team", "equipo", "equipos"}:
        raise HTTPException(400, "La categoria del equipo debe pertenecer a la modalidad por equipos")

    rule = _competition_team_membership_rule(session, competition_id)
    categories = _team_member_categories(session, competition_id, member_ids)
    unique_categories = {cat for cat in categories if cat}
    if rule == "same_category":
        if len(unique_categories) > 1:
            raise HTTPException(400, "Todos los integrantes del equipo deben pertenecer a la misma categoria")
        if category and unique_categories and next(iter(unique_categories)) != (category.nombre or "").strip():
            raise HTTPException(400, "La categoria del equipo no coincide con la categoria de los integrantes")
    elif category and unique_categories and len(unique_categories) > 1:
        # Explicit team categories stay valid even if member categories are mixed.
        pass

    for pid in member_ids:
        if not session.get(Participant, pid):
            raise HTTPException(404, f"Participante {pid} no encontrado")
        existing = session.exec(
            select(Team)
            .join(TeamMember, TeamMember.team_id == Team.id)
            .where(
                TeamMember.participant_id == pid,
                Team.competition_id == competition_id,
                Team.id != (current_team_id or 0),
            )
        ).first()
        if existing:
            raise HTTPException(409, f"El participante {pid} ya esta en el equipo '{existing.nombre}'")


def _require_captain(team_id: int, user: dict, session: Session) -> Team:
    participant_id = get_effective_participant_id(user)
    if not is_end_user(user) or participant_id is None:
        raise HTTPException(403, "Solo usuarios pueden realizar esta accion")
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Equipo no encontrado")
    if team.captain_id != participant_id:
        raise HTTPException(403, "No eres el capitan de este equipo")
    return team


# ── Routes: literal paths BEFORE parameterized ───────────────────────────────

@router.get("/my-invitations")
def my_invitations(session: Session = Depends(get_session), user=Depends(require_auth)):
    """Invitaciones pendientes que el participante autenticado ha recibido."""
    participant_id = get_effective_participant_id(user)
    if not is_end_user(user) or participant_id is None:
        raise HTTPException(403, "Solo usuarios")
    invs = session.exec(
        select(TeamInvitation).where(
            TeamInvitation.invitee_id == participant_id,
            TeamInvitation.status == "pending",
        )
    ).all()
    result = []
    for inv in invs:
        team = session.get(Team, inv.team_id)
        captain = session.get(Participant, team.captain_id) if team and team.captain_id else None
        result.append({
            **inv.model_dump(),
            "team": _with_members(session, team) if team else None,
            "captain_nombre": f"{captain.nombre} {captain.apellido}" if captain else None,
        })
    return result


@router.post("/invitations/{inv_id}/accept")
def accept_invitation(inv_id: int, session: Session = Depends(get_session), user=Depends(require_auth)):
    participant_id = get_effective_participant_id(user)
    if not is_end_user(user) or participant_id is None:
        raise HTTPException(403, "Solo usuarios")

    inv = session.get(TeamInvitation, inv_id)
    if not inv or inv.invitee_id != participant_id:
        raise HTTPException(404, "Invitacion no encontrada")
    if inv.status != "pending":
        raise HTTPException(400, "La invitacion ya fue procesada")

    team = session.get(Team, inv.team_id)
    if not team:
        raise HTTPException(404, "Equipo no encontrado")

    # check capacity
    team_size = _competition_team_size(session, team.competition_id, fallback=2)
    current_size = len(session.exec(select(TeamMember).where(TeamMember.team_id == team.id)).all())
    if current_size >= team_size:
        raise HTTPException(400, f"El equipo ya esta lleno. Maximo {team_size} integrantes")

    # check not already in a team in this competition
    existing = session.exec(
        select(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.participant_id == participant_id, Team.competition_id == team.competition_id)
    ).first()
    if existing:
        raise HTTPException(409, f"Ya estas en el equipo '{existing.nombre}'")

    session.add(TeamMember(team_id=team.id, participant_id=participant_id))
    inv.status = "accepted"
    session.add(inv)

    # reject other pending invitations for the same participant in the same competition
    other_invs = session.exec(
        select(TeamInvitation)
        .join(Team, Team.id == TeamInvitation.team_id)
        .where(
            TeamInvitation.invitee_id == participant_id,
            TeamInvitation.status == "pending",
            Team.competition_id == team.competition_id,
            TeamInvitation.id != inv_id,
        )
    ).all()
    for oi in other_invs:
        oi.status = "rejected"
        session.add(oi)

    session.commit()
    return {"ok": True}


@router.delete("/invitations/{inv_id}")
def reject_invitation(inv_id: int, session: Session = Depends(get_session), user=Depends(require_auth)):
    participant_id = get_effective_participant_id(user)
    if not is_end_user(user) or participant_id is None:
        raise HTTPException(403, "Solo usuarios")

    inv = session.get(TeamInvitation, inv_id)
    if not inv or inv.invitee_id != participant_id:
        raise HTTPException(404, "Invitacion no encontrada")
    if inv.status != "pending":
        raise HTTPException(400, "La invitacion ya fue procesada")

    inv.status = "rejected"
    session.add(inv)
    session.commit()
    return {"ok": True}


# ── Standard CRUD ─────────────────────────────────────────────────────────────

@router.get("")
def list_teams(
    competition_id: Optional[int] = None,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    query = select(Team).order_by(Team.nombre)
    if competition_id:
        require_competition_access(session, competition_id, user)
        query = query.where(Team.competition_id == competition_id)
    else:
        owned_ids = get_owned_competition_ids(session, user)
        if user.get("role") == "organizer":
            query = query.where(Team.competition_id.in_(owned_ids))
    teams = session.exec(query).all()
    return [_with_members(session, t) for t in teams]


@router.get("/{team_id}")
def get_team(team_id: int, session: Session = Depends(get_session), user=Depends(require_auth)):
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Equipo no encontrado")
    require_competition_access(session, int(team.competition_id), user)
    return _with_members(session, team)


@router.post("", status_code=201)
def create_team(body: TeamCreate, session: Session = Depends(get_session), user=Depends(require_staff)):
    require_competition_access(session, body.competition_id, user)
    if body.captain_id and body.captain_id not in body.member_ids:
        raise HTTPException(400, "El capitan debe ser uno de los integrantes del equipo")
    _validate_team_membership(
        session,
        competition_id=body.competition_id,
        member_ids=body.member_ids,
        team_category_id=body.team_category_id,
    )

    requested_name = _clean_name(body.nombre)
    team = Team(
        nombre=requested_name or f"tmp-{body.competition_id}-{len(body.member_ids)}",
        competition_id=body.competition_id,
        team_category_id=body.team_category_id,
        captain_id=body.captain_id if body.captain_id else (body.member_ids[0] if body.member_ids else None),
    )
    session.add(team)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe un equipo con ese nombre en esta competencia")

    if not requested_name:
        team.nombre = f"Equipo {team.id}"
        session.add(team)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            raise HTTPException(409, "No se pudo generar un nombre de equipo")

    for pid in body.member_ids:
        session.add(TeamMember(team_id=team.id, participant_id=pid))

    session.commit()
    session.refresh(team)
    return _with_members(session, team)


@router.put("/{team_id}")
def update_team(team_id: int, body: TeamUpdate, session: Session = Depends(get_session), user=Depends(require_staff)):
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Equipo no encontrado")
    require_competition_access(session, int(team.competition_id), user)

    if body.nombre is not None:
        team.nombre = _clean_name(body.nombre) or f"Equipo {team.id}"
        session.add(team)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            raise HTTPException(409, "Ya existe un equipo con ese nombre en esta competencia")

    next_member_ids = body.member_ids if body.member_ids is not None else [
        m.participant_id for m in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all()
    ]
    next_team_category_id = body.team_category_id if body.team_category_id is not None else team.team_category_id
    _validate_team_membership(
        session,
        competition_id=team.competition_id,
        member_ids=next_member_ids,
        team_category_id=next_team_category_id,
        current_team_id=team_id,
    )

    if body.member_ids is not None:
        for tm in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all():
            session.delete(tm)
        session.flush()
        for pid in body.member_ids:
            session.add(TeamMember(team_id=team_id, participant_id=pid))

        # if new member_ids no longer include existing captain, reset captain to first member
        if team.captain_id and team.captain_id not in body.member_ids:
            team.captain_id = body.member_ids[0] if body.member_ids else None
            session.add(team)

    if body.team_category_id is not None:
        team.team_category_id = body.team_category_id
        session.add(team)

    if body.captain_id is not None:
        # validate captain is a member
        member_ids = [
            m.participant_id
            for m in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all()
        ]
        if body.captain_id not in member_ids:
            raise HTTPException(400, "El capitan debe ser uno de los integrantes del equipo")
        team.captain_id = body.captain_id
        session.add(team)

    session.commit()
    session.refresh(team)
    return _with_members(session, team)


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: int, session: Session = Depends(get_session), user=Depends(require_staff)):
    team = session.get(Team, team_id)
    if team:
        require_competition_access(session, int(team.competition_id), user)
        session.delete(team)
        session.commit()


# ── Captain-only endpoints ────────────────────────────────────────────────────

@router.put("/{team_id}/rename")
def captain_rename_team(
    team_id: int,
    body: TeamRenameRequest,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    team = _require_captain(team_id, user, session)
    new_name = _clean_name(body.nombre) or f"Equipo {team.id}"
    team.nombre = new_name
    session.add(team)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Ya existe un equipo con ese nombre en esta competencia")
    session.refresh(team)
    return _with_members(session, team)


@router.post("/{team_id}/invite")
def captain_invite(
    team_id: int,
    body: TeamInviteRequest,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    team = _require_captain(team_id, user, session)

    invitee = session.exec(
        select(Participant).where(Participant.cedula == body.invitee_cedula)
    ).first()
    if not invitee:
        raise HTTPException(404, "Participante no encontrado con esa cedula")

    # must be enrolled and confirmed in the competition
    enrollment = session.get(CompetitionParticipant, (team.competition_id, invitee.id))
    if not enrollment or enrollment.estado != "confirmado":
        raise HTTPException(400, "El participante no esta inscrito y confirmado en esta competencia")

    # must not already be in a team
    existing_team = session.exec(
        select(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.participant_id == invitee.id, Team.competition_id == team.competition_id)
    ).first()
    if existing_team:
        raise HTTPException(409, f"El participante ya esta en el equipo '{existing_team.nombre}'")

    # team must have room
    team_size = _competition_team_size(session, team.competition_id, fallback=2)
    current_size = len(session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all())
    if current_size >= team_size:
        raise HTTPException(400, f"El equipo ya tiene el maximo de {team_size} integrantes")

    current_member_ids = [m.participant_id for m in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all()]
    _validate_team_membership(
        session,
        competition_id=team.competition_id,
        member_ids=current_member_ids + [invitee.id],
        team_category_id=team.team_category_id,
        current_team_id=team.id,
    )

    # no duplicate pending invite
    existing_inv = session.exec(
        select(TeamInvitation).where(
            TeamInvitation.team_id == team_id,
            TeamInvitation.invitee_id == invitee.id,
            TeamInvitation.status == "pending",
        )
    ).first()
    if existing_inv:
        raise HTTPException(409, "Ya existe una invitacion pendiente para este participante")

    session.add(TeamInvitation(team_id=team_id, invitee_id=invitee.id))
    session.commit()
    return {"ok": True, "invitee": {"nombre": invitee.nombre, "apellido": invitee.apellido, "cedula": invitee.cedula}}


@router.get("/{team_id}/invitations")
def get_team_invitations(
    team_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    team = _require_captain(team_id, user, session)
    invs = session.exec(
        select(TeamInvitation).where(
            TeamInvitation.team_id == team_id,
            TeamInvitation.status == "pending",
        )
    ).all()
    result = []
    for inv in invs:
        p = session.get(Participant, inv.invitee_id)
        result.append({
            **inv.model_dump(),
            "invitee_nombre": f"{p.nombre} {p.apellido}" if p else None,
            "invitee_cedula": p.cedula if p else None,
        })
    return result


@router.put("/{team_id}/transfer-captain")
def transfer_captain(
    team_id: int,
    body: TeamUpdate,  # reuse TeamUpdate — send captain_id only
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    team = _require_captain(team_id, user, session)

    if body.captain_id is None:
        raise HTTPException(400, "Falta new_captain_id")
    member_ids = [
        m.participant_id
        for m in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all()
    ]
    if body.captain_id not in member_ids:
        raise HTTPException(400, "El nuevo capitan debe ser integrante del equipo")
    if body.captain_id == team.captain_id:
        raise HTTPException(400, "Esa persona ya es el capitan")

    team.captain_id = body.captain_id
    session.add(team)
    session.commit()
    session.refresh(team)
    return _with_members(session, team)


@router.delete("/{team_id}/invitations/{inv_id}", status_code=204)
def cancel_team_invitation(
    team_id: int,
    inv_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    _require_captain(team_id, user, session)
    inv = session.get(TeamInvitation, inv_id)
    if not inv or inv.team_id != team_id:
        raise HTTPException(404, "Invitacion no encontrada")
    session.delete(inv)
    session.commit()
