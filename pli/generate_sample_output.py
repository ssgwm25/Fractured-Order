"""Generate a standalone PLI sample adjudication report for one FO 1.0 action.

Runs the deterministic engine only (no Supabase, no Cursor API). Uses the
pilot worksheet for the chosen action and writes an HTML report whose trend
charts are produced by the canonical ``pli_charts`` generator (same visual
language as the FO report pack and intended White Cell exports).
"""
from __future__ import annotations

import html
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import engine  # noqa: E402
from pli_charts import (  # noqa: E402
    BASELINE_COLOR as NAVY,
    FAV_COLOR as GREEN,
    POST_COLOR as GOLD,
    UNFAV_COLOR as RED,
    adjudication_charts_base64,
)

WORKSHEETS = HERE / "pilot" / "worksheets.json"
DEFAULT_ACTION = "M1-A7"


def load_action(action_id: str) -> dict:
    pilot = json.loads(WORKSHEETS.read_text(encoding="utf-8"))
    for entry in pilot["actions"]:
        if entry["action_id"] == action_id:
            return entry
    raise KeyError(f"Action {action_id!r} not found in {WORKSHEETS}")


def trace_block(title: str, lines: list[str]) -> str:
    body = "".join(f"<p>{line}</p>" for line in lines if line)
    return f'<div class="trace"><h3>{html.escape(title)}</h3>{body}</div>'


