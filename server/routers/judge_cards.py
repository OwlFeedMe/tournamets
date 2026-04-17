import base64
import hashlib
import hmac
import io
import json
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urljoin

import qrcode
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_ALIGN_VERTICAL, WD_ROW_HEIGHT_RULE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import SQLModel, Session, select

from access import require_competition_access
from auth import require_staff
from database import get_session
from models import (
    CompetitionHeat,
    CompetitionHeatAssignment,
    CompetitionParticipant,
    CompetitionPhase,
    Participant,
)

router = APIRouter(prefix="/api/judge-cards", tags=["judge_cards"])


class JudgeCardsExportBody(SQLModel):
    competition_id: int
    phase_ids: list[int] | None = None
    categories: list[str] | None = None
    only_confirmed: int = 1
    include_unassigned: int = 1
    sort_mode: str = "phase_heat_lane_name"
    layout: str = "2x4"
    include_score_field: int = 1
    include_signature_field: int = 1
    include_notes_field: int = 0
    include_qr: int = 1
    extra_fields: list[str] | None = None
    title: str | None = None
    judge_portal_base_url: str | None = None
    judge_portal_path: str = "judge/score"
    qr_expiration_days: int = 30


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _qr_secret() -> str:
    value = (os.getenv("CHECKIN_QR_SECRET") or os.getenv("SECRET_KEY") or "").strip()
    if not value:
        raise HTTPException(500, "Falta CHECKIN_QR_SECRET o SECRET_KEY en el servidor")
    return value


def _make_judge_token(
    *,
    competition_id: int,
    participant_id: int,
    phase_id: int,
    heat_id: int | None,
    expires_days: int,
) -> str:
    now = _utcnow()
    safe_days = min(max(int(expires_days or 30), 1), 365)
    payload = {
        "scope": "judge_score",
        "c": int(competition_id),
        "p": int(participant_id),
        "ph": int(phase_id),
        "h": int(heat_id) if heat_id else None,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=safe_days)).timestamp()),
    }
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(_qr_secret().encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64url_encode(signature)}"


def _qr_image_bytes(url: str) -> io.BytesIO:
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=6, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    image = qr.make_image(fill_color="#0D0F12", back_color="#F5F7FA")
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    buf.seek(0)
    return buf


def _layout_to_grid(layout: str) -> tuple[int, int]:
    normalized = (layout or "").strip().lower()
    allowed = {"2x3", "2x4", "3x3"}
    if normalized not in allowed:
        normalized = "2x4"
    cols, rows = normalized.split("x", 1)
    return int(cols), int(rows)


def _set_cell_border(cell) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_borders = tc_pr.first_child_found_in("w:tcBorders")
    if tc_borders is None:
        tc_borders = OxmlElement("w:tcBorders")
        tc_pr.append(tc_borders)
    for edge in ("top", "left", "bottom", "right"):
        edge_tag = f"w:{edge}"
        element = tc_borders.find(qn(edge_tag))
        if element is None:
            element = OxmlElement(edge_tag)
            tc_borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "8")
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), "252A33")


def _set_page_style(doc: Document) -> None:
    section = doc.sections[0]
    section.orientation = WD_ORIENT.PORTRAIT
    section.left_margin = Inches(0.35)
    section.right_margin = Inches(0.35)
    section.top_margin = Inches(0.35)
    section.bottom_margin = Inches(0.35)


def _add_header(doc: Document, title: str, subtitle: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(title)
    run.bold = True
    run.font.size = Pt(15)
    run.font.color.rgb = RGBColor(0x0D, 0x0F, 0x12)

    p2 = doc.add_paragraph()
    p2.paragraph_format.space_after = Pt(10)
    run2 = p2.add_run(subtitle)
    run2.font.size = Pt(9)
    run2.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)


