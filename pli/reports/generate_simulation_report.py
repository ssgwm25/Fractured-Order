"""Per-simulation report: full-horizon charts via existing FO generators + multi-track rollup."""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from reports.trace_narrative import move_rollups  # noqa: E402

OUT_DIR = HERE / "out" / "simulation"

MULTI_TRACK_FOOTNOTE = (
    "The Petrihos Lever Index (PLI) adjudicates Fractured Order actions across "
    "parallel tracks. Macroeconomic adjudication (Implementation, Fit, and "
    "quarterly indicator deltas under FO 2.0 stacking) runs when the Plenum Instrument of Power is "
    "Economic. Diplomatic filings receive a Diplomacy Index code (not a score). "
    "Informational filings receive an unscored SME information brief. All "
    "actions receive National Interest six-domain National War College tier deltas and Glasl "
    "escalation staging. Charts are produced by the canonical pli_charts.py / "
    "generate_fo10_report_charts.py generators."
)


def write_simulation_report(
    records: list[dict],
    *,
    out_dir: Path | None = None,
) -> dict[str, Path]:
    out_dir = out_dir or OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    md = "# Per-simulation adjudication report\n\n"
    md += move_rollups(records).replace("# Per-move", "# Simulation-wide")
    md += "\n## Pipeline footnote\n\n" + MULTI_TRACK_FOOTNOTE + "\n"
    md_path = out_dir / "simulation.md"
    md_path.write_text(md, encoding="utf-8")

    pdf_path = out_dir / "simulation.pdf"
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    with PdfPages(pdf_path) as pdf:
        fig = plt.figure(figsize=(8.5, 11))
        fig.patch.set_facecolor("white")
        fig.text(
            0.08,
            0.92,
            "PLI Per-Simulation Report",
            fontsize=16,
            fontweight="bold",
            color="#115740",
        )
        fig.text(0.08, 0.86, md[:4000], fontsize=8, va="top", family="monospace")
        pdf.savefig(fig)
        plt.close(fig)

        fig = plt.figure(figsize=(8.5, 11))
        fig.patch.set_facecolor("white")
        fig.text(0.08, 0.9, "PLI multi-track footnote", fontsize=14, color="#115740")
        fig.text(0.08, 0.82, MULTI_TRACK_FOOTNOTE, fontsize=9, va="top", wrap=True)
        pdf.savefig(fig)
        plt.close(fig)

    # Reuse existing full-game chart pack when pilot data is available
    try:
        from generate_fo10_report_charts import (
            load_all_actions,
            plot_all_indicators,
            plot_single_indicator,
            simulate,
            INDICATORS,
        )

        actions = load_all_actions()
        post, markers = simulate(actions, max_move=2)
        overview = out_dir / "simulation_overview"
        plot_all_indicators(
            "Full-game cumulative macro trends",
            "Existing FO chart generator",
            post,
            markers,
            2,
            overview,
        )
        for ind in INDICATORS:
            plot_single_indicator(
                ind, post, markers, 2, out_dir / f"simulation_{ind}"
            )
    except Exception as err:
        (out_dir / "simulation_chart_error.txt").write_text(str(err), encoding="utf-8")

    return {"markdown": md_path, "pdf": pdf_path}


def main() -> int:
    adj_dir = ROOT / "adjudications"
    records = []
    for path in sorted(adj_dir.glob("*.json")):
        if path.name.startswith("_"):
            continue
        records.append(json.loads(path.read_text(encoding="utf-8")))
    paths = write_simulation_report(records)
    print(f"Wrote {paths['markdown']} ({len(records)} actions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
