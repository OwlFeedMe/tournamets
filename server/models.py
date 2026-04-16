from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import Index, UniqueConstraint, Column, Integer, String, ForeignKey, DateTime, Date, func
from sqlmodel import SQLModel, Field

from constants import (
    EstadoParticipante, EstadoInscripcion, EstadoFase,
    Modalidad, FormatoFase, ReglaGanador, ModoPoints, ModoTV, ReglaMiembro, Role,
)


# ── Table Models (DB) ─────────────────────────────────────────────────────────

class Participant(SQLModel, table=True):
    __tablename__ = "participants"

    id: Optional[int] = Field(default=None, primary_key=True)
    cedula: str = Field(unique=True, index=True)
    nombre: str
    apellido: str
    email: Optional[str] = None
    celular: Optional[str] = None
    sexo: Optional[str] = None
    genero: Optional[str] = None
    categoria: Optional[str] = None
    box: Optional[str] = None
    talla_camiseta: Optional[str] = None
    profile_photo_url: Optional[str] = None
    fecha_nacimiento: Optional[date] = Field(
        default=None,
        sa_column=Column(Date, nullable=True),
    )
    ciudad_pais: Optional[str] = None
    estado: str = Field(default=EstadoParticipante.ACTIVO)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class AppUser(SQLModel, table=True):
    __tablename__ = "app_users"
    __table_args__ = (
        UniqueConstraint("username"),
        UniqueConstraint("participant_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True)
    display_name: str
    role: str = Field(default=Role.USER, index=True)  # base role: user, legacy admin fallback
    password_hash: str
    organizer_enabled: int = Field(default=0)
    judge_enabled: int = Field(default=0)
    admin_enabled: int = Field(default=0)
    participant_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    is_active: int = Field(default=1)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class OrganizerApplication(SQLModel, table=True):
    __tablename__ = "organizer_applications"

    id: Optional[int] = Field(default=None, primary_key=True)
    app_user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    participant_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    status: str = Field(default="pending", index=True)  # pending | approved | rejected
    requested_event_name: str
    requested_event_location: Optional[str] = None
    requested_event_date: Optional[date] = Field(
        default=None,
        sa_column=Column(Date, nullable=True),
    )
    requested_event_description: Optional[str] = None
    why_organizer: str
    prior_events_summary: Optional[str] = None
    why_finalrep: str
    profile_snapshot_json: str
    review_note: Optional[str] = None
    reviewed_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True),
    )
    reviewed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class Competition(SQLModel, table=True):
    __tablename__ = "competitions"

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    descripcion: Optional[str] = None
    general_info_text: Optional[str] = None
    lugar: Optional[str] = None
    contact_phone: Optional[str] = None
    website_url: Optional[str] = None
    social_links: Optional[str] = None
    profile_image_url: Optional[str] = None
    banner_image_url: Optional[str] = None
    banner_desktop_url: Optional[str] = None
    banner_mobile_url: Optional[str] = None
    theme_background_color: Optional[str] = None
    theme_surface_color: Optional[str] = None
    theme_primary_color: Optional[str] = None
    theme_accent_color: Optional[str] = None
    imagen_url: Optional[str] = None
    activa: int = Field(default=0)
    individual_enabled: int = Field(default=1)
    team_enabled: int = Field(default=0)
    team_categories_enabled: int = Field(default=1)
    team_size: int = Field(default=2)
    team_membership_rule: str = Field(default=ReglaMiembro.FREE)  # free | same_category
    allow_user_results: int = Field(default=0)
    show_individual_leaderboard: int = Field(default=1)
    show_team_all_by_category_option: int = Field(default=1)
    show_team_all_global_option: int = Field(default=1)
    tv_show_qr: int = Field(default=1)
    tv_show_timer: int = Field(default=1)
    tv_include_total_slide: int = Field(default=1)
    tv_only_finalized_phases: int = Field(default=1)
    tv_rotation_interval_seconds: int = Field(default=24)
    tv_data_refresh_interval_seconds: int = Field(default=5)
    tv_mode: str = Field(default=ModoTV.CYCLIC)  # cyclic | static
    tv_static_view: str = Field(default=Modalidad.INDIVIDUAL)  # individual | teams
    tv_static_phase_id: Optional[int] = Field(default=None)
    tv_static_individual_category: Optional[str] = None
    tv_static_team_category_mode: str = Field(default="__by_category__")  # __by_category__ | __all__ | category
    enrollment_open: int = Field(default=0)           # 1 = inscripciones abiertas
    enrollment_start: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    enrollment_end: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    competition_start: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    competition_end: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    schedule_items: Optional[str] = None
    landing_sections: Optional[str] = None
    enrollment_intro_text: Optional[str] = None
    enrollment_payment_methods: Optional[str] = None
    enrollment_questions: Optional[str] = None
    enrollment_terms_text: Optional[str] = None
    require_payment_receipt: int = Field(default=0)
    platform_fee_rate: float = Field(default=0.05)
    # Timer fields
    timer_duration: int = Field(default=0)            # total seconds; 0 = no timer configured
    timer_started_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    timer_elapsed_before_pause: int = Field(default=0)  # seconds elapsed before current run
    timer_mode: str = Field(default="countdown")       # "countdown" | "stopwatch"
    timer_format: str = Field(default="mm:ss")         # "mm:ss" | "mmm:ss" | "hh:mm:ss"
    scoring_mode: str = Field(default=ReglaGanador.HIGHER_WINS)  # highest_wins | lowest_wins
    organizer_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True),
    )
    slug: Optional[str] = Field(default=None, sa_column=Column(String, unique=True, index=True, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class PasswordResetCode(SQLModel, table=True):
    __tablename__ = "password_reset_codes"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True)
    code: str
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    used_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class CompetitionInterestNotification(SQLModel, table=True):
    __tablename__ = "competition_interest_notifications"
    __table_args__ = (
        UniqueConstraint("competition_id", "notification_type", "participant_id", name="uq_comp_interest_participant"),
        UniqueConstraint("competition_id", "notification_type", "email", name="uq_comp_interest_email"),
        Index("ix_comp_interest_competition_type", "competition_id", "notification_type"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    participant_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    email: Optional[str] = Field(default=None, index=True)
    notification_type: str = Field(default="open_enrollment", index=True)
    source: Optional[str] = None
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class Team(SQLModel, table=True):
    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("nombre", "competition_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    team_category_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("competition_categories.id", ondelete="SET NULL"), nullable=True),
    )
    captain_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class TeamInvitation(SQLModel, table=True):
    __tablename__ = "team_invitations"
    __table_args__ = (UniqueConstraint("team_id", "invitee_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    team_id: int = Field(
        sa_column=Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    )
    invitee_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    )
    status: str = Field(default="pending")  # pending / accepted / rejected
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class TeamMember(SQLModel, table=True):
    __tablename__ = "team_members"

    team_id: int = Field(
        sa_column=Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True)
    )
    participant_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), primary_key=True)
    )


