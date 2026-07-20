"""PLI pilot: rerun the eleven FO 1.0 Blue actions through the pipeline.

Each worksheet in ``worksheets.json`` is the agent output for one Blue action
(classification + rule citation, precedent tier + statutory citations,
modifiers, Fit anchor). This script schema-validates every worksheet, runs
the deterministic engine, and compares the resulting Implementation and Fit
scores to the provisional rescoring table in the trial codebook, logging
every divergence to ``pilot_results.json``.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import jsonschema

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))

import engine  # noqa: E402

SCHEMA = json.loads((HERE.parent / "worksheet_schema.json").read_text(encoding="utf-8"))
PILOT = json.loads((HERE / "worksheets.json").read_text(encoding="utf-8"))
OUT = HERE.parent / "archive" / "validation-2026-07" / "pilot_results.json"


def main() -> int:
    results = []
    divergences = []

    for entry in PILOT["actions"]:
        worksheet = entry["worksheet"]
        jsonschema.validate(worksheet, SCHEMA)

        record = engine.adjudicate_from_worksheet(worksheet, entry["exec_year"])

        got_impl = record["implementation"]["score"] if record["implementation"] else None
        got_fit = record["fit"]["score"] if record["fit"] else None
        want_impl = entry["provisional"]["implementation"]
        want_fit = entry["provisional"]["fit"]

        impl_match = got_impl == want_impl
        fit_match = got_fit == want_fit
        if not (impl_match and fit_match):
            divergences.append(
                {
                    "action": entry["action_id"],
                    "implementation": {"pipeline": got_impl, "provisional": want_impl},
                    "fit": {"pipeline": got_fit, "provisional": want_fit},
                }
            )

        trend = record["trend"]
        verdicts = {
            name: data["verdict"] for name, data in trend["indicators"].items()
        }

        results.append(
            {
                "action_id": entry["action_id"],
                "title": entry["title"],
                "lever": worksheet["classification"]["lever"],
                "instrument": worksheet["classification"]["instrument"],
                "tier": worksheet["precedent"]["tier"],
                "implementation": {"pipeline": got_impl, "provisional": want_impl, "match": impl_match},
                "fit": {"pipeline": got_fit, "provisional": want_fit, "match": fit_match},
                "no_effect": bool(trend.get("no_effect")),
                "verdicts": verdicts,
                "flags": trend.get("flags", []),
                "record": record,
            }
        )

        status = "MATCH" if impl_match and fit_match else "DIVERGE"
        print(
            f"{entry['action_id']:6s} {worksheet['classification']['lever']:2s} "
            f"impl {str(got_impl):>4s}/{str(want_impl):<4s} fit {str(got_fit):>4s}/{str(want_fit):<4s} {status}"
        )

    OUT.write_text(
        json.dumps(
            {
                "codebook_version": engine.CODEBOOK["version"],
                "orientation": PILOT["orientation"],
                "n_actions": len(results),
                "n_divergences": len(divergences),
                "divergences": divergences,
                "results": results,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\n{len(results)} actions adjudicated, {len(divergences)} divergence(s) vs provisional table")
    print(f"Full trace written to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
