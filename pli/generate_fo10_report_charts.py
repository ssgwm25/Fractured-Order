"""Generate FO 1.0 PLI macro trend charts from the live quarterly engine.

Deliverable (Desktop):
  - PLI_FO10_Report_Charts_Combined.pdf

Uses codebook quarterly grid (2026Q1–2032Q4), month-of-submission anchors
(notional 3-month spacing on the locked Blue chronology for FO 1.0 demo),
and profiled ramp/plateau/decay weights — no hardcoded annual ACTION_DELTAS.
"""
from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import engine  # noqa: E402
from pli_charts import (  # noqa: E402
    FAV_COLOR,
    FAV_FILL,
    GREY,
    LEGEND_KWARGS,
    UNFAV_COLOR,
    WM_GREEN,
    BASELINE_COLOR as _SHARED_BASELINE,
    IND_COLORS as _SHARED_IND_COLORS,
)

WORKSHEETS = HERE / "pilot" / "worksheets.json"
DESKTOP = Path.home() / "Desktop"

# Re-export shared palette (canonical source: pli_charts.py)
BASELINE_COLOR = _SHARED_BASELINE
IND_COLORS = _SHARED_IND_COLORS
NEUTRAL_COLOR = "#5a5f6e"
TITLE_BOX = "#f3ead7"
TITLE_EDGE = "#c9b896"
TITLE_TEXT = "#2c2c2c"
SHORT_LABELS = {
    "real_gdp_growth": "Real GDP growth",
    "pce_inflation": "PCE inflation",
    "unemployment_rate": "Unemployment",
    "trade_volume_growth": "Trade volume growth",
    "fixed_investment_growth": "Fixed investment growth",
}
FULL_LABELS = {
    "real_gdp_growth": "Real GDP growth (%)",
    "pce_inflation": "PCE inflation (Q4/Q4, %)",
    "unemployment_rate": "Unemployment rate (%)",
    "trade_volume_growth": "Trade volume growth (%)",
    "fixed_investment_growth": "Fixed investment growth (%)",
}
FILE_STEMS = {
    "real_gdp_growth": "RealGDP",
    "pce_inflation": "PCEInflation",
    "unemployment_rate": "Unemployment",
    "trade_volume_growth": "TradeVolume",
    "fixed_investment_growth": "FixedInvestment",
}

# Report-style display titles (FO Interim Report Game Action labels).
DISPLAY_TITLES = {
    "M1-A1": "Wedges and Incentives",
    "M1-A2": "No BRICS+ in America Act",
    "M1-A3": "Minerals for All Act",
    "M1-A4": "Trade Investigations",
    "M1-A5": "IP Enforced Remuneration",
    "M1-A6": "Stockpiling, Medical & Critical Minerals",
    "M1-A7": "Probiotic Act of 2027",
    "M1-TAIWAN": "Taiwan Free Trade and Policy Act of 2027",
    "M2-A1": "EU Minerals",
    "M2-A2": "Global Allied Telecom & Connectivity Initiative",
    "M2-A3": "Global Strategic Futures Initiative",
    "M2-A4": "Sanctions & Critical Minerals Policy",
}

S_CAP = engine.CODEBOOK["magnitude_classes"]["S"]
INDICATORS = engine.INDICATORS
QUARTERS = engine.QUARTERS
FAVORABLE = engine.CODEBOOK["favorable_direction"]
BASELINE = engine.CODEBOOK["baseline"]
BASELINE_SOURCES = engine.CODEBOOK.get(
    "baseline_sources",
    "IMF Article IV, CBO, Fed SEP, WTO, OECD (see PLI_Annotated_Bibliography.md)",
)
CODEBOOK_VERSION = engine.CODEBOOK["version"]


def quarter_to_float(label: str) -> float:
    return int(label[:4]) + (int(label[-1]) - 1) * 0.25


def month_to_float(yyyy_mm: str) -> float:
    return int(yyyy_mm[:4]) + (int(yyyy_mm[5:7]) - 1) / 12.0


# FO display window on the quarterly grid (through Move 3 / CBO-style horizon).
FO_QUARTERS = [q for q in QUARTERS if q >= "2027Q1" and q <= "2032Q4"]
FO_XS = [quarter_to_float(q) for q in FO_QUARTERS]
Q_IDX = {q: i for i, q in enumerate(QUARTERS)}
FO_BASELINE = {
    ind: [BASELINE[ind][Q_IDX[q]] for q in FO_QUARTERS] for ind in INDICATORS
}

