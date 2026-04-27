import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from access import require_competition_access
from auth import get_current_user_id, require_auth, require_staff
from database import get_session
from models import (
    CompetitionCategory,
    CompetitionDiscount,
    CompetitionDiscountUsage,
    Participant,
)
from pydantic import BaseModel
from routers.config import get_pricing_config

router = APIRouter(tags=["discounts"])

MAX_DISCOUNT_PERCENTAGE = 80
_CODE_RE = re.compile(r"^[A-Z0-9_\-]{2,50}$")


# ── Schemas ────────────────────────────────────────────────────────────────────

class DiscountCreate(BaseModel):
    code: str
    description: Optional[str] = None
    discount_type: str = "percentage"   # "percentage" | "fixed"
    discount_value: int
    max_uses: Optional[int] = None
    max_uses_per_user: int = 1
    applies_to_category_id: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None


class DiscountUpdate(BaseModel):
    description: Optional[str] = None
    max_uses: Optional[int] = None
    max_uses_per_user: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    is_active: Optional[int] = None


class ValidateDiscountRequest(BaseModel):
    code: str
    categoria: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validate_discount_limits(
    discount_type: str,
    discount_value: int,
    competition_id: int,
    applies_to_category_id: Optional[int],
    session: Session,
) -> None:
    if discount_type not in ("percentage", "fixed"):
        raise HTTPException(422, "Tipo de descuento invalido. Usa 'percentage' o 'fixed'")

    if discount_value <= 0:
        raise HTTPException(422, "El valor del descuento debe ser mayor a 0")

    if discount_type == "percentage":
        if discount_value > MAX_DISCOUNT_PERCENTAGE:
            raise HTTPException(422, f"El descuento maximo permitido es {MAX_DISCOUNT_PERCENTAGE}%")

    if discount_type == "fixed":
        if applies_to_category_id:
            category = session.get(CompetitionCategory, applies_to_category_id)
            if not category or category.competition_id != competition_id:
                raise HTTPException(404, "Categoria no encontrada en esta competencia")
            max_fixed = round(category.enrollment_price * MAX_DISCOUNT_PERCENTAGE / 100)
            if discount_value > max_fixed:
                raise HTTPException(
                    422,
                    f"Para esa categoria el descuento fijo maximo es "
                    f"{max_fixed} COP (80% de {category.enrollment_price} COP)",
                )
        else:
            categories = session.exec(
                select(CompetitionCategory)
                .where(CompetitionCategory.competition_id == competition_id)
                .where(CompetitionCategory.enrollment_price > 0)
            ).all()
            if categories:
                cheapest = min(c.enrollment_price for c in categories)
                max_fixed = round(cheapest * MAX_DISCOUNT_PERCENTAGE / 100)
                if discount_value > max_fixed:
                    raise HTTPException(
                        422,
                        f"El descuento fijo excede el 80% de la categoria mas economica "
                        f"({cheapest} COP). Maximo permitido: {max_fixed} COP",
                    )


def compute_discount_amount(base_price: int, discount: CompetitionDiscount) -> int:
    """Calcula centavos de descuento aplicando el tope del 80%."""
    if discount.discount_type == "percentage":
        pct = min(discount.discount_value, MAX_DISCOUNT_PERCENTAGE)
        return round(base_price * pct / 100)
    # fixed — nunca puede superar el 80% del precio actual
    max_allowed = round(base_price * MAX_DISCOUNT_PERCENTAGE / 100)
    return min(discount.discount_value, max_allowed)


