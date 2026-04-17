from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import Session, select

from access import get_owned_competition_ids, is_organizer_user, require_competition_access
from auth import get_current_user_id, require_admin, require_staff
from database import get_session
from models import Competition, CompetitionWithdrawalRequest, WithdrawalRequestCreate, WithdrawalRequestReview

router = APIRouter(prefix="/api/finance", tags=["finance"])


def _normalize_amount(value: object) -> int:
    try:
        amount = int(value or 0)
    except Exception:
        amount = 0
    return max(0, amount)


def _coerce_int(value: object) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _to_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _enrollment_closed(competition: Competition) -> bool:
    now = datetime.now(timezone.utc)
    enrollment_end = _to_utc(competition.enrollment_end)
    if not bool(competition.enrollment_open):
        return True
    if enrollment_end and now >= enrollment_end:
        return True
    return False


def _competition_summary(session: Session, competition: Competition) -> dict:
    participants = session.exec(
        select(CompetitionWithdrawalRequest).where(CompetitionWithdrawalRequest.competition_id == competition.id)
    ).all()
    withdrawals = list(participants)

    _REVENUE_SQL = """
        SELECT
            COALESCE(SUM(CASE WHEN payment_status = 'approved' THEN payment_amount_total ELSE 0 END), 0) AS total_collected,
            COALESCE(SUM(CASE WHEN payment_status = 'approved' THEN payment_base_amount ELSE 0 END), 0) AS organizer_revenue,
            COALESCE(SUM(CASE WHEN payment_status = 'approved' THEN payment_platform_fee ELSE 0 END), 0) AS platform_revenue_gross,
            COALESCE(SUM(CASE WHEN payment_status = 'approved' THEN payment_processor_fee ELSE 0 END), 0) AS processor_fees,
            COALESCE(SUM(CASE WHEN payment_status = 'approved' THEN payment_platform_net ELSE 0 END), 0) AS platform_revenue_net,
            COALESCE(SUM(CASE WHEN payment_status = 'approved' THEN 1 ELSE 0 END), 0) AS approved_payments,
            COALESCE(SUM(CASE WHEN payment_status IN ('created', 'processing', 'pending') THEN 1 ELSE 0 END), 0) AS payments_in_progress
        FROM {table}
        WHERE competition_id = :competition_id
    """
    params = {"competition_id": competition.id}

    enrollment_rows = session.execute(
        text(_REVENUE_SQL.format(table="competition_participants")), params,
    ).mappings().first()

    ticketing_rows = session.execute(
        text(_REVENUE_SQL.format(table="spectator_ticket_orders")), params,
    ).mappings().first()

    def _sum_field(field: str) -> int:
        a = (enrollment_rows.get(field) if enrollment_rows else 0) or 0
        b = (ticketing_rows.get(field) if ticketing_rows else 0) or 0
        return int(a) + int(b)

    total_collected = _normalize_amount(_sum_field("total_collected"))
    organizer_revenue = _normalize_amount(_sum_field("organizer_revenue"))
    platform_revenue_gross = _normalize_amount(_sum_field("platform_revenue_gross"))
    processor_fees = _normalize_amount(_sum_field("processor_fees"))
    platform_revenue_net = _coerce_int(_sum_field("platform_revenue_net"))
    approved_payments = _sum_field("approved_payments")
    payments_in_progress = _sum_field("payments_in_progress")

    # Disbursement state: what happened with the organizer's payout
    paid_withdrawal = next((item for item in withdrawals if item.status == "paid"), None)
    pending_withdrawal = next((item for item in withdrawals if item.status in {"pending", "approved"}), None)
    paid_out_total = sum(
        _normalize_amount(item.amount) for item in withdrawals if item.status == "paid"
    )
    pending_withdrawals = sum(
        _normalize_amount(item.amount) for item in withdrawals if item.status in {"pending", "approved"}
    )
    available_balance = max(0, organizer_revenue - pending_withdrawals - paid_out_total)

    # disbursement_status: what the organizer should see
    if paid_withdrawal:
        disbursement_status = "paid"
    elif pending_withdrawal and pending_withdrawal.status == "approved":
        disbursement_status = "approved"
    elif pending_withdrawal:
        disbursement_status = "pending"
    else:
        disbursement_status = "none"

    # Admin-only metrics (full picture)
    organizer_balance_held = max(0, organizer_revenue - paid_out_total)
    expected_bold_balance = max(0, total_collected - processor_fees - paid_out_total)
    finalrep_available_balance = expected_bold_balance - organizer_balance_held
    event_started = bool(_to_utc(competition.competition_start) and datetime.now(timezone.utc) >= _to_utc(competition.competition_start))
    enrollment_closed = _enrollment_closed(competition)

    return {
        "competition_id": competition.id,
        "competition_name": competition.nombre,
        "enrollment_open": bool(competition.enrollment_open),
        "enrollment_end": competition.enrollment_end,
        "enrollment_closed": enrollment_closed,
        "withdrawal_request_allowed": enrollment_closed and available_balance > 0,
        "competition_start": competition.competition_start,
        "competition_end": competition.competition_end,
        # Organizer-facing: total collected + disbursement status only
        "total_collected": total_collected,
        "organizer_revenue": organizer_revenue,
        "approved_payments": approved_payments,
        "payments_in_progress": payments_in_progress,
        "disbursement_status": disbursement_status,       # none | pending | approved | paid
        "paid_out_total": paid_out_total,
        "available_balance": available_balance,
        "pending_withdrawals": pending_withdrawals,
        # Admin-only metrics
        "platform_revenue": platform_revenue_gross,
        "platform_revenue_gross": platform_revenue_gross,
        "platform_revenue_net": platform_revenue_net,
        "processor_fees": processor_fees,
        "organizer_balance_held": organizer_balance_held,
        "expected_bold_balance": expected_bold_balance,
        "finalrep_available_balance": finalrep_available_balance,
        "event_started": event_started,
        "can_release_funds": event_started,
        "withdrawal_requests_count": len(withdrawals),
    }


