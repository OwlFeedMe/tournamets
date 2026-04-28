import json
import re
import unicodedata
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from constants import (
    GymStatus, GymOwnershipStatus, GymClaimStatus,
    GymMembershipStatus, GymStaffRole,
)
from models import Gym, GymAuditLog, GymClaim, GymMembership, GymStaff


# ── Helpers ────────────────────────────────────────────────────────────────────

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[\s_-]+", "-", text)


def make_unique_slug(session: Session, base: str) -> str:
    candidate = slugify(base)[:80]
    if not session.exec(select(Gym).where(Gym.slug == candidate)).first():
        return candidate
    for i in range(2, 100):
        slugged = f"{candidate}-{i}"
        if not session.exec(select(Gym).where(Gym.slug == slugged)).first():
            return slugged
    raise HTTPException(500, "No se pudo generar un slug unico para el gym")


# ── Audit log ─────────────────────────────────────────────────────────────────

def log_gym_action(
    session: Session,
    gym_id: int,
    actor_user_id: Optional[int],
    action_type: str,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
) -> None:
    entry = GymAuditLog(
        gym_id=gym_id,
        actor_user_id=actor_user_id,
        action_type=action_type,
        before_snapshot=json.dumps(before) if before else None,
        after_snapshot=json.dumps(after) if after else None,
    )
    session.add(entry)


# ── Permission helpers ─────────────────────────────────────────────────────────

def get_gym_staff_entry(session: Session, gym_id: int, user_id: int) -> Optional[GymStaff]:
    return session.exec(
        select(GymStaff)
        .where(GymStaff.gym_id == gym_id)
        .where(GymStaff.user_id == user_id)
        .where(GymStaff.status == "active")
    ).first()


def is_gym_owner_or_manager(session: Session, gym_id: int, user_id: int) -> bool:
    staff = get_gym_staff_entry(session, gym_id, user_id)
    return staff is not None and staff.role in {GymStaffRole.OWNER, GymStaffRole.MANAGER}


def is_gym_staff_active(session: Session, gym_id: int, user_id: int) -> bool:
    return get_gym_staff_entry(session, gym_id, user_id) is not None


def require_gym_manager(session: Session, gym_id: int, user_id: int) -> None:
    if not is_gym_owner_or_manager(session, gym_id, user_id):
        raise HTTPException(403, "Necesitas ser owner o manager del gym para realizar esta accion")


# ── Gym state machine ──────────────────────────────────────────────────────────

_GYM_TRANSITIONS: dict[str, set[str]] = {
    GymStatus.DRAFT:          {GymStatus.PENDING_REVIEW},
    GymStatus.PENDING_REVIEW: {GymStatus.PUBLISHED, GymStatus.REJECTED},
    GymStatus.PUBLISHED:      {GymStatus.SUSPENDED, GymStatus.ARCHIVED},
    GymStatus.SUSPENDED:      {GymStatus.PUBLISHED, GymStatus.ARCHIVED},
    GymStatus.REJECTED:       {GymStatus.PENDING_REVIEW},
    GymStatus.ARCHIVED:       set(),
}


def transition_gym_status(
    session: Session,
    gym: Gym,
    new_status: str,
    actor_user_id: Optional[int],
) -> None:
    allowed = _GYM_TRANSITIONS.get(gym.status, set())
    if new_status not in allowed:
        raise HTTPException(409, f"No se puede pasar de '{gym.status}' a '{new_status}'")
    before = {"status": gym.status}
    gym.status = new_status
    if new_status == GymStatus.PUBLISHED and not gym.published_at:
        gym.published_at = utcnow()
    session.add(gym)
    log_gym_action(session, gym.id, actor_user_id, f"status:{new_status}", before, {"status": new_status})


# ── Membership state machine ───────────────────────────────────────────────────

_MEMBERSHIP_TRANSITIONS: dict[str, set[str]] = {
    GymMembershipStatus.DECLARED:         {GymMembershipStatus.PENDING_APPROVAL, GymMembershipStatus.APPROVED, GymMembershipStatus.REMOVED},
    GymMembershipStatus.PENDING_APPROVAL: {GymMembershipStatus.APPROVED, GymMembershipStatus.REJECTED, GymMembershipStatus.REMOVED},
    GymMembershipStatus.APPROVED:         {GymMembershipStatus.REMOVED, GymMembershipStatus.INACTIVE},
    GymMembershipStatus.REJECTED:         {GymMembershipStatus.PENDING_APPROVAL},
    GymMembershipStatus.REMOVED:          set(),
    GymMembershipStatus.INACTIVE:         set(),
}


