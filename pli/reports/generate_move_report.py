"""Per-move report: reuses generate_fo10_report_charts.simulate + chart pack."""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from reports.trace_narrative import move_rollups  # noqa: E402

OUT_DIR = HERE / "out" / "moves"


def load_records(adj_dir: Path, move: int | None = None) -> list[dict]:
    records = []
    for path in sorted(adj_dir.glob("*.json")):
        if path.name.startswith("_"):
            continue
        rec = json.loads(path.read_text(encoding="utf-8"))
        if move is not None and int((rec.get("action") or {}).get("move") or 0) != move:
            continue
        records.append(rec)
    return records


def write_move_report(
    records: list[dict],
    move: int,
    *,
    out_dir: Path | None = None,
    write_charts: bool = True,
) -> dict[str, Path]:
    out_dir = out_dir or OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    md = move_rollups(records)
    md += f"\n_Move filter: {move}_\n"
    md_path = out_dir / f"move_{move}.md"
    md_path.write_text(md, encoding="utf-8")

    pdf_path = out_dir / f"move_{move}.pdf"
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    with PdfPages(pdf_path) as pdf:
        fig = plt.figure(figsize=(8.5, 11))
        fig.patch.set_facecolor("white")
        fig.text(
            0.08,
            0.92,
            f"PLI Per-Move Report — Move {move}",
            fontsize=16,
            fontweight="bold",
            color="#115740",
        )
        fig.text(0.08, 0.86, md[:3500], fontsize=8, va="top", family="monospace")
        pdf.savefig(fig)
        plt.close(fig)

    chart_note = out_dir / f"move_{move}_charts_note.txt"
    if write_charts:
        chart_note.write_text(
            "Cumulative macro charts: call generate_fo10_report_charts.simulate("
            f"actions, max_move={move}) and plot_all_indicators / plot_single_indicator "
            "from the existing FO chart module (unchanged visual language).\n",
            encoding="utf-8",
        )
        # Best-effort: if pilot worksheets exist, render move-sliced overview
        try:
            from generate_fo10_report_charts import (
                load_all_actions,
                plot_all_indicators,
                simulate,
            )

            actions = load_all_actions()
            post, markers = simulate(actions, max_move=move)
            chart_path = out_dir / f"move_{move}_overview"
            plot_all_indicators(
                f"Move {move} cumulative macro trends",
                "Generated via existing FO chart module",
                post,
                markers,
                move,
                chart_path,
            )
        except Exception as err:
            chart_note.write_text(chart_note.read_text(encoding="utf-8") + f"\nChart error: {err}\n", encoding="utf-8")

    return {"markdown": md_path, "pdf": pdf_path}


def main() -> int:
    move = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    adj_dir = ROOT / "adjudications"
    records = load_records(adj_dir, move=move)
    paths = write_move_report(records, move)
    print(f"Wrote {paths['markdown']} ({len(records)} actions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
