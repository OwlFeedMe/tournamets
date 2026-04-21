from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from access import get_owned_competition_ids, is_organizer_user, require_competition_access
from auth import get_effective_user_id, is_end_user, require_auth, require_staff
from database import MAX_TEAM_SIZE, get_session
from models import (
    Competition, CompetitionCategory, CompetitionParticipant,
    Participant, Team, TeamCreate, TeamMember, TeamUpdate,
    TeamInvitation, TeamInviteRequest, TeamRenameRequest,
)
from services.leaderboard_cache import invalidate_leaderboard_results_snapshot

router = APIRouter(prefix="/api/teams", tags=["teams"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_team_category_from_members(
    team: Team,
    members: list[dict],
    explicit_category: CompetitionCategory | None,
) -> dict | None:
    if explicit_category and explicit_category.competition_id == team.competition_id:
        return {
            "id": explicit_category.id,
            "nombre": explicit_category.nombre,
            "descripcion": explicit_category.descripcion,
            "modality": explicit_category.modality,
            "orden": explicit_category.orden,
        }
    member_cats = sorted({
        str(m.get("categoria") or "").strip()
        for m in members
        if (m.get("categoria") or "").strip()
    })
    if len(member_cats) == 1:
        return {"id": None, "nombre": member_cats[0], "descripcion": None, "modality": "teams", "orden": 0}
    if len(member_cats) > 1:
        return {"id": None, "nombre": "Mixta", "descripcion": None, "modality": "teams", "orden": 0}
    return None


def _with_members(session: Session, team: Team) -> dict:
    member_rows = session.exec(
        select(Participant, CompetitionParticipant.categoria)
        .join(TeamMember, TeamMember.user_id == Participant.id)
        .outerjoin(
            CompetitionParticipant,
            (CompetitionParticipant.user_id == Participant.id)
            & (CompetitionParticipant.competition_id == team.competition_id),
        )
        .where(TeamMember.team_id == team.id)
    ).all()
    members = [
        {
            "id": participant.id,
            "user_id": participant.id,
            "nombre": participant.nombre,
            "apellido": participant.apellido,
            "box": participant.box,
            "categoria": category or participant.categoria,
            "is_captain": participant.id == team.captain_id,
        }
        for participant, category in member_rows
    ]
    explicit = (
        session.get(CompetitionCategory, team.team_category_id)
        if team.team_category_id else None
    )
    return {
        **team.model_dump(),
        "team_category": _build_team_category_from_members(team, members, explicit),
        "team_category_id": team.team_category_id,
        "captain_user_id": team.captain_id,
        "members": members,
    }


def _serialize_teams_bulk(session: Session, teams: list[Team]) -> list[dict]:
    """Serializa multiples equipos con 2 queries fijas (members + categories)."""
    if not teams:
        return []
    team_ids = [int(t.id) for t in teams]
    team_by_id = {int(t.id): t for t in teams}

    member_rows = session.exec(
        select(TeamMember.team_id, Participant, CompetitionParticipant.categoria)
        .join(Team, Team.id == TeamMember.team_id)
        .join(Participant, Participant.id == TeamMember.user_id)
        .outerjoin(
            CompetitionParticipant,
            (CompetitionParticipant.user_id == Participant.id)
            & (CompetitionParticipant.competition_id == Team.competition_id),
        )
        .where(TeamMember.team_id.in_(team_ids))
    ).all()

    members_by_team: dict[int, list[dict]] = defaultdict(list)
    for team_id, participant, category in member_rows:
        team = team_by_id.get(int(team_id))
        if team is None:
            continue
        members_by_team[int(team_id)].append({
            "id": participant.id,
            "user_id": participant.id,
            "nombre": participant.nombre,
            "apellido": participant.apellido,
            "box": participant.box,
            "categoria": category or participant.categoria,
            "is_captain": participant.id == team.captain_id,
        })

    category_ids = {int(t.team_category_id) for t in teams if t.team_category_id}
    categories_map: dict[int, CompetitionCategory] = {}
    if category_ids:
        category_rows = session.exec(
            select(CompetitionCategory).where(CompetitionCategory.id.in_(category_ids))
        ).all()
        categories_map = {int(c.id): c for c in category_rows}

    result: list[dict] = []
    for t in teams:
        members = members_by_team.get(int(t.id), [])
        explicit = categories_map.get(int(t.team_category_id)) if t.team_category_id else None
        result.append({
            **t.model_dump(),
            "team_category": _build_team_category_from_members(t, members, explicit),
            "team_category_id": t.team_category_id,
            "captain_user_id": t.captain_id,
            "members": members,
        })
    return result


def _clean_name(value: str | None) -> str:
    return (value or "").strip()


def _resolve_member_ids(member_ids: list[int] | None, user_ids: list[int] | None) -> list[int]:
    resolved = user_ids if user_ids is not None else member_ids
    return [int(item) for item in (resolved or [])]


def _resolve_captain_id(captain_id: int | None, user_id: int | None) -> int | None:
    resolved = user_id if user_id is not None else captain_id
    return int(resolved) if resolved is not None else None


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


def _team_category(session: Session, team_category_id: int | None) -> CompetitionCategory | None:
    if team_category_id is None:
        return None
    return session.get(CompetitionCategory, team_category_id)


def _member_category_label(session: Session, competition_id: int, user_id: int) -> str:
    enrollment = session.get(CompetitionParticipant, (competition_id, user_id))
    if enrollment and (enrollment.categoria or "").strip():
        return (enrollment.categoria or "").strip()
    participant = session.get(Participant, user_id)
    if participant and (participant.categoria or "").strip():
        return (participant.categoria or "").strip()
    return "Sin categoria"


def _team_member_categories(session: Session, competition_id: int, member_ids: list[int]) -> list[str]:
    return [_member_category_label(session, competition_id, pid) for pid in member_ids]


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
                TeamMember.user_id == pid,
                Team.competition_id == competition_id,
                Team.id != (current_team_id or 0),
            )
        ).first()
        if existing:
            raise HTTPException(409, f"El participante {pid} ya esta en el equipo '{existing.nombre}'")