MOVE_BANDS: dict[int, dict[str, Any]] = {
    1: {"start": 2027.0, "end": 2029.0, "label": "Move 1"},
    2: {"start": 2029.0, "end": 2031.0, "label": "Move 2"},
    3: {"start": 2031.0, "end": 2033.0, "label": "Move 3"},
}

# Locked Blue chronology (FO 1.0 deck). Notional months every 3 months from 2027-01.
CHRONO_ORDER: list[str] = [
    "M1-A1",
    "M1-A4",
    "M1-A5",
    "M1-A3",
    "M1-TAIWAN",
    "M1-A6",
    "M1-A7",
    "M1-A2",
    "M2-A1",
    "M2-A2",
    "M2-A3",
    "M2-A4",
]


def notional_submission_month(action_id: str) -> str:
    y, m = 2027, 1
    for aid in CHRONO_ORDER:
        if aid == action_id:
            return f"{y:04d}-{m:02d}"
        m += 3
        while m > 12:
            m -= 12
            y += 1
    return "2027-01"

REMOVED_ACTIONS: dict[str, dict[str, str]] = {
    "M1-A1": {
        "status": "non_economic",
        "legend": "Wedges and Incentives (non-economic)",
        "marker": "s",
        "facecolor": "white",
        "edgecolor": "#888888",
    },
    "M1-TAIWAN": {
        "status": "not_in_pli",
        "legend": "Taiwan FTA (not in PLI macro corpus)",
        "marker": "^",
        "facecolor": "white",
        "edgecolor": "#5a5f6e",
    },
    "M2-A1": {
        "status": "withdrawn",
        "legend": "EU Minerals (withdrawn)",
        "marker": "D",
        "facecolor": "white",
        "edgecolor": "#c0392b",
    },
}


def move_num(action_id: str) -> int:
    if action_id.startswith("M1-"):
        return 1
    if action_id.startswith("M2-"):
        return 2
    if action_id.startswith("M3-"):
        return 3
    return int(action_id.split("-")[0][1:])


def action_seq(action_id: str) -> int:
    """Sequence within move from locked chronology (1-indexed)."""
    move = move_num(action_id)
    pos = 0
    for aid in CHRONO_ORDER:
        if move_num(aid) == move:
            pos += 1
            if aid == action_id:
                return pos
    return pos


def display_title(action_id: str) -> str:
    return DISPLAY_TITLES.get(action_id, action_id)


def load_all_actions() -> list[dict]:
    pilot = json.loads(WORKSHEETS.read_text(encoding="utf-8"))
    by_id = {e["action_id"]: e for e in pilot["actions"]}
    if "M1-TAIWAN" not in by_id:
        by_id["M1-TAIWAN"] = {
            "action_id": "M1-TAIWAN",
            "title": DISPLAY_TITLES["M1-TAIWAN"],
            "submission_month": notional_submission_month("M1-TAIWAN"),
            "worksheet": None,
        }
    ordered: list[dict] = []
    for aid in CHRONO_ORDER:
        if aid in by_id:
            ordered.append(by_id[aid])
    return ordered


def submission_month_for(entry: dict) -> str:
    return (
        entry.get("submission_month")
        or (entry.get("worksheet") or {}).get("submission_month")
        or notional_submission_month(entry["action_id"])
    )


def zero_deltas() -> dict[str, list[float]]:
    return {ind: [0.0] * len(QUARTERS) for ind in INDICATORS}


def cap_deltas(deltas: dict[str, list[float]]) -> dict[str, list[float]]:
    return {
        ind: [max(-S_CAP, min(S_CAP, round(v, 2))) for v in deltas[ind]]
        for ind in INDICATORS
    }


def add_deltas(a: dict[str, list[float]], b: dict[str, list[float]]) -> dict[str, list[float]]:
    return {
        ind: [round(a[ind][i] + b[ind][i], 2) for i in range(len(QUARTERS))]
        for ind in INDICATORS
    }


def post_from_running(running: dict[str, list[float]]) -> dict[str, list[float]]:
    return {
        ind: [round(BASELINE[ind][i] + running[ind][i], 2) for i in range(len(QUARTERS))]
        for ind in INDICATORS
    }


def fo_slice(values: list[float]) -> list[float]:
    return [values[Q_IDX[q]] for q in FO_QUARTERS]


