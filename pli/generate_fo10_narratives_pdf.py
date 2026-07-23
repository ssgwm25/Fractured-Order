"""Generate PLI FO 1.0 chart narratives PDF for the Interim Report.

Deliverable (Desktop):
  PLI_FO10_Chart_Narratives_for_General.pdf
"""
from __future__ import annotations

import sys
import textwrap
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

from generate_fo10_report_charts import (  # noqa: E402
    NARRATIVES,
    INDICATORS,
    DESKTOP,
    WM_GREEN,
    GREY,
    FAV_COLOR,
    UNFAV_COLOR,
    load_all_actions,
    simulate,
    verdict,
)

OUT = DESKTOP / "PLI_FO10_Chart_Narratives_for_General.pdf"

PLI_FOOTNOTE = (
    "The Petrihos Lever Index (PLI) is the Fractured Order macroeconomic "
    "adjudication framework. It replaces free-text economic scoring with a "
    "traceable three-layer pipeline: (1) Classification of each action into an "
    "economic lever and instrument (or non-economic exclusion); (2) an "
    "Implementation score (1–10) based on precedent tier, funding/partner/"
    "timeline modifiers, and execution feasibility; and (3) a Fit score (1–10) "
    "measuring alignment with the acting team’s declared Strategic Orientation "
    "(here, Blue Reframing). A deterministic engine then maps those scores onto "
    "quarterly deltas for five sourced U.S. indicators—real GDP growth, PCE "
    "inflation, unemployment, trade volume growth, and fixed investment "
    "growth—anchored to the IMF Article IV / CBO / Fed / WTO / OECD baseline "
    "documented in PLI_Annotated_Bibliography.md (grid 2026Q1–2032Q4; "
    "submission_month required). Multi-action stacking defaults to uncapped so "
    "higher-order effects remain visible; alternate same_quarter / per_move "
    "modes clamp at ±0.8 when selected. Non-economic actions (Wedges and "
    "Incentives) and withdrawn actions (EU Minerals) receive no macro vector. "
    "Chart paths show the cumulative post-action series against that baseline; "
    "favorable/unfavorable verdicts judge net divergence from the acting team’s "
    "economic interest."
)

SECTION_ORDER = [
    ("Full-Game Macro Trends", None, "all_intro"),
    ("Real GDP Growth", "real_gdp_growth", "real_gdp_growth"),
    ("PCE Inflation", "pce_inflation", "pce_inflation"),
    ("Unemployment", "unemployment_rate", "unemployment_rate"),
    ("Trade Volume Growth", "trade_volume_growth", "trade_volume_growth"),
    ("Fixed Investment Growth", "fixed_investment_growth", "fixed_investment_growth"),
]


def _ensure_mpl():
    try:
        import matplotlib.pyplot as plt
        from matplotlib.backends.backend_pdf import PdfPages
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "matplotlib", "-q"])
        import matplotlib.pyplot as plt
        from matplotlib.backends.backend_pdf import PdfPages
    return plt, PdfPages


def _wrap(text: str, width: int = 92) -> list[str]:
    return textwrap.wrap(text, width=width, break_long_words=False, break_on_hyphens=False)


