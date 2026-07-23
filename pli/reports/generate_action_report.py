"""Per-action report: editable markdown + branded visual PDF (charts + narratives)."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from pli_pdf import DESK, PDF, S, WM_GREEN, GREY, NAVY, png_size  # noqa: E402
from reports.action_visual_summaries import (  # noqa: E402
    build_action_visuals,
    diplomacy_action_narrative,
    macro_track_active,
)
from reports.ni_titles import national_interest_section_title  # noqa: E402
from reports.trace_narrative import (  # noqa: E402
    diplomacy_narrative,
    glasl_narrative,
    information_narrative,
    macro_narrative,
    ni_narrative,
    record_to_markdown,
)

OUT_DIR = HERE / "out" / "actions"

_MD_BOLD = re.compile(r"\*\*(.+?)\*\*")
_MD_CODE = re.compile(r"`([^`]+)`")
_MD_HEADING = re.compile(r"^#{1,6}\s+")


def _plain_narrative(md: str) -> str:
    """Strip markdown decorations for PDF body text; drop the ## heading line."""
    if not md:
        return ""
    lines: list[str] = []
    for raw in md.splitlines():
        line = raw.rstrip()
        if _MD_HEADING.match(line):
            continue
        line = _MD_BOLD.sub(r"\1", line)
        line = _MD_CODE.sub(r"\1", line)
        lines.append(line)
    # Collapse leading/trailing blank lines but keep paragraph breaks
    text = "\n".join(lines).strip()
    return text


def _safe_lines(text: str, width: int = 95) -> list[str]:
    out: list[str] = []
    for para in text.splitlines() or [""]:
        para = S(para)
        if not para:
            out.append("")
            continue
        while len(para) > width:
            cut = para.rfind(" ", 0, width)
            if cut < 40:
                cut = width
            out.append(para[:cut])
            para = para[cut:].lstrip()
        out.append(para)
    return out


def _write_wrapped(
    pdf: PDF,
    text: str,
    size: int = 9,
    leading: float = 4.4,
    *,
    align: str = "L",
) -> None:
    pdf.set_font("Helvetica", "", size)
    pdf.set_text_color(30, 30, 30)
    for line in _safe_lines(text):
        if pdf.get_y() > 270:
            pdf.add_page()
            pdf.set_font("Helvetica", "", size)
        pdf.cell(0, leading, line, new_x="LMARGIN", new_y="NEXT", align=align)


def _embed_image(pdf: PDF, path: Path, *, max_w: float = 180, max_h: float = 105) -> None:
    if not path or not Path(path).exists():
        return
    path = Path(path)
    try:
        w_px, h_px = png_size(path)
    except Exception:
        w_px, h_px = 1600, 900
    aspect = h_px / max(w_px, 1)
    w = max_w
    h = w * aspect
    if h > max_h:
        h = max_h
        w = h / aspect
    if pdf.get_y() + h > 270:
        pdf.add_page()
    x = pdf.l_margin + (pdf.w - pdf.l_margin - pdf.r_margin - w) / 2
    pdf.image(str(path), x=x, y=pdf.get_y(), w=w, h=h)
    pdf.set_y(pdf.get_y() + h + 3)


def _page_break_if_needed(pdf: PDF, needed_mm: float) -> None:
    if pdf.get_y() + needed_mm > 270:
        pdf.add_page()


def _section_heading(pdf: PDF, title: str) -> None:
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 7, S(title), new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(1)


def _embed_macro_grid(pdf: PDF, charts: list[Path]) -> None:
    """2-column layout for the five indicator SME charts (Green section 6 style)."""
    if not charts:
        return
    page_w = pdf.w - pdf.l_margin - pdf.r_margin
    col_w = (page_w - 4) / 2
    y0 = pdf.get_y()
    for i, chart in enumerate(charts):
        col = i % 2
        row = i // 2
        try:
            w_px, h_px = png_size(chart)
        except Exception:
            w_px, h_px = 1000, 550
        aspect = h_px / max(w_px, 1)
        w = col_w
        h = w * aspect
        if h > 52:
            h = 52
            w = h / aspect
        x = pdf.l_margin + col * (col_w + 4)
        y = y0 + row * (h + 4)
        if y + h > 250 and col == 0:
            pdf.add_page()
            y0 = pdf.get_y()
            y = y0
        pdf.image(str(chart), x=x, y=y, w=w, h=h)
    rows = (len(charts) + 1) // 2
    try:
        w_px, h_px = png_size(charts[0])
        aspect = h_px / max(w_px, 1)
        h = min(52, col_w * aspect)
    except Exception:
        h = 48
    pdf.set_y(y0 + rows * (h + 4) + 4)