def _require_captain(team_id: int, user: dict, session: Session) -> Team:
    user_id = get_effective_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios pueden realizar esta accion")
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Equipo no encontrado")
    if team.captain_id != user_id:
        raise HTTPException(403, "No eres el capitan de este equipo")
    return team


# ── Routes: literal paths BEFORE parameterized ───────────────────────────────

@router.get("/my-invitations")
def my_invitations(session: Session = Depends(get_session), user=Depends(require_auth)):
    """Invitaciones pendientes que el participante autenticado ha recibido."""
    user_id = get_effective_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")
    invs = session.exec(
        select(TeamInvitation).where(
            TeamInvitation.invitee_id == user_id,
            TeamInvitation.status == "pending",
        )
    ).all()
    if not invs:
        return []
    team_ids = [int(inv.team_id) for inv in invs if inv.team_id is not None]
    teams = session.exec(select(Team).where(Team.id.in_(team_ids))).all() if team_ids else []
    teams_by_id = {int(t.id): t for t in teams}
    team_payloads = {int(p["id"]): p for p in _serialize_teams_bulk(session, teams)}
    captain_ids = {int(t.captain_id) for t in teams if t.captain_id}
    captains_by_id: dict[int, Participant] = {}
    if captain_ids:
        captain_rows = session.exec(
            select(Participant).where(Participant.id.in_(captain_ids))
        ).all()
        captains_by_id = {int(c.id): c for c in captain_rows}
    result = []
    for inv in invs:
        team = teams_by_id.get(int(inv.team_id)) if inv.team_id is not None else None
        captain = captains_by_id.get(int(team.captain_id)) if team and team.captain_id else None
        result.append({
            **inv.model_dump(),
            "invitee_user_id": inv.invitee_id,
            "team": team_payloads.get(int(team.id)) if team else None,
            "captain_nombre": f"{captain.nombre} {captain.apellido}" if captain else None,
            "captain_user_id": int(team.captain_id) if team and team.captain_id is not None else None,
        })
    return result


@router.post("/invitations/{inv_id}/accept")
def accept_invitation(inv_id: int, session: Session = Depends(get_session), user=Depends(require_auth)):
    user_id = get_effective_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")

    inv = session.get(TeamInvitation, inv_id)
    if not inv or inv.invitee_id != user_id:
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
        .where(TeamMember.user_id == user_id, Team.competition_id == team.competition_id)
    ).first()
    if existing:
        raise HTTPException(409, f"Ya estas en el equipo '{existing.nombre}'")

    session.add(TeamMember(team_id=team.id, user_id=user_id))
    inv.status = "accepted"
    session.add(inv)

    # reject other pending invitations for the same participant in the same competition
    other_invs = session.exec(
        select(TeamInvitation)
        .join(Team, Team.id == TeamInvitation.team_id)
        .where(
            TeamInvitation.invitee_id == user_id,
            TeamInvitation.status == "pending",
            Team.competition_id == team.competition_id,
            TeamInvitation.id != inv_id,
        )
    ).all()
    for oi in other_invs:
        oi.status = "rejected"
        session.add(oi)

    session.commit()
    invalidate_leaderboard_results_snapshot(team.competition_id)
    return {"ok": True}