def validate_discount_for_checkout(
    code: str,
    competition_id: int,
    user_id: int,
    category: CompetitionCategory,
    session: Session,
) -> tuple[CompetitionDiscount, int]:
    """
    Verifica el código y retorna (discount, discount_amount_centavos).
    Lanza HTTPException si el código no es válido o no aplica.
    """
    discount = session.exec(
        select(CompetitionDiscount)
        .where(CompetitionDiscount.competition_id == competition_id)
        .where(func.upper(CompetitionDiscount.code) == code.upper().strip())
        .where(CompetitionDiscount.is_active == 1)
    ).first()

    if not discount:
        raise HTTPException(400, "Codigo de descuento invalido o inactivo")

    now = datetime.now(timezone.utc)
    if discount.valid_from and now < discount.valid_from:
        raise HTTPException(400, "Este codigo aun no esta vigente")
    if discount.valid_until and now > discount.valid_until:
        raise HTTPException(400, "Este codigo ha expirado")
    if discount.max_uses is not None and discount.uses_count >= discount.max_uses:
        raise HTTPException(400, "Este codigo ha alcanzado su limite de usos")
    if discount.applies_to_category_id and discount.applies_to_category_id != category.id:
        raise HTTPException(400, "Este codigo no aplica para la categoria seleccionada")

    active_uses = session.exec(
        select(func.count()).where(
            CompetitionDiscountUsage.discount_id == discount.id,
            CompetitionDiscountUsage.user_id == user_id,
            CompetitionDiscountUsage.enrollment_status != "cancelled",
        )
    ).one()
    if active_uses >= discount.max_uses_per_user:
        raise HTTPException(400, "Ya utilizaste este codigo de descuento")

    amount = compute_discount_amount(category.enrollment_price, discount)
    return discount, amount


# ── Endpoints organizer ────────────────────────────────────────────────────────

