import io
import uuid
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, Body, Depends, HTTPException, Query, File, UploadFile
from sqlalchemy import func
from sqlmodel import Session, select

from auth import require_admin, require_auth
from access import get_user_id, is_admin_user
from database import get_session
from constants import (
    GymStatus, GymOwnershipStatus, GymClaimStatus,
    GymMembershipStatus, GymStaffRole, GymSubmissionStatus,
)
from models import Gym, GymAuditLog, GymClaim, GymLocation, GymMembership, GymReport, GymStaff, GymSubmission, User
from services.gyms import (
    approve_gym_claim,
    clear_primary_memberships,
    find_duplicate_candidates,
    get_gym_staff_entry,
    is_gym_owner_or_manager,
    log_gym_action,
    make_unique_slug,
    reject_gym_claim,
    require_gym_manager,
    transition_gym_status,
    transition_membership_status,
    utcnow,
)

router = APIRouter(tags=["gyms"])
GYM_ASSET_DIR = Path(__file__).resolve().parents[1] / "uploads" / "gym_assets"
GYM_ASSET_DIR.mkdir(parents=True, exist_ok=True)
GYM_ASSET_SPECS = {
    "logo": {"field": "logo_url", "width": 512, "height": 512, "mode": "cover"},
    "cover": {"field": "cover_image_url", "mode": "original"},
}


# ── Serializers ────────────────────────────────────────────────────────────────

def _gym_dict(gym: Gym) -> dict:
    return {
        "id": gym.id,
        "slug": gym.slug,
        "display_name": gym.display_name,
        "legal_name": gym.legal_name,
        "short_description": gym.short_description,
        "status": gym.status,
        "ownership_status": gym.ownership_status,
        "plan_tier": gym.plan_tier,
        "verification_badge": bool(gym.verification_badge),
        "logo_url": gym.logo_url,
        "cover_image_url": gym.cover_image_url,
        "country": gym.country,
        "state_region": gym.state_region,
        "city": gym.city,
        "website_url": gym.website_url,
        "instagram_url": gym.instagram_url,
        "is_featured": bool(gym.is_featured),
        "created_at": gym.created_at,
        "published_at": gym.published_at,
    }


def _submission_dict(sub: GymSubmission) -> dict:
    return {
        "id": sub.id,
        "submitted_by_user_id": sub.submitted_by_user_id,
        "proposed_name": sub.proposed_name,
        "country": sub.country,
        "state_region": sub.state_region,
        "city": sub.city,
        "instagram_url": sub.instagram_url,
        "website_url": sub.website_url,
        "contact_name": sub.contact_name,
        "contact_email": sub.contact_email,
        "submission_type": sub.submission_type,
        "notes": sub.notes,
        "status": sub.status,
        "matched_gym_id": sub.matched_gym_id,
        "reviewed_by_admin_id": sub.reviewed_by_admin_id,
        "reviewed_at": sub.reviewed_at,
        "created_at": sub.created_at,
    }


def _claim_dict(claim: GymClaim) -> dict:
    return {
        "id": claim.id,
        "gym_id": claim.gym_id,
        "requested_by_user_id": claim.requested_by_user_id,
        "role_requested": claim.role_requested,
        "evidence_type": claim.evidence_type,
        "evidence_url": claim.evidence_url,
        "notes": claim.notes,
        "status": claim.status,
        "reviewed_by_admin_id": claim.reviewed_by_admin_id,
        "reviewed_at": claim.reviewed_at,
        "created_at": claim.created_at,
    }


def _admin_gym_dict(
    gym: Gym,
    *,
    approved_members: int = 0,
    pending_claims: int = 0,
    active_staff: int = 0,
) -> dict:
    return {
        **_gym_dict(gym),
        "approved_members": approved_members,
        "pending_claims": pending_claims,
        "active_staff": active_staff,
    }


def _gym_has_managed_roster(gym: Gym) -> bool:
    return gym.ownership_status in {
        GymOwnershipStatus.CLAIMED,
        GymOwnershipStatus.VERIFIED,
    }


def _gym_public_roster_statuses(gym: Gym) -> set[str]:
    return set(GymMembershipStatus.ACTIVE)


def _gym_public_athlete_count(gym: Gym, counts_by_status: dict[str, int]) -> int:
    return sum(
        counts_by_status.get(status, 0)
        for status in GymMembershipStatus.ACTIVE
    )


def _membership_dict(m: GymMembership) -> dict:
    return {
        "id": m.id,
        "gym_id": m.gym_id,
        "user_id": m.user_id,
        "membership_type": m.membership_type,
        "status": m.status,
        "is_primary": bool(m.is_primary),
        "visibility": m.visibility,
        "requested_at": m.requested_at,
        "approved_at": m.approved_at,
        "approved_by_user_id": m.approved_by_user_id,
        "ended_at": m.ended_at,
    }


def _delete_local_gym_asset(asset_url: str | None) -> None:
    if not asset_url or not asset_url.startswith("/uploads/gym_assets/"):
        return
    target = GYM_ASSET_DIR / asset_url.rsplit("/", 1)[-1]
    try:
        if target.exists():
            target.unlink()
    except OSError:
        pass


def _process_gym_asset(file: UploadFile, gym_id: int, asset_type: str) -> str:
    spec = GYM_ASSET_SPECS[asset_type]
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "El archivo debe ser una imagen")

    try:
        raw = file.file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "No se pudo procesar la imagen")

    if spec.get("mode") == "cover":
        width = spec["width"]
        height = spec["height"]
        src_w, src_h = image.size
        crop_size = min(src_w, src_h)
        left = int((src_w - crop_size) / 2)
        top = int((src_h - crop_size) / 2)
        image = image.crop((left, top, left + crop_size, top + crop_size))
        image = image.resize((width, height), Image.Resampling.LANCZOS)
        filename = f"gym_{gym_id}_{asset_type}_{uuid.uuid4().hex}.jpg"
        image.save(GYM_ASSET_DIR / filename, format="JPEG", quality=84, optimize=True)
        return f"/uploads/gym_assets/{filename}"

    max_width = 1600
    src_w, src_h = image.size
    if src_w > max_width:
        target_height = int(src_h * (max_width / src_w))
        image = image.resize((max_width, target_height), Image.Resampling.LANCZOS)
    filename = f"gym_{gym_id}_{asset_type}_{uuid.uuid4().hex}.jpg"
    image.save(GYM_ASSET_DIR / filename, format="JPEG", quality=86, optimize=True)
    return f"/uploads/gym_assets/{filename}"


