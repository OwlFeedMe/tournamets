"""
Email templates for FinalRep notifications.
Each function returns a (subject, text_body, html_body) tuple.
"""

_STYLE = """
  body {
    font-family: Arial, sans-serif;
    background: #0D0F12;
    color: #F5F7FA;
    padding: 24px;
    margin: 0;
  }
  .card {
    max-width: 560px;
    margin: 0 auto;
    background: #171B21;
    border: 1px solid #252A33;
    border-radius: 12px;
    padding: 28px;
  }
  h2 {
    margin-top: 0;
    margin-bottom: 16px;
    color: #FF6B00;
  }
  p, li {
    color: #F5F7FA;
    line-height: 1.6;
  }
  strong {
    color: #FFFFFF;
  }
  a {
    color: #FF9A3D;
  }
  .btn {
    display: inline-block;
    padding: 11px 20px;
    border-radius: 8px;
    background: #FF6B00;
    color: #FFFFFF !important;
    text-decoration: none;
    font-weight: 700;
    margin-top: 8px;
  }
  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 14px;
  }
  .badge-green {
    background: rgba(34, 197, 94, 0.16);
    color: #86EFAC;
    border: 1px solid rgba(34, 197, 94, 0.35);
  }
  .badge-red {
    background: rgba(239, 68, 68, 0.16);
    color: #FCA5A5;
    border: 1px solid rgba(239, 68, 68, 0.35);
  }
  .muted {
    font-size: 13px;
    color: #AAB2C0;
    margin-top: 16px;
  }
  .divider {
    border: none;
    border-top: 1px solid #252A33;
    margin: 20px 0;
  }
  .detail {
    margin: 6px 0;
    color: #F5F7FA;
  }
  .detail span {
    color: #AAB2C0;
  }
  .code {
    font-size: 32px;
    letter-spacing: 6px;
    font-weight: 800;
    color: #FF6B00;
    margin: 8px 0;
  }
"""


def _html(title: str, content: str) -> str:
    return f"""\
<html>
  <head><style>{_STYLE}</style></head>
  <body>
    <div class="card">
      <h2>{title}</h2>
      {content}
    </div>
  </body>
</html>"""


# ---------------------------------------------------------------------------
# 1. Bienvenida tras registro
# ---------------------------------------------------------------------------

def render_welcome(*, nombre: str) -> tuple[str, str, str]:
    subject = "Bienvenido/a a FinalRep"
    text = (
        f"Hola {nombre},\n\n"
        "Tu cuenta en FinalRep ha sido creada exitosamente.\n\n"
        "Ya puedes inscribirte en competencias, ver tus resultados y mucho mas.\n\n"
        "Si tienes alguna duda, escribenos a support@finalrep.co\n\n"
        "Equipo FinalRep"
    )
    html = _html("Bienvenido/a a FinalRep", f"""\
      <p>Hola <strong>{nombre}</strong>,</p>
      <p>Tu cuenta ha sido creada exitosamente. Ya puedes explorar y inscribirte en competencias.</p>
      <hr class="divider">
      <p class="muted">Si tienes alguna duda escribe a <a href="mailto:support@finalrep.co" style="color:#e63946;">support@finalrep.co</a></p>
    """)
    return subject, text, html


# ---------------------------------------------------------------------------
# 2. Pago aprobado
# ---------------------------------------------------------------------------

def render_payment_approved(
    *,
    nombre: str,
    competition_name: str,
    category_name: str,
    order_id: str,
) -> tuple[str, str, str]:
    subject = f"Pago aprobado - {competition_name}"
    text = (
        f"Hola {nombre},\n\n"
        f"Tu pago para la competencia \"{competition_name}\" ha sido aprobado.\n\n"
        f"Categoria: {category_name}\n"
        f"Referencia: {order_id}\n\n"
        "Tu inscripcion esta en proceso de revision por el organizador. "
        "Te notificaremos cuando sea confirmada.\n\n"
        "Equipo FinalRep"
    )
    html = _html("Pago aprobado", f"""\
      <p>Hola <strong>{nombre}</strong>,</p>
      <p>Tu pago fue aprobado exitosamente. <span class="badge badge-green">Aprobado</span></p>
      <hr class="divider">
      <p class="detail"><span>Competencia:</span> <strong>{competition_name}</strong></p>
      <p class="detail"><span>Categoria:</span> {category_name}</p>
      <p class="detail"><span>Referencia:</span> {order_id}</p>
      <hr class="divider">
      <p>Tu inscripcion esta en proceso de revision. Te avisaremos cuando el organizador la confirme.</p>
      <p class="muted">Consultas: <a href="mailto:support@finalrep.co" style="color:#e63946;">support@finalrep.co</a></p>
    """)
    return subject, text, html