def action_deltas(entry: dict) -> dict[str, list[float]] | None:
    if entry["action_id"] in REMOVED_ACTIONS:
        return None
    ws = entry.get("worksheet")
    if not ws:
        return None
    month = submission_month_for(entry)
    trend = engine.adjudicate_from_worksheet(ws, submission_month=month)["trend"]
    if trend.get("no_effect"):
        return None
    return {ind: list(trend["indicators"][ind]["deltas"]) for ind in INDICATORS}


def interpolate_value(x: float, xs: list[float], values: list[float]) -> float:
    import numpy as np
    return float(np.interp(x, xs, values))


def simulate(
    actions: list[dict],
    max_move: int,
) -> tuple[dict[str, list[float]], list[dict]]:
    """Stack live quarterly engine deltas via FO 2.0 stacking policy."""
    markers: list[dict] = []
    delta_list: list[dict[str, list[float]]] = []
    move_ids: list[int] = []

    for entry in actions:
        aid = entry["action_id"]
        if move_num(aid) > max_move:
            continue
        month = submission_month_for(entry)
        x = month_to_float(month)
        removed = aid in REMOVED_ACTIONS
        deltas = None if removed else action_deltas(entry)

        if deltas is not None:
            delta_list.append(deltas)
            move_ids.append(move_num(aid))

        markers.append({
            "action_id": aid,
            "title": display_title(aid),
            "x": x,
            "submission_month": month,
            "removed": removed,
            "status": REMOVED_ACTIONS[aid]["status"] if removed else "economic",
        })

    if delta_list:
        stacked = engine.stack_action_deltas(
            delta_list,
            policy=None,  # codebook default (uncapped)
            move_ids=move_ids,
        )
        running = stacked["deltas"]
        stacking_policy = stacked["stacking_policy"]
    else:
        running = zero_deltas()
        stacking_policy = engine.resolve_stacking_policy(None)

    # Stash for footers
    simulate.last_stacking_policy = stacking_policy  # type: ignore[attr-defined]

    final_post = post_from_running(running)
    fo_post = {ind: fo_slice(final_post[ind]) for ind in INDICATORS}

    for m in markers:
        m["values"] = {
            ind: interpolate_value(m["x"], FO_XS, fo_post[ind])
            for ind in INDICATORS
        }
        m["baseline_values"] = {
            ind: interpolate_value(m["x"], FO_XS, FO_BASELINE[ind])
            for ind in INDICATORS
        }

    return fo_post, markers


def stacking_footer_phrase() -> str:
    policy = getattr(simulate, "last_stacking_policy", None) or engine.resolve_stacking_policy(None)
    if policy == "uncapped":
        return f"stacking_policy={policy} (multi-action higher-order effects visible)"
    return f"stacking_policy={policy} (cap +/-{S_CAP} pp where applicable)"

def verdict(ind: str, post: list[float]) -> str:
    base = FO_BASELINE[ind]
    net = sum(p - b for p, b in zip(post, base)) * FAVORABLE[ind]
    if net > 0:
        return "favorable"
    if net < 0:
        return "unfavorable"
    return "neutral"


def verdict_color(v: str) -> str:
    if v == "favorable":
        return FAV_COLOR
    if v == "unfavorable":
        return UNFAV_COLOR
    return NEUTRAL_COLOR


def _ensure_mpl():
    try:
        import matplotlib.pyplot as plt
        from matplotlib.backends.backend_pdf import PdfPages
        from matplotlib.lines import Line2D
        from matplotlib.patches import FancyBboxPatch
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "matplotlib", "numpy", "-q"])
        import matplotlib.pyplot as plt
        from matplotlib.backends.backend_pdf import PdfPages
        from matplotlib.lines import Line2D
        from matplotlib.patches import FancyBboxPatch
    return plt, PdfPages, Line2D, FancyBboxPatch


