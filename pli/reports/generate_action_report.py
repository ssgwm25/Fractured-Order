"""Per-action report: editable markdown + PDF packaging around existing charts."""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from reports.trace_narrative import record_to_markdown  # noqa: E402

OUT_DIR = HERE / "out" / "actions"


def _pdf_from_markdown(md_text: str, out_pdf: Path, title: str, *, synthetic: bool = False) -> None:
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    sections = []
    current = []
    for line in md_text.splitlines():
        if line.startswith("## ") and current:
            sections.append("\n".join(current))
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append("\n".join(current))

    with PdfPages(out_pdf) as pdf:
        fig = plt.figure(figsize=(8.5, 11))
        fig.patch.set_facecolor("white")
        fig.text(0.08, 0.92, title, fontsize=16, fontweight="bold", color="#115740",
                 transform=fig.transFigure)
        if synthetic:
            fig.text(
                0.08,
                0.87,
                "SYNTHETIC OFFLINE PILOT — NOT SME-APPROVED",
                fontsize=11,
                fontweight="bold",
                color="#b04a4a",
                transform=fig.transFigure,
            )
            y0 = 0.82
        else:
            fig.text(
                0.08,
                0.87,
                "Auto-traced multi-track adjudication (SME-editable)",
                fontsize=10,
                color="#5a5f6e",
                transform=fig.transFigure,
            )
            y0 = 0.82
        cover = sections[0] if sections else md_text
        fig.text(0.08, y0, cover[:2800], fontsize=8.5, va="top", family="sans-serif",
                 transform=fig.transFigure, wrap=True)
        pdf.savefig(fig)
        plt.close(fig)

        for chunk in sections[1:]:
            fig = plt.figure(figsize=(8.5, 11))
            fig.patch.set_facecolor("white")
            lines = chunk.splitlines()
            fig.text(
                0.08,
                0.94,
                (lines[0] if lines else "")[:110],
                fontsize=12,
                fontweight="bold",
                color="#115740",
                transform=fig.transFigure,
            )
            body = "\n".join(lines[1:100])
            fig.text(
                0.08,
                0.88,
                body[:4500],
                fontsize=8.5,
                va="top",
                family="sans-serif",
                transform=fig.transFigure,
            )
            pdf.savefig(fig)
            plt.close(fig)


def write_action_report(record: dict, *, out_dir: Path | None = None) -> dict[str, Path]:
    out_dir = out_dir or OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    action_id = record.get("action_id", "unknown")
    md = record_to_markdown(record)
    md_path = out_dir / f"{action_id}.md"
    pdf_path = out_dir / f"{action_id}.pdf"
    md_path.write_text(md, encoding="utf-8")
    _pdf_from_markdown(
        md,
        pdf_path,
        f"PLI Action Report — {action_id}",
        synthetic=bool(record.get("pilot_synthetic")),
    )

    # Embed existing per-action charts when macro effect exists
    macro = (record.get("tracks") or {}).get("macro") or {}
    trend = macro.get("trend")
    if trend and not trend.get("no_effect"):
        try:
            from pli_charts import plot_adjudication_indicator
            import engine as eng

            years = eng.YEARS
            chart_dir = out_dir / f"{action_id}_charts"
            chart_dir.mkdir(exist_ok=True)
            title = (record.get("action") or {}).get("goal") or action_id
            for key, ind in (trend.get("indicators") or {}).items():
                plot_adjudication_indicator(
                    years,
                    ind,
                    action_title=title,
                    out_path=chart_dir / f"{key}.png",
                    ind_key=key,
                )
        except Exception as err:  # chart failure should not block narrative PDF
            (out_dir / f"{action_id}_chart_error.txt").write_text(str(err), encoding="utf-8")

    return {"markdown": md_path, "pdf": pdf_path}


def main() -> int:
    import json

    if len(sys.argv) < 2:
        print("Usage: python reports/generate_action_report.py <adjudications/ACTION.json>")
        return 2
    record = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    paths = write_action_report(record)
    print(f"Wrote {paths['markdown']}")
    print(f"Wrote {paths['pdf']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
