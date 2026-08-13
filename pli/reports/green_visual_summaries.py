"""Corpus-level visual summaries for the Green Cell multi-track PDF.

Produces PNGs + White Cell player-facing narratives for:
  Diplomacy index, National Interest, Information, Escalation (Glasl), Economics.

Economics reuses ``pli_charts.plot_adjudication_indicator`` — the same SME
adjudication chart language as the White Cell panel / sample outputs.
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

import engine  # noqa: E402
from pli_charts import (  # noqa: E402
    BASELINE_COLOR,
    FAV_COLOR,
    GREY,
    IND_COLORS,
    UNFAV_COLOR,
    WM_GREEN,
    plot_adjudication_indicator,
    quarter_to_float,
)

BAND_COLORS = {
    "Pressure": "#b04a4a",
    "Positioning": "#1f3b6e",
    "Relationship-Building": "#2e7d32",
}
NI_COLORS = {
    "NI-1": "#1f3b6e",
    "NI-2": "#7a4b00",
    "NI-3": "#115740",
    "NI-4": "#5b4b8a",
    "NI-5": "#b8860b",
    "NI-6": "#b04a4a",
}


def _mpl():
    try:
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError:
        import subprocess

        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "matplotlib", "numpy", "-q"]
        )
        import matplotlib.pyplot as plt
        import numpy as np
    return plt, np


def _econ_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for rec in records:
        macro = (rec.get("tracks") or {}).get("macro") or {}
        trend = macro.get("trend") or {}
        if macro.get("status") == "pending" and trend and not trend.get("no_effect"):
            out.append(rec)
    return out


def plot_diplomacy_summary(records: list[dict[str, Any]], out_path: Path) -> dict[str, Any]:
    plt, np = _mpl()
    bands = ["Pressure", "Positioning", "Relationship-Building"]
    m1 = {b: 0 for b in bands}
    m2 = {b: 0 for b in bands}
    chrono_bands: list[str] = []
    for rec in records:
        dipl = (rec.get("tracks") or {}).get("diplomacy") or {}
        band = dipl.get("band")
        if band not in bands:
            continue
        move = int((rec.get("action") or {}).get("move") or 1)
        (m1 if move == 1 else m2)[band] += 1
        chrono_bands.append(band)

    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.2), facecolor="white")
    fig.suptitle(
        "Diplomacy Index — Green Cell band distribution",
        fontsize=13,
        fontweight="bold",
        color=WM_GREEN,
        y=0.98,
    )

    x = np.arange(len(bands))
    w = 0.36
    axes[0].bar(x - w / 2, [m1[b] for b in bands], w, label="Move 1", color="#1f3b6e")
    axes[0].bar(x + w / 2, [m2[b] for b in bands], w, label="Move 2", color="#b9975b")
    axes[0].set_xticks(x)
    axes[0].set_xticklabels(bands, fontsize=8)
    axes[0].set_ylabel("Actions", fontsize=9, color=GREY)
    axes[0].legend(fontsize=8, frameon=True)
    axes[0].spines["top"].set_visible(False)
    axes[0].spines["right"].set_visible(False)
    axes[0].set_title("Counts by move", fontsize=10, color=GREY)

    # Chronology strip
    ax = axes[1]
    for i, band in enumerate(chrono_bands):
        ax.barh(0, 1, left=i, height=0.55, color=BAND_COLORS[band], edgecolor="white")
    ax.set_xlim(0, max(len(chrono_bands), 1))
    ax.set_yticks([])
    ax.set_xlabel("Chronological action order (Appendix B)", fontsize=8, color=GREY)
    ax.set_title("Band path across the Green sequence", fontsize=10, color=GREY)
    for band, color in BAND_COLORS.items():
        ax.scatter([], [], color=color, s=40, label=band)
    ax.legend(fontsize=7.5, loc="upper right", frameon=True, ncol=1)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)

    fig.tight_layout(rect=[0.02, 0.02, 0.98, 0.90])
    out_path = Path(out_path)
    fig.savefig(out_path, dpi=160, facecolor="white")
    plt.close(fig)

    total = {b: m1[b] + m2[b] for b in bands}
    narrative = (
        f"White Cell talking points — Diplomacy: Across {sum(total.values())} indexed "
        f"Green actions, Positioning dominated ({total['Positioning']}), with Pressure "
        f"rising in Move 2 ({m2['Pressure']} vs {m1['Pressure']} in Move 1) and "
        f"Relationship-Building remaining rare ({total['Relationship-Building']}). "
        f"Tell players: Green did not auto-align into a hard-pressure bloc; partners "
        f"used consultations, treaties, and frameworks to preserve autonomy before "
        f"selective hardening. Diplomacy codes are an index, not a numeric score — "
        f"band shifts are the story to brief."
    )
    return {
        "path": out_path,
        "narrative": narrative,
        "stats": {"move1": m1, "move2": m2, "total": total},
    }


def plot_ni_summary(records: list[dict[str, Any]], out_path: Path) -> dict[str, Any]:
    plt, np = _mpl()
    domains = [f"NI-{i}" for i in range(1, 7)]
    labels = []
    sums = []
    matrix = []  # rows = actions with any non-zero, cols = domains

    for rec in records:
        ni = (rec.get("tracks") or {}).get("national_interest") or {}
        deltas = ni.get("domain_deltas") or {}
        row = [int((deltas.get(d) or {}).get("delta") or 0) for d in domains]
        if any(row):
            matrix.append(row)
        if not labels:
            labels = [(deltas.get(d) or {}).get("label", d) for d in domains]

    sums = [sum(r[i] for r in matrix) for i in range(6)] if matrix else [0] * 6
    short = [d.replace("NI-", "") for d in domains]

    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.4), facecolor="white")
    fig.suptitle(
        "National Interest (impact on Blue) — domain tier deltas (National War College)",
        fontsize=13,
        fontweight="bold",
        color=WM_GREEN,
        y=0.98,
    )

    colors = [NI_COLORS[d] for d in domains]
    bars = axes[0].bar(short, sums, color=colors)
    axes[0].axhline(0, color="#333", linewidth=0.8)
    axes[0].set_ylabel("Sum of tier deltas", fontsize=9, color=GREY)
    axes[0].set_title("Net corpus sum by domain", fontsize=10, color=GREY)
    axes[0].spines["top"].set_visible(False)
    axes[0].spines["right"].set_visible(False)
    for b, v in zip(bars, sums):
        axes[0].text(
            b.get_x() + b.get_width() / 2,
            v + (0.08 if v >= 0 else -0.18),
            f"{v:+d}",
            ha="center",
            fontsize=8,
            fontweight="bold",
        )

    if matrix:
        arr = np.array(matrix, dtype=float)
        im = axes[1].imshow(arr.T, aspect="auto", cmap="RdYlGn", vmin=-2, vmax=2)
        axes[1].set_yticks(range(6))
        axes[1].set_yticklabels([f"{d}" for d in domains], fontsize=8)
        axes[1].set_xlabel("Actions with non-zero NI move (chrono subset)", fontsize=8, color=GREY)
        axes[1].set_title("Per-action domain heatmap", fontsize=10, color=GREY)
        fig.colorbar(im, ax=axes[1], fraction=0.046, pad=0.04)
    else:
        axes[1].text(0.5, 0.5, "No NI deltas", ha="center")
        axes[1].axis("off")

    fig.tight_layout(rect=[0.02, 0.02, 0.98, 0.90])
    out_path = Path(out_path)
    fig.savefig(out_path, dpi=160, facecolor="white")
    plt.close(fig)

    top = sorted(zip(domains, labels or domains, sums), key=lambda t: abs(t[2]), reverse=True)
    lead = ", ".join(f"{d} ({lab.split('&')[0].strip()[:28]} {v:+d})" for d, lab, v in top[:3])
    narrative = (
        f"White Cell talking points — National Interest: Green play produced net "
        f"domain movement concentrated in {lead}. Positive NI-2 / NI-3 / NI-4 cells "
        f"mean partners advanced prosperity, alliance credibility, and Indo-Pacific "
        f"stability stakes; negative cells (when present) are the costs to brief — "
        f"usually domestic sustainability or partner cohesion under Pressure-band "
        f"moves. Remind players: NI is a six-domain National War College intensity "
        f"vector, not a single US/PRC score, and vital-level (±2) moves are rare."
    )
    return {"path": out_path, "narrative": narrative, "sums": dict(zip(domains, sums))}


def _wrap_words(text: str, width: int, max_lines: int | None = None) -> list[str]:
    """Word-wrap for matplotlib card text (matplotlib wrap=True does not respect box width)."""
    import textwrap

    text = " ".join((text or "").split())
    if not text:
        return [""]
    lines = textwrap.wrap(text, width=width, break_long_words=True, break_on_hyphens=True)
    if not lines:
        return [""]
    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines]
        # Ellipsis on last line without overflowing width
        last = lines[-1]
        if len(last) > width - 1:
            last = last[: max(0, width - 1)]
        lines[-1] = (last.rstrip(" .,;:") + "…")[:width]
    return lines


def plot_info_summary(records: list[dict[str, Any]], out_path: Path) -> dict[str, Any]:
    plt, _ = _mpl()
    from matplotlib.patches import FancyBboxPatch

    briefs = []
    for rec in records:
        info = (rec.get("tracks") or {}).get("information") or {}
        if info.get("status") != "pending":
            continue
        sec = info.get("sections") or {}
        briefs.append(
            {
                "id": str(rec.get("action_id") or ""),
                "title": str((rec.get("action") or {}).get("goal") or ""),
                "summary": str(sec.get("summary") or ""),
                "audiences": str(sec.get("audiences") or ""),
            }
        )

    # Card geometry in axes units (0..1 width). Wrap width tuned to ~10.5in figure.
    left, card_w = 0.035, 0.93
    pad_x = 0.02
    wrap_w = 100
    line_h = 0.040
    gap = 0.030
    pad_top, pad_bot = 0.024, 0.028

    prepared = []
    for b in briefs:
        head = _wrap_words(f"{b['id']}  ·  {b['title']}", wrap_w, max_lines=2)
        summary = _wrap_words(b["summary"], wrap_w, max_lines=3)
        audiences = _wrap_words(f"Audiences: {b['audiences']}", wrap_w, max_lines=2)
        n_lines = len(head) + len(summary) + len(audiences)
        card_h = pad_top + n_lines * line_h + pad_bot + 0.016  # spacer after head
        prepared.append(
            {
                "id": b["id"],
                "head": head,
                "summary": summary,
                "audiences": audiences,
                "card_h": card_h,
            }
        )

    n = max(len(prepared), 1)
    total_h = sum(p["card_h"] for p in prepared) + gap * max(n - 1, 0) + 0.04
    fig_h = max(4.2, min(8.0, 1.15 + total_h * 6.8))
    fig, ax = plt.subplots(figsize=(10.5, fig_h), facecolor="white")
    fig.suptitle(
        "Information briefs — unscored SME lane",
        fontsize=13,
        fontweight="bold",
        color=WM_GREEN,
        y=0.98,
    )
    ax.set_xlim(0, 1)
    ax.set_ylim(0, max(total_h, 0.4))
    ax.axis("off")

    if not prepared:
        ax.text(0.5, 0.2, "No Information-track actions in this corpus", ha="center", color=GREY)
    else:
        y_cursor = total_h - 0.01
        for p in prepared:
            h = p["card_h"]
            y0 = y_cursor - h
            ax.add_patch(
                FancyBboxPatch(
                    (left, y0),
                    card_w,
                    h,
                    boxstyle="round,pad=0.008,rounding_size=0.015",
                    facecolor="#f4f6f9",
                    edgecolor="#c9b896",
                    linewidth=1.35,
                    clip_on=False,
                )
            )
            x = left + pad_x
            ty = y_cursor - pad_top
            # Header line 1: ID (green) + remainder of first wrapped head line
            head0 = p["head"][0]
            id_token = p["id"]
            # Strip leading "ID  ·  " if present so we can color the ID alone
            remainder = head0
            prefix = f"{id_token}  ·  "
            if remainder.startswith(prefix):
                remainder = remainder[len(prefix) :]
            elif remainder.startswith(id_token):
                remainder = remainder[len(id_token) :].lstrip(" ·")
            ax.text(x, ty, id_token, fontsize=9, fontweight="bold", color=WM_GREEN, va="top", ha="left")
            # Fixed column after ID (avoids oversized gap from char-width guesses)
            ax.text(x + 0.118, ty, remainder, fontsize=8.4, color="#222222", va="top", ha="left")
            ty -= line_h
            for extra in p["head"][1:]:
                ax.text(x, ty, extra, fontsize=8.2, color="#222222", va="top", ha="left")
                ty -= line_h
            ty -= 0.008  # spacer before body
            for line in p["summary"]:
                ax.text(x, ty, line, fontsize=7.5, color=GREY, va="top", ha="left")
                ty -= line_h
            for line in p["audiences"]:
                ax.text(x, ty, line, fontsize=7.1, color="#555555", va="top", ha="left", style="italic")
                ty -= line_h
            y_cursor = y0 - gap

    fig.tight_layout(rect=[0.02, 0.02, 0.98, 0.92])
    out_path = Path(out_path)
    fig.savefig(out_path, dpi=160, facecolor="white")
    plt.close(fig)

    ids = ", ".join(b["id"] for b in briefs) or "none"
    narrative = (
        f"White Cell talking points — Information: {len(briefs)} action(s) took the "
        f"Informational Instrument of Power ({ids}). These produce unscored SME briefs "
        f"(audiences, narratives, second-order effects) — not effectiveness ratings. "
        f"Brief players that influence/outreach and public signaling still matter for "
        f"sentiment and escalation even when macro indicators do not move. Use the "
        f"SME questions on each brief as facilitation prompts."
    )
    return {"path": out_path, "narrative": narrative, "count": len(briefs)}


def plot_escalation_summary(records: list[dict[str, Any]], out_path: Path) -> dict[str, Any]:
    plt, _ = _mpl()
    xs = list(range(1, len(records) + 1))
    before = []
    after = []
    labels = []
    for rec in records:
        gl = (rec.get("tracks") or {}).get("glasl") or {}
        before.append(gl.get("stage_before"))
        after.append(gl.get("stage_after"))
        labels.append(str(rec.get("action_id") or ""))

    fig, ax = plt.subplots(figsize=(10.5, 4.2), facecolor="white")
    fig.suptitle(
        "Escalation (Glasl) — stage path across Green chronology",
        fontsize=13,
        fontweight="bold",
        color=WM_GREEN,
        y=0.98,
    )
    ax.plot(xs, after, color=WM_GREEN, linewidth=2.4, marker="o", markersize=5, label="Stage after")
    ax.fill_between(xs, before, after, where=[(a or 0) > (b or 0) for a, b in zip(after, before)],
                     color=UNFAV_COLOR, alpha=0.25, interpolate=True, label="Stage increase")
    ax.axhspan(4, 7, color="#f4f6f9", zorder=0)
    ax.set_ylim(1, 9)
    ax.set_yticks(range(1, 10))
    ax.set_ylabel("Glasl stage", fontsize=9, color=GREY)
    ax.set_xlabel("Chronological Green action #", fontsize=9, color=GREY)
    # Label jump points
    for i, (b, a, lab) in enumerate(zip(before, after, labels)):
        if b is not None and a is not None and a != b:
            ax.annotate(
                lab.replace("G-", ""),
                xy=(i + 1, a),
                xytext=(0, 8),
                textcoords="offset points",
                fontsize=6.5,
                color="#333",
                ha="center",
            )
    ax.legend(fontsize=8, frameon=True)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(True, axis="y", color="#e4e6eb", linewidth=0.7)

    fig.tight_layout(rect=[0.02, 0.02, 0.98, 0.90])
    out_path = Path(out_path)
    fig.savefig(out_path, dpi=160, facecolor="white")
    plt.close(fig)

    start = after[0] if after else None
    end = after[-1] if after else None
    jumps = sum(1 for b, a in zip(before, after) if b is not None and a is not None and a > b)
    narrative = (
        f"White Cell talking points — Escalation: Green Glasl path ran from stage "
        f"{start} to {end} with {jumps} upward jump(s). Early Move 1 Positioning kept "
        f"the cell inside coalition/reputation competition (stage 4); Move 2 Pressure "
        f"signaling and dependency cuts stepped the ladder. Shaded band marks the FO "
        f"operating range (stages 4–7). Tell players: escalation is cumulative and "
        f"session-scoped — later Pressure filings inherit the stage left by earlier play."
    )
    return {
        "path": out_path,
        "narrative": narrative,
        "start": start,
        "end": end,
        "jumps": jumps,
    }


def plot_econ_stacked_summary(records: list[dict[str, Any]], out_path: Path) -> dict[str, Any]:
    """Corpus stacked macro path using engine stacking + SME chart language."""
    plt, np = _mpl()
    econ = _econ_records(records)
    rows = []
    for rec in econ:
        macro = rec["tracks"]["macro"]
        rows.append(
            {
                "action_id": rec["action_id"],
                "move": (rec.get("action") or {}).get("move") or 1,
                "trend": macro["trend"],
            }
        )
    stacked = engine.stack_from_adjudication_records(rows) if rows else None

    fig, axes = plt.subplots(2, 3, figsize=(11.2, 6.6), facecolor="white")
    fig.suptitle(
        "Economics — Green actions on Blue/U.S. FO board (stacked)",
        fontsize=13,
        fontweight="bold",
        color=WM_GREEN,
        y=0.98,
    )
    fig.text(
        0.5,
        0.935,
        "Baseline = U.S. FO indicators (not Green national accounts) · "
        "Post-stack = baseline + Green Economic lever deltas · "
        "Green/red = favorable/unfavorable to acting side",
        ha="center",
        fontsize=7.5,
        color=GREY,
    )
    axes_flat = list(axes.flatten())
    indicators = list(engine.INDICATORS)
    quarters = list(engine.QUARTERS)
    xs = [quarter_to_float(q) for q in quarters]

    if not stacked:
        for ax in axes_flat:
            ax.axis("off")
        axes_flat[0].text(0.5, 0.5, "No economic actions", ha="center")
    else:
        post = stacked["post_action"]
        for i, key in enumerate(indicators):
            ax = axes_flat[i]
            base = list(engine.CODEBOOK["baseline"][key])
            post_line = list(post[key])
            # Build a mini indicator dict for favorable_direction from first econ trend
            fav = 1
            sample = rows[0]["trend"]["indicators"].get(key) or {}
            fav = int(sample.get("favorable_direction", 1))
            label = sample.get("label", key)
            color = IND_COLORS.get(key, "#7a4b00")
            base_arr = np.array(base, dtype=float)
            post_arr = np.array(post_line, dtype=float)
            signed = (post_arr - base_arr) * fav
            ax.plot(xs, base, color=BASELINE_COLOR, linewidth=1.6, linestyle="--")
            ax.plot(xs, post_line, color=color, linewidth=1.8)
            ax.fill_between(
                xs, base_arr, post_arr, where=(signed >= 0),
                color=FAV_COLOR, alpha=0.35, interpolate=True,
            )
            ax.fill_between(
                xs, base_arr, post_arr, where=(signed < 0),
                color=UNFAV_COLOR, alpha=0.25, interpolate=True,
            )
            ax.set_title(label, fontsize=9, fontweight="bold", color=WM_GREEN)
            tick_idx = [j for j, q in enumerate(quarters) if q.endswith("Q1")]
            ax.set_xticks([xs[j] for j in tick_idx[::2]])
            ax.set_xticklabels([quarters[j][:4] for j in tick_idx[::2]], fontsize=6.5)
            ax.tick_params(axis="y", labelsize=6.5)
            ax.grid(True, color="#e4e6eb", linewidth=0.6)
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)
        axes_flat[-1].axis("off")
        # Legend / action list in last panel
        lines = [f"{r['action_id']} (M{r['move']})" for r in rows]
        axes_flat[-1].text(
            0.05,
            0.9,
            "Macro-scored Green actions\n(stacked uncapped)\n\n" + "\n".join(lines),
            fontsize=8.5,
            va="top",
            color="#222",
            family="sans-serif",
            transform=axes_flat[-1].transAxes,
        )

    fig.tight_layout(rect=[0.02, 0.02, 0.98, 0.90])
    out_path = Path(out_path)
    fig.savefig(out_path, dpi=160, facecolor="white")
    plt.close(fig)

    narrative = (
        f"White Cell talking points — Economics (stacked): {len(rows)} Green Economic "
        f"filings were scored and stacked on the quarterly grid. Important board note: "
        f"PLI has no Green-country macro baselines in this pilot. The navy dashed line "
        f"is the U.S./Blue FO dashboard path (IMF Article IV and corroborating U.S. "
        f"forecasters). Colored post-action lines show how Green Economic lever vectors "
        f"would move those Blue-board indicators — a shared adjudication display, not a "
        f"forecast of ROK/EU/ASEAN/Japan national accounts, and not a finished "
        f"Green-to-Blue spillover model. Only Economic Instruments of Power move these "
        f"charts; Diplomacy/Info still matter on their own tracks. "
        f"PCE inflation is labeled Q4/Q4 because the Fed SEP / IMF anchor reports the "
        f"price level in 2026Q4 versus 2025Q4 (fourth-quarter over fourth-quarter), not "
        f"a calendar-year average — PLI keeps that convention so baseline values match "
        f"the sourced U.S. series."
    )
    return {"path": out_path, "narrative": narrative, "econ_count": len(rows)}


def plot_econ_action_sme_charts(
    record: dict[str, Any], chart_dir: Path
) -> list[Path]:
    """Per-action SME adjudication charts via canonical pli_charts."""
    macro = (record.get("tracks") or {}).get("macro") or {}
    trend = macro.get("trend") or {}
    if macro.get("status") != "pending" or trend.get("no_effect"):
        return []
    chart_dir.mkdir(parents=True, exist_ok=True)
    title = (record.get("action") or {}).get("goal") or record.get("action_id")
    month = trend.get("submission_month")
    quarters = list(trend.get("quarters") or engine.QUARTERS)
    paths: list[Path] = []
    for key, ind in (trend.get("indicators") or {}).items():
        out = chart_dir / f"{key}.png"
        plot_adjudication_indicator(
            quarters,
            ind,
            action_title=str(title),
            out_path=out,
            ind_key=key,
            submission_month=month,
        )
        paths.append(out)
    return paths


def econ_action_narrative(record: dict[str, Any]) -> str:
    action = record.get("action") or {}
    macro = (record.get("tracks") or {}).get("macro") or {}
    clf = macro.get("classification") or {}
    impl = macro.get("implementation") or {}
    trend = macro.get("trend") or {}
    verdicts = []
    for key, ind in (trend.get("indicators") or {}).items():
        verdicts.append(f"{ind.get('label', key)}={ind.get('verdict')}")
    return (
        f"White Cell talking points — {record.get('action_id')}: "
        f"{action.get('goal')}. Lever {clf.get('lever')}/{clf.get('instrument')} "
        f"({clf.get('direction')}); Implementation {impl.get('score')}/10. "
        f"Indicator verdicts: {'; '.join(verdicts)}. "
        f"Board note: navy baseline is the U.S./Blue FO path — there is no Green "
        f"national macro baseline here. The post-action path is that Blue board plus "
        f"this Green Economic lever's deltas (directional display for adjudication, "
        f"not a partner-economy forecast). Same SME chart language: green/red wedges "
        f"mark favorable/unfavorable divergence on that board. "
        f"PCE inflation (Q4/Q4) means fourth-quarter-over-fourth-quarter percent change "
        f"(Fed/IMF convention), not annual-average inflation."
    )


def build_all_summaries(
    records: list[dict[str, Any]], work_dir: Path | None = None
) -> dict[str, Any]:
    """Build all corpus visuals; return dict of sections for PDF embedding."""
    tmp_root = Path(work_dir) if work_dir else Path(tempfile.mkdtemp(prefix="pli_green_viz_"))
    tmp_root.mkdir(parents=True, exist_ok=True)

    dipl = plot_diplomacy_summary(records, tmp_root / "diplomacy.png")
    ni = plot_ni_summary(records, tmp_root / "ni.png")
    info = plot_info_summary(records, tmp_root / "info.png")
    esc = plot_escalation_summary(records, tmp_root / "escalation.png")
    econ_stack = plot_econ_stacked_summary(records, tmp_root / "econ_stacked.png")

    econ_actions = []
    for rec in _econ_records(records):
        aid = rec["action_id"]
        charts = plot_econ_action_sme_charts(rec, tmp_root / "econ_actions" / aid)
        econ_actions.append(
            {
                "action_id": aid,
                "title": (rec.get("action") or {}).get("goal"),
                "charts": charts,
                "narrative": econ_action_narrative(rec),
            }
        )

    return {
        "work_dir": tmp_root,
        "diplomacy": dipl,
        "national_interest": ni,
        "information": info,
        "escalation": esc,
        "economics_stacked": econ_stack,
        "economics_actions": econ_actions,
    }