def draw_action_title_rail(ax, markers: list[dict], max_move: int, y_axes=(-0.11, -0.22)):
    """Staggered beige action-title boxes under the x-axis (report style)."""
    plt, _, _, FancyBboxPatch = _ensure_mpl()
    trans = ax.get_xaxis_transform()
    visible = [m for m in markers if move_num(m["action_id"]) <= max_move]
    for i, m in enumerate(visible):
        y = y_axes[0] if i % 2 == 0 else y_axes[1]
        title = m["title"]
        # Shorten only the longest titles for rail fit.
        if "Telecom" in title and len(title) > 34:
            label = "Global Allied Telecom &\nConnectivity Initiative"
        elif "Stockpiling" in title:
            label = "Stockpiling, Medical &\nCritical Minerals"
        else:
            label = title
        ax.plot([m["x"], m["x"]], [-0.02, y + 0.035], transform=trans,
                color="#c9b896", linewidth=0.7, clip_on=False, zorder=0)
        ax.text(
            m["x"], y, label,
            transform=trans, ha="center", va="center",
            fontsize=5.4, color=TITLE_TEXT, linespacing=1.0,
            bbox=dict(
                boxstyle="round,pad=0.22,rounding_size=0.12",
                facecolor=TITLE_BOX, edgecolor=TITLE_EDGE, linewidth=0.6,
            ),
            clip_on=False, zorder=8,
        )


def draw_axis_label(fig, axes_center_x: float = 0.5):
    """Place 'Year / Game Action' under 2029, beneath the action-title rail."""
    fig.text(
        axes_center_x, 0.045, "Year / Game Action",
        ha="center", va="top", fontsize=10, color=GREY,
    )


def draw_move_bands(ax, max_move: int):
    trans = ax.get_xaxis_transform()
    for move in sorted(MOVE_BANDS):
        if move > max_move:
            continue
        band = MOVE_BANDS[move]
        mid = (band["start"] + band["end"]) / 2
        ax.axvspan(
            band["start"], band["end"], ymin=0, ymax=1,
            color="#f4f6f9", zorder=0, alpha=0.55,
        )
        ax.text(
            mid, 1.02, band["label"],
            transform=trans, ha="center", va="bottom",
            fontsize=10, fontweight="bold", color=WM_GREEN,
        )
        if move > 1:
            ax.axvline(band["start"], color="#333333", linewidth=1.1, linestyle="-", zorder=2)