def _serialize_withdrawal(item: CompetitionWithdrawalRequest) -> dict:
    return {
        "id": item.id,
        "competition_id": item.competition_id,
        "requested_by_user_id": item.requested_by_user_id,
        "reviewed_by_user_id": item.reviewed_by_user_id,
        "amount": item.amount,
        "status": item.status,
        "destination_note": item.destination_note,
        "requester_note": item.requester_note,
        "review_note": item.review_note,
        "payout_reference": item.payout_reference,
        "terms_accepted_at": item.terms_accepted_at,
        "terms_version": item.terms_version,
        "requested_at": item.requested_at,
        "reviewed_at": item.reviewed_at,
        "paid_at": item.paid_at,
    }


@router.get("/overview")
def finance_overview(session: Session = Depends(get_session), user=Depends(require_staff)):
    competitions_query = select(Competition).order_by(Competition.created_at.desc())
    if is_organizer_user(user):
        owned_ids = get_owned_competition_ids(session, user)
        competitions_query = competitions_query.where(Competition.id.in_(owned_ids))
    competitions = session.exec(competitions_query).all()
    summaries = [_competition_summary(session, comp) for comp in competitions]

    totals = {
        "competitions": len(summaries),
        "total_collected": sum(item["total_collected"] for item in summaries),
        "organizer_revenue": sum(item["organizer_revenue"] for item in summaries),
        "platform_revenue": sum(item["platform_revenue_gross"] for item in summaries),
        "platform_revenue_gross": sum(item["platform_revenue_gross"] for item in summaries),
        "platform_revenue_net": sum(item["platform_revenue_net"] for item in summaries),
        "processor_fees": sum(item["processor_fees"] for item in summaries),
        "organizer_balance_held": sum(item["organizer_balance_held"] for item in summaries),
        "expected_bold_balance": sum(item["expected_bold_balance"] for item in summaries),
        "finalrep_available_balance": sum(item["finalrep_available_balance"] for item in summaries),
        "pending_withdrawals": sum(item["pending_withdrawals"] for item in summaries),
        "paid_out_total": sum(item["paid_out_total"] for item in summaries),
        "available_balance": sum(item["available_balance"] for item in summaries),
        "approved_payments": sum(item["approved_payments"] for item in summaries),
        "payments_in_progress": sum(item["payments_in_progress"] for item in summaries),
    }
    return {"totals": totals, "competitions": summaries}


