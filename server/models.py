from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import UniqueConstraint, Column, Integer, String, ForeignKey, DateTime, Date, func
from sqlmodel import SQLModel, Field, Relationship


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
    estado: str = Field(default="activo")
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
    role: str = Field(default="user", index=True)  # admin | organizer | user
    password_hash: str
    participant_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    is_active: int = Field(default=1)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
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
    team_membership_rule: str = Field(default="free")  # free | same_category
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
    tv_mode: str = Field(default="cyclic")  # cyclic | static
    tv_static_view: str = Field(default="individual")  # individual | teams
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
    enrollment_intro_text: Optional[str] = None
    enrollment_payment_methods: Optional[str] = None
    enrollment_questions: Optional[str] = None
    enrollment_terms_text: Optional[str] = None
    require_payment_receipt: int = Field(default=0)
    # Timer fields
    timer_duration: int = Field(default=0)            # total seconds; 0 = no timer configured
    timer_started_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    timer_elapsed_before_pause: int = Field(default=0)  # seconds elapsed before current run
    timer_mode: str = Field(default="countdown")       # "countdown" | "stopwatch"
    timer_format: str = Field(default="mm:ss")         # "mm:ss" | "mmm:ss" | "hh:mm:ss"
    scoring_mode: str = Field(default="highest_wins")  # highest_wins | lowest_wins
    organizer_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True),
    )
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
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
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
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    nombre: str
    descripcion: Optional[str] = None
    modality: str = Field(default="individual")  # individual | teams
    orden: int = Field(default=0)


class CompetitionPhase(SQLModel, table=True):
    __tablename__ = "competition_phases"

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    nombre: str
    descripcion: Optional[str] = None
    modality: str = Field(default="individual")  # individual | teams
    block_name: Optional[str] = None
    block_order: int = Field(default=0)
    phase_format: str = Field(default="activity")  # activity / wod
    tipo: str = Field(default="cantidad")  # posicion / cantidad / tiempo
    measurement_method: str = Field(default="unidades")  # unidades / metros / tiempo_hms / repeticiones / kilogramos / gramos / libras / posicion
    winner_rule: str = Field(default="higher_wins")  # higher_wins / lower_wins
    scoring_rules: Optional[str] = None  # JSON string for position scoring rules
    activities: Optional[str] = None  # JSON string for WOD child activities
    points_mode: str = Field(default="manual")  # manual | position_direct | position_rules
    allow_multiple_results: int = Field(default=0)  # 0 = unico por participante/fase, 1 = multiple
    team_result_mode: str = Field(default="sum_two")  # sum_two / total / single_member
    estado: str = Field(default="pendiente")  # pendiente / en_progreso / finalizada
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    orden: int = Field(default=0)


class CompetitionHeat(SQLModel, table=True):
    __tablename__ = "competition_heats"

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    phase_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competition_phases.id", ondelete="CASCADE"), nullable=False)
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
        default="confirmado",
        sa_column=Column(String, nullable=False, server_default="confirmado"),
    )
    enrollment_answers: Optional[str] = None
    inscrito_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class Result(SQLModel, table=True):
    __tablename__ = "results"

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
    display_name: Optional[str] = None
    nombre: Optional[str] = None
    username: Optional[str] = None
    app_user_id: Optional[int] = None
    participant_id: Optional[int] = None


class MeResponse(SQLModel):
    role: str
    display_name: Optional[str] = None
    nombre: Optional[str] = None
    username: Optional[str] = None
    app_user_id: Optional[int] = None
    participant_id: Optional[int] = None


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
    estado: str = "activo"


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
    estado: str = "activo"
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
    team_membership_rule: str = "free"
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
    tv_mode: str = "cyclic"
    tv_static_view: str = "individual"
    tv_static_phase_id: Optional[int] = None
    tv_static_individual_category: Optional[str] = None
    tv_static_team_category_mode: str = "__by_category__"
    enrollment_open: int = 0
    enrollment_start: Optional[datetime] = None
    enrollment_end: Optional[datetime] = None
    competition_start: Optional[datetime] = None
    competition_end: Optional[datetime] = None
    schedule_items: Optional[List["CompetitionDateItem"]] = None
    enrollment_intro_text: Optional[str] = None
    enrollment_payment_methods: Optional[List["EnrollmentPaymentMethodItem"]] = None
    enrollment_questions: Optional[List["EnrollmentQuestionItem"]] = None
    enrollment_terms_text: Optional[str] = None
    require_payment_receipt: int = 0
    scoring_mode: str = "highest_wins"


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
    enrollment_intro_text: Optional[str] = None
    enrollment_payment_methods: Optional[List["EnrollmentPaymentMethodItem"]] = None
    enrollment_questions: Optional[List["EnrollmentQuestionItem"]] = None
    enrollment_terms_text: Optional[str] = None
    require_payment_receipt: Optional[int] = None
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


# ── Category / Phase schemas ───────────────────────────────────────────────────

class CategoryCreate(SQLModel):
    nombre: str
    descripcion: Optional[str] = None
    modality: str = "individual"
    orden: int = 0


class CategoryUpdate(SQLModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    modality: Optional[str] = None
    orden: Optional[int] = None


class PhaseCreate(SQLModel):
    nombre: str
    descripcion: Optional[str] = None
    modality: str = "individual"
    block_name: Optional[str] = None
    block_order: int = 0
    phase_format: str = "activity"
    tipo: str = "cantidad"
    measurement_method: Optional[str] = None
    winner_rule: Optional[str] = None
    scoring_rules: Optional[str] = None
    activities: Optional[List[dict]] = None
    points_mode: str = "manual"
    allow_multiple_results: int = 0
    team_result_mode: str = "sum_two"
    estado: str = "pendiente"
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