def plot_all_indicators(
    title: str,
    subtitle: str,
    post: dict[str, list[float]],
    markers: list[dict],
    max_move: int,
    out_base: Path,
):
    plt, PdfPages, Line2D, _ = _ensure_mpl()

    fig, ax = plt.subplots(figsize=(14.5, 8.4), facecolor="white")
    fig.suptitle(title, fontsize=16, fontweight="bold", color=WM_GREEN, y=0.98)
    fig.text(0.5, 0.935, subtitle, ha="center", fontsize=10, color=GREY)

    draw_move_bands(ax, max_move)

    for ind in INDICATORS:
        line = post[ind]
        color = IND_COLORS[ind]
        v = verdict(ind, line)
        vcolor = verdict_color(v)
        ax.plot(
            FO_XS, line, color=color, linewidth=2.6, linestyle="-",
            label=SHORT_LABELS[ind], zorder=3,
        )
        ax.annotate(
            v,
            xy=(FO_XS[-1], line[-1]),
            xytext=(8, 0),
            textcoords="offset points",
            fontsize=8,
            fontweight="bold",
            color=vcolor,
            va="center",
            zorder=5,
        )

    for m in markers:
        if move_num(m["action_id"]) > max_move:
            continue
        aid = m["action_id"]
        x = m["x"]
        if m["removed"]:
            style = REMOVED_ACTIONS[aid]
            # One marker per removed action, placed on GDP line for readability.
            y = m["values"]["real_gdp_growth"]
            ax.scatter(
                [x], [y],
                marker=style["marker"],
                s=90 if style["marker"] == "D" else 75,
                facecolors=style["facecolor"],
                edgecolors=style["edgecolor"],
                linewidths=1.5,
                zorder=7,
            )
            if style["status"] == "non_economic":
                ax.scatter([x], [y], marker="x", s=45, color="#888888", zorder=8)
        else:
            for ind in INDICATORS:
                y = m["values"][ind]
                ax.scatter(
                    [x], [y],
                    color=IND_COLORS[ind],
                    s=32,
                    zorder=6,
                    edgecolors="white",
                    linewidths=0.6,
                )

    draw_action_title_rail(ax, markers, max_move)

    ax.set_xlim(2026.85, 2032.45)
    ax.set_ylabel("Percent (%)", fontsize=10, color=GREY)
    year_ticks = [2027, 2028, 2029, 2030, 2031, 2032]
    ax.set_xticks(year_ticks)
    ax.set_xticklabels([str(y) for y in year_ticks], fontsize=9)
    ax.tick_params(axis="y", labelsize=9)
    ax.grid(True, color="#e4e6eb", linewidth=0.8, zorder=1)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.set_ylim(0, 5.4)
    ax.set_xlabel("")

    indicator_handles = [
        Line2D([0], [0], color=IND_COLORS[ind], linewidth=2.6,
               label=SHORT_LABELS[ind])
        for ind in INDICATORS
    ]
    visible_removed = sorted({
        m["action_id"] for m in markers
        if m["removed"] and move_num(m["action_id"]) <= max_move
    })
    removed_handles = [
        Line2D(
            [0], [0], marker=REMOVED_ACTIONS[aid]["marker"], linestyle="None",
            markerfacecolor=REMOVED_ACTIONS[aid]["facecolor"],
            markeredgecolor=REMOVED_ACTIONS[aid]["edgecolor"],
            markersize=8, label=REMOVED_ACTIONS[aid]["legend"],
        )
        for aid in visible_removed
    ]

    # Fixed margins: right gutter for the key; bottom room for action titles.
    fig.subplots_adjust(left=0.07, right=0.78, top=0.88, bottom=0.30)
    ax.legend(
        handles=indicator_handles + removed_handles,
        loc="upper left",
        bbox_to_anchor=(1.02, 1.0),
        frameon=True,
        framealpha=0.97,
        edgecolor="#d8dce3",
        borderaxespad=0.0,
        fontsize=7.2,
        labelspacing=LEGEND_KWARGS["labelspacing"],
        handleheight=LEGEND_KWARGS["handleheight"],
    )

    # Center the axis label under 2029 in figure coordinates (after layout).
    inv = fig.transFigure.inverted()
    x_disp, _ = ax.transData.transform((2029.0, 0.0))
    x_fig, _ = inv.transform((x_disp, 0.0))
    fig.text(
        x_fig, 0.10, "Year / Game Action",
        ha="center", va="top", fontsize=10, color=GREY,
    )
    fig.text(
        0.5, 0.035,
        f"PLI codebook {CODEBOOK_VERSION} | Blue Team Reframing | "
        f"Quarterly grid 2027Q1-2032Q4 | Month-anchored submissions | {stacking_footer_phrase()} | "
        f"Baseline: {BASELINE_SOURCES}",
        ha="center", fontsize=6.2, color=GREY,
    )

    png = out_base.with_suffix(".png")
    pdf = out_base.with_suffix(".pdf")
    fig.savefig(png, dpi=200, facecolor="white")
    with PdfPages(pdf) as doc:
        doc.savefig(fig, facecolor="white")
    plt.close(fig)
    return png, pdf