class CompetitionCategory(SQLModel, table=True):
    __tablename__ = "competition_categories"

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    nombre: str
    descripcion: Optional[str] = None
    modality: str = Field(default=Modalidad.INDIVIDUAL)  # individual | teams
    enrollment_price: int = Field(default=0)
    orden: int = Field(default=0)


class CompetitionPhase(SQLModel, table=True):
    __tablename__ = "competition_phases"

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    nombre: str
    descripcion: Optional[str] = None
    modality: str = Field(default=Modalidad.INDIVIDUAL)  # individual | teams
    block_name: Optional[str] = None
    block_order: int = Field(default=0)
    phase_format: str = Field(default=FormatoFase.ACTIVITY)  # activity / wod
    tipo: str = Field(default="cantidad")  # posicion / cantidad / tiempo
    measurement_method: str = Field(default="unidades")  # unidades / metros / tiempo_hms / repeticiones / kilogramos / gramos / libras / posicion
    winner_rule: str = Field(default=ReglaGanador.HIGHER_WINS)  # higher_wins / lower_wins
    scoring_rules: Optional[str] = None  # JSON string for position scoring rules
    activities: Optional[str] = None  # JSON string for WOD child activities
    points_mode: str = Field(default=ModoPoints.MANUAL)  # manual | position_direct | position_rules
    allow_multiple_results: int = Field(default=0)  # 0 = unico por participante/fase, 1 = multiple
    team_result_mode: str = Field(default="sum_two")  # sum_two / total / single_member
    estado: str = Field(default=EstadoFase.PENDIENTE)  # pendiente / en_progreso / finalizada
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    orden: int = Field(default=0)