@router.get("/competitions/{competition_id}")
def competition_finance_detail(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    summary = _competition_summary(session, competition)
    withdrawals = session.exec(
        select(CompetitionWithdrawalRequest)
        .where(CompetitionWithdrawalRequest.competition_id == competition_id)
        .order_by(CompetitionWithdrawalRequest.requested_at.desc(), CompetitionWithdrawalRequest.id.desc())
    ).all()
    return {
        "competition": {
            "id": competition.id,
            "nombre": competition.nombre,
            "competition_start": competition.competition_start,
            "competition_end": competition.competition_end,
            "organizer_user_id": competition.organizer_user_id,
        },
        "summary": summary,
        "withdrawals": [_serialize_withdrawal(item) for item in withdrawals],
    }


@router.post("/competitions/{competition_id}/withdrawals", status_code=201)
def create_withdrawal_request(
    competition_id: int,
    body: WithdrawalRequestCreate,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, competition_id, user)
    summary = _competition_summary(session, competition)
    amount = _normalize_amount(summary["available_balance"])
    if amount <= 0:
        raise HTTPException(400, "No hay saldo disponible para retirar en esta competencia")
    if not summary["enrollment_closed"]:
        raise HTTPException(400, "Solo puedes solicitar el retiro cuando las inscripciones esten cerradas")
    if not int(body.terms_accepted or 0):
        raise HTTPException(400, "Debes leer y aceptar las condiciones de retiro antes de continuar")

    request = CompetitionWithdrawalRequest(
        competition_id=competition_id,
        requested_by_user_id=int(get_current_user_id(user) or 0),
        amount=amount,
        status="pending",
        destination_note=str(body.destination_note or "").strip() or None,
        requester_note=str(body.requester_note or "").strip() or None,
        terms_accepted_at=datetime.now(timezone.utc),
        terms_version="withdrawal_terms_v1",
    )
    session.add(request)
    session.commit()
    session.refresh(request)
    return {"ok": True, "request": _serialize_withdrawal(request), "summary": _competition_summary(session, competition)}


@router.get("/withdrawals")
def list_withdrawals(session: Session = Depends(get_session), user=Depends(require_staff)):
    query = (
        select(CompetitionWithdrawalRequest, Competition)
        .join(Competition, Competition.id == CompetitionWithdrawalRequest.competition_id)
        .order_by(CompetitionWithdrawalRequest.requested_at.desc(), CompetitionWithdrawalRequest.id.desc())
    )
    if is_organizer_user(user):
        owned_ids = get_owned_competition_ids(session, user)
        query = query.where(CompetitionWithdrawalRequest.competition_id.in_(owned_ids))
    rows = session.exec(query).all()
    return [
        {
            **_serialize_withdrawal(item),
            "competition_name": competition.nombre,
            "competition_start": competition.competition_start,
        }
        for item, competition in rows
    ]


@router.put("/withdrawals/{withdrawal_id}")
def review_withdrawal_request(
    withdrawal_id: int,
    body: WithdrawalRequestReview,
    session: Session = Depends(get_session),
    user=Depends(require_admin),
):
    request = session.get(CompetitionWithdrawalRequest, withdrawal_id)
    if not request:
        raise HTTPException(404, "Solicitud de retiro no encontrada")
    competition = session.get(Competition, request.competition_id)
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")

    next_status = str(body.status or "").strip().lower()
    if next_status not in {"pending", "approved", "rejected", "paid"}:
        raise HTTPException(400, "Estado de retiro invalido")

    event_started = bool(_to_utc(competition.competition_start) and datetime.now(timezone.utc) >= _to_utc(competition.competition_start))
    if next_status in {"approved", "paid"} and not event_started:
        raise HTTPException(400, "Solo puedes liberar dinero cuando la competencia haya iniciado")

    if next_status == "paid" and not str(body.payout_reference or "").strip():
        raise HTTPException(400, "Debes registrar una referencia de pago para marcar el retiro como pagado")

    request.status = next_status
    request.review_note = str(body.review_note or "").strip() or None
    request.payout_reference = str(body.payout_reference or "").strip() or request.payout_reference
    request.reviewed_by_user_id = int(get_current_user_id(user) or 0)
    request.reviewed_at = datetime.now(timezone.utc)
    request.paid_at = datetime.now(timezone.utc) if next_status == "paid" else None
    session.add(request)
    session.commit()
    session.refresh(request)
    return {"ok": True, "request": _serialize_withdrawal(request), "summary": _competition_summary(session, competition)}
