from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from auth import require_admin, require_auth
from database import MAX_TEAM_SIZE, get_session
from models import (
    Participant, Team, TeamCreate, TeamMember, TeamUpdate,
    TeamInvitation, TeamInviteRequest, TeamRenameRequest,
    CompetitionParticipant,
)

router = APIRouter(prefix="/api/teams", tags=["teams"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _with_members(session: Session, team: Team) -> dict:
    members = session.exec(
        select(Participant)
        .join(TeamMember, TeamMember.participant_id == Participant.id)
        .where(TeamMember.team_id == team.id)
    ).all()
    return {
        **team.model_dump(),
        "members": [
            {**m.model_dump(), "is_captain": m.id == team.captain_id}
            for m in members
        ],
    }


def _clean_name(value: str | None) -> str:
    return (value or "").strip()


def _competition_team_size(session: Session, competition_id: int, fallback: int = 2) -> int:
    teams = session.exec(select(Team).where(Team.competition_id == competition_id)).all()
    for t in teams:
        count = session.exec(select(TeamMember).where(TeamMember.team_id == t.id)).all()
        if len(count) > 0:
            return len(count)
    return max(1, min(MAX_TEAM_SIZE, fallback))


def _require_captain(team_id: int, user: dict, session: Session) -> Team:
    if user.get("role") != "participant":
        raise HTTPException(403, "Solo participantes pueden realizar esta accion")
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Equipo no encontrado")
    if team.captain_id != int(user["sub"]):
        raise HTTPException(403, "No eres el capitan de este equipo")
    return team


# ── Routes: literal paths BEFORE parameterized ───────────────────────────────

@router.get("/my-invitations")
def my_invitations(session: Session = Depends(get_session), user=Depends(require_auth)):
    """Invitaciones pendientes que el participante autenticado ha recibido."""
    if user.get("role") != "participant":
        raise HTTPException(403, "Solo participantes")
    participant_id = int(user["sub"])
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
        members = session.exec(
            select(Participant)
            .join(TeamMember, TeamMember.participant_id == Participant.id)
            .where(TeamMember.team_id == inv.team_id)
        ).all()
        result.append({
            **inv.model_dump(),
            "team": {
                **team.model_dump(),
                "members": [{**m.model_dump(), "is_captain": m.id == team.captain_id} for m in members],
            } if team else None,
            "captain_nombre": f"{captain.nombre} {captain.apellido}" if captain else None,
        })
    return result


@router.post("/invitations/{inv_id}/accept")
def accept_invitation(inv_id: int, session: Session = Depends(get_session), user=Depends(require_auth)):
    if user.get("role") != "participant":
        raise HTTPException(403, "Solo participantes")
    participant_id = int(user["sub"])

    inv = session.get(TeamInvitation, inv_id)
    if not inv or inv.invitee_id != participant_id:
        raise HTTPException(404, "Invitacion no encontrada")
    if inv.status != "pending":
        raise HTTPException(400, "La invitacion ya fue procesada")

    team = session.get(Team, inv.team_id)
    if not team:
        raise HTTPException(404, "Equipo no encontrado")

    # check capacity
    current_size = len(session.exec(select(TeamMember).where(TeamMember.team_id == team.id)).all())
    if current_size >= MAX_TEAM_SIZE:
        raise HTTPException(400, "El equipo ya esta lleno")

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
    if user.get("role") != "participant":
        raise HTTPException(403, "Solo participantes")
    participant_id = int(user["sub"])

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
def list_teams(competition_id: Optional[int] = None, session: Session = Depends(get_session)):
    query = select(Team).order_by(Team.nombre)
    if competition_id:
        query = query.where(Team.competition_id == competition_id)
    teams = session.exec(query).all()
    return [_with_members(session, t) for t in teams]


@router.get("/{team_id}")
def get_team(team_id: int, session: Session = Depends(get_session)):
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Equipo no encontrado")
    return _with_members(session, team)


@router.post("", status_code=201)
def create_team(body: TeamCreate, session: Session = Depends(get_session), _=Depends(require_admin)):
    team_size = _competition_team_size(session, body.competition_id, fallback=len(body.member_ids) or 2)
    if len(body.member_ids) != team_size:
        raise HTTPException(400, f"Cada equipo debe tener exactamente {team_size} miembros")

    if body.captain_id and body.captain_id not in body.member_ids:
        raise HTTPException(400, "El capitan debe ser uno de los integrantes del equipo")

    requested_name = _clean_name(body.nombre)
    team = Team(
        nombre=requested_name or f"tmp-{body.competition_id}-{len(body.member_ids)}",
        competition_id=body.competition_id,
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
        if not session.get(Participant, pid):
            session.rollback()
            raise HTTPException(404, f"Participante {pid} no encontrado")

        existing = session.exec(
            select(Team)
            .join(TeamMember, TeamMember.team_id == Team.id)
            .where(TeamMember.participant_id == pid, Team.competition_id == body.competition_id)
        ).first()
        if existing:
            session.rollback()
            raise HTTPException(409, f"El participante {pid} ya esta en el equipo '{existing.nombre}'")

        session.add(TeamMember(team_id=team.id, participant_id=pid))

    session.commit()
    session.refresh(team)
    return _with_members(session, team)


@router.put("/{team_id}")
def update_team(team_id: int, body: TeamUpdate, session: Session = Depends(get_session), _=Depends(require_admin)):
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Equipo no encontrado")

    if body.nombre is not None:
        team.nombre = _clean_name(body.nombre) or f"Equipo {team.id}"
        session.add(team)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            raise HTTPException(409, "Ya existe un equipo con ese nombre en esta competencia")

    if body.member_ids is not None:
        current_members_count = len(
            session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all()
        )
        fallback = current_members_count if current_members_count > 0 else 2
        team_size = _competition_team_size(session, team.competition_id, fallback=fallback)
        if len(body.member_ids) != team_size:
            raise HTTPException(400, f"Cada equipo debe tener exactamente {team_size} miembros")

        for tm in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all():
            session.delete(tm)
        session.flush()

        for pid in body.member_ids:
            if not session.get(Participant, pid):
                raise HTTPException(404, f"Participante {pid} no encontrado")

            existing = session.exec(
                select(Team)
                .join(TeamMember, TeamMember.team_id == Team.id)
                .where(
                    TeamMember.participant_id == pid,
                    Team.competition_id == team.competition_id,
                    Team.id != team_id,
                )
            ).first()
            if existing:
                raise HTTPException(409, f"El participante {pid} ya esta en '{existing.nombre}'")

            session.add(TeamMember(team_id=team_id, participant_id=pid))

        # if new member_ids no longer include existing captain, reset captain to first member
        if team.captain_id and team.captain_id not in body.member_ids:
            team.captain_id = body.member_ids[0] if body.member_ids else None
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
def delete_team(team_id: int, session: Session = Depends(get_session), _=Depends(require_admin)):
    team = session.get(Team, team_id)
    if team:
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
    current_size = len(session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all())
    if current_size >= MAX_TEAM_SIZE:
        raise HTTPException(400, f"El equipo ya tiene el maximo de {MAX_TEAM_SIZE} integrantes")

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
