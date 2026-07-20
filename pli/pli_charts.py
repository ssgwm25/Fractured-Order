"""Canonical PLI macroeconomic chart generator.

All PLI trend charts — FO report packs, sample adjudication HTML, and any
server-side / White Cell image exports — should use this module so visual
language stays consistent:

  - navy dashed baseline, colored solid post-action
  - optional sparse markers (prefer submission markers over every-quarter dots)
  - darker favorable green / red unfavorable segment fills
  - action titles (not M1-A# notation) in titles and labels
  - legend spacing that keeps special markers from colliding

FO cumulative report charts live in ``generate_fo10_report_charts.py`` and
import shared style constants from here.
"""
from __future__ import annotations

import base64
import io
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import engine  # noqa: E402

GREY = "#5a5f6e"
WM_GREEN = "#115740"
FAV_COLOR = "#0a4d28"
FAV_FILL = "#0f6b35"
UNFAV_COLOR = "#b04a4a"
NEUTRAL_COLOR = "#5a5f6e"
BASELINE_COLOR = "#1f3b6e"
POST_COLOR = "#7a4b00"

IND_COLORS = {
    "real_gdp_growth": "#1f3b6e",
    "pce_inflation": "#b04a4a",
    "unemployment_rate": "#2e7d32",
    "trade_volume_growth": "#b8860b",
    "fixed_investment_growth": "#5b4b8a",
}

LEGEND_KWARGS = {
    "fontsize": 8,
    "frameon": True,
    "framealpha": 0.95,
    "edgecolor": "#d8dce3",
    "labelspacing": 0.55,
    "handleheight": 1.35,
}


def quarter_to_float(label: str) -> float:
    """Map 2026Q1 → 2026.0, 2026Q2 → 2026.25, …"""
    year = int(label[:4])
    q = int(label[-1])
    return year + (q - 1) * 0.25


def month_to_float(yyyy_mm: str) -> float:
    year = int(yyyy_mm[:4])
    month = int(yyyy_mm[5:7])
    return year + (month - 1) / 12.0


def _ensure_mpl():
    try:
        import matplotlib.pyplot as plt
        from matplotlib.lines import Line2D
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "matplotlib", "numpy", "-q"])
        import matplotlib.pyplot as plt
        from matplotlib.lines import Line2D
    return plt, Line2D


def plot_adjudication_indicator(
    quarters: list[str],
    indicator: dict[str, Any],
    *,
    action_title: str,
    out_path: Path | None = None,
    ind_key: str | None = None,
    submission_month: str | None = None,
) -> Path | bytes:
    """Render one baseline-vs-post chart for a single adjudicated action."""
    plt, Line2D = _ensure_mpl()
    import numpy as np

    base = list(indicator["baseline"])
    post = list(indicator["post_action"])
    fav_dir = int(indicator.get("favorable_direction", 1))
    verdict = indicator.get("verdict", "neutral")
    label = indicator.get("label", ind_key or "Indicator")
    color = IND_COLORS.get(ind_key or "", POST_COLOR)
    vcolor = FAV_COLOR if verdict == "favorable" else (
        UNFAV_COLOR if verdict == "unfavorable" else NEUTRAL_COLOR
    )

    xs = [quarter_to_float(q) for q in quarters]
    base_arr = np.array(base, dtype=float)
    post_arr = np.array(post, dtype=float)
    signed = (post_arr - base_arr) * fav_dir

    fig, ax = plt.subplots(figsize=(6.2, 3.4), facecolor="white")
    fig.suptitle(label, fontsize=11, fontweight="bold", color=vcolor, y=0.98)
    fig.text(
        0.5, 0.91,
        f"{action_title}  |  [{verdict}]",
        ha="center", fontsize=8.5, color=GREY,
    )

    ax.plot(
        xs, base, color=BASELINE_COLOR, linewidth=2.0, linestyle="--",
        label="Macroeconomic baseline", zorder=3,
    )
    ax.plot(
        xs, post, color=color, linewidth=2.2, linestyle="-",
        label="Post-action", zorder=4,
    )
    ax.fill_between(
        xs, base_arr, post_arr, where=(signed >= 0),
        color=FAV_FILL, alpha=0.55, interpolate=True, zorder=2,
    )
    ax.fill_between(
        xs, base_arr, post_arr, where=(signed < 0),
        color=UNFAV_COLOR, alpha=0.28, interpolate=True, zorder=2,
    )

    if submission_month:
        sx = month_to_float(submission_month)
        sy = float(np.interp(sx, xs, post_arr))
        ax.scatter(
            [sx], [sy], s=36, color=color, edgecolors="white", linewidths=0.8,
            zorder=6, label=f"Submitted {submission_month}",
        )
        ax.axvline(sx, color="#c9b896", linewidth=0.9, linestyle=":", zorder=1)

    ymin = float(min(min(base), min(post)) - 0.35)
    ymax = float(max(max(base), max(post)) + 0.45)
    ax.set_ylim(max(0.0, ymin), ymax)
    ax.set_xlim(xs[0] - 0.1, xs[-1] + 0.1)
    ax.set_ylabel("Percent (%)", fontsize=8, color=GREY)
    # Tick every Q1 for readability on 28-quarter grid.
    tick_idx = [i for i, q in enumerate(quarters) if q.endswith("Q1")]
    ax.set_xticks([xs[i] for i in tick_idx])
    ax.set_xticklabels([quarters[i][:4] for i in tick_idx], fontsize=7.5)
    ax.tick_params(axis="y", labelsize=7.5)
    ax.grid(True, color="#e4e6eb", linewidth=0.7, zorder=1)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    handles = [
        Line2D([0], [0], color=BASELINE_COLOR, linewidth=2.0, linestyle="--",
               label="Baseline"),
        Line2D([0], [0], color=color, linewidth=2.2, label="Post-action"),
        plt.Rectangle((0, 0), 1, 1, facecolor=FAV_COLOR, alpha=1.0,
                      label="Favorable divergence"),
        plt.Rectangle((0, 0), 1, 1, facecolor=UNFAV_COLOR, alpha=0.85,
                      label="Unfavorable divergence"),
    ]
    ax.legend(handles=handles, loc="best", **LEGEND_KWARGS)

    fig.tight_layout(rect=[0.02, 0.02, 0.98, 0.86])

    if out_path is not None:
        out_path = Path(out_path)
        fig.savefig(out_path, dpi=160, facecolor="white")
        plt.close(fig)
        return out_path

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=160, facecolor="white")
    plt.close(fig)
    return buf.getvalue()


def adjudication_charts_base64(
    trend: dict[str, Any],
    action_title: str,
    submission_month: str | None = None,
) -> list[tuple[str, str]]:
    """Return [(label, base64_png), ...] for every indicator in a trend record."""
    if trend.get("no_effect"):
        return []
    quarters = list(trend.get("quarters") or trend["years"])
    month = submission_month or trend.get("submission_month")
    out: list[tuple[str, str]] = []
    for key, indicator in trend["indicators"].items():
        png_bytes = plot_adjudication_indicator(
            quarters, indicator, action_title=action_title, ind_key=key,
            submission_month=month,
        )
        assert isinstance(png_bytes, (bytes, bytearray))
        out.append((indicator.get("label", key), base64.b64encode(png_bytes).decode("ascii")))
    return out
