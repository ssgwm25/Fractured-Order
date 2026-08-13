"""Per-action visual summaries for PLI action PDFs.

Produces PNGs for Macro (canonical SME panels), National Interest, Glasl,
Diplomacy, and Information when those tracks are present on a single record.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

import engine  # noqa: E402
from pli_charts import (  # noqa: E402
    GREY,
    UNFAV_COLOR,
    WM_GREEN,
    plot_adjudication_indicator,
)
from reports.ni_titles import national_interest_chart_title  # noqa: E402

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
    plt.close("all")
    return plt, np


def _wrap_words(text: str, width: int, max_lines: int | None = None) -> list[str]:
    import textwrap

    text = " ".join((text or "").split())
    if not text:
        return [""]
    lines = textwrap.wrap(text, width=width, break_long_words=True, break_on_hyphens=True)
    if not lines:
        return [""]
    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        if len(last) > width - 1:
            last = last[: max(0, width - 1)]
        lines[-1] = (last.rstrip(" .,;:") + "…")[:width]
    return lines


def _track_active(track: dict[str, Any] | None) -> bool:
    if not track:
        return False
    status = track.get("status")
    if status in ("skipped", "skipped_ne"):
        return False
    return True


def macro_track_active(record: dict[str, Any]) -> bool:
    """True when Macro was scheduled and produced a real lever vector (not Green/NE skip)."""
    tracks = record.get("tracks") or {}
    routing = (tracks.get("routing") or {}).get("tracks") or {}
    if routing.get("macro") is False:
        return False
    macro = tracks.get("macro") or {}
    if not _track_active(macro):
        return False
    trend = macro.get("trend") or {}
    if trend.get("no_effect"):
        return False
    return True


def plot_macro_action_charts(record: dict[str, Any], chart_dir: Path) -> list[Path]:
    """Per-action SME adjudication charts via canonical pli_charts."""
    if not macro_track_active(record):
        return []
    macro = (record.get("tracks") or {}).get("macro") or {}
    trend = macro.get("trend") or {}
    indicators = trend.get("indicators") or {}
    if not indicators:
        return []

    chart_dir.mkdir(parents=True, exist_ok=True)
    title = (record.get("action") or {}).get("goal") or record.get("action_id")
    month = trend.get("submission_month")
    quarters = list(trend.get("quarters") or engine.QUARTERS or engine.YEARS)
    paths: list[Path] = []
    for key, ind in indicators.items():
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


def plot_ni_action(record: dict[str, Any], out_path: Path) -> Path | None:
    """Horizontal bar chart of NI-1…6 domain deltas for one action."""
    ni = (record.get("tracks") or {}).get("national_interest") or {}
    if not _track_active(ni):
        return None
    deltas = ni.get("domain_deltas") or {}
    if not deltas:
        return None

    plt, _ = _mpl()
    domains = [f"NI-{i}" for i in range(1, 7)]
    values = [int((deltas.get(d) or {}).get("delta") or 0) for d in domains]
    labels = [
        str((deltas.get(d) or {}).get("label") or d).split("&")[0].strip()[:36]
        for d in domains
    ]
    action = record.get("action") or {}
    aid = record.get("action_id") or ""
    title = action.get("goal") or aid

    fig, ax = plt.subplots(figsize=(9.5, 4.6), facecolor="white")
    fig.suptitle(
        national_interest_chart_title(action.get("team")),
        fontsize=13,
        fontweight="bold",
        color=WM_GREEN,
        y=0.98,
    )
    fig.text(0.5, 0.91, f"{aid}  ·  {title}"[:110], ha="center", fontsize=8.5, color=GREY)

    y = range(len(domains))
    colors = [
        NI_COLORS[d] if v >= 0 else UNFAV_COLOR for d, v in zip(domains, values)
    ]
    bars = ax.barh(list(y), values, color=colors, height=0.62, edgecolor="white")
    ax.axvline(0, color="#333", linewidth=0.9)
    ax.set_yticks(list(y))
    ax.set_yticklabels([f"{d}  {lab}" for d, lab in zip(domains, labels)], fontsize=8)
    ax.set_xlabel("Tier delta", fontsize=9, color=GREY)
    ax.set_xlim(-2.5, 2.5)
    ax.set_xticks([-2, -1, 0, 1, 2])
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    for bar, v in zip(bars, values):
        ax.text(
            v + (0.08 if v >= 0 else -0.08),
            bar.get_y() + bar.get_height() / 2,
            f"{v:+d}",
            va="center",
            ha="left" if v >= 0 else "right",
            fontsize=8.5,
            fontweight="bold",
        )

    fig.tight_layout(rect=[0.02, 0.02, 0.98, 0.88])
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=160, facecolor="white")
    plt.close(fig)
    return out_path


def plot_glasl_action(record: dict[str, Any], out_path: Path) -> Path | None:
    """Before → after Glasl stage path for one action."""
    gl = (record.get("tracks") or {}).get("glasl") or {}
    if not _track_active(gl):
        return None
    before = gl.get("stage_before")
    after = gl.get("stage_after")
    if before is None and after is None:
        return None

    plt, _ = _mpl()
    aid = record.get("action_id") or ""
    title = (record.get("action") or {}).get("goal") or aid
    b = int(before if before is not None else after or 4)
    a = int(after if after is not None else before or 4)
    delta = gl.get("delta")
    if delta is None:
        delta = a - b

    fig, ax = plt.subplots(figsize=(9.5, 3.8), facecolor="white")
    fig.suptitle(
        "Escalation (Glasl) — stage before / after",
        fontsize=13,
        fontweight="bold",
        color=WM_GREEN,
        y=0.98,
    )
    fig.text(0.5, 0.90, f"{aid}  ·  {title}"[:110], ha="center", fontsize=8.5, color=GREY)

    ax.axhspan(4, 7, color="#f4f6f9", zorder=0)
    ax.plot([0, 1], [b, a], color=WM_GREEN, linewidth=2.6, marker="o", markersize=9, zorder=3)
    if a > b:
        ax.fill_between([0, 1], [b, b], [a, a], color=UNFAV_COLOR, alpha=0.22, zorder=1)
    ax.annotate(
        f"Before {b}",
        xy=(0, b),
        xytext=(0, 14 if a >= b else -18),
        textcoords="offset points",
        ha="center",
        fontsize=9,
        color="#333",
    )
    ax.annotate(
        f"After {a}  (Δ{delta:+d})",
        xy=(1, a),
        xytext=(0, 14 if a >= b else -18),
        textcoords="offset points",
        ha="center",
        fontsize=9,
        fontweight="bold",
        color=WM_GREEN,
    )
    ax.set_xlim(-0.25, 1.25)
    ax.set_ylim(1, 9)
    ax.set_yticks(range(1, 10))
    ax.set_xticks([0, 1])
    ax.set_xticklabels(["Before", "After"], fontsize=9, color=GREY)
    ax.set_ylabel("Glasl stage", fontsize=9, color=GREY)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(True, axis="y", color="#e4e6eb", linewidth=0.7)

    fig.tight_layout(rect=[0.02, 0.02, 0.98, 0.86])
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=160, facecolor="white")
    plt.close(fig)
    return out_path


def plot_diplomacy_action(record: dict[str, Any], out_path: Path) -> Path | None:
    """Band + code callout for one diplomacy-indexed action."""
    dipl = (record.get("tracks") or {}).get("diplomacy") or {}
    if not _track_active(dipl):
        return None
    if dipl.get("status") == "needs_human" and not dipl.get("band"):
        return None

    plt, _ = _mpl()
    from matplotlib.patches import FancyBboxPatch

    aid = record.get("action_id") or ""
    title = (record.get("action") or {}).get("goal") or aid
    band = str(dipl.get("band") or "n/a")
    code = str(dipl.get("code_string") or "n/a")
    category = str(dipl.get("category") or "")
    style = str(dipl.get("policy_style") or "")
    color = BAND_COLORS.get(band, "#5a5f6e")

    # Wrap the long pipe-separated code string so it never clips the card edge.
    code_lines = _wrap_words(f"Code: {code}", width=68, max_lines=4)
    detail = "  ·  ".join(p for p in (category, style) if p)
    detail_lines = _wrap_words(detail, width=72, max_lines=2) if detail else []

    line_h = 0.055
    pad_top, pad_bot = 0.045, 0.04
    body_lines = 1 + len(code_lines) + len(detail_lines)  # band + code + detail
    card_h = pad_top + body_lines * line_h + pad_bot + 0.02
    total_h = max(0.72, card_h + 0.18)

    fig, ax = plt.subplots(figsize=(9.5, max(3.8, 1.1 + total_h * 4.2)), facecolor="white")
    fig.suptitle(
        "Diplomacy Index — band & code",
        fontsize=13,
        fontweight="bold",
        color=WM_GREEN,
        y=0.98,
    )
    fig.text(0.5, 0.91, f"{aid}  ·  {title}"[:110], ha="center", fontsize=8.5, color=GREY)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, total_h)
    ax.axis("off")

    left, card_w = 0.06, 0.88
    y0 = total_h - card_h - 0.10
    ax.add_patch(
        FancyBboxPatch(
            (left, y0),
            card_w,
            card_h,
            boxstyle="round,pad=0.015,rounding_size=0.02",
            facecolor="#f4f6f9",
            edgecolor=color,
            linewidth=2.2,
            clip_on=False,
        )
    )
    x = left + 0.035
    ty = y0 + card_h - pad_top
    ax.text(x, ty, band, fontsize=15, fontweight="bold", color=color, va="top")
    ty -= line_h * 1.15
    for i, line in enumerate(code_lines):
        ax.text(
            x,
            ty,
            line,
            fontsize=8.5 if i == 0 else 8.2,
            color="#222",
            va="top",
            family="monospace",
        )
        ty -= line_h
    if detail_lines:
        ty -= 0.008
        for line in detail_lines:
            ax.text(x, ty, line, fontsize=8.5, color=GREY, va="top")
            ty -= line_h * 0.95

    # Band legend strip
    x0 = 0.06
    legend_y = 0.035
    for name, c in BAND_COLORS.items():
        ax.add_patch(
            FancyBboxPatch(
                (x0, legend_y),
                0.28,
                0.055,
                boxstyle="round,pad=0.004,rounding_size=0.01",
                facecolor=c,
                edgecolor="white",
                linewidth=0.5,
                clip_on=False,
            )
        )
        ax.text(
            x0 + 0.14,
            legend_y + 0.027,
            name,
            fontsize=7,
            color="white",
            ha="center",
            va="center",
        )
        x0 += 0.30

    fig.tight_layout(rect=[0.02, 0.02, 0.98, 0.88])
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=160, facecolor="white", bbox_inches="tight")
    plt.close(fig)
    return out_path


def plot_information_action(record: dict[str, Any], out_path: Path) -> Path | None:
    """Brief card collage for one Information-track action."""
    info = (record.get("tracks") or {}).get("information") or {}
    if not _track_active(info):
        return None
    sec = info.get("sections") or {}
    if not any(sec.values()) and info.get("status") == "needs_human":
        return None

    plt, _ = _mpl()
    from matplotlib.patches import FancyBboxPatch

    aid = record.get("action_id") or ""
    title = (record.get("action") or {}).get("goal") or aid
    summary = str(sec.get("summary") or info.get("summary") or "")
    audiences = str(sec.get("audiences") or info.get("audiences") or "")
    narratives = str(sec.get("narratives") or info.get("narratives") or "")

    wrap_w = 95
    head = _wrap_words(f"{aid}  ·  {title}", wrap_w, max_lines=2)
    summary_lines = _wrap_words(summary or "(no summary yet)", wrap_w, max_lines=4)
    audience_lines = _wrap_words(f"Audiences: {audiences or 'n/a'}", wrap_w, max_lines=2)
    narrative_lines = _wrap_words(f"Narratives: {narratives or 'n/a'}", wrap_w, max_lines=3)

    line_h = 0.055
    pad_top, pad_bot = 0.04, 0.04
    n_lines = len(head) + len(summary_lines) + len(audience_lines) + len(narrative_lines)
    card_h = pad_top + n_lines * line_h + pad_bot + 0.04
    total_h = max(card_h + 0.08, 0.55)

    fig, ax = plt.subplots(figsize=(9.5, max(3.8, 1.0 + total_h * 5.5)), facecolor="white")
    fig.suptitle(
        "Information brief — unscored SME lane",
        fontsize=13,
        fontweight="bold",
        color=WM_GREEN,
        y=0.98,
    )
    ax.set_xlim(0, 1)
    ax.set_ylim(0, total_h)
    ax.axis("off")

    left, card_w = 0.04, 0.92
    y0 = total_h - card_h - 0.02
    ax.add_patch(
        FancyBboxPatch(
            (left, y0),
            card_w,
            card_h,
            boxstyle="round,pad=0.01,rounding_size=0.015",
            facecolor="#f4f6f9",
            edgecolor="#c9b896",
            linewidth=1.4,
        )
    )
    x = left + 0.025
    ty = y0 + card_h - pad_top
    for i, line in enumerate(head):
        ax.text(
            x,
            ty,
            line,
            fontsize=9 if i == 0 else 8.2,
            fontweight="bold" if i == 0 else "normal",
            color=WM_GREEN if i == 0 else "#222",
            va="top",
        )
        ty -= line_h
    ty -= 0.012
    for line in summary_lines:
        ax.text(x, ty, line, fontsize=8, color=GREY, va="top")
        ty -= line_h
    for line in audience_lines:
        ax.text(x, ty, line, fontsize=7.5, color="#555", va="top", style="italic")
        ty -= line_h
    for line in narrative_lines:
        ax.text(x, ty, line, fontsize=7.5, color="#555", va="top")
        ty -= line_h

    fig.tight_layout(rect=[0.02, 0.02, 0.98, 0.90])
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=160, facecolor="white")
    plt.close(fig)
    return out_path


def diplomacy_action_narrative(record: dict[str, Any]) -> str:
    """White Cell talking-points prose for one diplomacy-indexed action."""
    action = record.get("action") or {}
    dipl = (record.get("tracks") or {}).get("diplomacy") or {}
    if not dipl:
        return ""
    if dipl.get("status") == "needs_human" and not dipl.get("band"):
        reason = dipl.get("needs_human_reason") or "Needs human indexing."
        return (
            f"White Cell talking points — {record.get('action_id')}: "
            f"Diplomacy lane is awaiting SME indexing ({reason})."
        )

    aid = record.get("action_id") or "this action"
    title = action.get("goal") or aid
    team = action.get("team") or "n/a"
    band = dipl.get("band") or "n/a"
    category = dipl.get("category") or "n/a"
    style = dipl.get("policy_style") or "n/a"
    code = dipl.get("code_string") or "n/a"
    rationale = (dipl.get("rationale") or "").strip()
    rationale_bit = (
        f" SME rationale: {rationale}"
        if rationale
        else " SME rationale was not recorded on the worksheet."
    )
    return (
        f"White Cell talking points — {aid}: {title} ({team}). "
        f"Indexed in the {band} band under {category} with a {style} policy style "
        f"(code `{code}`).{rationale_bit} "
        f"Brief players that the Diplomacy Index is a categorical code path — band and "
        f"style shifts are the story — not a numeric effectiveness score. Use the band "
        f"to situate how hard or soft this filing sits relative to Pressure vs "
        f"Relationship-Building neighbors in the move."
    )


def build_action_visuals(
    record: dict[str, Any], chart_dir: Path
) -> dict[str, Any]:
    """Build all per-action charts; return paths keyed by track."""
    chart_dir = Path(chart_dir)
    chart_dir.mkdir(parents=True, exist_ok=True)
    macro_charts = plot_macro_action_charts(record, chart_dir / "macro")
    # Also copy macro charts to chart_dir root for sidecar convenience
    for p in macro_charts:
        dest = chart_dir / p.name
        if p.resolve() != dest.resolve():
            dest.write_bytes(p.read_bytes())

    return {
        "chart_dir": chart_dir,
        "macro": macro_charts,
        "national_interest": plot_ni_action(record, chart_dir / "national_interest.png"),
        "glasl": plot_glasl_action(record, chart_dir / "glasl.png"),
        "diplomacy": plot_diplomacy_action(record, chart_dir / "diplomacy.png"),
        "information": plot_information_action(record, chart_dir / "information.png"),
    }
