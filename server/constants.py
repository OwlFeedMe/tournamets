class Role:
    ADMIN = "admin"
    ORGANIZER = "organizer"
    JUDGE = "judge"
    USER = "user"
    PARTICIPANT = "participant"

    STAFF = {ADMIN, ORGANIZER}
    APP_ROLES = {ADMIN, ORGANIZER, JUDGE, USER}
    END_USER_ROLES = {PARTICIPANT, USER}
    EXTRA_ROLES = {ADMIN, ORGANIZER, JUDGE}


class EstadoParticipante:
    ACTIVO = "activo"
    INACTIVO = "inactivo"


class EstadoInscripcion:
    CONFIRMADO = "confirmado"
    PENDIENTE = "pendiente"
    RECHAZADO = "rechazado"


class EstadoFase:
    PENDIENTE = "pendiente"
    EN_PROGRESO = "en_progreso"
    FINALIZADA = "finalizada"

    ALL = {PENDIENTE, EN_PROGRESO, FINALIZADA}


class Modalidad:
    INDIVIDUAL = "individual"
    TEAMS = "teams"

    ALL = {INDIVIDUAL, TEAMS}


class FormatoFase:
    ACTIVITY = "activity"
    WOD = "wod"

    ALL = {ACTIVITY, WOD}


class ReglaGanador:
    HIGHER_WINS = "higher_wins"
    LOWER_WINS = "lower_wins"

    ALL = {HIGHER_WINS, LOWER_WINS}


class ModoPoints:
    MANUAL = "manual"
    POSITION_DIRECT = "position_direct"
    POSITION_RULES = "position_rules"

    ALL = {MANUAL, POSITION_DIRECT, POSITION_RULES}


class ModoTV:
    CYCLIC = "cyclic"
    STATIC = "static"

    ALL = {CYCLIC, STATIC}


class ReglaMiembro:
    FREE = "free"
    SAME_CATEGORY = "same_category"

    ALL = {FREE, SAME_CATEGORY}


class MedicionFase:
    AMRAP = "amrap"
    EMOM = "emom"
    FOR_TIME = "for_time"
    RM = "rm"
    UNIDADES = "unidades"
    METROS = "metros"
    TIEMPO_HMS = "tiempo_hms"
    REPETICIONES = "repeticiones"
    KILOGRAMOS = "kilogramos"
    GRAMOS = "gramos"
    LIBRAS = "libras"
    POSICION = "posicion"

    ALL = {AMRAP, EMOM, FOR_TIME, RM, UNIDADES, METROS, TIEMPO_HMS, REPETICIONES, KILOGRAMOS, GRAMOS, LIBRAS, POSICION}

    # Métodos que implican medición de tiempo (gana el menor)
    TIPO_TIEMPO = {FOR_TIME, TIEMPO_HMS}
    TIPO_POSICION = {POSICION}

    ALIAS = {
        "rm": RM,
        "repetition maximum": RM,
        "unidad": UNIDADES,
        "metro": METROS,
        "tiempo": TIEMPO_HMS,
        "hh:mm:ss": TIEMPO_HMS,
        "hms": TIEMPO_HMS,
        "reps": REPETICIONES,
        "rep": REPETICIONES,
        "kg": KILOGRAMOS,
        "g": GRAMOS,
        "lb": LIBRAS,
        "lbs": LIBRAS,
        "posición": POSICION,
        "fortime": FOR_TIME,
        "for time": FOR_TIME,
    }


class UnidadRM:
    KG = "kg"
    LB = "lb"

    ALL = {KG, LB}


class GymStatus:
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    PUBLISHED = "published"
    REJECTED = "rejected"
    ARCHIVED = "archived"
    SUSPENDED = "suspended"

    ALL = {DRAFT, PENDING_REVIEW, PUBLISHED, REJECTED, ARCHIVED, SUSPENDED}
    PUBLIC = {PUBLISHED}


class GymOwnershipStatus:
    UNCLAIMED = "unclaimed"
    CLAIM_PENDING = "claim_pending"
    CLAIMED = "claimed"
    VERIFIED = "verified"

    ALL = {UNCLAIMED, CLAIM_PENDING, CLAIMED, VERIFIED}


class GymPlanTier:
    FREE = "free"
    PRO = "pro"
    PARTNER = "partner"

    ALL = {FREE, PRO, PARTNER}


class GymMembershipStatus:
    DECLARED = "declared"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    REMOVED = "removed"
    INACTIVE = "inactive"

    ALL = {DECLARED, PENDING_APPROVAL, APPROVED, REJECTED, REMOVED, INACTIVE}
    ACTIVE = {DECLARED, PENDING_APPROVAL, APPROVED}


class GymStaffRole:
    OWNER = "owner"
    MANAGER = "manager"
    COACH = "coach"
    STAFF = "staff"

    ALL = {OWNER, MANAGER, COACH, STAFF}


class GymClaimStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"

    ALL = {PENDING, APPROVED, REJECTED, WITHDRAWN}


class GymSubmissionStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    MATCHED = "matched"

    ALL = {PENDING, APPROVED, REJECTED, MATCHED}


class AthleteProfileVisibility:
    PUBLIC = "public"
    PRIVATE = "private"

    ALL = {PUBLIC, PRIVATE}


ATHLETE_USERNAME_RESERVED = {
    "a",
    "admin",
    "api",
    "app",
    "auth",
    "athlete",
    "athletes",
    "competition",
    "competitions",
    "event",
    "events",
    "explore",
    "finalrep",
    "gym",
    "gyms",
    "home",
    "judge",
    "leaderboard",
    "login",
    "notifications",
    "organizer",
    "profile",
    "rankings",
    "register",
    "results",
    "schedule",
    "signup",
    "system",
    "teams",
    "tv",
    "user",
    "users",
    "workout",
    "workouts",
}