# ── Submissions: users suggest new gyms ───────────────────────────────────────

@router.post("/api/gym-submissions", status_code=201)
def create_gym_submission(
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    proposed_name = str(body.get("proposed_name") or "").strip()
    if not proposed_name:
        raise HTTPException(400, "El nombre del gym es requerido")

    city = str(body.get("city") or "").strip() or None
    force = bool(body.get("force_submit"))

    if not force:
        duplicates = find_duplicate_candidates(session, proposed_name, city)
        if duplicates:
            return {"ok": False, "duplicate_candidates": duplicates}

    user_id = get_user_id(user)
    sub = GymSubmission(
        submitted_by_user_id=user_id,
        proposed_name=proposed_name,
        country=str(body.get("country") or "").strip() or None,
        state_region=str(body.get("state_region") or "").strip() or None,
        city=city,
        instagram_url=str(body.get("instagram_url") or "").strip() or None,
        website_url=str(body.get("website_url") or "").strip() or None,
        contact_name=str(body.get("contact_name") or "").strip() or None,
        contact_email=str(body.get("contact_email") or "").strip() or None,
        submission_type=str(body.get("submission_type") or "suggest"),
        notes=str(body.get("notes") or "").strip() or None,
        status=GymSubmissionStatus.PENDING,
    )
    session.add(sub)
    session.commit()
    session.refresh(sub)
    return {"ok": True, "submission": _submission_dict(sub)}


@router.get("/api/gym-submissions/check-duplicates")
def check_gym_duplicates(
    name: str,
    city: str = "",
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    return {"candidates": find_duplicate_candidates(session, name, city or None)}


# ── Admin: submissions queue ───────────────────────────────────────────────────

@router.get("/api/admin/gym-submissions")
def admin_list_submissions(
    status: str = "pending",
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    query = select(GymSubmission)
    if status != "all":
        query = query.where(GymSubmission.status == status)
    rows = session.exec(query.order_by(GymSubmission.created_at.desc())).all()
    return [_submission_dict(r) for r in rows]


@router.post("/api/admin/gym-submissions/{submission_id}/approve", status_code=200)
def admin_approve_submission(
    submission_id: int,
    body: dict = Body(default={}),
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    sub = session.get(GymSubmission, submission_id)
    if not sub:
        raise HTTPException(404, "Submission no encontrada")
    if sub.status != GymSubmissionStatus.PENDING:
        raise HTTPException(409, "Esta submission ya fue procesada")

    admin_user_id = get_user_id(user)
    display_name = str(body.get("display_name") or sub.proposed_name).strip()
    slug = make_unique_slug(session, display_name)

    gym = Gym(
        slug=slug,
        display_name=display_name,
        status=GymStatus.PUBLISHED,
        ownership_status=GymOwnershipStatus.UNCLAIMED,
        country=sub.country,
        state_region=sub.state_region,
        city=sub.city,
        instagram_url=sub.instagram_url,
        website_url=sub.website_url,
        contact_email=sub.contact_email,
        created_by_user_id=sub.submitted_by_user_id,
        published_at=utcnow(),
    )
    session.add(gym)
    session.flush()

    sub.status = GymSubmissionStatus.APPROVED
    sub.matched_gym_id = gym.id
    sub.reviewed_by_admin_id = admin_user_id
    sub.reviewed_at = utcnow()
    session.add(sub)

    log_gym_action(session, gym.id, admin_user_id, "submission:approved",
                   after={"from_submission_id": sub.id})
    session.commit()
    session.refresh(gym)
    return {"ok": True, "gym": _gym_dict(gym)}


@router.post("/api/admin/gym-submissions/{submission_id}/reject", status_code=200)
def admin_reject_submission(
    submission_id: int,
    body: dict = Body(default={}),
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    sub = session.get(GymSubmission, submission_id)
    if not sub:
        raise HTTPException(404, "Submission no encontrada")
    if sub.status != GymSubmissionStatus.PENDING:
        raise HTTPException(409, "Esta submission ya fue procesada")

    admin_user_id = get_user_id(user)
    sub.status = GymSubmissionStatus.REJECTED
    sub.reviewed_by_admin_id = admin_user_id
    sub.reviewed_at = utcnow()
    if body.get("notes"):
        sub.notes = (sub.notes or "") + f"\n[Admin] {body['notes']}"
    session.add(sub)
    session.commit()
    return {"ok": True}


# ── Admin: gym status transitions ──────────────────────────────────────────────

@router.post("/api/admin/gyms/{gym_id}/status", status_code=200)
def admin_transition_gym_status(
    gym_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    gym = session.get(Gym, gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")
    new_status = str(body.get("status") or "").strip()
    if not new_status:
        raise HTTPException(400, "El campo 'status' es requerido")
    admin_user_id = get_user_id(user)
    transition_gym_status(session, gym, new_status, admin_user_id)
    session.commit()
    session.refresh(gym)
    return {"ok": True, "gym": _gym_dict(gym)}


# ── Claims: users claim ownership ─────────────────────────────────────────────

@router.post("/api/gyms/{gym_id}/claims", status_code=201)
def create_gym_claim(
    gym_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    gym = session.get(Gym, gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")
    if gym.status not in {GymStatus.PUBLISHED, GymStatus.DRAFT}:
        raise HTTPException(409, "Solo se puede reclamar un gym publicado")
    if gym.ownership_status == GymOwnershipStatus.VERIFIED:
        raise HTTPException(409, "Este gym ya tiene un owner verificado")

    user_id = get_user_id(user)

    existing = session.exec(
        select(GymClaim)
        .where(GymClaim.gym_id == gym_id)
        .where(GymClaim.requested_by_user_id == user_id)
        .where(GymClaim.status == GymClaimStatus.PENDING)
    ).first()
    if existing:
        raise HTTPException(409, "Ya tienes un claim pendiente para este gym")

    claim = GymClaim(
        gym_id=gym_id,
        requested_by_user_id=user_id,
        role_requested=str(body.get("role_requested") or "owner"),
        evidence_type=str(body.get("evidence_type") or "").strip() or None,
        evidence_url=str(body.get("evidence_url") or "").strip() or None,
        notes=str(body.get("notes") or "").strip() or None,
        status=GymClaimStatus.PENDING,
    )
    session.add(claim)

    if gym.ownership_status == GymOwnershipStatus.UNCLAIMED:
        gym.ownership_status = GymOwnershipStatus.CLAIM_PENDING
        session.add(gym)

    log_gym_action(session, gym_id, user_id, "claim:submitted")
    session.commit()
    session.refresh(claim)
    return {"ok": True, "claim": _claim_dict(claim)}


@router.get("/api/admin/gym-claims")
def admin_list_claims(
    status: str = "pending",
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    query = select(GymClaim)
    if status != "all":
        query = query.where(GymClaim.status == status)
    rows = session.exec(query.order_by(GymClaim.created_at.desc())).all()
    gym_ids = list({row.gym_id for row in rows})
    user_ids = list({row.requested_by_user_id for row in rows})
    gyms = {gym.id: gym for gym in session.exec(select(Gym).where(Gym.id.in_(gym_ids))).all()} if gym_ids else {}
    users = {member.id: member for member in session.exec(select(User).where(User.id.in_(user_ids))).all()} if user_ids else {}
    return [
        {
            **_claim_dict(row),
            "gym_slug": gyms.get(row.gym_id).slug if row.gym_id in gyms else None,
            "gym_display_name": gyms.get(row.gym_id).display_name if row.gym_id in gyms else None,
            "requester_display_name": (
                users.get(row.requested_by_user_id).display_name
                or f"{users.get(row.requested_by_user_id).nombre} {users.get(row.requested_by_user_id).apellido}"
            ) if row.requested_by_user_id in users else None,
            "requester_email": users.get(row.requested_by_user_id).email if row.requested_by_user_id in users else None,
        }
        for row in rows
    ]


@router.post("/api/admin/gym-claims/{claim_id}/approve", status_code=200)
def admin_approve_claim(
    claim_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    claim = session.get(GymClaim, claim_id)
    if not claim:
        raise HTTPException(404, "Claim no encontrado")
    admin_user_id = get_user_id(user)
    approve_gym_claim(session, claim, admin_user_id)
    session.commit()
    return {"ok": True, "claim": _claim_dict(claim)}


@router.post("/api/admin/gym-claims/{claim_id}/reject", status_code=200)
def admin_reject_claim(
    claim_id: int,
    body: dict = Body(default={}),
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    claim = session.get(GymClaim, claim_id)
    if not claim:
        raise HTTPException(404, "Claim no encontrado")
    admin_user_id = get_user_id(user)
    reject_gym_claim(session, claim, admin_user_id, note=body.get("notes"))

    # If no more pending claims, revert gym ownership_status to unclaimed
    gym = session.get(Gym, claim.gym_id)
    if gym and gym.ownership_status == GymOwnershipStatus.CLAIM_PENDING:
        remaining = session.exec(
            select(GymClaim)
            .where(GymClaim.gym_id == claim.gym_id)
            .where(GymClaim.status == GymClaimStatus.PENDING)
        ).first()
        if not remaining:
            gym.ownership_status = GymOwnershipStatus.UNCLAIMED
            session.add(gym)

    session.commit()
    return {"ok": True}


# ── Memberships: athletes affiliate to a gym ──────────────────────────────────

@router.post("/api/gyms/{gym_id}/memberships", status_code=201)
def request_gym_membership(
    gym_id: int,
    body: dict = Body(default={}),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    gym = session.get(Gym, gym_id)
    if not gym or gym.status != GymStatus.PUBLISHED:
        raise HTTPException(404, "Gym no encontrado")

    user_id = get_user_id(user)

    active_same_gym = session.exec(
        select(GymMembership)
        .where(GymMembership.gym_id == gym_id)
        .where(GymMembership.user_id == user_id)
        .where(GymMembership.status.in_(list(GymMembershipStatus.ACTIVE)))
    ).first()
    if active_same_gym:
        raise HTTPException(409, "Ya tienes una afiliacion activa o pendiente en este gym")

    active_other_gym = session.exec(
        select(GymMembership, Gym)
        .join(Gym, GymMembership.gym_id == Gym.id)
        .where(GymMembership.user_id == user_id)
        .where(GymMembership.status.in_(list(GymMembershipStatus.ACTIVE)))
        .order_by(GymMembership.is_primary.desc(), GymMembership.requested_at.desc())
    ).first()
    if active_other_gym:
        membership, current_gym = active_other_gym
        if membership.gym_id != gym_id:
            current_name = current_gym.display_name or "tu gym actual"
            raise HTTPException(
                409,
                f"Solo puedes representar un gym a la vez. Sal de {current_name} antes de elegir otro.",
            )

    is_primary = bool(body.get("is_primary", False))
    if is_primary:
        clear_primary_memberships(session, user_id)

    # If gym is verified, membership goes to pending_approval; otherwise declared
    initial_status = (
        GymMembershipStatus.PENDING_APPROVAL
        if gym.ownership_status == GymOwnershipStatus.VERIFIED
        else GymMembershipStatus.DECLARED
    )

    membership = GymMembership(
        gym_id=gym_id,
        user_id=user_id,
        membership_type=str(body.get("membership_type") or "athlete"),
        status=initial_status,
        is_primary=1 if is_primary else 0,
        visibility=str(body.get("visibility") or "public"),
    )
    session.add(membership)
    log_gym_action(session, gym_id, user_id, "membership:requested")
    session.commit()
    session.refresh(membership)
    return {"ok": True, "membership": _membership_dict(membership)}


@router.get("/api/gyms/{gym_id}/memberships")
def list_gym_memberships(
    gym_id: int,
    status: str = "all",
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    gym = session.get(Gym, gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")

    if not is_admin_user(user) and not is_gym_owner_or_manager(session, gym_id, user_id):
        raise HTTPException(403, "Solo el staff del gym o un admin puede ver las afiliaciones")

    query = select(GymMembership).where(GymMembership.gym_id == gym_id)
    if status != "all":
        query = query.where(GymMembership.status == status)
    rows = session.exec(query.order_by(GymMembership.requested_at.desc())).all()
    return [_membership_dict(r) for r in rows]


@router.post("/api/gyms/{gym_id}/memberships/{membership_id}/approve", status_code=200)
def approve_gym_membership(
    gym_id: int,
    membership_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    if not is_admin_user(user):
        require_gym_manager(session, gym_id, user_id)

    membership = session.get(GymMembership, membership_id)
    if not membership or membership.gym_id != gym_id:
        raise HTTPException(404, "Afiliacion no encontrada")

    transition_membership_status(
        session, membership, GymMembershipStatus.APPROVED, user_id, approved_by_user_id=user_id
    )
    session.commit()
    return {"ok": True, "membership": _membership_dict(membership)}


@router.post("/api/gyms/{gym_id}/memberships/{membership_id}/reject", status_code=200)
def reject_gym_membership(
    gym_id: int,
    membership_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    if not is_admin_user(user):
        require_gym_manager(session, gym_id, user_id)

    membership = session.get(GymMembership, membership_id)
    if not membership or membership.gym_id != gym_id:
        raise HTTPException(404, "Afiliacion no encontrada")

    transition_membership_status(session, membership, GymMembershipStatus.REJECTED, user_id)
    session.commit()
    return {"ok": True, "membership": _membership_dict(membership)}


@router.delete("/api/gyms/{gym_id}/memberships/{membership_id}", status_code=200)
def remove_gym_membership(
    gym_id: int,
    membership_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    membership = session.get(GymMembership, membership_id)
    if not membership or membership.gym_id != gym_id:
        raise HTTPException(404, "Afiliacion no encontrada")

    is_self = membership.user_id == user_id
    is_manager = is_gym_owner_or_manager(session, gym_id, user_id)
    if not is_self and not is_manager and not is_admin_user(user):
        raise HTTPException(403, "No tienes permiso para eliminar esta afiliacion")

    transition_membership_status(session, membership, GymMembershipStatus.REMOVED, user_id)
    session.commit()
    return {"ok": True}


# ── Gym manager: edit profile ─────────────────────────────────────────────────

_MANAGER_EDITABLE = {
    "short_description", "full_description", "logo_url", "cover_image_url",
    "primary_color", "accent_color", "website_url", "instagram_url",
    "whatsapp_url", "contact_email", "contact_phone", "head_coach_name",
    "founded_year",
}
_OWNER_EDITABLE = _MANAGER_EDITABLE | {"display_name", "legal_name"}
_ADMIN_EDITABLE = _OWNER_EDITABLE | {
    "country", "state_region", "city", "address_line",
    "is_featured", "is_franchise", "verification_badge", "plan_tier",
}


@router.patch("/api/gyms/{gym_id}", status_code=200)
def update_gym(
    gym_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    gym = session.get(Gym, gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")

    user_id = get_user_id(user)
    admin = is_admin_user(user)
    staff_entry = get_gym_staff_entry(session, gym_id, user_id) if not admin else None

    if not admin and not staff_entry:
        raise HTTPException(403, "Solo el staff del gym o un admin puede editar")

    if admin:
        allowed = _ADMIN_EDITABLE
    elif staff_entry and staff_entry.role == GymStaffRole.OWNER:
        allowed = _OWNER_EDITABLE
    else:
        allowed = _MANAGER_EDITABLE

    before = {f: getattr(gym, f) for f in allowed if hasattr(gym, f)}
    changed = False
    for field, value in body.items():
        if field in allowed and hasattr(gym, field):
            setattr(gym, field, value)
            changed = True

    if not changed:
        return {"ok": True, "gym": _gym_dict(gym)}

    after = {f: getattr(gym, f) for f in allowed if hasattr(gym, f)}
    session.add(gym)
    log_gym_action(session, gym_id, user_id, "gym:updated", before, after)
    session.commit()
    session.refresh(gym)
    return {"ok": True, "gym": _gym_dict(gym)}


@router.post("/api/gyms/{gym_id}/assets", status_code=200)
def upload_gym_asset(
    gym_id: int,
    asset_type: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    if not is_admin_user(user):
        require_gym_manager(session, gym_id, user_id)

    gym = session.get(Gym, gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")

    spec = GYM_ASSET_SPECS.get(asset_type)
    if not spec:
        raise HTTPException(400, "asset_type invalido")

    field_name = spec["field"]
    previous_asset = getattr(gym, field_name, None)
    new_asset = _process_gym_asset(file, gym_id, asset_type)
    setattr(gym, field_name, new_asset)
    session.add(gym)
    session.commit()
    session.refresh(gym)
    _delete_local_gym_asset(previous_asset)
    log_gym_action(session, gym_id, user_id, f"gym_asset:{asset_type}_updated")
    session.commit()
    return {"ok": True, "asset_type": asset_type, "url": new_asset, "gym": _gym_dict(gym)}


@router.delete("/api/gyms/{gym_id}/assets", status_code=200)
def delete_gym_asset(
    gym_id: int,
    asset_type: str,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    if not is_admin_user(user):
        require_gym_manager(session, gym_id, user_id)

    gym = session.get(Gym, gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")

    spec = GYM_ASSET_SPECS.get(asset_type)
    if not spec:
        raise HTTPException(400, "asset_type invalido")

    field_name = spec["field"]
    previous_asset = getattr(gym, field_name, None)
    setattr(gym, field_name, None)
    session.add(gym)
    session.commit()
    session.refresh(gym)
    _delete_local_gym_asset(previous_asset)
    log_gym_action(session, gym_id, user_id, f"gym_asset:{asset_type}_deleted")
    session.commit()
    return {"ok": True, "asset_type": asset_type, "gym": _gym_dict(gym)}


# ── Gym manager: staff management ─────────────────────────────────────────────

@router.get("/api/gyms/{gym_id}/staff")
def list_gym_staff(
    gym_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    gym = session.get(Gym, gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")
    if not is_admin_user(user) and not is_gym_owner_or_manager(session, gym_id, user_id):
        raise HTTPException(403, "Acceso restringido al staff del gym")

    rows = session.exec(
        select(GymStaff, User)
        .join(User, GymStaff.user_id == User.id)
        .where(GymStaff.gym_id == gym_id)
        .order_by(GymStaff.created_at.asc())
    ).all()

    return [
        {
            "id": staff.id,
            "user_id": staff.user_id,
            "display_name": user.display_name or f"{user.nombre} {user.apellido}",
            "email": user.email,
            "profile_photo_url": user.profile_photo_url,
            "role": staff.role,
            "status": staff.status,
            "permissions_scope": staff.permissions_scope,
            "created_at": staff.created_at,
        }
        for staff, user in rows
    ]


@router.post("/api/gyms/{gym_id}/staff", status_code=201)
def add_gym_staff(
    gym_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    if not is_admin_user(user):
        require_gym_manager(session, gym_id, user_id)

    gym = session.get(Gym, gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")

    target_user_id = body.get("user_id")
    email = str(body.get("email") or "").strip().lower() or None

    target: User | None = None
    if target_user_id:
        target = session.get(User, int(target_user_id))
    elif email:
        target = session.exec(select(User).where(User.email == email)).first()

    if not target:
        raise HTTPException(404, "Usuario no encontrado")

    existing = get_gym_staff_entry(session, gym_id, target.id)
    if existing:
        raise HTTPException(409, "Este usuario ya es staff del gym")

    role = str(body.get("role") or GymStaffRole.COACH)
    if role not in GymStaffRole.ALL:
        raise HTTPException(400, f"Rol invalido. Opciones: {', '.join(GymStaffRole.ALL)}")

    # Only admin can assign owner role
    if role == GymStaffRole.OWNER and not is_admin_user(user):
        raise HTTPException(403, "Solo un admin puede asignar el rol de owner")

    staff = GymStaff(gym_id=gym_id, user_id=target.id, role=role, status="active")
    session.add(staff)
    log_gym_action(session, gym_id, user_id, "staff:added",
                   after={"user_id": target.id, "role": role})
    session.commit()
    session.refresh(staff)
    return {
        "ok": True,
        "staff": {
            "id": staff.id,
            "user_id": staff.user_id,
            "display_name": target.display_name or f"{target.nombre} {target.apellido}",
            "email": target.email,
            "role": staff.role,
            "status": staff.status,
        },
    }


@router.patch("/api/gyms/{gym_id}/staff/{staff_id}", status_code=200)
def update_gym_staff(
    gym_id: int,
    staff_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    if not is_admin_user(user):
        require_gym_manager(session, gym_id, user_id)

    staff = session.get(GymStaff, staff_id)
    if not staff or staff.gym_id != gym_id:
        raise HTTPException(404, "Staff no encontrado")

    new_role = body.get("role")
    new_status = body.get("status")

    if new_role:
        if new_role not in GymStaffRole.ALL:
            raise HTTPException(400, "Rol invalido")
        if new_role == GymStaffRole.OWNER and not is_admin_user(user):
            raise HTTPException(403, "Solo un admin puede asignar el rol de owner")
        staff.role = new_role

    if new_status and new_status in {"active", "inactive"}:
        staff.status = new_status

    session.add(staff)
    log_gym_action(session, gym_id, user_id, "staff:updated",
                   after={"staff_id": staff_id, "role": staff.role, "status": staff.status})
    session.commit()
    return {"ok": True, "role": staff.role, "status": staff.status}


@router.delete("/api/gyms/{gym_id}/staff/{staff_id}", status_code=200)
def remove_gym_staff(
    gym_id: int,
    staff_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    if not is_admin_user(user):
        require_gym_manager(session, gym_id, user_id)

    staff = session.get(GymStaff, staff_id)
    if not staff or staff.gym_id != gym_id:
        raise HTTPException(404, "Staff no encontrado")

    if staff.role == GymStaffRole.OWNER and not is_admin_user(user):
        raise HTTPException(403, "No se puede remover al owner")

    session.delete(staff)
    log_gym_action(session, gym_id, user_id, "staff:removed",
                   before={"user_id": staff.user_id, "role": staff.role})
    session.commit()
    return {"ok": True}


# ── Gym manager: locations ─────────────────────────────────────────────────────

@router.get("/api/gyms/{gym_id}/locations")
def list_gym_locations(
    gym_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    if not is_admin_user(user):
        require_gym_manager(session, gym_id, user_id)

    gym = session.get(Gym, gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")

    locations = session.exec(
        select(GymLocation)
        .where(GymLocation.gym_id == gym_id)
        .order_by(GymLocation.is_primary.desc(), GymLocation.id.asc())
    ).all()

    return {
        "items": [
            {
                "id": loc.id,
                "name": loc.name,
                "country": loc.country,
                "state_region": loc.state_region,
                "city": loc.city,
                "address_line": loc.address_line,
                "contact_phone": loc.contact_phone,
                "schedule_summary": loc.schedule_summary,
                "is_primary": bool(loc.is_primary),
                "status": loc.status,
            }
            for loc in locations
        ]
    }


@router.post("/api/gyms/{gym_id}/locations", status_code=201)
def add_gym_location(
    gym_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    if not is_admin_user(user):
        require_gym_manager(session, gym_id, user_id)

    gym = session.get(Gym, gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")

    loc = GymLocation(
        gym_id=gym_id,
        name=str(body.get("name") or "").strip() or None,
        country=str(body.get("country") or "").strip() or None,
        state_region=str(body.get("state_region") or "").strip() or None,
        city=str(body.get("city") or "").strip() or None,
        address_line=str(body.get("address_line") or "").strip() or None,
        contact_phone=str(body.get("contact_phone") or "").strip() or None,
        schedule_summary=str(body.get("schedule_summary") or "").strip() or None,
        is_primary=1 if body.get("is_primary") else 0,
        status="active",
    )
    session.add(loc)
    log_gym_action(session, gym_id, user_id, "location:added")
    session.commit()
    session.refresh(loc)
    return {"ok": True, "location": {"id": loc.id, "name": loc.name, "city": loc.city}}


@router.patch("/api/gyms/{gym_id}/locations/{loc_id}", status_code=200)
def update_gym_location(
    gym_id: int,
    loc_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    if not is_admin_user(user):
        require_gym_manager(session, gym_id, user_id)

    loc = session.get(GymLocation, loc_id)
    if not loc or loc.gym_id != gym_id:
        raise HTTPException(404, "Sede no encontrada")

    for field in ("name", "country", "state_region", "city", "address_line",
                  "contact_phone", "schedule_summary", "is_primary", "status"):
        if field in body:
            setattr(loc, field, body[field])

    session.add(loc)
    session.commit()
    return {"ok": True}


@router.delete("/api/gyms/{gym_id}/locations/{loc_id}", status_code=200)
def delete_gym_location(
    gym_id: int,
    loc_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    if not is_admin_user(user):
        require_gym_manager(session, gym_id, user_id)

    loc = session.get(GymLocation, loc_id)
    if not loc or loc.gym_id != gym_id:
        raise HTTPException(404, "Sede no encontrada")

    session.delete(loc)
    session.commit()
    return {"ok": True}


# ── Me: gyms where I am staff ─────────────────────────────────────────────────

@router.get("/api/me/managed-gyms")
def my_managed_gyms(
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    rows = session.exec(
        select(GymStaff, Gym)
        .join(Gym, GymStaff.gym_id == Gym.id)
        .where(GymStaff.user_id == user_id)
        .where(GymStaff.status == "active")
    ).all()
    return [
        {**_gym_dict(gym), "my_role": staff.role}
        for staff, gym in rows
    ]


@router.get("/api/admin/gyms")
def list_gyms_admin(
    status: str = Query(default="all"),
    q: str = Query(default=""),
    country: str = Query(default=""),
    city: str = Query(default=""),
    ownership_status: str = Query(default=""),
    limit: int = Query(default=100, le=250),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    query = select(Gym)

    if status != "all":
        query = query.where(Gym.status == status)
    if q:
        like = f"%{q}%"
        query = query.where(
            Gym.display_name.ilike(like) |
            Gym.slug.ilike(like) |
            Gym.city.ilike(like)
        )
    if country:
        query = query.where(Gym.country.ilike(f"%{country}%"))
    if city:
        query = query.where(Gym.city.ilike(f"%{city}%"))
    if ownership_status:
        query = query.where(Gym.ownership_status == ownership_status)

    query = query.order_by(Gym.updated_at.desc(), Gym.created_at.desc())

    total = session.exec(select(func.count()).select_from(query.subquery())).one()
    gyms = session.exec(query.offset(offset).limit(limit)).all()

    gym_ids = [gym.id for gym in gyms]
    approved_members_by_gym: dict[int, int] = {}
    pending_claims_by_gym: dict[int, int] = {}
    active_staff_by_gym: dict[int, int] = {}

    if gym_ids:
        approved_rows = session.exec(
            select(GymMembership.gym_id, func.count(GymMembership.id))
            .where(GymMembership.gym_id.in_(gym_ids))
            .where(GymMembership.status == GymMembershipStatus.APPROVED)
            .group_by(GymMembership.gym_id)
        ).all()
        approved_members_by_gym = {gym_id: count for gym_id, count in approved_rows}

        claim_rows = session.exec(
            select(GymClaim.gym_id, func.count(GymClaim.id))
            .where(GymClaim.gym_id.in_(gym_ids))
            .where(GymClaim.status == GymClaimStatus.PENDING)
            .group_by(GymClaim.gym_id)
        ).all()
        pending_claims_by_gym = {gym_id: count for gym_id, count in claim_rows}

        staff_rows = session.exec(
            select(GymStaff.gym_id, func.count(GymStaff.id))
            .where(GymStaff.gym_id.in_(gym_ids))
            .where(GymStaff.status == "active")
            .group_by(GymStaff.gym_id)
        ).all()
        active_staff_by_gym = {gym_id: count for gym_id, count in staff_rows}

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [
            _admin_gym_dict(
                gym,
                approved_members=approved_members_by_gym.get(gym.id, 0),
                pending_claims=pending_claims_by_gym.get(gym.id, 0),
                active_staff=active_staff_by_gym.get(gym.id, 0),
            )
            for gym in gyms
        ],
    }


# ── Public directory ───────────────────────────────────────────────────────────

@router.get("/api/gyms")
def list_gyms_public(
    q: str = Query(default=""),
    country: str = Query(default=""),
    city: str = Query(default=""),
    ownership_status: str = Query(default=""),
    limit: int = Query(default=40, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    query = select(Gym).where(Gym.status == GymStatus.PUBLISHED)

    if q:
        query = query.where(Gym.display_name.ilike(f"%{q}%"))
    if country:
        query = query.where(Gym.country.ilike(f"%{country}%"))
    if city:
        query = query.where(Gym.city.ilike(f"%{city}%"))
    if ownership_status:
        query = query.where(Gym.ownership_status == ownership_status)

    query = query.order_by(Gym.is_featured.desc(), Gym.published_at.desc())

    total = session.exec(
        select(func.count()).select_from(query.subquery())
    ).one()

    gyms = session.exec(query.offset(offset).limit(limit)).all()

    gym_ids = [g.id for g in gyms]
    counts_by_gym: dict[int, dict[str, int]] = {}
    if gym_ids:
        rows = session.exec(
            select(GymMembership.gym_id, GymMembership.status, func.count(GymMembership.id))
            .where(GymMembership.gym_id.in_(gym_ids))
            .where(GymMembership.visibility == "public")
            .where(GymMembership.status.in_(tuple(GymMembershipStatus.ACTIVE)))
            .group_by(GymMembership.gym_id, GymMembership.status)
        ).all()
        for gym_id, status, count in rows:
            counts_by_gym.setdefault(gym_id, {})[status] = count

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [
            {
                **_gym_dict(g),
                "approved_members": counts_by_gym.get(g.id, {}).get(GymMembershipStatus.APPROVED, 0),
                "athlete_count": _gym_public_athlete_count(g, counts_by_gym.get(g.id, {})),
                "roster_scope": "official" if _gym_has_managed_roster(g) else "linked",
            }
            for g in gyms
        ],
    }


@router.get("/api/gyms/{slug}")
def get_gym_public(
    slug: str,
    session: Session = Depends(get_session),
):
    gym = session.exec(select(Gym).where(Gym.slug == slug)).first()
    if not gym or gym.status != GymStatus.PUBLISHED:
        raise HTTPException(404, "Gym no encontrado")

    locations = session.exec(
        select(GymLocation)
        .where(GymLocation.gym_id == gym.id)
        .where(GymLocation.status == "active")
        .order_by(GymLocation.is_primary.desc())
    ).all()

    staff_rows = session.exec(
        select(GymStaff, User)
        .join(User, GymStaff.user_id == User.id)
        .where(GymStaff.gym_id == gym.id)
        .where(GymStaff.status == "active")
    ).all()

    staff_list = [
        {
            "user_id": staff.user_id,
            "username": user.username,
            "role": staff.role,
            "display_name": user.display_name or f"{user.nombre} {user.apellido}",
            "profile_photo_url": user.profile_photo_url,
        }
        for staff, user in staff_rows
    ]

    membership_counts = session.exec(
        select(GymMembership.status, func.count(GymMembership.id))
        .where(GymMembership.gym_id == gym.id)
        .where(GymMembership.visibility == "public")
        .where(GymMembership.status.in_(tuple(GymMembershipStatus.ACTIVE)))
        .group_by(GymMembership.status)
    ).all()
    counts_by_status = {status: count for status, count in membership_counts}

    roster_statuses = tuple(_gym_public_roster_statuses(gym))
    roster_members = session.exec(
        select(GymMembership, User)
        .join(User, GymMembership.user_id == User.id)
        .where(GymMembership.gym_id == gym.id)
        .where(GymMembership.status.in_(roster_statuses))
        .where(GymMembership.visibility == "public")
        .order_by(
            GymMembership.is_primary.desc(),
            func.coalesce(GymMembership.approved_at, GymMembership.requested_at).desc(),
        )
        .limit(50)
    ).all()

    roster = [
        {
            "user_id": m.user_id,
            "username": user.username,
            "display_name": user.display_name or f"{user.nombre} {user.apellido}",
            "profile_photo_url": user.profile_photo_url,
            "categoria": user.categoria,
            "is_primary": bool(m.is_primary),
            "status": m.status,
        }
        for m, user in roster_members
    ]

    return {
        **_gym_dict(gym),
        "full_description": gym.full_description,
        "legal_name": gym.legal_name,
        "address_line": gym.address_line,
        "geo_lat": gym.geo_lat,
        "geo_lng": gym.geo_lng,
        "whatsapp_url": gym.whatsapp_url,
        "contact_email": gym.contact_email,
        "contact_phone": gym.contact_phone,
        "head_coach_name": gym.head_coach_name,
        "primary_color": gym.primary_color,
        "accent_color": gym.accent_color,
        "founded_year": gym.founded_year,
        "is_franchise": bool(gym.is_franchise),
        "locations": [
            {
                "id": loc.id,
                "name": loc.name,
                "city": loc.city,
                "state_region": loc.state_region,
                "country": loc.country,
                "address_line": loc.address_line,
                "contact_phone": loc.contact_phone,
                "schedule_summary": loc.schedule_summary,
                "is_primary": bool(loc.is_primary),
            }
            for loc in locations
        ],
        "staff": staff_list,
        "roster": roster,
        "athlete_count": _gym_public_athlete_count(gym, counts_by_status),
        "roster_scope": "official" if _gym_has_managed_roster(gym) else "linked",
        "member_counts": counts_by_status,
    }


# ── Me: own memberships ────────────────────────────────────────────────────────

@router.get("/api/me/gym-memberships")
def my_gym_memberships(
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_user_id(user)
    rows = session.exec(
        select(GymMembership)
        .where(GymMembership.user_id == user_id)
        .order_by(GymMembership.is_primary.desc(), GymMembership.requested_at.desc())
    ).all()
    gym_ids = list({r.gym_id for r in rows})
    gyms = {g.id: g for g in session.exec(select(Gym).where(Gym.id.in_(gym_ids))).all()} if gym_ids else {}
    result = []
    for r in rows:
        d = _membership_dict(r)
        gym = gyms.get(r.gym_id)
        if gym:
            d["gym_display_name"] = gym.display_name
            d["gym_slug"] = gym.slug
            d["gym_city"] = gym.city
            d["gym_ownership_status"] = gym.ownership_status
        result.append(d)
    return result


# ── Reports: users flag incorrect info ────────────────────────────────────────

VALID_REPORT_CATEGORIES = {"wrong_info", "closed", "duplicate", "other"}


@router.post("/api/gyms/{gym_id}/reports", status_code=201)
def create_gym_report(
    gym_id: int,
    body: dict = Body(...),
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    gym = session.get(Gym, gym_id)
    if not gym or gym.status not in GymStatus.PUBLIC:
        raise HTTPException(404, "Gym no encontrado")

    category = body.get("category", "wrong_info")
    if category not in VALID_REPORT_CATEGORIES:
        raise HTTPException(422, "Categoría inválida")

    report = GymReport(
        gym_id=gym_id,
        reported_by_user_id=get_user_id(user),
        category=category,
        details=str(body.get("details", ""))[:1000] or None,
        status="pending",
    )
    session.add(report)
    session.commit()
    return {"ok": True, "id": report.id}


@router.get("/api/admin/gym-reports")
def list_gym_reports(
    status: str = Query(default="pending"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    q = select(GymReport)
    if status != "all":
        q = q.where(GymReport.status == status)
    q = q.order_by(GymReport.created_at.desc()).offset(offset).limit(limit)
    reports = session.exec(q).all()

    gym_ids = list({r.gym_id for r in reports})
    gyms = {g.id: g for g in session.exec(select(Gym).where(Gym.id.in_(gym_ids))).all()} if gym_ids else {}

    return [
        {
            "id": r.id,
            "gym_id": r.gym_id,
            "gym_display_name": gyms.get(r.gym_id, Gym()).display_name if r.gym_id in gyms else None,
            "gym_slug": gyms.get(r.gym_id, Gym()).slug if r.gym_id in gyms else None,
            "reported_by_user_id": r.reported_by_user_id,
            "category": r.category,
            "details": r.details,
            "status": r.status,
            "resolved_by_admin_id": r.resolved_by_admin_id,
            "resolved_at": r.resolved_at,
            "created_at": r.created_at,
        }
        for r in reports
    ]


@router.post("/api/admin/gym-reports/{report_id}/resolve", status_code=200)
def resolve_gym_report(
    report_id: int,
    body: dict = Body(default={}),
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    report = session.get(GymReport, report_id)
    if not report:
        raise HTTPException(404, "Reporte no encontrado")
    resolution = body.get("resolution", "resolved")
    if resolution not in ("resolved", "dismissed"):
        resolution = "resolved"
    report.status = resolution
    report.resolved_by_admin_id = get_user_id(user)
    report.resolved_at = datetime.now(timezone.utc)
    session.add(report)
    session.commit()
    return {"ok": True}


# ── Merge: consolidate duplicate gyms ─────────────────────────────────────────

@router.post("/api/admin/gyms/{source_id}/merge-into/{target_id}", status_code=200)
def merge_gyms(
    source_id: int,
    target_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    if source_id == target_id:
        raise HTTPException(422, "No puedes hacer merge de un gym consigo mismo")

    source = session.get(Gym, source_id)
    target = session.get(Gym, target_id)
    if not source or not target:
        raise HTTPException(404, "Gym no encontrado")

    admin_id = get_user_id(user)

    # Move memberships — skip if user already has one in target
    existing_target_user_ids = {
        m.user_id for m in session.exec(
            select(GymMembership).where(GymMembership.gym_id == target_id)
        ).all()
    }
    for m in session.exec(select(GymMembership).where(GymMembership.gym_id == source_id)).all():
        if m.user_id in existing_target_user_ids:
            session.delete(m)
        else:
            m.gym_id = target_id
            session.add(m)

    # Move staff — skip duplicates
    existing_target_staff_user_ids = {
        s.user_id for s in session.exec(
            select(GymStaff).where(GymStaff.gym_id == target_id)
        ).all()
    }
    for s in session.exec(select(GymStaff).where(GymStaff.gym_id == source_id)).all():
        if s.user_id in existing_target_staff_user_ids:
            session.delete(s)
        else:
            s.gym_id = target_id
            session.add(s)

    # Move claims
    for c in session.exec(select(GymClaim).where(GymClaim.gym_id == source_id)).all():
        c.gym_id = target_id
        session.add(c)

    # Move reports
    for r in session.exec(select(GymReport).where(GymReport.gym_id == source_id)).all():
        r.gym_id = target_id
        session.add(r)

    # Migrate audit log entries
    for entry in session.exec(select(GymAuditLog).where(GymAuditLog.gym_id == source_id)).all():
        entry.gym_id = target_id
        session.add(entry)

    # Archive source and log the action
    source.status = GymStatus.ARCHIVED
    session.add(source)

    log = GymAuditLog(
        gym_id=target_id,
        actor_user_id=admin_id,
        action_type="merge",
        after_snapshot=f'{{"merged_from_gym_id": {source_id}, "source_display_name": "{source.display_name}"}}',
    )
    session.add(log)
    session.commit()
    return {"ok": True, "target_id": target_id, "source_archived": source_id}


# ── Admin: audit log for a gym ────────────────────────────────────────────────

@router.get("/api/admin/gyms/{gym_id}/audit-log")
def get_gym_audit_log(
    gym_id: int,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    gym = session.get(Gym, gym_id)
    if not gym:
        raise HTTPException(404, "Gym no encontrado")

    entries = session.exec(
        select(GymAuditLog)
        .where(GymAuditLog.gym_id == gym_id)
        .order_by(GymAuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    actor_ids = list({e.actor_user_id for e in entries if e.actor_user_id})
    actors = {u.id: u for u in session.exec(select(User).where(User.id.in_(actor_ids))).all()} if actor_ids else {}

    return {
        "gym_id": gym_id,
        "gym_display_name": gym.display_name,
        "entries": [
            {
                "id": e.id,
                "action_type": e.action_type,
                "actor_user_id": e.actor_user_id,
                "actor_name": f"{actors[e.actor_user_id].nombre} {actors[e.actor_user_id].apellido}" if e.actor_user_id and e.actor_user_id in actors else None,
                "before_snapshot": e.before_snapshot,
                "after_snapshot": e.after_snapshot,
                "created_at": e.created_at,
            }
            for e in entries
        ],
    }


# ── Admin: global audit log across all gyms ───────────────────────────────────

@router.get("/api/admin/gym-audit-log")
def get_global_gym_audit_log(
    gym_name: str = Query(default=""),
    action_type: str = Query(default=""),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    q = select(GymAuditLog)
    if action_type:
        q = q.where(GymAuditLog.action_type == action_type)
    q = q.order_by(GymAuditLog.created_at.desc()).offset(offset).limit(limit)
    entries = session.exec(q).all()

    gym_ids = list({e.gym_id for e in entries})
    gyms = {g.id: g for g in session.exec(select(Gym).where(Gym.id.in_(gym_ids))).all()} if gym_ids else {}

    if gym_name:
        name_lower = gym_name.lower()
        entries = [e for e in entries if name_lower in (gyms.get(e.gym_id, Gym()).display_name or "").lower()]

    actor_ids = list({e.actor_user_id for e in entries if e.actor_user_id})
    actors = {u.id: u for u in session.exec(select(User).where(User.id.in_(actor_ids))).all()} if actor_ids else {}

    return [
        {
            "id": e.id,
            "gym_id": e.gym_id,
            "gym_display_name": gyms.get(e.gym_id, Gym()).display_name if e.gym_id in gyms else None,
            "action_type": e.action_type,
            "actor_user_id": e.actor_user_id,
            "actor_name": f"{actors[e.actor_user_id].nombre} {actors[e.actor_user_id].apellido}" if e.actor_user_id and e.actor_user_id in actors else None,
            "before_snapshot": e.before_snapshot,
            "after_snapshot": e.after_snapshot,
            "created_at": e.created_at,
        }
        for e in entries
    ]
