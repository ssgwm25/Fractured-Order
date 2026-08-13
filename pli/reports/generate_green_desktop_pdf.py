"""Combined Desktop PDF for Green Cell full multi-track PLI run."""
from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from pli_pdf import DESK, PDF, S, WM_GOLD, WM_GREEN, GREY, NAVY, png_size  # noqa: E402
from reports.green_visual_summaries import build_all_summaries  # noqa: E402

OUT_NAME = "PLI_Green_Cell_Full_Multitrack_Adjudication.pdf"


def _track_flags(record: dict[str, Any]) -> str:
    r = (record.get("tracks") or {}).get("routing") or {}
    t = r.get("tracks") or {}
    bits = []
    if t.get("macro"):
        bits.append("Economics")
    if t.get("diplomacy"):
        bits.append("Diplomacy")
    if t.get("information"):
        bits.append("Information")
    bits.append("National Interest (impact on Blue)")
    bits.append("Escalation")
    return ", ".join(bits)


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
    leading: float = 4.2,
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
    """Place a PNG centered in the content width, preserving aspect ratio."""
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


def _section_heading(pdf: PDF, title: str, *, align: str = "L") -> None:
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 7, S(title), new_x="LMARGIN", new_y="NEXT", align=align)
    pdf.ln(1)


def _page_break_if_needed(pdf: PDF, needed_mm: float) -> None:
    """Start a new page when heading + chart would not fit together."""
    bottom = 270.0
    if pdf.get_y() + needed_mm > bottom:
        pdf.add_page()


def _section_with_chart(
    pdf: PDF,
    title: str,
    chart_path: Path,
    narrative: str,
    *,
    max_h: float = 100,
) -> None:
    """Keep section heading on the same page as its chart (page-break as a unit)."""
    # Heading (~10) + chart + small gap; narrative may continue on next page.
    _page_break_if_needed(pdf, needed_mm=12 + max_h + 8)
    _section_heading(pdf, title, align="C")
    _embed_image(pdf, chart_path, max_h=max_h)
    _write_wrapped(pdf, narrative, align="C")
    pdf.ln(4)


def _append_visual_summaries(pdf: PDF, records: list[dict[str, Any]]) -> None:
    work = Path(tempfile.mkdtemp(prefix="pli_green_viz_"))
    try:
        summaries = build_all_summaries(records, work_dir=work)

        pdf.h1("Visual summaries — all tracks")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(40, 40, 40)
        _write_wrapped(
            pdf,
            "Corpus-level visuals for Diplomacy, National Interest (impact on Blue), Information, "
            "Escalation (Glasl), and Economics. Economics charts reuse the canonical "
            "SME adjudication generator (pli_charts.py). Board caveat: this pilot has "
            "no Green-country macro baselines — econ charts show Green Economic lever "
            "deltas on the U.S./Blue FO indicator board (directional adjudication "
            "display, not Green national forecasts). PCE inflation titles use Q4/Q4 "
            "because the Fed/IMF anchor is fourth-quarter-over-fourth-quarter percent "
            "change, not a calendar-year average. Narratives under each figure are "
            "White Cell facilitation notes for player briefbacks.",
            align="C",
        )
        pdf.ln(3)

        _section_with_chart(
            pdf,
            "1. Diplomacy Index",
            summaries["diplomacy"]["path"],
            summaries["diplomacy"]["narrative"],
            max_h=100,
        )
        _section_with_chart(
            pdf,
            "2. National Interest (impact on Blue — National War College domains)",
            summaries["national_interest"]["path"],
            summaries["national_interest"]["narrative"],
            max_h=100,
        )
        _section_with_chart(
            pdf,
            "3. Information briefs",
            summaries["information"]["path"],
            summaries["information"]["narrative"],
            max_h=145,
        )
        _section_with_chart(
            pdf,
            "4. Escalation (Glasl)",
            summaries["escalation"]["path"],
            summaries["escalation"]["narrative"],
            max_h=100,
        )
        # Economics stacked — keep header with the chart panel
        _section_with_chart(
            pdf,
            "5. Economics — Green levers on Blue/U.S. FO board (stacked)",
            summaries["economics_stacked"]["path"],
            summaries["economics_stacked"]["narrative"],
            max_h=130,
        )

        # Per-action SME charts
        _page_break_if_needed(pdf, needed_mm=40)
        _section_heading(
            pdf,
            "6. Economics — per-action SME charts (Blue-board display)",
            align="C",
        )
        _write_wrapped(
            pdf,
            "Each Economic Green action below uses the same five-indicator SME panel "
            "(pli_charts.plot_adjudication_indicator). Read every panel as: U.S./Blue "
            "baseline + this Green Economic action's lever deltas. Not Green GDP/inflation "
            "national accounts.",
            align="C",
        )
        pdf.ln(2)
        for item in summaries["economics_actions"]:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 12)
            pdf.set_text_color(*WM_GREEN)
            pdf.multi_cell(
                0, 6, S(f"{item['action_id']} — {item.get('title') or ''}"), align="C"
            )
            pdf.ln(2)
            charts = item.get("charts") or []
            # 2-column layout for the five indicator charts
            if charts:
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
                # approximate advance
                try:
                    _, h_px = png_size(charts[0])
                    w_px, _ = png_size(charts[0])
                    aspect = h_px / max(w_px, 1)
                    h = min(52, col_w * aspect)
                except Exception:
                    h = 48
                pdf.set_y(y0 + rows * (h + 4) + 4)
            _write_wrapped(pdf, item["narrative"], align="C")
    finally:
        shutil.rmtree(work, ignore_errors=True)


