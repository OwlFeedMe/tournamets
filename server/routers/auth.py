from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from auth import ADMIN_ID, ADMIN_PASSWORD, create_access_token
from database import get_session
from models import LoginRequest, TokenResponse, Participant

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    # Admin login
    if body.cedula == ADMIN_ID and body.password == ADMIN_PASSWORD:
        token = create_access_token({"sub": "admin", "role": "admin"})
        return TokenResponse(access_token=token, role="admin", nombre="Administrador")

    # Participant login (password = cedula)
    participant = session.exec(
        select(Participant)
        .where(Participant.cedula == body.cedula, Participant.estado == "activo")
    ).first()

    if not participant or body.password != body.cedula:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    token = create_access_token({
        "sub": str(participant.id),
        "role": "participant",
        "cedula": participant.cedula,
    })
    return TokenResponse(
        access_token=token,
        role="participant",
        nombre=f"{participant.nombre} {participant.apellido}",
        participant_id=participant.id,
    )