def transition_membership_status(
    session: Session,
    membership: GymMembership,
    new_status: str,
    actor_user_id: Optional[int],
    approved_by_user_id: Optional[int] = None,
) -> None:
    allowed = _MEMBERSHIP_TRANSITIONS.get(membership.status, set())
    if new_status not in allowed:
        raise HTTPException(409, f"No se puede pasar de '{membership.status}' a '{new_status}'")
    before = {"status": membership.status}
    membership.status = new_status
    now = utcnow()
    if new_status == GymMembershipStatus.APPROVED:
        membership.approved_at = now
        membership.approved_by_user_id = approved_by_user_id or actor_user_id
    elif new_status in {GymMembershipStatus.REMOVED, GymMembershipStatus.INACTIVE}:
        membership.ended_at = now
    session.add(membership)
    log_gym_action(
        session, membership.gym_id, actor_user_id,
        f"membership:{new_status}",
        before, {"status": new_status, "user_id": membership.user_id},
    )


# ── Claim flow ─────────────────────────────────────────────────────────────────

def approve_gym_claim(session: Session, claim: GymClaim, admin_user_id: int) -> None:
    if claim.status != GymClaimStatus.PENDING:
        raise HTTPException(409, "Solo se pueden aprobar claims en estado pending")

    gym = session.get(Gym, claim.gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")

    before_gym = {"ownership_status": gym.ownership_status, "claimed_by_user_id": gym.claimed_by_user_id}

    # Update claim
    claim.status = GymClaimStatus.APPROVED
    claim.reviewed_by_admin_id = admin_user_id
    claim.reviewed_at = utcnow()
    session.add(claim)

    # Update gym ownership
    gym.ownership_status = GymOwnershipStatus.VERIFIED
    gym.claimed_by_user_id = claim.requested_by_user_id
    session.add(gym)

    # Upsert GymStaff as owner
    existing_staff = get_gym_staff_entry(session, gym.id, claim.requested_by_user_id)
    if existing_staff:
        existing_staff.role = GymStaffRole.OWNER
        existing_staff.status = "active"
        session.add(existing_staff)
    else:
        session.add(GymStaff(
            gym_id=gym.id,
            user_id=claim.requested_by_user_id,
            role=GymStaffRole.OWNER,
            status="active",
        ))

    # Reject any other pending claims for this gym
    pending_others = session.exec(
        select(GymClaim)
        .where(GymClaim.gym_id == gym.id)
        .where(GymClaim.id != claim.id)
        .where(GymClaim.status == GymClaimStatus.PENDING)
    ).all()
    for other in pending_others:
        other.status = GymClaimStatus.REJECTED
        other.reviewed_by_admin_id = admin_user_id
        other.reviewed_at = utcnow()
        session.add(other)

    log_gym_action(
        session, gym.id, admin_user_id, "claim:approved",
        before_gym,
        {"ownership_status": gym.ownership_status, "claimed_by_user_id": gym.claimed_by_user_id},
    )


def reject_gym_claim(session: Session, claim: GymClaim, admin_user_id: int, note: Optional[str] = None) -> None:
    if claim.status != GymClaimStatus.PENDING:
        raise HTTPException(409, "Solo se pueden rechazar claims en estado pending")
    claim.status = GymClaimStatus.REJECTED
    claim.reviewed_by_admin_id = admin_user_id
    claim.reviewed_at = utcnow()
    if note:
        claim.notes = (claim.notes or "") + f"\n[Admin] {note}"
    session.add(claim)
    log_gym_action(session, claim.gym_id, admin_user_id, "claim:rejected")


# ── Anti-duplicate check ───────────────────────────────────────────────────────

def find_duplicate_candidates(session: Session, name: str, city: Optional[str]) -> list[dict]:
    """Returns gyms that closely match name+city to warn before creating a new submission."""
    name_lower = name.strip().lower()
    candidates = session.exec(
        select(Gym).where(Gym.status != GymStatus.ARCHIVED)
    ).all()

    results = []
    for gym in candidates:
        gym_name_lower = gym.display_name.lower()
        name_match = (
            gym_name_lower == name_lower
            or name_lower in gym_name_lower
            or gym_name_lower in name_lower
        )
        city_match = (
            not city
            or not gym.city
            or gym.city.lower() == city.strip().lower()
        )
        if name_match and city_match:
            results.append({
                "id": gym.id,
                "slug": gym.slug,
                "display_name": gym.display_name,
                "city": gym.city,
                "country": gym.country,
                "status": gym.status,
                "ownership_status": gym.ownership_status,
            })
    return results


# ── Primary membership enforcement ────────────────────────────────────────────

def clear_primary_memberships(session: Session, user_id: int) -> None:
    """Removes is_primary flag from all active memberships of a user."""
    rows = session.exec(
        select(GymMembership)
        .where(GymMembership.user_id == user_id)
        .where(GymMembership.is_primary == 1)
    ).all()
    for row in rows:
        row.is_primary = 0
        session.add(row)