def write_green_desktop_pdf(
    records: list[dict[str, Any]],
    *,
    corpus_meta: dict[str, Any] | None = None,
    out_path: Path | None = None,
) -> Path:
    out_path = out_path or (DESK / OUT_NAME)
    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=16)

    # Cover
    pdf.add_page()
    pdf.ln(28)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(*WM_GREEN)
    pdf.multi_cell(0, 10, S("Fractured Order 1.0"), align="C")
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 18)
    pdf.multi_cell(0, 9, S("Green Cell — Full PLI Multitrack"), align="C")
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(*GREY)
    pdf.multi_cell(
        0,
        6,
        S("Information  ·  Diplomacy  ·  National Interest (impact on Blue)  ·  Escalation  ·  Economics"),
        align="C",
    )
    pdf.ln(8)
    pdf.set_draw_color(*WM_GOLD)
    pdf.set_line_width(0.6)
    pdf.line(40, pdf.get_y(), 170, pdf.get_y())
    pdf.ln(10)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(40, 40, 40)
    cover_bits = [
        f"Actions adjudicated: {len(records)} (Appendix B chronological order)",
        "Pipeline: PLI Master multi-track (adjudicate_router + track engines)",
        "Order lock: Move 1 seq 1-12, then Move 2 seq 1-10",
        "Tracks: Macro when Economic IOP; Diplomacy / Information by lane;",
        "         National Interest (impact on Blue) + Glasl Escalation on every action",
        "",
        "SYNTHETIC OFFLINE PILOT — interpretive NI/Glasl/Info/Diplomacy and",
        "macro worksheets are corpus fixtures for full-pipeline demonstration;",
        "not SME-approved White Cell judgments of record.",
    ]
    if corpus_meta and corpus_meta.get("source_order"):
        cover_bits.insert(1, S(f"Source order: {corpus_meta['source_order'][:90]}"))
    for line in cover_bits:
        pdf.cell(0, 5.5, S(line), new_x="LMARGIN", new_y="NEXT", align="C")

    # Chronology index
    pdf.h1("Chronological action index")
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(235, 239, 247)
    pdf.set_text_color(*NAVY)
    headers = ["#", "ID", "Actor", "Title", "IOP", "Tracks"]
    widths = [10, 28, 18, 70, 28, 36]
    for h, w in zip(headers, widths):
        pdf.cell(w, 6, S(h), border=0, fill=True)
    pdf.ln()
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(20, 20, 20)
    for i, rec in enumerate(records, 1):
        action = rec.get("action") or {}
        title = (action.get("goal") or "")[:42]
        iop = action.get("instrument_of_power") or ""
        row = [
            str(i),
            str(rec.get("action_id")),
            str(action.get("sector") or "")[:8],
            title,
            iop[:12],
            _track_flags(rec)[:28],
        ]
        if pdf.get_y() > 270:
            pdf.add_page()
        for val, w in zip(row, widths):
            pdf.cell(w, 5, S(val), border=0)
        pdf.ln()

    # Per-action pages in chrono order
    for idx, rec in enumerate(records, 1):
        action = rec.get("action") or {}
        tracks = rec.get("tracks") or {}
        aid = rec.get("action_id")
        pdf.h1(f"{idx}. {aid}")
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*WM_GREEN)
        pdf.multi_cell(0, 6, S(str(action.get("goal") or "")))
        pdf.ln(2)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(40, 40, 40)
        meta = [
            f"Team: green   Move: {action.get('move')}   "
            f"Instrument of Power: {action.get('instrument_of_power')}",
            f"Status: {rec.get('status')}   Track statuses: {rec.get('track_statuses')}",
            f"Tracks run: {_track_flags(rec)}",
            f"Orientation context: {(tracks.get('national_interest') or {}).get('orientation')}",
        ]
        for line in meta:
            pdf.cell(0, 5, S(line), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        # Diplomacy
        dipl = tracks.get("diplomacy")
        if dipl:
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*NAVY)
            pdf.cell(0, 6, S("Diplomacy Index"), new_x="LMARGIN", new_y="NEXT")
            if dipl.get("status") == "needs_human":
                _write_wrapped(pdf, f"Needs human: {dipl.get('needs_human_reason')}")
            else:
                _write_wrapped(
                    pdf,
                    f"Code: {dipl.get('code_string')}\n"
                    f"Band: {dipl.get('band')} | Category: {dipl.get('category')}\n"
                    f"Policy style: {dipl.get('policy_style')}\n"
                    f"Rationale: {dipl.get('rationale')}\n"
                    "(Index code — not a numeric score.)",
                )
            pdf.ln(2)

        # Information
        info = tracks.get("information")
        if info:
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*NAVY)
            pdf.cell(0, 6, S("Information Brief (unscored)"), new_x="LMARGIN", new_y="NEXT")
            if info.get("status") == "needs_human":
                _write_wrapped(pdf, f"Needs human: {info.get('needs_human_reason')}")
            else:
                sec = info.get("sections") or {}
                _write_wrapped(
                    pdf,
                    f"Summary: {sec.get('summary', '')}\n"
                    f"Audiences: {sec.get('audiences', '')}\n"
                    f"Narratives: {sec.get('narratives', '')}\n"
                    f"Second-order effects: {sec.get('second_order_effects', '')}\n"
                    f"SME questions: {sec.get('sme_questions', '')}",
                )
            pdf.ln(2)

        # National Interest
        ni = tracks.get("national_interest") or {}
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*NAVY)
        pdf.cell(
            0,
            6,
            S("National Interest (impact on Blue — National War College domains)"),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        if ni.get("status") == "needs_human":
            _write_wrapped(pdf, f"Needs human: {ni.get('needs_human_reason')}")
        else:
            ni_lines = []
            for domain, entry in (ni.get("domain_deltas") or {}).items():
                ni_lines.append(
                    f"{domain} ({entry.get('label')}): {entry.get('delta'):+d} — "
                    f"{entry.get('rationale')}"
                )
            if ni.get("threat_cross_check"):
                tc = ni["threat_cross_check"]
                ni_lines.append(
                    f"Threat cross-check — Capability: {tc.get('capability')} | "
                    f"Will: {tc.get('will')} | Vulnerability: {tc.get('vulnerability')}"
                )
            _write_wrapped(pdf, "\n".join(ni_lines))
        pdf.ln(2)

        # Escalation / Glasl
        gl = tracks.get("glasl") or {}
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*NAVY)
        pdf.cell(0, 6, S("Escalation (Glasl)"), new_x="LMARGIN", new_y="NEXT")
        _write_wrapped(
            pdf,
            f"Stage before: {gl.get('stage_before')} ({gl.get('stage_before_label')})\n"
            f"Delta: {gl.get('delta'):+d}\n"
            f"Stage after: {gl.get('stage_after')} ({gl.get('stage_after_label')})\n"
            f"Rationale: {gl.get('rationale')}",
        )
        pdf.ln(2)

        # Economics / Macro — only when this filing actually scored a lever vector
        macro = tracks.get("macro") or {}
        routing_macro = ((tracks.get("routing") or {}).get("tracks") or {}).get("macro")
        macro_skipped = (
            not routing_macro
            or macro.get("status") in ("skipped_ne", "skipped")
            or (macro.get("trend") or {}).get("no_effect")
        )
        if not macro_skipped:
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*NAVY)
            pdf.cell(0, 6, S("Economics (Macro PLI)"), new_x="LMARGIN", new_y="NEXT")
            if macro.get("status") == "needs_human":
                _write_wrapped(pdf, f"Needs human: {macro.get('needs_human_reason')}")
            else:
                clf = macro.get("classification") or {}
                impl = macro.get("implementation") or {}
                trend = macro.get("trend") or {}
                lines = [
                    f"Lever {clf.get('lever')} / instrument {clf.get('instrument')} "
                    f"({clf.get('direction')})",
                    f"Rule: {clf.get('rule_citation')}",
                    f"Implementation {impl.get('score')}/10 "
                    f"(band {trend.get('implementation_band')}; matrix persistence)",
                    "Indicator verdicts:",
                ]
                for key, ind in (trend.get("indicators") or {}).items():
                    lines.append(
                        f"  - {ind.get('label', key)}: {ind.get('verdict', 'n/a')}"
                    )
                _write_wrapped(pdf, "\n".join(lines))

    # Rollup
    pdf.h1("Simulation rollup (chronological)")
    glasl_path = []
    ni_sums = {f"NI-{i}": 0 for i in range(1, 7)}
    dipl_codes = []
    econ_hits = []
    info_hits = []
    for rec in records:
        aid = rec.get("action_id")
        tracks = rec.get("tracks") or {}
        gl = tracks.get("glasl") or {}
        if gl.get("stage_after") is not None:
            glasl_path.append(
                f"{aid}: {gl.get('stage_before')}->{gl.get('stage_after')} "
                f"(d{gl.get('delta'):+d})"
            )
        for domain, entry in ((tracks.get("national_interest") or {}).get("domain_deltas") or {}).items():
            ni_sums[domain] = ni_sums.get(domain, 0) + int(entry.get("delta") or 0)
        dipl = tracks.get("diplomacy") or {}
        if dipl.get("code_string"):
            dipl_codes.append(f"{aid}: {dipl['code_string']}")
        macro = tracks.get("macro") or {}
        if macro.get("status") == "pending" and not (macro.get("trend") or {}).get("no_effect"):
            clf = macro.get("classification") or {}
            econ_hits.append(f"{aid}: {clf.get('lever')}/{clf.get('instrument')}")
        if tracks.get("information") and tracks["information"].get("status") == "pending":
            info_hits.append(aid)

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, S("Glasl path"), new_x="LMARGIN", new_y="NEXT")
    _write_wrapped(pdf, "\n".join(glasl_path))
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, S("NI domain sums (all Green actions)"), new_x="LMARGIN", new_y="NEXT")
    _write_wrapped(pdf, "\n".join(f"{k}: {v:+d}" for k, v in ni_sums.items()))
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, S("Diplomacy index tally"), new_x="LMARGIN", new_y="NEXT")
    _write_wrapped(pdf, "\n".join(dipl_codes) if dipl_codes else "(none)")
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, S("Economics (macro-scored actions)"), new_x="LMARGIN", new_y="NEXT")
    _write_wrapped(pdf, "\n".join(econ_hits) if econ_hits else "(none)")
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, S("Information briefs"), new_x="LMARGIN", new_y="NEXT")
    _write_wrapped(pdf, ", ".join(info_hits) if info_hits else "(none)")

    # Visual summaries for all tracks (end of report)
    _append_visual_summaries(pdf, records)

    pdf.output(str(out_path))
    return out_path


def main() -> int:
    import json

    records = []
    for path in sorted((ROOT / "adjudications").glob("G-*.json")):
        records.append(json.loads(path.read_text(encoding="utf-8")))
    if not records:
        print("No G-*.json adjudications found. Run pilot/run_green_multitrack.py first.")
        return 2
    # Chronological by move then action id (zero-padded)
    records.sort(
        key=lambda r: (
            int((r.get("action") or {}).get("move") or 0),
            str(r.get("action_id")),
        )
    )
    out = write_green_desktop_pdf(records)
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