# ---------------------------------------------------------------------------
# 3. Pago rechazado
# ---------------------------------------------------------------------------

def render_payment_rejected(
    *,
    nombre: str,
    competition_name: str,
    category_name: str,
) -> tuple[str, str, str]:
    subject = f"Pago no aprobado - {competition_name}"
    text = (
        f"Hola {nombre},\n\n"
        f"Lamentablemente tu pago para la competencia \"{competition_name}\" (categoria: {category_name}) "
        "no fue aprobado por la pasarela de pago.\n\n"
        "Puedes intentarlo nuevamente desde la plataforma.\n\n"
        "Si el problema persiste, escribe a support@finalrep.co\n\n"
        "Equipo FinalRep"
    )
    html = _html("Pago no aprobado", f"""\
      <p>Hola <strong>{nombre}</strong>,</p>
      <p>Tu pago no fue aprobado. <span class="badge badge-red">Rechazado</span></p>
      <hr class="divider">
      <p class="detail"><span>Competencia:</span> <strong>{competition_name}</strong></p>
      <p class="detail"><span>Categoria:</span> {category_name}</p>
      <hr class="divider">
      <p>Puedes intentar el pago nuevamente desde la plataforma.</p>
      <p class="muted">Si el problema persiste escribe a <a href="mailto:support@finalrep.co" style="color:#e63946;">support@finalrep.co</a></p>
    """)
    return subject, text, html


# ---------------------------------------------------------------------------
# 4. Inscripcion confirmada por el organizador
# ---------------------------------------------------------------------------

def render_enrollment_confirmed(
    *,
    nombre: str,
    competition_name: str,
    category_name: str,
) -> tuple[str, str, str]:
    subject = f"Inscripcion confirmada - {competition_name}"
    text = (
        f"Hola {nombre},\n\n"
        f"Tu inscripcion en la competencia \"{competition_name}\" ha sido CONFIRMADA.\n\n"
        f"Categoria: {category_name}\n\n"
        "Prepárate, ya eres parte oficial del evento.\n\n"
        "Equipo FinalRep"
    )
    html = _html("Inscripcion confirmada", f"""\
      <p>Hola <strong>{nombre}</strong>,</p>
      <p>Tu inscripcion ha sido <span class="badge badge-green">Confirmada</span></p>
      <hr class="divider">
      <p class="detail"><span>Competencia:</span> <strong>{competition_name}</strong></p>
      <p class="detail"><span>Categoria:</span> {category_name}</p>
      <hr class="divider">
      <p>Ya eres parte oficial de la competencia. ¡Prepárate!</p>
      <p class="muted">Consultas: <a href="mailto:support@finalrep.co" style="color:#e63946;">support@finalrep.co</a></p>
    """)
    return subject, text, html


# ---------------------------------------------------------------------------
# 5. Solicitud de organizador recibida (al usuario)
# ---------------------------------------------------------------------------

def render_organizer_application_received(*, nombre: str) -> tuple[str, str, str]:
    subject = "Solicitud de organizador recibida - FinalRep"
    text = (
        f"Hola {nombre},\n\n"
        "Recibimos tu solicitud para ser organizador en FinalRep.\n\n"
        "Nuestro equipo la revisará a la brevedad y te notificaremos por correo con la decision.\n\n"
        "Equipo FinalRep"
    )
    html = _html("Solicitud recibida", f"""\
      <p>Hola <strong>{nombre}</strong>,</p>
      <p>Hemos recibido tu solicitud para convertirte en organizador de eventos en FinalRep.</p>
      <p>Nuestro equipo la revisará y te avisaremos pronto con la respuesta.</p>
      <p class="muted">Consultas: <a href="mailto:support@finalrep.co" style="color:#e63946;">support@finalrep.co</a></p>
    """)
    return subject, text, html


