from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import Index, UniqueConstraint, Column, Integer, String, ForeignKey, DateTime, Date, func
from sqlmodel import SQLModel, Field

from constants import (
    EstadoParticipante, EstadoInscripcion, EstadoFase,
    Modalidad, FormatoFase, ReglaGanador, ModoPoints, ModoTV, ReglaMiembro, Role, UnidadRM,
    GymStatus, GymOwnershipStatus, GymPlanTier, GymMembershipStatus, GymStaffRole,
    GymClaimStatus, GymSubmissionStatus,
    AthleteProfileVisibility,
)


# ── Table Models (DB) ─────────────────────────────────────────────────────────

class User(SQLModel, table=True):
    __tablename__ = "participants"
    __table_args__ = (
        UniqueConstraint("cedula"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    cedula: str = Field(index=True)
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
    username: Optional[str] = Field(default=None, index=True)
    display_name: Optional[str] = None
    public_profile_enabled: int = Field(default=0)
    public_profile_indexable: int = Field(default=1)
    public_profile_visibility: str = Field(default=AthleteProfileVisibility.PRIVATE)
    public_bio: Optional[str] = None
    public_cover_url: Optional[str] = None
    public_show_city: int = Field(default=1)
    public_show_gym: int = Field(default=1)
    public_show_age: int = Field(default=0)
    public_show_results: int = Field(default=1)
    verified_athlete: int = Field(default=0)
    role: str = Field(default=Role.USER, index=True)
    password_hash: Optional[str] = None
    organizer_enabled: int = Field(default=0)
    judge_enabled: int = Field(default=0)
    admin_enabled: int = Field(default=0)
    is_active: int = Field(default=1)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


Participant = User


class AthleteUsernameAlias(SQLModel, table=True):
    __tablename__ = "athlete_username_aliases"
    __table_args__ = (
        UniqueConstraint("alias", name="uq_athlete_username_aliases_alias"),
        Index("ix_athlete_username_aliases_user_id", "user_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    )
    alias: str = Field(sa_column=Column(String, nullable=False, index=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class OrganizerApplication(SQLModel, table=True):
    __tablename__ = "organizer_applications"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
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
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
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
    show_public_category_roster: int = Field(default=0)
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
    rm_unit: str = Field(default=UnidadRM.KG)
    organizer_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    invitations_enabled: int = Field(default=0)
    allow_free_categories: int = Field(default=0)
    slug: Optional[str] = Field(default=None, sa_column=Column(String, unique=True, index=True, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class CompetitionSpectatorTicketingConfig(SQLModel, table=True):
    __tablename__ = "competition_spectator_ticketing_config"
    __table_args__ = (
        UniqueConstraint("competition_id", name="uq_comp_spectator_ticketing_competition"),
        Index("ix_comp_spectator_ticketing_competition", "competition_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    status: str = Field(default="draft")  # draft | active
    enabled: int = Field(default=0)       # irreversible once active
    activated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    max_capacity: int = Field(default=0)
    product_title: Optional[str] = None
    product_description: Optional[str] = None
    benefits_text: Optional[str] = None
    access_text: Optional[str] = None
    price_unit: int = Field(default=0)
    ticket_products: Optional[str] = None
    bulk_pricing_tiers: Optional[str] = None
    limit_per_identity: int = Field(default=1)
    max_tickets_per_person: Optional[int] = Field(default=None)
    max_tickets_per_transaction: Optional[int] = Field(default=None)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class SpectatorTicketOrder(SQLModel, table=True):
    __tablename__ = "spectator_ticket_orders"
    __table_args__ = (
        UniqueConstraint("payment_reference", name="uq_spectator_ticket_order_payment_reference"),
        Index("ix_spectator_ticket_orders_competition_id", "competition_id"),
        Index("ix_spectator_ticket_orders_email", "buyer_email"),
        Index("ix_spectator_ticket_orders_identity", "buyer_document"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    buyer_full_name: str
    buyer_email: str
    buyer_phone: str
    buyer_document: str = Field(index=True)
    product_id: Optional[str] = None
    product_label: Optional[str] = None
    access_days: Optional[str] = None
    quantity: int = Field(default=1)
    unit_price_applied: int = Field(default=0)
    payment_provider: str = Field(default="bold")
    payment_reference: str = Field(index=True)
    payment_order_id: Optional[str] = None
    payment_status: str = Field(default="created")
    payment_transaction_id: Optional[str] = None
    payment_base_amount: int = Field(default=0)
    payment_platform_fee: int = Field(default=0)
    payment_platform_fee_rate: float = Field(default=0.05)
    payment_processor_fee: int = Field(default=0)
    payment_platform_net: int = Field(default=0)
    payment_amount_total: int = Field(default=0)
    tickets_pdf_url: Optional[str] = None
    tickets_email_sent_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    paid_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class SpectatorTicket(SQLModel, table=True):
    __tablename__ = "spectator_tickets"
    __table_args__ = (
        UniqueConstraint("ticket_uid", name="uq_spectator_tickets_uid"),
        UniqueConstraint("order_id", "ticket_number", name="uq_spectator_tickets_order_number"),
        Index("ix_spectator_tickets_competition_id", "competition_id"),
        Index("ix_spectator_tickets_order_id", "order_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    order_id: int = Field(
        sa_column=Column(Integer, ForeignKey("spectator_ticket_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    ticket_number: int = Field(default=1)
    ticket_uid: str = Field(index=True)
    status: str = Field(default="active")  # active | used | canceled | voided
    scanned_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    scanned_station: Optional[str] = None
    scanned_device_id: Optional[str] = None
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class SpectatorTicketCheckinAudit(SQLModel, table=True):
    __tablename__ = "spectator_ticket_checkin_audit"
    __table_args__ = (
        Index("ix_spectator_ticket_checkin_audit_competition_id", "competition_id"),
        Index("ix_spectator_ticket_checkin_audit_ticket_id", "ticket_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    ticket_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("spectator_tickets.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    order_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("spectator_ticket_orders.id", ondelete="SET NULL"), nullable=True),
    )
    action: str = Field(default="scan")
    result: str = Field(default="invalid")
    reason: Optional[str] = None
    station: Optional[str] = None
    device_id: Optional[str] = None
    actor_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
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
        UniqueConstraint("competition_id", "notification_type", "user_id", name="uq_comp_interest_user"),
        UniqueConstraint("competition_id", "notification_type", "email", name="uq_comp_interest_email"),
        Index("ix_comp_interest_competition_type", "competition_id", "notification_type"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    user_id: Optional[int] = Field(
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
    user_id: int = Field(
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
    is_visible: int = Field(default=1)
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
    user_id: Optional[int] = Field(
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
    user_id: int = Field(
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
    discount_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("competition_discounts.id", ondelete="SET NULL"), nullable=True),
    )
    discount_amount: int = Field(default=0)
    inscrito_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class CompetitionJudgeAssignment(SQLModel, table=True):
    __tablename__ = "competition_judge_assignments"
    __table_args__ = (
        UniqueConstraint("competition_id", "user_id", name="uq_comp_judge_assignment_user"),
        UniqueConstraint("competition_id", "invited_email", name="uq_comp_judge_assignment_email"),
        Index("ix_comp_judge_assignment_competition", "competition_id"),
        Index("ix_comp_judge_assignment_status", "status"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    invited_email: str = Field(index=True)
    status: str = Field(default="pending", index=True)  # pending | active | rejected | revoked
    invited_by_user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="RESTRICT"), nullable=False)
    )
    accepted_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    rejected_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    revoked_at: Optional[datetime] = Field(
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


class CompetitionJudgeActionAudit(SQLModel, table=True):
    __tablename__ = "competition_judge_action_audit"
    __table_args__ = (
        Index("ix_comp_judge_audit_competition", "competition_id"),
        Index("ix_comp_judge_audit_assignment", "judge_assignment_id"),
        Index("ix_comp_judge_audit_actor", "actor_user_id"),
        Index("ix_comp_judge_audit_action", "action"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    judge_assignment_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("competition_judge_assignments.id", ondelete="SET NULL"), nullable=True),
    )
    actor_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    action: str = Field(default="unknown")
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    result: str = Field(default="accepted")
    meta_json: Optional[str] = None
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class CompetitionPaymentIntent(SQLModel, table=True):
    __tablename__ = "competition_payment_intents"

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    user_id: int = Field(
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
    discount_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("competition_discounts.id", ondelete="SET NULL"), nullable=True),
    )
    discount_amount: int = Field(default=0)
    payment_updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class CompetitionCompetitorInvitation(SQLModel, table=True):
    __tablename__ = "competition_competitor_invitations"
    __table_args__ = (
        UniqueConstraint("competition_id", "invited_email", name="uq_comp_competitor_invitation_email"),
        Index("ix_comp_competitor_invitation_competition", "competition_id"),
        Index("ix_comp_competitor_invitation_status", "status"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    invited_email: str = Field(index=True)
    categoria: Optional[str] = None
    note: Optional[str] = None
    status: str = Field(default="pending", index=True)  # pending | accepted | rejected | revoked
    invited_by_user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="RESTRICT"), nullable=False)
    )
    accepted_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    rejected_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    revoked_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class CompetitionDiscount(SQLModel, table=True):
    __tablename__ = "competition_discounts"
    __table_args__ = (
        UniqueConstraint("competition_id", "code", name="uq_comp_discount_code"),
        Index("ix_comp_discount_competition", "competition_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    code: str = Field(max_length=50)
    description: Optional[str] = None
    discount_type: str = Field(default="percentage")   # "percentage" | "fixed"
    discount_value: int = Field(default=0)             # % (1-80) o centavos fijos
    max_uses: Optional[int] = Field(default=None)      # None = ilimitado
    uses_count: int = Field(default=0)
    max_uses_per_user: int = Field(default=1)
    applies_to_category_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("competition_categories.id", ondelete="SET NULL"), nullable=True),
    )
    valid_from: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    valid_until: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    is_active: int = Field(default=1)
    created_by_user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="RESTRICT"), nullable=False)
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class CompetitionDiscountUsage(SQLModel, table=True):
    __tablename__ = "competition_discount_usages"
    __table_args__ = (
        Index("ix_comp_discount_usage_discount", "discount_id"),
        Index("ix_comp_discount_usage_user", "user_id"),
        Index("ix_comp_discount_usage_competition", "competition_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    discount_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competition_discounts.id", ondelete="CASCADE"), nullable=False)
    )
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    )
    discount_code: str
    discount_type: str
    discount_value: int
    base_price_before: int = Field(default=0)
    discount_amount_applied: int = Field(default=0)
    final_base_price: int = Field(default=0)
    payment_intent_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("competition_payment_intents.id", ondelete="SET NULL"), nullable=True),
    )
    enrollment_status: str = Field(default="pending")  # pending | confirmed | cancelled
    applied_at: Optional[datetime] = Field(
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


class CompetitionQrIdentity(SQLModel, table=True):
    __tablename__ = "competition_qr_identities"
    __table_args__ = (
        UniqueConstraint("competition_id", "user_id", name="uq_comp_qr_identity_enrollment"),
        UniqueConstraint("qr_uid", name="uq_comp_qr_uid"),
        Index("ix_comp_qr_identity_competition", "competition_id"),
        Index("ix_comp_qr_identity_user", "user_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    qr_uid: str = Field(index=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    )
    version: int = Field(default=1)
    status: str = Field(default="active", index=True)  # active | revoked
    issued_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    last_reissued_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    revoked_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    revoked_reason: Optional[str] = None
    created_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    revoked_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class CompetitionCheckinPhase(SQLModel, table=True):
    __tablename__ = "competition_checkin_phases"
    __table_args__ = (
        UniqueConstraint("competition_id", "code", name="uq_comp_checkin_phase_code"),
        Index("ix_comp_checkin_phase_competition", "competition_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    code: str = Field(index=True)
    label: str
    description: Optional[str] = None
    order_index: int = Field(default=0)
    enabled: int = Field(default=1)
    max_uses: int = Field(default=1)
    is_system: int = Field(default=0)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class CompetitionCheckinUsage(SQLModel, table=True):
    __tablename__ = "competition_checkin_usages"
    __table_args__ = (
        UniqueConstraint("qr_identity_id", "phase_id", "use_number", name="uq_comp_checkin_usage_slot"),
        Index("ix_comp_checkin_usage_competition", "competition_id"),
        Index("ix_comp_checkin_usage_phase", "phase_id"),
        Index("ix_comp_checkin_usage_user", "user_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    )
    qr_identity_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competition_qr_identities.id", ondelete="CASCADE"), nullable=False)
    )
    phase_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competition_checkin_phases.id", ondelete="CASCADE"), nullable=False)
    )
    use_number: int = Field(default=1)
    idempotency_key: Optional[str] = Field(default=None, index=True)
    station: Optional[str] = None
    device_id: Optional[str] = None
    used_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    used_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class CompetitionCheckinAudit(SQLModel, table=True):
    __tablename__ = "competition_checkin_audit"
    __table_args__ = (
        Index("ix_comp_checkin_audit_competition", "competition_id"),
        Index("ix_comp_checkin_audit_phase", "phase_id"),
        Index("ix_comp_checkin_audit_result", "result"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    )
    user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    qr_identity_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("competition_qr_identities.id", ondelete="SET NULL"), nullable=True),
    )
    phase_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("competition_checkin_phases.id", ondelete="SET NULL"), nullable=True),
    )
    action: str = Field(default="scan")
    result: str = Field(default="accepted")
    reason: Optional[str] = None
    token_fingerprint: Optional[str] = None
    station: Optional[str] = None
    device_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    actor_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    meta_json: Optional[str] = None
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class CompetitionWithdrawalRequest(SQLModel, table=True):
    __tablename__ = "competition_withdrawal_requests"

    id: Optional[int] = Field(default=None, primary_key=True)
    competition_id: int = Field(
        sa_column=Column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    requested_by_user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="RESTRICT"), nullable=False)
    )
    reviewed_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
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
        Index("ix_results_comp_user", "competition_id", "user_id"),
        Index("ix_results_comp_team", "competition_id", "team_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(
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


# ── Gym domain models ─────────────────────────────────────────────────────────

class Gym(SQLModel, table=True):
    __tablename__ = "gyms"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_gyms_slug"),
        Index("ix_gyms_status", "status"),
        Index("ix_gyms_ownership_status", "ownership_status"),
        Index("ix_gyms_country_city", "country", "city"),
        Index("ix_gyms_created_by", "created_by_user_id"),
        Index("ix_gyms_is_featured", "is_featured"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(sa_column=Column(String, unique=True, nullable=False, index=True))
    display_name: str
    legal_name: Optional[str] = None
    short_description: Optional[str] = None
    full_description: Optional[str] = None
    status: str = Field(default=GymStatus.PENDING_REVIEW, index=True)
    ownership_status: str = Field(default=GymOwnershipStatus.UNCLAIMED, index=True)
    plan_tier: str = Field(default=GymPlanTier.FREE)
    verification_badge: int = Field(default=0)
    founded_year: Optional[int] = None
    logo_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    primary_color: Optional[str] = None
    accent_color: Optional[str] = None
    country: Optional[str] = Field(default=None, index=True)
    state_region: Optional[str] = None
    city: Optional[str] = Field(default=None, index=True)
    address_line: Optional[str] = None
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None
    website_url: Optional[str] = None
    instagram_url: Optional[str] = None
    whatsapp_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    head_coach_name: Optional[str] = None
    is_franchise: int = Field(default=0)
    is_featured: int = Field(default=0)
    created_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    claimed_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
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


class GymLocation(SQLModel, table=True):
    __tablename__ = "gym_locations"
    __table_args__ = (
        Index("ix_gym_locations_gym", "gym_id"),
        Index("ix_gym_locations_country_city", "country", "city"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    gym_id: int = Field(
        sa_column=Column(Integer, ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    name: Optional[str] = None
    country: Optional[str] = None
    state_region: Optional[str] = None
    city: Optional[str] = None
    address_line: Optional[str] = None
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None
    contact_phone: Optional[str] = None
    schedule_summary: Optional[str] = None
    is_primary: int = Field(default=0)
    status: str = Field(default="active")  # active | inactive
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class GymSubmission(SQLModel, table=True):
    __tablename__ = "gym_submissions"
    __table_args__ = (
        Index("ix_gym_submissions_status", "status"),
        Index("ix_gym_submissions_submitted_by", "submitted_by_user_id"),
        Index("ix_gym_submissions_matched_gym", "matched_gym_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    submitted_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    proposed_name: str
    country: Optional[str] = None
    state_region: Optional[str] = None
    city: Optional[str] = None
    instagram_url: Optional[str] = None
    website_url: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    submission_type: str = Field(default="suggest")  # suggest | claim_intent
    notes: Optional[str] = None
    status: str = Field(default=GymSubmissionStatus.PENDING, index=True)
    matched_gym_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("gyms.id", ondelete="SET NULL"), nullable=True),
    )
    reviewed_by_admin_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    reviewed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class GymClaim(SQLModel, table=True):
    __tablename__ = "gym_claims"
    __table_args__ = (
        Index("ix_gym_claims_gym", "gym_id"),
        Index("ix_gym_claims_status", "status"),
        Index("ix_gym_claims_requester", "requested_by_user_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    gym_id: int = Field(
        sa_column=Column(Integer, ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    requested_by_user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="RESTRICT"), nullable=False)
    )
    role_requested: str = Field(default=GymStaffRole.OWNER)  # owner | manager
    evidence_type: Optional[str] = None  # email_domain | instagram_dm | document | manual
    evidence_url: Optional[str] = None
    notes: Optional[str] = None
    status: str = Field(default=GymClaimStatus.PENDING, index=True)
    reviewed_by_admin_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    reviewed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class GymMembership(SQLModel, table=True):
    __tablename__ = "gym_memberships"
    __table_args__ = (
        Index("ix_gym_memberships_gym", "gym_id"),
        Index("ix_gym_memberships_user", "user_id"),
        Index("ix_gym_memberships_status", "status"),
        Index("ix_gym_memberships_gym_user", "gym_id", "user_id"),
        Index("ix_gym_memberships_is_primary", "user_id", "is_primary"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    gym_id: int = Field(
        sa_column=Column(Integer, ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    membership_type: str = Field(default="athlete")  # athlete | coach | staff
    status: str = Field(default=GymMembershipStatus.DECLARED, index=True)
    requested_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    approved_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    approved_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    ended_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    is_primary: int = Field(default=0)
    visibility: str = Field(default="public")  # public | private


class GymStaff(SQLModel, table=True):
    __tablename__ = "gym_staff"
    __table_args__ = (
        UniqueConstraint("gym_id", "user_id", name="uq_gym_staff_gym_user"),
        Index("ix_gym_staff_gym", "gym_id"),
        Index("ix_gym_staff_user", "user_id"),
        Index("ix_gym_staff_role", "role"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    gym_id: int = Field(
        sa_column=Column(Integer, ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    role: str = Field(default=GymStaffRole.STAFF, index=True)  # owner | manager | coach | staff
    status: str = Field(default="active")  # active | inactive | invited
    permissions_scope: Optional[str] = None  # JSON
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class GymAuditLog(SQLModel, table=True):
    __tablename__ = "gym_audit_log"
    __table_args__ = (
        Index("ix_gym_audit_log_gym", "gym_id"),
        Index("ix_gym_audit_log_actor", "actor_user_id"),
        Index("ix_gym_audit_log_action", "action_type"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    gym_id: int = Field(
        sa_column=Column(Integer, ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    actor_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    action_type: str = Field(index=True)
    before_snapshot: Optional[str] = None  # JSON
    after_snapshot: Optional[str] = None   # JSON
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class GymReport(SQLModel, table=True):
    __tablename__ = "gym_reports"
    __table_args__ = (
        Index("ix_gym_reports_gym", "gym_id"),
        Index("ix_gym_reports_status", "status"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    gym_id: int = Field(
        sa_column=Column(Integer, ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    reported_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    category: str = Field(default="wrong_info")  # wrong_info | closed | duplicate | other
    details: Optional[str] = None
    status: str = Field(default="pending")  # pending | resolved | dismissed
    resolved_by_admin_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
    )
    resolved_at: Optional[datetime] = None
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
    user_id: int
    role: str
    base_role: str = Role.USER
    extra_roles: List[str] = []
    display_name: Optional[str] = None
    nombre: Optional[str] = None
    username: Optional[str] = None
    organizer_enabled: bool = False
    judge_enabled: bool = False
    admin_enabled: bool = False


class MeResponse(SQLModel):
    user_id: int
    role: str
    base_role: str = Role.USER
    extra_roles: List[str] = []
    display_name: Optional[str] = None
    nombre: Optional[str] = None
    username: Optional[str] = None
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
    username: Optional[str] = None
    display_name: Optional[str] = None
    public_profile_enabled: int = 0
    public_profile_indexable: int = 1
    public_profile_visibility: str = AthleteProfileVisibility.PRIVATE
    public_bio: Optional[str] = None
    public_cover_url: Optional[str] = None
    public_show_city: int = 1
    public_show_gym: int = 1
    public_show_age: int = 0
    public_show_results: int = 1
    verified_athlete: int = 0
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
    username: Optional[str] = None
    display_name: Optional[str] = None
    public_profile_enabled: Optional[int] = None
    public_profile_indexable: Optional[int] = None
    public_profile_visibility: Optional[str] = None
    public_bio: Optional[str] = None
    public_cover_url: Optional[str] = None
    public_show_city: Optional[int] = None
    public_show_gym: Optional[int] = None
    public_show_age: Optional[int] = None
    public_show_results: Optional[int] = None


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
    show_public_category_roster: int = 0
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
    rm_unit: str = UnidadRM.KG


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
    show_public_category_roster: Optional[int] = None
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
    rm_unit: Optional[str] = None
    allow_free_categories: Optional[int] = None


# ── Team schemas ───────────────────────────────────────────────────────────────

class TeamCreate(SQLModel):
    nombre: str
    competition_id: int
    member_ids: List[int] = []
    user_ids: Optional[List[int]] = None
    captain_id: Optional[int] = None
    user_id: Optional[int] = None
    team_category_id: Optional[int] = None


class TeamUpdate(SQLModel):
    nombre: Optional[str] = None
    member_ids: Optional[List[int]] = None
    user_ids: Optional[List[int]] = None
    captain_id: Optional[int] = None
    user_id: Optional[int] = None
    team_category_id: Optional[int] = None


class TeamInviteRequest(SQLModel):
    invitee_cedula: str
    invitee_user_id: Optional[int] = None


class TeamRenameRequest(SQLModel):
    nombre: str


# ── Result schemas ─────────────────────────────────────────────────────────────

class ResultCreate(SQLModel):
    competition_id: int
    user_id: Optional[int] = None
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
    user_id: int
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
    is_visible: int = 1
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
    is_visible: Optional[int] = None
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


class SpectatorTicketTierItem(SQLModel):
    min_quantity: int
    unit_price: int


class SpectatorTicketProductItem(SQLModel):
    id: Optional[str] = None
    label: str
    price_unit: int
    access_days: List[str] = Field(default_factory=list)
    is_all_days: int = 0


class SpectatorTicketingConfigUpdate(SQLModel):
    max_capacity: Optional[int] = None
    product_title: Optional[str] = None
    product_description: Optional[str] = None
    benefits_text: Optional[str] = None
    access_text: Optional[str] = None
    price_unit: Optional[int] = None
    ticket_products: Optional[List["SpectatorTicketProductItem"]] = None
    bulk_pricing_tiers: Optional[List["SpectatorTicketTierItem"]] = None
    limit_per_identity: Optional[int] = None
    max_tickets_per_person: Optional[int] = None
    max_tickets_per_transaction: Optional[int] = None


class SpectatorTicketingConfigOut(SQLModel):
    competition_id: int
    status: str = "draft"
    enabled: int = 0
    activated_at: Optional[datetime] = None
    max_capacity: int = 0
    product_title: Optional[str] = None
    product_description: Optional[str] = None
    benefits_text: Optional[str] = None
    access_text: Optional[str] = None
    price_unit: int = 0
    ticket_products: List["SpectatorTicketProductItem"] = Field(default_factory=list)
    bulk_pricing_tiers: List["SpectatorTicketTierItem"] = Field(default_factory=list)
    limit_per_identity: int = 1
    max_tickets_per_person: Optional[int] = None
    max_tickets_per_transaction: Optional[int] = None


class SpectatorCheckoutRequest(SQLModel):
    buyer_full_name: str
    buyer_email: str
    buyer_phone: str
    buyer_document: str
    product_id: Optional[str] = None
    quantity: int = 1


class SpectatorPaymentStatusSyncRequest(SQLModel):
    reference: str


class CompetitionPaymentIntentActivateRequest(SQLModel):
    reference: str


class SpectatorTicketScanRequest(SQLModel):
    token: str
    station: Optional[str] = None
    device_id: Optional[str] = None


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
    discount_code: Optional[str] = None


class EnrollStatusUpdate(SQLModel):
    estado: str  # confirmado / rechazado


# ── Platform config schemas ────────────────────────────────────────────────────

class PlatformConfigUpdate(SQLModel):
    default_platform_fee_rate: Optional[float] = None   # 0.0 – 1.0
    bold_processor_rate: Optional[float] = None          # e.g. 0.0269
    bold_processor_fixed_fee: Optional[int] = None       # e.g. 300 (COP)
    min_platform_fee: Optional[int] = None               # e.g. 5000 (COP)