@router.delete("/invitations/{inv_id}")
def reject_invitation(inv_id: int, session: Session = Depends(get_session), user=Depends(require_auth)):
    user_id = get_effective_user_id(user)
    if not is_end_user(user) or user_id is None:
        raise HTTPException(403, "Solo usuarios")

    inv = session.get(TeamInvitation, inv_id)
    if not inv or inv.invitee_id != user_id:
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
        if is_organizer_user(user):
            query = query.where(Team.competition_id.in_(owned_ids))
    teams = session.exec(query).all()
    return _serialize_teams_bulk(session, teams)


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
    member_ids = _resolve_member_ids(body.member_ids, body.user_ids)
    captain_id = _resolve_captain_id(body.captain_id, body.user_id)
    if captain_id and captain_id not in member_ids:
        raise HTTPException(400, "El capitan debe ser uno de los integrantes del equipo")
    _validate_team_membership(
        session,
        competition_id=body.competition_id,
        member_ids=member_ids,
        team_category_id=body.team_category_id,
    )

    requested_name = _clean_name(body.nombre)
    team = Team(
        nombre=requested_name or f"tmp-{body.competition_id}-{len(member_ids)}",
        competition_id=body.competition_id,
        team_category_id=body.team_category_id,
        captain_id=captain_id if captain_id else (member_ids[0] if member_ids else None),
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

    for pid in member_ids:
        session.add(TeamMember(team_id=team.id, user_id=pid))

    session.commit()
    session.refresh(team)
    invalidate_leaderboard_results_snapshot(body.competition_id)
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

    next_member_ids = _resolve_member_ids(body.member_ids, body.user_ids) if (body.member_ids is not None or body.user_ids is not None) else [
        m.user_id for m in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all()
    ]
    next_team_category_id = body.team_category_id if body.team_category_id is not None else team.team_category_id
    _validate_team_membership(
        session,
        competition_id=team.competition_id,
        member_ids=next_member_ids,
        team_category_id=next_team_category_id,
        current_team_id=team_id,
    )

    if body.member_ids is not None or body.user_ids is not None:
        for tm in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all():
            session.delete(tm)
        session.flush()
        for pid in next_member_ids:
            session.add(TeamMember(team_id=team_id, user_id=pid))

        # if new member_ids no longer include existing captain, reset captain to first member
        if team.captain_id and team.captain_id not in next_member_ids:
            team.captain_id = next_member_ids[0] if next_member_ids else None
            session.add(team)

    if body.team_category_id is not None:
        team.team_category_id = body.team_category_id
        session.add(team)

    next_captain_id = _resolve_captain_id(body.captain_id, body.user_id)
    if next_captain_id is not None:
        # validate captain is a member
        member_ids = [
            m.user_id
            for m in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all()
        ]
        if next_captain_id not in member_ids:
            raise HTTPException(400, "El capitan debe ser uno de los integrantes del equipo")
        team.captain_id = next_captain_id
        session.add(team)

    session.commit()
    session.refresh(team)
    invalidate_leaderboard_results_snapshot(team.competition_id)
    return _with_members(session, team)


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: int, session: Session = Depends(get_session), user=Depends(require_staff)):
    team = session.get(Team, team_id)
    if team:
        require_competition_access(session, int(team.competition_id), user)
        competition_id = int(team.competition_id)
        session.delete(team)
        session.commit()
        invalidate_leaderboard_results_snapshot(competition_id)


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
    invalidate_leaderboard_results_snapshot(team.competition_id)
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
        select(Participant).where(
            Participant.id == body.invitee_user_id if body.invitee_user_id is not None else Participant.cedula == body.invitee_cedula
        )
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
        .where(TeamMember.user_id == invitee.id, Team.competition_id == team.competition_id)
    ).first()
    if existing_team:
        raise HTTPException(409, f"El participante ya esta en el equipo '{existing_team.nombre}'")

    # team must have room
    team_size = _competition_team_size(session, team.competition_id, fallback=2)
    current_size = len(session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all())
    if current_size >= team_size:
        raise HTTPException(400, f"El equipo ya tiene el maximo de {team_size} integrantes")

    current_member_ids = [m.user_id for m in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all()]
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
    return {"ok": True, "invitee": {"id": invitee.id, "user_id": invitee.id, "nombre": invitee.nombre, "apellido": invitee.apellido, "cedula": invitee.cedula}}


@router.get("/{team_id}/invitations")
def get_team_invitations(
    team_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    _require_captain(team_id, user, session)
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
            "invitee_user_id": inv.invitee_id,
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

    next_captain_id = _resolve_captain_id(body.captain_id, body.user_id)
    if next_captain_id is None:
        raise HTTPException(400, "Falta new_captain_id")
    member_ids = [
        m.user_id
        for m in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all()
    ]
    if next_captain_id not in member_ids:
        raise HTTPException(400, "El nuevo capitan debe ser integrante del equipo")
    if next_captain_id == team.captain_id:
        raise HTTPException(400, "Esa persona ya es el capitan")

    team.captain_id = next_captain_id
    session.add(team)
    session.commit()
    session.refresh(team)
    invalidate_leaderboard_results_snapshot(team.competition_id)
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