def _build_cards_dataset(
    session: Session,
    *,
    competition_id: int,
    phase_ids: list[int] | None,
    categories: list[str] | None,
    only_confirmed: bool,
    include_unassigned: bool,
) -> tuple[list[dict], dict[int, CompetitionPhase]]:
    phase_query = select(CompetitionPhase).where(CompetitionPhase.competition_id == competition_id)
    if phase_ids:
        phase_query = phase_query.where(CompetitionPhase.id.in_(phase_ids))
    phase_query = phase_query.order_by(CompetitionPhase.block_order, CompetitionPhase.orden, CompetitionPhase.id)
    phases = session.exec(phase_query).all()
    if not phases:
        raise HTTPException(404, "No se encontraron fases para generar tarjetas")
    phase_map = {int(p.id): p for p in phases if p.id is not None}

    cp_query = (
        select(CompetitionParticipant, Participant)
        .join(Participant, Participant.id == CompetitionParticipant.participant_id)
        .where(CompetitionParticipant.competition_id == competition_id)
    )
    if only_confirmed:
        cp_query = cp_query.where(CompetitionParticipant.estado == "confirmado")
    cp_rows = session.exec(cp_query).all()

    category_filter = {str(c or "").strip().lower() for c in (categories or []) if str(c or "").strip()}
    participants_pool: dict[int, dict] = {}
    for cp, participant in cp_rows:
        category = str(cp.categoria or participant.categoria or "").strip()
        if category_filter and category.lower() not in category_filter:
            continue
        participants_pool[int(participant.id)] = {
            "participant_id": int(participant.id),
            "participant_name": f"{(participant.nombre or '').strip()} {(participant.apellido or '').strip()}".strip(),
            "cedula": str(participant.cedula or "").strip(),
            "category": category or "Sin categoria",
        }
    if not participants_pool:
        raise HTTPException(404, "No hay participantes que coincidan con los filtros")

    heat_query = (
        select(CompetitionHeatAssignment, CompetitionHeat)
        .join(CompetitionHeat, CompetitionHeat.id == CompetitionHeatAssignment.heat_id)
        .where(CompetitionHeat.competition_id == competition_id)
        .where(CompetitionHeat.phase_id.in_(list(phase_map.keys())))
        .order_by(CompetitionHeat.phase_id, CompetitionHeat.heat_number, CompetitionHeat.start_at, CompetitionHeatAssignment.lane_number)
    )
    heat_rows = session.exec(heat_query).all()

    assigned_by_phase: dict[int, list[dict]] = {}
    for assignment, heat in heat_rows:
        participant_id = int(assignment.participant_id or 0)
        if participant_id <= 0:
            continue
        base = participants_pool.get(participant_id)
        if not base:
            continue
        pid = int(heat.phase_id)
        assigned_by_phase.setdefault(pid, []).append(
            {
                **base,
                "phase_id": pid,
                "heat_id": int(heat.id),
                "phase_name": str(phase_map[pid].nombre or "").strip() or f"Fase {pid}",
                "block_name": str(phase_map[pid].block_name or "").strip(),
                "heat_name": str(heat.nombre or "").strip() or f"Heat {int(heat.heat_number or 0)}",
                "heat_number": int(heat.heat_number or 0),
                "lane_number": int(assignment.lane_number or 0),
                "start_at": heat.start_at,
                "location_name": str(heat.location_name or "").strip(),
            }
        )

    cards: list[dict] = []
    for phase_id, phase in phase_map.items():
        phase_cards = assigned_by_phase.get(phase_id, [])
        if phase_cards:
            cards.extend(phase_cards)
            continue
        if include_unassigned:
            for item in participants_pool.values():
                cards.append(
                    {
                        **item,
                        "phase_id": int(phase_id),
                        "heat_id": None,
                        "phase_name": str(phase.nombre or "").strip() or f"Fase {phase_id}",
                        "block_name": str(phase.block_name or "").strip(),
                        "heat_name": "",
                        "heat_number": 0,
                        "lane_number": 0,
                        "start_at": None,
                        "location_name": "",
                    }
                )
    if not cards:
        raise HTTPException(404, "No se encontraron tarjetas para exportar con los filtros actuales")
    return cards, phase_map


def _sort_cards(cards: list[dict], sort_mode: str) -> list[dict]:
    mode = (sort_mode or "").strip().lower()
    if mode == "name":
        return sorted(cards, key=lambda c: (c["participant_name"].lower(), int(c["phase_id"]), int(c.get("lane_number") or 0)))
    return sorted(
        cards,
        key=lambda c: (
            int(c["phase_id"]),
            int(c.get("heat_number") or 0),
            int(c.get("lane_number") or 0),
            c["participant_name"].lower(),
        ),
    )