def _section_with_chart(
    pdf: PDF,
    title: str,
    chart_path: Path | None,
    narrative: str,
    *,
    max_h: float = 100,
) -> None:
    _page_break_if_needed(pdf, needed_mm=12 + (max_h if chart_path else 20) + 8)
    _section_heading(pdf, title)
    if chart_path:
        _embed_image(pdf, chart_path, max_h=max_h)
    plain = _plain_narrative(narrative)
    if plain:
        _write_wrapped(pdf, plain, align="L")
    pdf.ln(4)


def _cover_page(pdf: PDF, record: dict[str, Any]) -> None:
    action = record.get("action") or {}
    tracks = record.get("tracks") or {}
    routing = tracks.get("routing") or {}
    action_id = record.get("action_id") or "unknown"
    synthetic = bool(record.get("pilot_synthetic"))

    pdf.add_page()
    pdf.set_fill_color(*NAVY)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 16)
    pdf.multi_cell(0, 10, S(f"  PLI Action Report — {action_id}"), fill=True)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)

    if synthetic:
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(176, 74, 74)
        pdf.multi_cell(0, 6, S("SYNTHETIC OFFLINE PILOT — NOT SME-APPROVED"))
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(*GREY)
        pdf.multi_cell(0, 5, S("Auto-traced multi-track adjudication (SME-editable)"))
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)

    meta = [
        f"Title: {action.get('goal') or 'n/a'}",
        f"Instrument of Power: {routing.get('instrument_of_power') or action.get('instrument_of_power') or 'n/a'}",
        f"Team / Move: {action.get('team')} / {action.get('move')}",
        f"Codebook: {record.get('codebook_version')}",
        f"Status: {record.get('status')}",
        f"Track statuses: {record.get('track_statuses')}",
    ]
    _write_wrapped(pdf, "\n".join(meta), size=10, leading=5.0)
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*WM_GREEN)
    pdf.cell(0, 6, S("Tracks scheduled"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    rt = routing.get("tracks") or {}
    track_lines = [
        f"- Macro: {rt.get('macro')}",
        f"- Diplomacy: {rt.get('diplomacy')}",
        f"- Information: {rt.get('information')}",
        f"- National Interest: {rt.get('national_interest')}",
        f"- Glasl: {rt.get('glasl')}",
    ]
    _write_wrapped(pdf, "\n".join(track_lines), size=9.5, leading=4.8)
    pdf.ln(4)
    if macro_track_active(record):
        blurb = (
            "This report pairs each track's visual with the full auto-traced narrative "
            "underneath. Macro indicator panels use the canonical SME chart generator "
            "(pli_charts.py) — the same language as the White Cell PLI Macro panel after "
            "SME review. Edit outputs in Plenum as needed; overrides become the "
            "adjudication of record."
        )
    else:
        blurb = (
            "This report pairs each scheduled track's visual with the full auto-traced "
            "narrative underneath. Macroeconomic adjudication is omitted when the "
            "Instrument of Power / routing does not schedule a Macro lever vector "
            "(e.g. Green proposals and non-economic filings). Edit outputs in Plenum "
            "as needed; overrides become the adjudication of record."
        )
    _write_wrapped(pdf, blurb, size=9, leading=4.4)


def _pdf_visual_report(
    record: dict[str, Any],
    out_pdf: Path,
    visuals: dict[str, Any],
) -> None:
    tracks = record.get("tracks") or {}
    action = record.get("action") or {}
    team = action.get("team")
    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=16)
    _cover_page(pdf, record)

    # Macro — only when routing scheduled a real macro lever vector
    if macro_track_active(record):
        macro = tracks.get("macro")
        pdf.add_page()
        _section_heading(pdf, "Macroeconomic adjudication")
        macro_charts = visuals.get("macro") or []
        if macro_charts:
            _write_wrapped(
                pdf,
                "SME indicator panels (baseline vs post-action). Green/red wedges mark "
                "favorable/unfavorable divergence. Same generator as post-approval PLI Macro.",
                size=8.5,
                leading=4.0,
                align="C",
            )
            pdf.ln(1)
            _embed_macro_grid(pdf, macro_charts)
        plain = _plain_narrative(macro_narrative(macro))
        if plain:
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*NAVY)
            pdf.cell(0, 6, S("Narrative summary"), new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
            _write_wrapped(pdf, plain, align="L")

    # National Interest (U.S./Blue-centric; label impact for non-Blue teams)
    ni = tracks.get("national_interest")
    if ni is not None:
        _section_with_chart(
            pdf,
            national_interest_section_title(team),
            visuals.get("national_interest"),
            ni_narrative(ni, team=team),
            max_h=95,
        )

    # Glasl
    glasl = tracks.get("glasl")
    if glasl is not None:
        _section_with_chart(
            pdf,
            "Escalation (Glasl)",
            visuals.get("glasl"),
            glasl_narrative(glasl),
            max_h=85,
        )

    # Diplomacy — chart + structured facts + labeled narrative summary (Macro pattern)
    dipl = tracks.get("diplomacy")
    if dipl is not None:
        pdf.add_page()
        _section_heading(pdf, "Diplomacy index")
        chart_path = visuals.get("diplomacy")
        if chart_path:
            _embed_image(pdf, chart_path, max_h=80)
        facts = _plain_narrative(diplomacy_narrative(dipl))
        if facts:
            _write_wrapped(pdf, facts, align="L")
        prose = diplomacy_action_narrative(record)
        if prose:
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*NAVY)
            pdf.cell(0, 6, S("Narrative summary"), new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
            _write_wrapped(pdf, prose, align="L")
        pdf.ln(4)

    # Information
    info = tracks.get("information")
    if info is not None:
        _section_with_chart(
            pdf,
            "Information brief",
            visuals.get("information"),
            information_narrative(info),
            max_h=120,
        )

    # Footnote
    pdf.add_page()
    _section_heading(pdf, "PLI multi-track footnote")
    _write_wrapped(
        pdf,
        "PLI runs parallel tracks after White Cell completeness: macroeconomic "
        "adjudication (Economic Instrument of Power only), Diplomacy indexing "
        "(Diplomatic), an unscored Information brief (Informational), and always-on "
        "National Interest (six-domain National War College tier deltas; U.S./Blue-centric "
        "for every team) plus Glasl "
        "escalation staging. Charts reuse the canonical pli_charts.py / FO report "
        "generators. Sources: PLI_Annotated_Bibliography.md.",
        size=9,
        leading=4.4,
    )

    out_pdf = Path(out_pdf)
    out_pdf.parent.mkdir(parents=True, exist_ok=True)
    out_pdf.write_bytes(pdf.output())


def write_action_report(
    record: dict,
    *,
    out_dir: Path | None = None,
    desktop_copy: Path | None = None,
) -> dict[str, Path]:
    out_dir = out_dir or OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    action_id = record.get("action_id", "unknown")
    md = record_to_markdown(record)
    md_path = out_dir / f"{action_id}.md"
    pdf_path = out_dir / f"{action_id}.pdf"
    md_path.write_text(md, encoding="utf-8")

    chart_dir = out_dir / f"{action_id}_charts"
    try:
        visuals = build_action_visuals(record, chart_dir)
    except Exception as err:  # chart failure should not block narrative PDF
        (out_dir / f"{action_id}_chart_error.txt").write_text(str(err), encoding="utf-8")
        visuals = {
            "macro": [],
            "national_interest": None,
            "glasl": None,
            "diplomacy": None,
            "information": None,
        }

    _pdf_visual_report(record, pdf_path, visuals)

    result: dict[str, Path] = {"markdown": md_path, "pdf": pdf_path, "charts": chart_dir}
    if desktop_copy is not None:
        desk = Path(desktop_copy)
        if not desk.is_absolute():
            desk = DESK / desk
        desk.parent.mkdir(parents=True, exist_ok=True)
        desk.write_bytes(pdf_path.read_bytes())
        result["desktop"] = desk
    return result


def main() -> int:
    import json

    if len(sys.argv) < 2:
        print("Usage: python reports/generate_action_report.py <adjudications/ACTION.json>")
        return 2
    record = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    paths = write_action_report(record)
    print(f"Wrote {paths['markdown']}")
    print(f"Wrote {paths['pdf']}")
    if paths.get("charts"):
        print(f"Charts: {paths['charts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