def build_pdf(out_path: Path, post: dict) -> Path:
    plt, PdfPages = _ensure_mpl()

    with PdfPages(out_path) as doc:
        fig = plt.figure(figsize=(8.5, 11), facecolor="white")

        y = 0.955
        fig.text(
            0.08, y,
            "Fractured Order 1.0 — Macro Chart Narratives",
            fontsize=16, fontweight="bold", color=WM_GREEN, va="top",
        )
        y -= 0.028
        fig.text(
            0.08, y,
            "Blue Team · Reframing orientation · FO timeline 2027–2031",
            fontsize=9.5, color=GREY, va="top",
        )
        y -= 0.018
        fig.text(
            0.08, y,
            "For use with PLI_FO10_Report_Charts_Combined.pdf  |  Statecraft Simulations Group",
            fontsize=8.5, color=GREY, va="top",
        )
        y -= 0.022
        # divider
        ax_line = fig.add_axes([0.08, y - 0.005, 0.84, 0.001])
        ax_line.axis("off")
        ax_line.plot([0, 1], [0.5, 0.5], color=WM_GREEN, linewidth=1.2)
        y -= 0.028

        for title, ind_key, narr_key in SECTION_ORDER:
            if y < 0.22:
                doc.savefig(fig, facecolor="white")
                plt.close(fig)
                fig = plt.figure(figsize=(8.5, 11), facecolor="white")
                y = 0.95

            verdict_txt = ""
            vcolor = WM_GREEN
            if ind_key is not None:
                v = verdict(ind_key, post[ind_key])
                verdict_txt = f"  —  {v}"
                vcolor = FAV_COLOR if v == "favorable" else (
                    UNFAV_COLOR if v == "unfavorable" else GREY
                )

            fig.text(
                0.08, y, title + verdict_txt,
                fontsize=11.5, fontweight="bold", color=vcolor if ind_key else WM_GREEN,
                va="top",
            )
            y -= 0.024

            for line in _wrap(NARRATIVES[narr_key], width=94):
                if y < 0.12:
                    doc.savefig(fig, facecolor="white")
                    plt.close(fig)
                    fig = plt.figure(figsize=(8.5, 11), facecolor="white")
                    y = 0.95
                fig.text(0.08, y, line, fontsize=9.3, color="#222222", va="top")
                y -= 0.0165
            y -= 0.016

        # ---- PLI footnote section ----
        if y < 0.32:
            doc.savefig(fig, facecolor="white")
            plt.close(fig)
            fig = plt.figure(figsize=(8.5, 11), facecolor="white")
            y = 0.95

        ax_line2 = fig.add_axes([0.08, y, 0.84, 0.001])
        ax_line2.axis("off")
        ax_line2.plot([0, 1], [0.5, 0.5], color=WM_GREEN, linewidth=1.2)
        y -= 0.028

        fig.text(
            0.08, y,
            "Suggested Main-Body Footnote — Petrihos Lever Index (PLI)",
            fontsize=11.5, fontweight="bold", color=WM_GREEN, va="top",
        )
        y -= 0.024
        fig.text(
            0.08, y,
            "Paste or adapt the paragraph below as a footnote where the macro charts "
            "are introduced in the Interim Report.",
            fontsize=8.5, color=GREY, va="top", fontstyle="italic",
        )
        y -= 0.022

        for line in _wrap(PLI_FOOTNOTE, width=94):
            if y < 0.08:
                doc.savefig(fig, facecolor="white")
                plt.close(fig)
                fig = plt.figure(figsize=(8.5, 11), facecolor="white")
                y = 0.95
            fig.text(0.08, y, line, fontsize=9.0, color="#222222", va="top")
            y -= 0.016

        fig.text(
            0.08, 0.035,
            "Source: PLI trial codebook trial-2026-07-13-quarterly · stacking_policy uncapped · pilot worksheets for eleven FO 1.0 Blue actions.",
            fontsize=7.5, color=GREY, va="bottom",
        )

        doc.savefig(fig, facecolor="white")
        plt.close(fig)

    # Plain-text companion for easy paste
    txt_path = out_path.with_suffix(".txt")
    blocks = [
        "Fractured Order 1.0 — Macro Chart Narratives",
        "=" * 52,
        "",
    ]
    for title, ind_key, narr_key in SECTION_ORDER:
        label = title
        if ind_key is not None:
            label = f"{title} — {verdict(ind_key, post[ind_key])}"
        blocks.append(label)
        blocks.append("-" * len(label))
        blocks.append(NARRATIVES[narr_key])
        blocks.append("")
    blocks.append("Suggested Main-Body Footnote — Petrihos Lever Index (PLI)")
    blocks.append("-" * 52)
    blocks.append(PLI_FOOTNOTE)
    blocks.append("")
    txt_path.write_text("\n".join(blocks), encoding="utf-8")
    return out_path


def main() -> int:
    actions = load_all_actions()
    post, _ = simulate(actions, max_move=2)
    path = build_pdf(OUT, post)
    print(f"Wrote: {path}")
    print(f"Wrote: {path.with_suffix('.txt')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