def _add_card_to_cell(
    cell,
    *,
    card: dict,
    include_score_field: bool,
    include_signature_field: bool,
    include_notes_field: bool,
    include_qr: bool,
    qr_url: str | None,
    qr_width_inches: float,
    extra_fields: set[str],
) -> None:
    cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP
    _set_cell_border(cell)
    cell.text = ""

    p_name = cell.add_paragraph()
    p_name.paragraph_format.space_after = Pt(1)
    run_name = p_name.add_run(card["participant_name"] or "Participante")
    run_name.bold = True
    run_name.font.size = Pt(10.5)
    run_name.font.color.rgb = RGBColor(0x0D, 0x0F, 0x12)

    p_meta = cell.add_paragraph()
    p_meta.paragraph_format.space_after = Pt(1)
    run_meta = p_meta.add_run(f"{card['phase_name']} | {card['category']}")
    run_meta.font.size = Pt(8.5)
    run_meta.font.color.rgb = RGBColor(0x25, 0x2A, 0x33)

    heat_bits = []
    if card.get("heat_name"):
        heat_bits.append(f"Heat: {card['heat_name']}")
    if int(card.get("lane_number") or 0) > 0:
        heat_bits.append(f"Carril: {int(card['lane_number'])}")
    if card.get("location_name"):
        heat_bits.append(f"Zona: {card['location_name']}")
    if heat_bits:
        p_heat = cell.add_paragraph()
        p_heat.paragraph_format.space_after = Pt(1)
        run_heat = p_heat.add_run(" | ".join(heat_bits))
        run_heat.font.size = Pt(8)
        run_heat.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)

    if "cedula" in extra_fields and card.get("cedula"):
        p_id = cell.add_paragraph()
        p_id.paragraph_format.space_after = Pt(1)
        run_id = p_id.add_run(f"ID: {card['cedula']}")
        run_id.font.size = Pt(8)
        run_id.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)

    if include_score_field:
        p_score = cell.add_paragraph()
        p_score.paragraph_format.space_before = Pt(2)
        p_score.paragraph_format.space_after = Pt(1)
        run_score = p_score.add_run("Puntuacion: ____________________")
        run_score.font.size = Pt(9)
        run_score.font.color.rgb = RGBColor(0x0D, 0x0F, 0x12)

    if include_signature_field:
        p_signature = cell.add_paragraph()
        p_signature.paragraph_format.space_after = Pt(1)
        run_signature = p_signature.add_run("Firma atleta: __________________")
        run_signature.font.size = Pt(9)
        run_signature.font.color.rgb = RGBColor(0x0D, 0x0F, 0x12)

    if include_notes_field:
        p_notes = cell.add_paragraph()
        p_notes.paragraph_format.space_after = Pt(1)
        run_notes = p_notes.add_run("Notas: _________________________")
        run_notes.font.size = Pt(8.5)
        run_notes.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)

    if include_qr and qr_url:
        p_qr = cell.add_paragraph()
        p_qr.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p_qr.paragraph_format.space_before = Pt(1)
        run_qr = p_qr.add_run()
        run_qr.add_picture(_qr_image_bytes(qr_url), width=Inches(qr_width_inches))


@router.post("/export-docx")
def export_judge_cards_docx(
    body: JudgeCardsExportBody,
    session: Session = Depends(get_session),
    user=Depends(require_staff),
):
    competition = require_competition_access(session, body.competition_id, user)
    cards, _phase_map = _build_cards_dataset(
        session,
        competition_id=body.competition_id,
        phase_ids=body.phase_ids,
        categories=body.categories,
        only_confirmed=bool(body.only_confirmed),
        include_unassigned=bool(body.include_unassigned),
    )
    cards = _sort_cards(cards, body.sort_mode)

    cols, rows = _layout_to_grid(body.layout)
    cards_per_page = cols * rows
    extra_fields = {str(name or "").strip().lower() for name in (body.extra_fields or []) if str(name or "").strip()}
    qr_width_inches = 0.95 if cols >= 3 else 1.1

    portal_base = (body.judge_portal_base_url or os.getenv("LEADERBOARD_BASE_URL") or "http://localhost:5173/").strip()
    portal_path = (body.judge_portal_path or "judge/score").lstrip("/")
    portal_base = portal_base if portal_base.endswith("/") else f"{portal_base}/"
    portal_url = urljoin(portal_base, portal_path)

    doc = Document()
    _set_page_style(doc)
    title = (body.title or f"Tarjetas de puntuacion - {competition.nombre}").strip()
    subtitle = f"Competencia: {competition.nombre} | Tarjetas: {len(cards)} | Generado: {_utcnow().strftime('%Y-%m-%d %H:%M UTC')}"
    _add_header(doc, title, subtitle)

    for start in range(0, len(cards), cards_per_page):
        chunk = cards[start:start + cards_per_page]
        if start > 0:
            doc.add_page_break()
        table = doc.add_table(rows=rows, cols=cols)
        table.autofit = False
        page_width = doc.sections[0].page_width - doc.sections[0].left_margin - doc.sections[0].right_margin
        col_width = int(page_width / cols)
        row_height = Inches(2.42 if rows == 4 else 3.2)
        for row in table.rows:
            row.height_rule = WD_ROW_HEIGHT_RULE.EXACTLY
            row.height = row_height
        for col_idx in range(cols):
            for row_idx in range(rows):
                table.cell(row_idx, col_idx).width = col_width

        for idx, card in enumerate(chunk):
            r = idx // cols
            c = idx % cols
            token = _make_judge_token(
                competition_id=body.competition_id,
                participant_id=int(card["participant_id"]),
                phase_id=int(card["phase_id"]),
                heat_id=(int(card["heat_id"]) if card.get("heat_id") else None),
                expires_days=int(body.qr_expiration_days or 30),
            )
            query = urlencode(
                {
                    "token": token,
                    "competition_id": int(body.competition_id),
                    "phase_id": int(card["phase_id"]),
                    "participant_id": int(card["participant_id"]),
                }
            )
            qr_url = f"{portal_url}?{query}"
            _add_card_to_cell(
                table.cell(r, c),
                card=card,
                include_score_field=bool(body.include_score_field),
                include_signature_field=bool(body.include_signature_field),
                include_notes_field=bool(body.include_notes_field),
                include_qr=bool(body.include_qr),
                qr_url=qr_url,
                qr_width_inches=qr_width_inches,
                extra_fields=extra_fields,
            )

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    filename = f"finalrep_tarjetas_competencia_{int(body.competition_id)}.docx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