def plot_single_indicator(
    ind: str,
    post: dict[str, list[float]],
    markers: list[dict],
    max_move: int,
    out_base: Path,
):
    plt, PdfPages, Line2D, _ = _ensure_mpl()

    base = FO_BASELINE[ind]
    line = post[ind]
    color = IND_COLORS[ind]
    v = verdict(ind, line)
    vcolor = verdict_color(v)
    fav_dir = FAVORABLE[ind]
    import numpy as np
    base_arr = np.array(base, dtype=float)
    line_arr = np.array(line, dtype=float)
    signed = (line_arr - base_arr) * fav_dir

    fig, ax = plt.subplots(figsize=(14.5, 7.8), facecolor="white")
    fig.suptitle(
        f"Fractured Order 1.0 — {FULL_LABELS[ind]}",
        fontsize=16, fontweight="bold", color=WM_GREEN, y=0.98,
    )
    fig.text(
        0.5, 0.935,
        f"PLI cumulative path vs macroeconomic baseline | Quarterly grid through 2032 | Verdict: {v}",
        ha="center", fontsize=10, color=GREY,
    )

    draw_move_bands(ax, max_move)

    ax.plot(
        FO_XS, base, color=BASELINE_COLOR, linewidth=2.4, linestyle="--",
        label="Macroeconomic baseline", zorder=3,
    )
    ax.plot(
        FO_XS, line, color=color, linewidth=2.6, linestyle="-",
        label="Post-action (PLI cumulative)", zorder=4,
    )
    ax.fill_between(
        FO_XS, base_arr, line_arr, where=(signed >= 0),
        color=FAV_FILL, alpha=0.62, interpolate=True, zorder=2,
        label="Favorable divergence",
    )
    ax.fill_between(
        FO_XS, base_arr, line_arr, where=(signed < 0),
        color=UNFAV_COLOR, alpha=0.28, interpolate=True, zorder=2,
        label="Unfavorable divergence",
    )

    for m in markers:
        if move_num(m["action_id"]) > max_move:
            continue
        aid = m["action_id"]
        x = m["x"]
        y = m["values"][ind]
        if m["removed"]:
            style = REMOVED_ACTIONS[aid]
            ax.scatter(
                [x], [y],
                marker=style["marker"],
                s=95 if style["marker"] == "D" else 80,
                facecolors=style["facecolor"],
                edgecolors=style["edgecolor"],
                linewidths=1.5,
                zorder=7,
            )
            if style["status"] == "non_economic":
                ax.scatter([x], [y], marker="x", s=48, color="#888888", zorder=8)
        else:
            ax.scatter(
                [x], [y],
                color=color, s=42, zorder=6,
                edgecolors="white", linewidths=0.7,
            )

    draw_action_title_rail(ax, markers, max_move)

    ymin = min(min(base), min(line)) - 0.35
    ymax = max(max(base), max(line)) + 0.45
    ax.set_ylim(max(0, ymin), ymax)
    ax.set_xlim(2026.85, 2032.45)
    ax.set_ylabel("Percent (%)", fontsize=10, color=GREY)
    year_ticks = [2027, 2028, 2029, 2030, 2031, 2032]
    ax.set_xticks(year_ticks)
    ax.set_xticklabels([str(y) for y in year_ticks], fontsize=9)
    ax.tick_params(axis="y", labelsize=9)
    ax.grid(True, color="#e4e6eb", linewidth=0.8, zorder=1)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.set_xlabel("")

    ax.annotate(
        v,
        xy=(FO_XS[-1], line[-1]),
        xytext=(8, 0),
        textcoords="offset points",
        fontsize=9,
        fontweight="bold",
        color=vcolor,
        va="center",
    )

    handles = [
        Line2D([0], [0], color=BASELINE_COLOR, linewidth=2.4, linestyle="--",
               label="Macroeconomic baseline"),
        Line2D([0], [0], color=color, linewidth=2.6,
               label="Post-action (PLI cumulative)"),
        plt.Rectangle((0, 0), 1, 1, facecolor=FAV_COLOR, alpha=1.0,
                      label="Favorable divergence"),
        plt.Rectangle((0, 0), 1, 1, facecolor=UNFAV_COLOR, alpha=0.85,
                      label="Unfavorable divergence"),
    ]
    visible_removed = sorted({
        m["action_id"] for m in markers
        if m["removed"] and move_num(m["action_id"]) <= max_move
    })
    for aid in visible_removed:
        handles.append(Line2D(
            [0], [0], marker=REMOVED_ACTIONS[aid]["marker"], linestyle="None",
            markerfacecolor=REMOVED_ACTIONS[aid]["facecolor"],
            markeredgecolor=REMOVED_ACTIONS[aid]["edgecolor"],
            markersize=8, label=REMOVED_ACTIONS[aid]["legend"],
        ))
    ax.legend(handles=handles, loc="upper right", **LEGEND_KWARGS)

    fig.subplots_adjust(left=0.08, right=0.97, top=0.88, bottom=0.30)
    inv = fig.transFigure.inverted()
    x_disp, _ = ax.transData.transform((2029.0, 0.0))
    x_fig, _ = inv.transform((x_disp, 0.0))
    fig.text(
        x_fig, 0.10, "Year / Game Action",
        ha="center", va="top", fontsize=10, color=GREY,
    )
    fig.text(
        0.5, 0.035,
        f"PLI codebook {CODEBOOK_VERSION} | Blue Team Reframing | "
        f"Quarterly grid through 2032 | Month-anchored submissions | {stacking_footer_phrase()} | "
        f"Baseline: {BASELINE_SOURCES}",
        ha="center", fontsize=6.6, color=GREY,
    )

    png = out_base.with_suffix(".png")
    pdf = out_base.with_suffix(".pdf")
    fig.savefig(png, dpi=200, facecolor="white")
    with PdfPages(pdf) as doc:
        doc.savefig(fig, facecolor="white")
    plt.close(fig)
    return png, pdf