@router.post("/api/competitions/{competition_id}/discounts")
def create_discount(
    competition_id: int,
    body: DiscountCreate,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    user_id = get_current_user_id(user)

    code = str(body.code or "").strip().upper()
    if not _CODE_RE.match(code):
        raise HTTPException(422, "El codigo solo puede contener letras mayusculas, numeros, guion y guion bajo (2-50 caracteres)")

    existing = session.exec(
        select(CompetitionDiscount)
        .where(CompetitionDiscount.competition_id == competition_id)
        .where(func.upper(CompetitionDiscount.code) == code)
    ).first()
    if existing:
        raise HTTPException(409, f"Ya existe un codigo '{code}' en esta competencia")

    _validate_discount_limits(
        body.discount_type, body.discount_value, competition_id, body.applies_to_category_id, session
    )

    if body.applies_to_category_id:
        cat = session.get(CompetitionCategory, body.applies_to_category_id)
        if not cat or cat.competition_id != competition_id:
            raise HTTPException(404, "Categoria no encontrada en esta competencia")

    discount = CompetitionDiscount(
        competition_id=competition_id,
        code=code,
        description=body.description,
        discount_type=body.discount_type,
        discount_value=body.discount_value,
        max_uses=body.max_uses,
        uses_count=0,
        max_uses_per_user=max(1, body.max_uses_per_user or 1),
        applies_to_category_id=body.applies_to_category_id,
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        is_active=1,
        created_by_user_id=user_id,
    )
    session.add(discount)
    session.commit()
    session.refresh(discount)
    return _discount_out(discount, session)


@router.get("/api/competitions/{competition_id}/discounts")
def list_discounts(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    discounts = session.exec(
        select(CompetitionDiscount)
        .where(CompetitionDiscount.competition_id == competition_id)
        .order_by(CompetitionDiscount.created_at.desc())
    ).all()
    return [_discount_out(d, session) for d in discounts]


@router.patch("/api/competitions/{competition_id}/discounts/{discount_id}")
def update_discount(
    competition_id: int,
    discount_id: int,
    body: DiscountUpdate,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    discount = _get_discount_or_404(session, competition_id, discount_id)

    if body.description is not None:
        discount.description = body.description
    if body.max_uses is not None:
        if body.max_uses < discount.uses_count:
            raise HTTPException(422, "El limite de usos no puede ser menor al numero de usos actuales")
        discount.max_uses = body.max_uses
    if body.max_uses_per_user is not None:
        discount.max_uses_per_user = max(1, body.max_uses_per_user)
    if body.valid_from is not None:
        discount.valid_from = body.valid_from
    if body.valid_until is not None:
        discount.valid_until = body.valid_until
    if body.is_active is not None:
        discount.is_active = 1 if body.is_active else 0

    session.add(discount)
    session.commit()
    session.refresh(discount)
    return _discount_out(discount, session)


@router.delete("/api/competitions/{competition_id}/discounts/{discount_id}")
def delete_discount(
    competition_id: int,
    discount_id: int,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    discount = _get_discount_or_404(session, competition_id, discount_id)

    if discount.uses_count > 0:
        raise HTTPException(
            409,
            "No se puede eliminar un codigo que ya fue utilizado. Desactivalo en su lugar.",
        )

    session.delete(discount)
    session.commit()
    return {"ok": True}


@router.get("/api/competitions/{competition_id}/discounts/{discount_id}/usages")
def get_discount_usages(
    competition_id: int,
    discount_id: int,
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    require_competition_access(session, competition_id, user)
    _get_discount_or_404(session, competition_id, discount_id)

    usages = session.exec(
        select(CompetitionDiscountUsage)
        .where(CompetitionDiscountUsage.discount_id == discount_id)
        .order_by(CompetitionDiscountUsage.applied_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    result = []
    for u in usages:
        participant = session.get(Participant, u.user_id)
        result.append({
            "id": u.id,
            "user_id": u.user_id,
            "user_name": f"{participant.nombre} {participant.apellido}".strip() if participant else "-",
            "user_email": participant.email if participant else "-",
            "discount_code": u.discount_code,
            "discount_type": u.discount_type,
            "discount_value": u.discount_value,
            "base_price_before": u.base_price_before,
            "discount_amount_applied": u.discount_amount_applied,
            "final_base_price": u.final_base_price,
            "enrollment_status": u.enrollment_status,
            "applied_at": u.applied_at.isoformat() if u.applied_at else None,
        })
    return result


# ── Endpoint participante ──────────────────────────────────────────────────────

@router.post("/api/competitions/{competition_id}/validate-discount")
def validate_discount(
    competition_id: int,
    body: ValidateDiscountRequest,
    session: Session = Depends(get_session),
    user=Depends(require_auth),
):
    user_id = get_current_user_id(user)
    if user_id is None:
        raise HTTPException(403, "Se requiere autenticacion")

    from models import Competition
    comp = session.get(Competition, competition_id)
    if not comp:
        raise HTTPException(404, "Competencia no encontrada")

    category = session.exec(
        select(CompetitionCategory)
        .where(CompetitionCategory.competition_id == competition_id)
        .where(CompetitionCategory.nombre == body.categoria)
    ).first()
    if not category:
        raise HTTPException(404, "Categoria no encontrada")

    discount, amount = validate_discount_for_checkout(
        body.code, competition_id, user_id, category, session
    )

    return {
        "valid": True,
        "code": discount.code,
        "discount_type": discount.discount_type,
        "discount_value": discount.discount_value,
        "discount_amount": amount,
        "description": discount.description,
    }


# ── Internal helpers ───────────────────────────────────────────────────────────

def _get_discount_or_404(session: Session, competition_id: int, discount_id: int) -> CompetitionDiscount:
    discount = session.get(CompetitionDiscount, discount_id)
    if not discount or discount.competition_id != competition_id:
        raise HTTPException(404, "Codigo de descuento no encontrado")
    return discount


def _discount_out(discount: CompetitionDiscount, session: Session) -> dict:
    category_name = None
    if discount.applies_to_category_id:
        cat = session.get(CompetitionCategory, discount.applies_to_category_id)
        category_name = cat.nombre if cat else None
    return {
        "id": discount.id,
        "code": discount.code,
        "description": discount.description,
        "discount_type": discount.discount_type,
        "discount_value": discount.discount_value,
        "max_uses": discount.max_uses,
        "uses_count": discount.uses_count,
        "max_uses_per_user": discount.max_uses_per_user,
        "applies_to_category_id": discount.applies_to_category_id,
        "applies_to_category_name": category_name,
        "valid_from": discount.valid_from.isoformat() if discount.valid_from else None,
        "valid_until": discount.valid_until.isoformat() if discount.valid_until else None,
        "is_active": discount.is_active,
        "created_at": discount.created_at.isoformat() if discount.created_at else None,
    }