class CompetitionHeat(SQLModel, table=True):
    __tablename__ = "competition_heats"

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    phase_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competition_phases.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    categoria: Optional[str] = Field(default=None, sa_column=Column(String, nullable=True))
    nombre: str
    heat_number: int = Field(default=1)
    lane_count: int = Field(default=0)
    start_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    end_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    location_name: Optional[str] = None
    location_detail: Optional[str] = None
    note: Optional[str] = None
    is_published: int = Field(default=0)
    published_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class CompetitionHeatAssignment(SQLModel, table=True):
    __tablename__ = "competition_heat_assignments"

    id: Optional[int] = Field(default=None, primary_key=True)
    heat_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competition_heats.id", ondelete="CASCADE"), nullable=False)
    )
    participant_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=True),
    )
    team_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True),
    )
    lane_number: int = Field(default=1)
    seed_order: int = Field(default=0)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class CompetitionParticipant(SQLModel, table=True):
    __tablename__ = "competition_participants"

    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), primary_key=True)
    )
    participant_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), primary_key=True)
    )
    categoria: Optional[str] = Field(
        default=None,
        sa_column=Column(String, nullable=True),
    )
    estado: str = Field(
        default=EstadoInscripcion.CONFIRMADO,
        sa_column=Column(String, nullable=False, server_default="confirmado"),
    )
    enrollment_answers: Optional[str] = None
    payment_provider: Optional[str] = None
    payment_reference: Optional[str] = None
    payment_order_id: Optional[str] = None
    payment_status: Optional[str] = None
    payment_transaction_id: Optional[str] = None
    payment_base_amount: int = Field(default=0)
    payment_platform_fee: int = Field(default=0)
    payment_platform_fee_rate: float = Field(default=0.05)
    payment_processor_fee: int = Field(default=0)
    payment_platform_net: int = Field(default=0)
    payment_amount_total: int = Field(default=0)
    payment_processed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    payment_updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    inscrito_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class CompetitionPaymentIntent(SQLModel, table=True):
    __tablename__ = "competition_payment_intents"

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    participant_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    categoria: Optional[str] = Field(default=None, sa_column=Column(String, nullable=True))
    enrollment_answers: Optional[str] = None
    payment_provider: str = Field(default="bold")
    payment_reference: str = Field(index=True, unique=True)
    payment_order_id: Optional[str] = None
    payment_status: str = Field(default="created")
    payment_transaction_id: Optional[str] = None
    payment_base_amount: int = Field(default=0)
    payment_platform_fee: int = Field(default=0)
    payment_platform_fee_rate: float = Field(default=0.05)
    payment_processor_fee: int = Field(default=0)
    payment_platform_net: int = Field(default=0)
    payment_amount_total: int = Field(default=0)
    payment_processed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    payment_updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class PlatformConfig(SQLModel, table=True):
    __tablename__ = "platform_config"

    key: str = Field(sa_column=Column(String, primary_key=True))
    value: str = Field(default="")
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class CompetitionWithdrawalRequest(SQLModel, table=True):
    __tablename__ = "competition_withdrawal_requests"

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    requested_by_user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("app_users.id", ondelete="RESTRICT"), nullable=False)
    )
    reviewed_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True),
    )
    amount: int = Field(default=0)
    status: str = Field(default="pending")  # pending | approved | rejected | paid
    destination_note: Optional[str] = None
    requester_note: Optional[str] = None
    review_note: Optional[str] = None
    payout_reference: Optional[str] = None
    terms_accepted_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    terms_version: Optional[str] = None
    requested_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    reviewed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    paid_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )


class Result(SQLModel, table=True):
    __tablename__ = "results"
    __table_args__ = (
        Index("ix_results_comp_phase", "competition_id", "phase_id"),
        Index("ix_results_comp_participant", "competition_id", "participant_id"),
        Index("ix_results_comp_team", "competition_id", "team_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=True),
    )
    team_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True),
    )
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    phase_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("competition_phases.id", ondelete="SET NULL"), nullable=True),
    )
    marca: Optional[int] = None  # valor bruto de la prueba (metros, reps, peso, segundos, etc.)
    puntos: int = Field(default=0)
    posicion: Optional[int] = None
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


# ── Auth schemas ───────────────────────────────────────────────────────────────

class LoginRequest(SQLModel):
    cedula: str
    password: str