NARRATIVES = {
    "all_intro": (
        "Across 2027–2032 the Blue macro picture splits between resilience and "
        "friction, under FO 2.0 uncapped multi-action stacking. Unemployment drifts "
        "from 4.2% toward 3.6% by 2032Q4, and fixed investment recovers from a 2028 "
        "trough near 1.9% to about 3.3% (2031) and 3.6% (2032) as stacked L7/L8 "
        "capacity impulses compound past ±0.8. Real GDP softens through 2029–2030 "
        "(near 1.7%) before rebounding to about 2.0% (2031) and 2.3% (2032). Trade "
        "volume collapses early—from 2.8% in 2027 to 0.6% in 2028—and only partially "
        "recovers, while PCE inflation runs hot mid-game (near 2.5%) before easing "
        "toward ~1.9% at the horizon. Net: labor and investment strengthen; trade "
        "and mid-game inflation absorb coercive statecraft costs."
    ),
    "real_gdp_growth": (
        "Real GDP growth ends favorable after a mid-game dip and a late recovery that "
        "is still building at 2032Q4. The path holds the 2.2% baseline in 2027, then "
        "softens to 1.9% (2028) and 1.7% (2029) as Trade Investigations impose a "
        "coercive drag. Capacity-building reverses the slide with a lag: Minerals for "
        "All (L7) starts moving GDP around 2030Q4 and is still ramping through 2032; "
        "the Probiotic Act adds a smaller late impulse. By 2031Q4 growth is about "
        "2.0% and by 2032Q4 about 2.3% versus an 1.8% late baseline (~+0.5 pp)—not "
        "the older annual-brick claim of 2.5% by 2030–31. Global Allied Telecom "
        "(Impl 3, L6) places effects beyond the grid; IP Enforced Remuneration does "
        "not execute. The recovery is carried by domestic inducement still mid-ramp "
        "at horizon end."
    ),
    "pce_inflation": (
        "PCE inflation is unfavorable on a cumulative basis even though the path "
        "eases late. Against a flat 2.0% baseline, Trade Investigations are the "
        "dominant early shock (+0.5 pp class), pushing the series to about 2.5% by "
        "late 2027–2028. Capacity actions add smaller transitory cost impulses; "
        "Stockpiling offsets some of the overshoot. By 2032Q4 the post-action path "
        "sits near 1.9%—slightly below baseline—yet the mid-game overshoot leaves "
        "the net cumulative verdict unfavorable. Stacking policy is uncapped; this "
        "indicator does not exceed ±S from stacking on this pack."
    ),
    "unemployment_rate": (
        "Unemployment remains contained and ends favorable. The series opens at the "
        "4.2% baseline in 2027, edges up slightly as Trade Investigations add modest "
        "labor-market friction, then improves as capacity actions take hold. By "
        "2032Q4 the path settles near 3.6% versus a 3.9% baseline (~−0.3 pp). The "
        "labor-market gain is a delayed payoff from domestic inducement, not from "
        "coercive packages."
    ),
    "trade_volume_growth": (
        "Trade volume growth is the sharpest adverse break from baseline. The "
        "baseline already steps down from 3.6% (2027) to 1.4% (2028); Trade "
        "Investigations deepen that break with a matrix-class −S (−0.8 pp) hit—"
        "a single-action impulse, not a stacking mute—and drive the post-action "
        "path to 0.6% in 2028. Later exclusion/sanctions and some domestic "
        "substitution trim further; stockpiling partially rebuilds volumes. The "
        "path recovers only into the low-1% range by 2031–32 and never fully "
        "reclaims the late baseline band. Verdict: unfavorable."
    ),
    "fixed_investment_growth": (
        "Fixed investment is the strongest Reframing-aligned success and the clearest "
        "demonstration of uncapped stacking. Trade Investigations pull investment "
        "down early; Minerals for All then delivers a large L7 impulse, with the "
        "Probiotic Act, Stockpiling, and Global Strategic Futures adding further "
        "buildout. Under default stacking_policy=uncapped, cumulative investment "
        "deltas exceed ±0.8 from about 2030Q4 onward (peaking near +1.8 pp by "
        "2032Q4)—the same_quarter clamp would have muted that late path near +0.7. "
        "Net path: 3.3% (2027) → 1.9% (2028) → ~2.6% (2030) → ~3.3% (2031) → "
        "~3.6% (2032), versus an 1.8% late baseline—clearly favorable."
    ),
}