def build_html(entry: dict, record: dict) -> str:
    worksheet = entry["worksheet"]
    classification = worksheet["classification"]
    precedent = worksheet["precedent"]
    impl = record["implementation"]
    fit = record["fit"]
    trend = record["trend"]
    action_title = entry.get("title") or entry["action_id"]

    modifiers = ", ".join(
        f"{name.replace('_', ' ')} ({value:+d})"
        for name, value in (impl or {}).get("modifiers_applied", {}).items()
    ) or "none"

    trace_html = [
        trace_block("Classification", [
            f"Lever: <strong>{classification['lever']}</strong>"
            + (f" | Instrument: <strong>{classification['instrument']}</strong>" if classification.get("instrument") else ""),
            f"Direction: {html.escape(classification['direction'])}",
            f"Rule cited: <em>{html.escape(classification['rule_citation'])}</em>",
        ]),
        trace_block("Precedent worksheet", [
            f"Tier {precedent['tier']} — {html.escape(impl['tier_label'] if impl else '')}",
            html.escape(precedent.get("rationale", "")),
            "Citations:<ul>"
            + "".join(f"<li>{html.escape(c)}</li>" for c in precedent.get("citations", []))
            + "</ul>" if precedent.get("citations") else "No citations recorded.",
        ]),
        trace_block(f"Implementation score: {impl['score']}/10" if impl else "Implementation", [
            f"Tier midpoint {impl['midpoint']} | Modifiers: {html.escape(modifiers)} | Raw {impl['raw']} -> floor, band-edge cap",
            f"Band {trend.get('implementation_band', '')}: controls magnitude class + onset delay",
        ] if impl else ["Non-economic — no Implementation score."]),
        trace_block(f"Fit score: {fit['score']}/10" if fit else "Fit", [
            f"Declared orientation: <strong>{html.escape(fit['orientation'] if fit else entry.get('orientation', 'reframing'))}</strong>",
            f"Anchor band {html.escape(fit['band'] if fit else '')}",
            f"<em>{html.escape(worksheet['fit']['rationale'])}</em>" if worksheet.get("fit") else "",
        ] if fit else ["Non-economic — no Fit score."]),
    ]

    if trend.get("no_effect"):
        charts_html = (
            f'<p class="note">No macroeconomic effect: '
            f'{html.escape(trend.get("no_effect_reason", ""))}. '
            f"All indicators stay on the baseline.</p>"
        )
    else:
        charts = adjudication_charts_base64(trend, action_title)
        charts_html = "".join(
            f'<div class="chart-card">'
            f'<img src="data:image/png;base64,{b64}" alt="{html.escape(label)}" '
            f'style="width:100%;height:auto;display:block;"/>'
            f"</div>"
            for label, b64 in charts
        )
        charts_html += (
            f'<p class="legend">'
            f'<span style="color:{NAVY};font-weight:600;">— baseline</span>&nbsp;&nbsp;'
            f'<span style="color:{GOLD};font-weight:600;">— post-action</span>&nbsp;&nbsp;'
            f'<span style="color:{GREEN};font-weight:600;">green = favorable</span>&nbsp;&nbsp;'
            f'<span style="color:{RED};font-weight:600;">red = unfavorable</span>'
            f'<br/><span style="color:#666;font-size:0.85em;">Charts rendered by pli_charts.py (canonical PLI generator).</span>'
            f"</p>"
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>PLI Sample Output — {html.escape(entry['title'])}</title>
  <style>
    body {{ font-family: Georgia, 'Times New Roman', serif; margin: 0; background: #f6f7f9; color: #1a1a1a; }}
    .wrap {{ max-width: 1100px; margin: 0 auto; padding: 32px 24px 48px; }}
    header {{ background: #115740; color: #fff; padding: 28px 24px; margin-bottom: 24px; }}
    header h1 {{ margin: 0 0 8px; font-size: 1.6rem; }}
    header p {{ margin: 0; opacity: 0.9; }}
    .meta {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }}
    .meta div {{ background: #fff; border: 1px solid #e4e6eb; border-radius: 8px; padding: 12px 14px; }}
    .meta strong {{ display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }}
    .trace-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 24px; }}
    .trace {{ background: #fff; border: 1px solid #e4e6eb; border-radius: 8px; padding: 14px; }}
    .trace h3 {{ margin: 0 0 8px; font-size: 0.95rem; color: #115740; }}
    .trace p {{ margin: 0 0 6px; font-size: 0.9rem; line-height: 1.45; }}
    .trace ul {{ margin: 6px 0 0 18px; padding: 0; font-size: 0.85rem; }}
    h2 {{ color: #115740; margin: 28px 0 12px; }}
    .charts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }}
    .chart-card {{ background: #fff; border: 1px solid #e4e6eb; border-radius: 8px; padding: 8px; }}
    .legend, .note {{ grid-column: 1 / -1; font-size: 0.9rem; color: #444; }}
    footer {{ margin-top: 32px; font-size: 0.85rem; color: #666; }}
  </style>
</head>
<body>
  <header>
    <div class="wrap" style="padding:0;">
      <h1>PLI Sample Adjudication Output</h1>
      <p>{html.escape(entry['title'])} | Fractured Order 1.0 Blue corpus | Engine-only demo (no live agent)</p>
    </div>
  </header>
  <div class="wrap">
    <div class="meta">
      <div><strong>Submission month</strong>{html.escape(record.get('submission_month') or entry.get('submission_month') or '—')}</div>
      <div><strong>Orientation</strong>{html.escape(pilot_orientation())}</div>
      <div><strong>Implementation</strong>{impl['score'] if impl else 'N/A'}</div>
      <div><strong>Fit</strong>{fit['score'] if fit else 'N/A'}</div>
      <div><strong>Codebook</strong>{html.escape(record['codebook_version'])}</div>
      <div><strong>Status</strong>Pending SME review (sample)</div>
    </div>

    <h2>Adjudication trace</h2>
    <div class="trace-grid">{''.join(trace_html)}</div>

    <h2>Macroeconomic trend charts</h2>
    <div class="charts">{charts_html}</div>

    <footer>
      Generated by pli/generate_sample_output.py via pli_charts.py — the canonical PLI chart generator
      (same visual language as the FO report pack: navy baseline, colored post-action, darker green/red divergence, on-line markers).
    </footer>
  </div>
</body>
</html>
"""


def pilot_orientation() -> str:
    return json.loads(WORKSHEETS.read_text(encoding="utf-8")).get("orientation", "reframing").title()


def main() -> int:
    action_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ACTION
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path.home() / "Desktop" / f"PLI_Sample_Output_{action_id}.html"

    entry = load_action(action_id)
    month = (
        entry.get("submission_month")
        or entry["worksheet"].get("submission_month")
        or engine.exec_year_to_default_month(entry["exec_year"])
    )
    record = engine.adjudicate_from_worksheet(entry["worksheet"], submission_month=month)
    out.write_text(build_html(entry, record), encoding="utf-8")

    impl = record["implementation"]["score"] if record["implementation"] else None
    fit = record["fit"]["score"] if record["fit"] else None
    print(f"Action:  {action_id} — {entry['title']}")
    print(f"Lever:   {entry['worksheet']['classification']['lever']} / {entry['worksheet']['classification'].get('instrument')}")
    print(f"Scores:  Implementation {impl} | Fit {fit}")
    print(f"Report:  {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