# ---------------------------------------------------------------------------
# 7. Nueva solicitud de organizador (notificacion interna al admin)
# ---------------------------------------------------------------------------

def render_organizer_application_admin_notice(
    *,
    nombre: str,
    email: str,
    requested_event_name: str,
) -> tuple[str, str, str]:
    subject = f"Nueva solicitud de organizador: {nombre}"
    text = (
        f"Nueva solicitud de organizador en FinalRep.\n\n"
        f"Usuario: {nombre}\n"
        f"Email: {email}\n"
        f"Evento solicitado: {requested_event_name}\n\n"
        "Revisa la solicitud en el panel de administracion."
    )
    html = _html("Nueva solicitud de organizador", f"""\
      <p>Se ha recibido una nueva solicitud para ser organizador.</p>
      <hr class="divider">
      <p class="detail"><span>Usuario:</span> <strong>{nombre}</strong></p>
      <p class="detail"><span>Email:</span> {email}</p>
      <p class="detail"><span>Evento:</span> {requested_event_name}</p>
      <hr class="divider">
      <p>Revisa la solicitud en el panel de administracion.</p>
    """)
    return subject, text, html


# ---------------------------------------------------------------------------
# 8. Solicitud de organizador aprobada
# ---------------------------------------------------------------------------

def render_organizer_application_approved(*, nombre: str) -> tuple[str, str, str]:
    subject = "Solicitud aprobada - Ya puedes crear eventos en FinalRep"
    text = (
        f"Hola {nombre},\n\n"
        "Tu solicitud para ser organizador en FinalRep ha sido APROBADA.\n\n"
        "Ya tienes acceso para crear y gestionar competencias en la plataforma.\n\n"
        "Equipo FinalRep"
    )
    html = _html("Solicitud aprobada", f"""\
      <p>Hola <strong>{nombre}</strong>,</p>
      <p>Tu solicitud para ser organizador ha sido <span class="badge badge-green">Aprobada</span></p>
      <hr class="divider">
      <p>Ya tienes acceso para crear y gestionar competencias en FinalRep.</p>
      <p class="muted">Consultas: <a href="mailto:support@finalrep.co" style="color:#e63946;">support@finalrep.co</a></p>
    """)
    return subject, text, html


# ---------------------------------------------------------------------------
# 9. Solicitud de organizador rechazada
# ---------------------------------------------------------------------------

def render_password_reset_code(*, nombre: str, code: str) -> tuple[str, str, str]:
    subject = "Codigo para restablecer tu contrasena - FinalRep"
    text = (
        f"Hola {nombre},\n\n"
        "Recibimos una solicitud para restablecer tu contrasena en FinalRep.\n\n"
        f"Tu codigo de verificacion es: {code}\n\n"
        "Este codigo vence en 20 minutos.\n\n"
        "Si no solicitaste este cambio, puedes ignorar este mensaje.\n\n"
        "Equipo FinalRep"
    )
    html = _html("Restablecer contrasena", f"""\
      <p>Hola <strong>{nombre}</strong>,</p>
      <p>Recibimos una solicitud para restablecer tu contrasena.</p>
      <hr class="divider">
      <p style="margin-bottom:4px;">Tu codigo de verificacion es:</p>
      <p class="code">{code}</p>
      <hr class="divider">
      <p class="muted">Este codigo vence en <strong>20 minutos</strong>. Si no solicitaste este cambio, ignora este mensaje.</p>
    """)
    return subject, text, html