def write_narratives_pdf(out_path: Path, post: dict[str, list[float]]):
    plt, PdfPages, _, _ = _ensure_mpl()
    from matplotlib.backends.backend_pdf import PdfPages as PP

    pages = [("Full-game overview", NARRATIVES["all_intro"])] + [
        (SHORT_LABELS[ind], NARRATIVES[ind]) for ind in INDICATORS
    ]

    with PP(out_path) as doc:
        # Cover / all narratives page
        fig = plt.figure(figsize=(8.5, 11), facecolor="white")
        fig.text(
            0.08, 0.95,
            "PLI FO 1.0 Chart Narratives",
            fontsize=18, fontweight="bold", color=WM_GREEN, va="top",
        )
        fig.text(
            0.08, 0.915,
            "Fractured Order 1.0 Blue actions · trial codebook trial-2026-07-13-quarterly · stacking uncapped · Reframing orientation",
            fontsize=9, color=GREY, va="top",
        )
        y = 0.88
        for heading, para in pages:
            v = ""
            if heading != "Full-game overview":
                ind = next(i for i, lab in SHORT_LABELS.items() if lab == heading)
                v = f"  [{verdict(ind, post[ind])}]"
            fig.text(0.08, y, heading + v, fontsize=11.5, fontweight="bold",
                     color=WM_GREEN, va="top")
            y -= 0.028
            wrapped = textwrap.fill(para, width=96)
            for line in wrapped.split("\n"):
                fig.text(0.08, y, line, fontsize=9.2, color="#222222", va="top")
                y -= 0.0185
            y -= 0.018
        fig.text(
            0.08, 0.04,
            "Source: PLI engine adjudication of pilot/worksheets.json against codebook_data.json.\n"
            "Action titles follow FO Interim Report Game Action labeling. EU Minerals withdrawn; "
            "Wedges and Incentives non-economic.",
            fontsize=7.5, color=GREY, va="bottom",
        )
        doc.savefig(fig, bbox_inches="tight")
        plt.close(fig)

    # Also write a plain-text companion for easy paste into the report.
    txt_path = out_path.with_suffix(".txt")
    blocks = ["PLI FO 1.0 Chart Narratives", "=" * 40, ""]
    for heading, para in pages:
        blocks.append(heading)
        blocks.append("-" * len(heading))
        blocks.append(para)
        blocks.append("")
    txt_path.write_text("\n".join(blocks), encoding="utf-8")
    return out_path, txt_path


def combine_pdfs(image_pngs: list[Path], out_path: Path):
    plt, PdfPages, _, _ = _ensure_mpl()
    try:
        from PIL import Image
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
        from PIL import Image

    with PdfPages(out_path) as doc:
        for png in image_pngs:
            img = Image.open(png)
            w, h = img.size
            fig = plt.figure(figsize=(w / 200, h / 200), dpi=200)
            ax = fig.add_axes([0, 0, 1, 1])
            ax.imshow(img)
            ax.axis("off")
            doc.savefig(fig, bbox_inches="tight", pad_inches=0)
            plt.close(fig)


def main() -> int:
    import tempfile

    actions = load_all_actions()
    post_full, markers_full = simulate(actions, max_move=2)

    combined = DESKTOP / "PLI_FO10_Report_Charts_Combined.pdf"
    with tempfile.TemporaryDirectory(prefix="pli_fo10_charts_") as tmp:
        tmp_dir = Path(tmp)
        deliverable_pngs: list[Path] = []

        png, _ = plot_all_indicators(
            "Fractured Order 1.0 — U.S. Macroeconomic Adjudication (Full Game)",
            "PLI cumulative trend lines after Moves 1-2 | Quarterly grid through 2032 | Month-anchored submissions | All five indicators",
            post_full, markers_full, max_move=2,
            out_base=tmp_dir / "PLI_FO10_FullGame_FiveIndicators",
        )
        deliverable_pngs.append(png)

        for ind in INDICATORS:
            png, _ = plot_single_indicator(
                ind, post_full, markers_full, max_move=2,
                out_base=tmp_dir / f"PLI_FO10_{FILE_STEMS[ind]}_Baseline",
            )
            deliverable_pngs.append(png)

        combine_pdfs(deliverable_pngs, combined)

    print(f"Wrote: {combined}")
    print("\nVerdicts:")
    for ind in INDICATORS:
        print(f"  {SHORT_LABELS[ind]}: {verdict(ind, post_full[ind])} | post={post_full[ind]} | base={FO_BASELINE[ind]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
