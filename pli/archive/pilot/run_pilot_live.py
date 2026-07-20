"""PLI live pilot: eleven FO 1.0 Blue actions through the REAL agent path.

Unlike ``run_pilot.py`` (which replays pre-built worksheets through the
engine), this script exercises the production pipeline end to end:
``adjudicate.adjudicate_action`` sends each raw player submission to a Cursor
agent via the SDK, validates the returned worksheet against the JSON schema,
runs the deterministic engine, and compares the resulting scores to the
provisional rescoring table in the trial codebook.

Requires CURSOR_API_KEY in the environment. Writes
``pilot_results_live.json`` with the full trace, including every agent
attempt.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))

import adjudicate  # noqa: E402
import engine  # noqa: E402

OUT = HERE.parent.parent / "archive" / "validation-2026-07" / "pilot_results_live.json"
ORIENTATION = "reframing"  # Blue's declared FO 1.0 Strategic Orientation

# Raw player submissions from the FO 1.0 record (Lever_Classification_V1_Blue_Test).
ACTIONS = [
    {
        "id": "M1-A1", "team": "blue", "move": 1, "exec_year": 2026,
        "goal": "Wedges and Incentive",
        "mechanism": "Informational",
        "sector": "Telecommunications",
        "targets": ["PRC"],
        "expected_outcomes": "Covertly hack and leak Chinese intent on BRICS+; exploit through third parties to argue PRC tech is faulty and dangerous. Policy tool: Covert Action Program. Target: China / global opinion.",
        "provisional": {"implementation": None, "fit": None},
    },
    {
        "id": "M1-A2", "team": "blue", "move": 1, "exec_year": 2026,
        "goal": "No BRICS+ in America Act",
        "mechanism": "Economic",
        "sector": "Telecommunications",
        "targets": ["PRC"],
        "expected_outcomes": "Restrict BRICS+ technology from the US market if associated with the PRC. Legislative. Target: China.",
        "provisional": {"implementation": 5, "fit": 4},
    },
    {
        "id": "M1-A3", "team": "blue", "move": 1, "exec_year": 2026,
        "goal": "Minerals for All Act",
        "mechanism": "Economic",
        "sector": "Other",
        "targets": ["PRC"],
        "expected_outcomes": "Deregulate US mining and processing to increase domestic mineral production. Legislative. Target: United States.",
        "provisional": {"implementation": 7, "fit": 8},
    },
    {
        "id": "M1-A4", "team": "blue", "move": 1, "exec_year": 2026,
        "goal": "Trade Investigations",
        "mechanism": "Economic",
        "sector": "Other",
        "targets": ["PRC"],
        "expected_outcomes": "Use ICTS authorities to restrict BRICS+ tech; initiate Section 301 and Section 232 investigations on semiconductors. Target: China, third parties.",
        "provisional": {"implementation": 9, "fit": 6},
    },
    {
        "id": "M1-A5", "team": "blue", "move": 1, "exec_year": 2026,
        "goal": "IP Enforced Remuneration",
        "mechanism": "Economic",
        "sector": "Other",
        "targets": ["PRC"],
        "expected_outcomes": "Use eminent domain, Section 338, allied coordination, and a sovereign fund to compensate for 30 years of stolen IP; block direct Chinese investment in US and allied partners.",
        "provisional": {"implementation": 2, "fit": 3},
    },
    {
        "id": "M1-A6", "team": "blue", "move": 1, "exec_year": 2026,
        "goal": "Stockpiling (Critical Minerals & Medicines)",
        "mechanism": "Economic",
        "sector": "Other",
        "targets": ["PRC"],
        "expected_outcomes": "Authorities and appropriations for long-term stockpiles of critical minerals and medicines. Target: US resilience vs. China dependence.",
        "provisional": {"implementation": 8, "fit": 8},
    },
    {
        "id": "M1-A7", "team": "blue", "move": 1, "exec_year": 2026,
        "goal": "Probiotic Act of 2027",
        "mechanism": "Economic",
        "sector": "Biotechnology",
        "targets": ["ROK", "EU"],
        "expected_outcomes": "Legislation for domestic deregulation, funding for advanced biotech manufacturers, allied/partner sourcing with South Korea and Europe.",
        "provisional": {"implementation": 6, "fit": 8},
    },
    {
        "id": "M2-A1", "team": "blue", "move": 2, "exec_year": 2027,
        "goal": "EU Critical Minerals System (withdrawn)",
        "mechanism": "Economic",
        "sector": "Other",
        "targets": ["EU"],
        "expected_outcomes": "Unified European critical minerals framework - joint purchasing, shared stockpiles, mutual recognition of permits. (Withdrawn before adjudication.)",
        "provisional": {"implementation": 4, "fit": 7},
    },
    {
        "id": "M2-A2", "team": "blue", "move": 2, "exec_year": 2027,
        "goal": "Global Telecom Initiative",
        "mechanism": "Economic",
        "sector": "Telecommunications",
        "targets": ["3RD"],
        "expected_outcomes": "Use IP enforcement funds with EU and allied support to expand allied telecom/satellite services in Africa, Latin America, Central America, and South Pacific as counter to BRICS.",
        "provisional": {"implementation": 3, "fit": 9},
    },
    {
        "id": "M2-A3", "team": "blue", "move": 2, "exec_year": 2027,
        "goal": "Global Strategic Futures Initiative",
        "mechanism": "Economic",
        "sector": "Other",
        "targets": ["US"],
        "expected_outcomes": "Domestic incentives and regulatory synchronization for US leadership in quantum, biotech, leapfrog tech; weaken Great Firewall (rhetorical).",
        "provisional": {"implementation": 6, "fit": 8},
    },
    {
        "id": "M2-A4", "team": "blue", "move": 2, "exec_year": 2027,
        "goal": "Sanctions & Critical Mineral Thresholds",
        "mechanism": "Economic",
        "sector": "Other",
        "targets": ["PRC", "3RD"],
        "expected_outcomes": "Severe sanctions on Chinese energy, financial markets, and trade; equivalent sanctions on third parties crossing 10% critical mineral import/export threshold with China.",
        "provisional": {"implementation": 6, "fit": 4},
    },
]


def main() -> int:
    if not os.environ.get("CURSOR_API_KEY"):
        print("CURSOR_API_KEY is not set", file=sys.stderr)
        return 1

    results = []
    divergences = []

    for action in ACTIONS:
        started = time.time()
        print(f"[{action['id']}] sending to agent...", flush=True)

        agent_result = adjudicate.adjudicate_action(action, ORIENTATION)
        elapsed = round(time.time() - started, 1)

        entry = {
            "action_id": action["id"],
            "title": action["goal"],
            "elapsed_seconds": elapsed,
            "agent": {"model": agent_result["model"], "attempts": agent_result["attempts"]},
            "needs_human": agent_result["needs_human"],
            "needs_human_reason": agent_result.get("needs_human_reason"),
            "worksheet": agent_result["worksheet"],
            "provisional": action["provisional"],
        }

        if agent_result["worksheet"] is None:
            print(f"[{action['id']}] FAILED validation after retries ({elapsed}s)", flush=True)
            entry["status"] = "needs_human"
            results.append(entry)
            divergences.append({"action": action["id"], "reason": "no valid worksheet"})
            continue

        try:
            record = engine.adjudicate_from_worksheet(agent_result["worksheet"], action["exec_year"])
        except engine.WorksheetError as err:
            print(f"[{action['id']}] engine rejected worksheet: {err}", flush=True)
            entry["status"] = "needs_human"
            entry["engine_error"] = str(err)
            results.append(entry)
            divergences.append({"action": action["id"], "reason": f"engine: {err}"})
            continue

        got_impl = record["implementation"]["score"] if record["implementation"] else None
        got_fit = record["fit"]["score"] if record["fit"] else None
        want_impl = action["provisional"]["implementation"]
        want_fit = action["provisional"]["fit"]
        impl_match = got_impl == want_impl
        fit_match = got_fit == want_fit

        entry["status"] = "needs_human" if agent_result["needs_human"] else "pending"
        entry["adjudication"] = record
        entry["comparison"] = {
            "implementation": {"pipeline": got_impl, "provisional": want_impl, "match": impl_match},
            "fit": {"pipeline": got_fit, "provisional": want_fit, "match": fit_match},
        }
        results.append(entry)

        if not (impl_match and fit_match):
            divergences.append(
                {
                    "action": action["id"],
                    "implementation": {"pipeline": got_impl, "provisional": want_impl},
                    "fit": {"pipeline": got_fit, "provisional": want_fit},
                    "lever": agent_result["worksheet"]["classification"]["lever"],
                    "tier": agent_result["worksheet"]["precedent"]["tier"],
                }
            )

        cls = agent_result["worksheet"]["classification"]
        status = "MATCH" if impl_match and fit_match else "DIVERGE"
        print(
            f"[{action['id']}] {cls['lever']}/{cls.get('instrument') or '-'} "
            f"impl {got_impl}/{want_impl} fit {got_fit}/{want_fit} {status} ({elapsed}s)",
            flush=True,
        )

    OUT.write_text(
        json.dumps(
            {
                "codebook_version": engine.CODEBOOK["version"],
                "orientation": ORIENTATION,
                "mode": "live-agent (Cursor SDK)",
                "n_actions": len(results),
                "n_divergences": len(divergences),
                "divergences": divergences,
                "results": results,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\n{len(results)} actions, {len(divergences)} divergence(s). Trace: {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