class RegisterRequest(SQLModel):
    cedula: Optional[str] = None
    nombre: str
    apellido: str
    email: str
    celular: Optional[str] = None
    genero: Optional[str] = None
    password: str


class TokenResponse(SQLModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    base_role: str = Role.USER
    extra_roles: List[str] = []
    display_name: Optional[str] = None
    nombre: Optional[str] = None
    username: Optional[str] = None
    app_user_id: Optional[int] = None
    participant_id: Optional[int] = None
    organizer_enabled: bool = False
    judge_enabled: bool = False
    admin_enabled: bool = False


class MeResponse(SQLModel):
    role: str
    base_role: str = Role.USER
    extra_roles: List[str] = []
    display_name: Optional[str] = None
    nombre: Optional[str] = None
    username: Optional[str] = None
    app_user_id: Optional[int] = None
    participant_id: Optional[int] = None
    organizer_enabled: bool = False
    judge_enabled: bool = False
    admin_enabled: bool = False


# ── Participant schemas ────────────────────────────────────────────────────────

class ParticipantCreate(SQLModel):
    cedula: str
    nombre: str
    apellido: str
    email: Optional[str] = None
    celular: Optional[str] = None
    sexo: Optional[str] = None
    genero: Optional[str] = None
    categoria: Optional[str] = None
    box: Optional[str] = None
    talla_camiseta: Optional[str] = None
    profile_photo_url: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    ciudad_pais: Optional[str] = None
    estado: str = EstadoParticipante.ACTIVO


class ParticipantUpdate(SQLModel):
    cedula: Optional[str] = None
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    email: Optional[str] = None
    celular: Optional[str] = None
    sexo: Optional[str] = None
    genero: Optional[str] = None
    categoria: Optional[str] = None
    box: Optional[str] = None
    talla_camiseta: Optional[str] = None
    profile_photo_url: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    ciudad_pais: Optional[str] = None
    estado: Optional[str] = None


class ParticipantProfile(SQLModel):
    id: Optional[int] = None
    cedula: str
    nombre: str
    apellido: str
    email: Optional[str] = None
    celular: Optional[str] = None
    sexo: Optional[str] = None
    genero: Optional[str] = None
    categoria: Optional[str] = None
    box: Optional[str] = None
    profile_photo_url: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    ciudad_pais: Optional[str] = None
    estado: str = EstadoParticipante.ACTIVO
    created_at: Optional[datetime] = None


class ParticipantSelfUpdate(SQLModel):
    """Participants updating their own profile — no estado field."""
    cedula: Optional[str] = None
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    email: Optional[str] = None
    celular: Optional[str] = None
    sexo: Optional[str] = None
    genero: Optional[str] = None
    categoria: Optional[str] = None
    box: Optional[str] = None
    profile_photo_url: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    ciudad_pais: Optional[str] = None


# ── Organizer application schemas ─────────────────────────────────────────────

class OrganizerApplicationCreate(SQLModel):
    requested_event_name: str
    requested_event_location: Optional[str] = None
    requested_event_date: Optional[date] = None
    requested_event_description: Optional[str] = None
    why_organizer: str
    prior_events_summary: Optional[str] = None
    why_finalrep: str


class OrganizerApplicationReview(SQLModel):
    status: str  # approved | rejected
    review_note: Optional[str] = None


# ── Competition schemas ────────────────────────────────────────────────────────

class CompetitionCreate(SQLModel):
    nombre: str
    descripcion: Optional[str] = None
    general_info_text: Optional[str] = None
    lugar: Optional[str] = None
    contact_phone: Optional[str] = None
    website_url: Optional[str] = None
    social_links: Optional[List["CompetitionSocialLinkItem"]] = None
    profile_image_url: Optional[str] = None
    banner_image_url: Optional[str] = None
    banner_desktop_url: Optional[str] = None
    banner_mobile_url: Optional[str] = None
    theme_background_color: Optional[str] = None
    theme_surface_color: Optional[str] = None
    theme_primary_color: Optional[str] = None
    theme_accent_color: Optional[str] = None
    imagen_url: Optional[str] = None
    activa: int = 0
    individual_enabled: int = 1
    team_enabled: int = 0
    team_categories_enabled: int = 1
    team_size: int = 2
    team_membership_rule: str = ReglaMiembro.FREE
    allow_user_results: int = 0
    show_individual_leaderboard: int = 1
    show_team_all_by_category_option: int = 1
    show_team_all_global_option: int = 1
    tv_show_qr: int = 1
    tv_show_timer: int = 1
    tv_include_total_slide: int = 1
    tv_only_finalized_phases: int = 1
    tv_rotation_interval_seconds: int = 24
    tv_data_refresh_interval_seconds: int = 5
    tv_mode: str = ModoTV.CYCLIC
    tv_static_view: str = Modalidad.INDIVIDUAL
    tv_static_phase_id: Optional[int] = None
    tv_static_individual_category: Optional[str] = None
    tv_static_team_category_mode: str = "__by_category__"
    enrollment_open: int = 0
    enrollment_start: Optional[datetime] = None
    enrollment_end: Optional[datetime] = None
    competition_start: Optional[datetime] = None
    competition_end: Optional[datetime] = None
    schedule_items: Optional[List["CompetitionDateItem"]] = None
    landing_sections: Optional[dict] = None
    enrollment_intro_text: Optional[str] = None
    enrollment_questions: Optional[List["EnrollmentQuestionItem"]] = None
    enrollment_terms_text: Optional[str] = None
    enrollment_payment_methods: Optional[List["EnrollmentPaymentMethodItem"]] = None
    require_payment_receipt: int = 0
    platform_fee_rate: float = 0.05
    scoring_mode: str = ReglaGanador.HIGHER_WINS


class CompetitionUpdate(SQLModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    general_info_text: Optional[str] = None
    lugar: Optional[str] = None
    contact_phone: Optional[str] = None
    website_url: Optional[str] = None
    social_links: Optional[List["CompetitionSocialLinkItem"]] = None
    profile_image_url: Optional[str] = None
    banner_image_url: Optional[str] = None
    banner_desktop_url: Optional[str] = None
    banner_mobile_url: Optional[str] = None
    theme_background_color: Optional[str] = None
    theme_surface_color: Optional[str] = None
    theme_primary_color: Optional[str] = None
    theme_accent_color: Optional[str] = None
    imagen_url: Optional[str] = None
    activa: Optional[int] = None
    individual_enabled: Optional[int] = None
    team_enabled: Optional[int] = None
    team_categories_enabled: Optional[int] = None
    team_size: Optional[int] = None
    team_membership_rule: Optional[str] = None
    allow_user_results: Optional[int] = None
    show_individual_leaderboard: Optional[int] = None
    show_team_all_by_category_option: Optional[int] = None
    show_team_all_global_option: Optional[int] = None
    tv_show_qr: Optional[int] = None
    tv_show_timer: Optional[int] = None
    tv_include_total_slide: Optional[int] = None
    tv_only_finalized_phases: Optional[int] = None
    tv_rotation_interval_seconds: Optional[int] = None
    tv_data_refresh_interval_seconds: Optional[int] = None
    tv_mode: Optional[str] = None
    tv_static_view: Optional[str] = None
    tv_static_phase_id: Optional[int] = None
    tv_static_individual_category: Optional[str] = None
    tv_static_team_category_mode: Optional[str] = None
    enrollment_open: Optional[int] = None
    enrollment_start: Optional[datetime] = None
    enrollment_end: Optional[datetime] = None
    competition_start: Optional[datetime] = None
    competition_end: Optional[datetime] = None
    schedule_items: Optional[List["CompetitionDateItem"]] = None
    landing_sections: Optional[dict] = None
    enrollment_intro_text: Optional[str] = None
    enrollment_payment_methods: Optional[List["EnrollmentPaymentMethodItem"]] = None
    enrollment_questions: Optional[List["EnrollmentQuestionItem"]] = None
    enrollment_terms_text: Optional[str] = None
    require_payment_receipt: Optional[int] = None
    platform_fee_rate: Optional[float] = None
    scoring_mode: Optional[str] = None


# ── Team schemas ───────────────────────────────────────────────────────────────

class TeamCreate(SQLModel):
    nombre: str
    competition_id: int
    member_ids: List[int] = []
    captain_id: Optional[int] = None
    team_category_id: Optional[int] = None


class TeamUpdate(SQLModel):
    nombre: Optional[str] = None
    member_ids: Optional[List[int]] = None
    captain_id: Optional[int] = None
    team_category_id: Optional[int] = None


class TeamInviteRequest(SQLModel):
    invitee_cedula: str


class TeamRenameRequest(SQLModel):
    nombre: str


# ── Result schemas ─────────────────────────────────────────────────────────────

class ResultCreate(SQLModel):
    competition_id: int
    participant_id: Optional[int] = None
    team_id: Optional[int] = None
    phase_id: Optional[int] = None
    marca: Optional[int] = None
    puntos: int = 0
    posicion: Optional[int] = None


class ResultUpdate(SQLModel):
    phase_id: Optional[int] = None
    marca: Optional[int] = None
    puntos: Optional[int] = None
    posicion: Optional[int] = None


# ── Enrollment schemas ─────────────────────────────────────────────────────────

class EnrollEntry(SQLModel):
    participant_id: int
    categoria: Optional[str] = None


class EnrollBody(SQLModel):
    participants: List[EnrollEntry]


class WithdrawalRequestCreate(SQLModel):
    destination_note: Optional[str] = None
    requester_note: Optional[str] = None
    terms_accepted: int = 0


class WithdrawalRequestReview(SQLModel):
    status: str
    review_note: Optional[str] = None
    payout_reference: Optional[str] = None


# ── Category / Phase schemas ───────────────────────────────────────────────────

class CategoryCreate(SQLModel):
    nombre: str
    descripcion: Optional[str] = None
    modality: str = Modalidad.INDIVIDUAL
    enrollment_price: int = 0
    orden: int = 0


class CategoryUpdate(SQLModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    modality: Optional[str] = None
    enrollment_price: Optional[int] = None
    orden: Optional[int] = None


class PhaseCreate(SQLModel):
    nombre: str
    descripcion: Optional[str] = None
    modality: str = Modalidad.INDIVIDUAL
    block_name: Optional[str] = None
    block_order: int = 0
    phase_format: str = FormatoFase.ACTIVITY
    tipo: str = "cantidad"
    measurement_method: Optional[str] = None
    winner_rule: Optional[str] = None
    scoring_rules: Optional[str] = None
    activities: Optional[List[dict]] = None
    points_mode: str = ModoPoints.MANUAL
    allow_multiple_results: int = 0
    team_result_mode: str = "sum_two"
    estado: str = EstadoFase.PENDIENTE
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    orden: int = 0


class PhaseUpdate(SQLModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    modality: Optional[str] = None
    block_name: Optional[str] = None
    block_order: Optional[int] = None
    phase_format: Optional[str] = None
    tipo: Optional[str] = None
    measurement_method: Optional[str] = None
    winner_rule: Optional[str] = None
    scoring_rules: Optional[str] = None
    activities: Optional[List[dict]] = None
    points_mode: Optional[str] = None
    allow_multiple_results: Optional[int] = None
    team_result_mode: Optional[str] = None
    estado: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    orden: Optional[int] = None


# ── Self-enrollment schemas ────────────────────────────────────────────────────

class EnrollmentQuestionItem(SQLModel):
    id: Optional[str] = None
    label: str
    field_type: str = "text"
    required: int = 0
    placeholder: Optional[str] = None


class EnrollmentPaymentMethodItem(SQLModel):
    id: Optional[str] = None
    label: str
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    notes: Optional[str] = None


class CompetitionDateItem(SQLModel):
    id: Optional[str] = None
    label: str
    kind: str = "custom"  # enrollment_start | enrollment_end | competition_start | competition_end | competition_day | custom
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    phase_id: Optional[int] = None
    use_phase_dates: int = 0
    note: Optional[str] = None


class CompetitionSocialLinkItem(SQLModel):
    id: Optional[str] = None
    label: str
    url: str


class EnrollmentAnswerItem(SQLModel):
    question_id: str
    question_label: Optional[str] = None
    question_type: Optional[str] = None
    answer: str

class SelfEnrollRequest(SQLModel):
    categoria: Optional[str] = None
    answers: Optional[List[EnrollmentAnswerItem]] = None
    payment_receipt_url: Optional[str] = None
    terms_accepted: int = 0


class EnrollStatusUpdate(SQLModel):
    estado: str  # confirmado / rechazado


# ── Platform config schemas ────────────────────────────────────────────────────

class PlatformConfigUpdate(SQLModel):
    default_platform_fee_rate: Optional[float] = None   # 0.0 – 1.0
    bold_processor_rate: Optional[float] = None          # e.g. 0.0269
    bold_processor_fixed_fee: Optional[int] = None       # e.g. 300 (COP)