def render_spectator_tickets_approved(
    *,
    buyer_name: str,
    competition_name: str,
    quantity: int,
    order_id: str,
) -> tuple[str, str, str]:
    subject = f"Tus boletas - {competition_name}"
    text = (
        f"Hola {buyer_name},\n\n"
        f"Tu pago fue aprobado para {competition_name}.\n"
        f"Cantidad de boletas: {quantity}\n"
        f"Referencia: {order_id}\n\n"
        "Adjuntamos las boletas en PDF. Presenta el QR de cada boleta en el ingreso.\n\n"
        "Equipo FinalRep"
    )
    html = _html("Boletas confirmadas", f"""\
      <p>Hola <strong>{buyer_name}</strong>,</p>
      <p>Tu pago fue aprobado. <span class="badge badge-green">Aprobado</span></p>
      <hr class="divider">
      <p class="detail"><span>Competencia:</span> <strong>{competition_name}</strong></p>
      <p class="detail"><span>Cantidad de boletas:</span> {quantity}</p>
      <p class="detail"><span>Referencia:</span> {order_id}</p>
      <hr class="divider">
      <p>Adjuntamos las boletas en PDF. Cada boleta tiene un QR unico para escaneo en puerta.</p>
      <p class="muted">Si tienes dudas, escribe a <a href="mailto:support@finalrep.co" style="color:#e63946;">support@finalrep.co</a></p>
    """)
    return subject, text, html


def render_organizer_application_rejected(
    *,
    nombre: str,
    review_note: str | None = None,
) -> tuple[str, str, str]:
    subject = "Solicitud de organizador no aprobada - FinalRep"
    note_text = f"\nMotivo: {review_note}\n" if review_note else ""
    note_html = f'<p class="detail"><span>Motivo:</span> {review_note}</p>' if review_note else ""
    text = (
        f"Hola {nombre},\n\n"
        "Tu solicitud para ser organizador en FinalRep no fue aprobada en esta ocasion.\n"
        f"{note_text}\n"
        "Si tienes preguntas, escribe a support@finalrep.co\n\n"
        "Equipo FinalRep"
    )
    html = _html("Solicitud no aprobada", f"""\
      <p>Hola <strong>{nombre}</strong>,</p>
      <p>Tu solicitud para ser organizador no fue aprobada. <span class="badge badge-red">No aprobada</span></p>
      <hr class="divider">
      {note_html}
      <p>Si tienes preguntas escribe a <a href="mailto:support@finalrep.co" style="color:#e63946;">support@finalrep.co</a></p>
    """)
    return subject, text, html


# ---------------------------------------------------------------------------
# Invitacion de competidor
# ---------------------------------------------------------------------------

def render_competitor_invitation(
    *,
    nombre: str,
    competition_name: str,
    invited_by_name: str,
    categoria: str | None,
    note: str | None,
    invitation_url: str,
) -> tuple[str, str, str]:
    categoria_line = f"Categoria asignada: {categoria}\n" if categoria else ""
    nota_line = f"Nota del organizador: {note}\n" if note else ""
    categoria_html = f'<p class="detail"><span>Categoria:</span> <strong>{categoria}</strong></p>' if categoria else ""
    nota_html = f'<p class="detail"><span>Nota:</span> {note}</p>' if note else ""

    subject = f"Invitacion a competir - {competition_name}"
    text = (
        f"Hola {nombre},\n\n"
        f"{invited_by_name} te invito a participar en la competencia \"{competition_name}\".\n\n"
        f"{categoria_line}"
        f"{nota_line}"
        "La inscripcion es sin costo — el organizador ya la cubre.\n\n"
        "Para aceptar o rechazar la invitacion ingresa a FinalRep:\n"
        f"{invitation_url}\n\n"
        "Equipo FinalRep"
    )
    html = _html("Invitacion a competir", f"""\
      <p>Hola <strong>{nombre}</strong>,</p>
      <p><strong>{invited_by_name}</strong> te invito a participar en esta competencia.</p>
      <hr class="divider">
      <p class="detail"><span>Competencia:</span> <strong>{competition_name}</strong></p>
      {categoria_html}
      {nota_html}
      <p class="detail" style="color:#8DF1E4; font-weight:700;">La inscripcion es sin costo.</p>
      <hr class="divider">
      <p>Ingresa a FinalRep para aceptar o rechazar la invitacion:</p>
      <a href="{invitation_url}" class="btn">Ver invitacion</a>
      <p class="muted">Si no reconoces esta invitacion, puedes ignorar este correo.</p>
    """)
    return subject, text, html
