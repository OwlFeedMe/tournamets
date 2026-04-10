class Role:
    ADMIN = "admin"
    ORGANIZER = "organizer"
    USER = "user"
    PARTICIPANT = "participant"

    STAFF = {ADMIN, ORGANIZER}
    APP_ROLES = {ADMIN, ORGANIZER, USER}
    END_USER_ROLES = {PARTICIPANT, USER}


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
