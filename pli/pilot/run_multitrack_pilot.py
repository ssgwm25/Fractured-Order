"""Replay FO 1.0 Blue pilot through multi-track adjudication (offline, no agent)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from adjudicate_router import (  # noqa: E402
    adjudicate_multitrack,
    instrument_from_pilot_entry,
)
from reports.regenerate_all import main as regenerate_reports  # noqa: E402

WORKSHEETS = HERE / "worksheets.json"


def _ni_for_action(entry: dict, orientation: str) -> dict:
    """Deterministic placeholder NI vector for offline pilot (SME replaces later)."""
    lever = entry["worksheet"]["classification"]["lever"]
    deltas = {f"NI-{i}": {"delta": 0, "rationale": "Pilot placeholder — no domain move."} for i in range(1, 7)}
    if lever == "NE":
        deltas["NI-3"] = {
            "delta": -1,
            "rationale": "Informational/diplomatic wedge risk to partner cohesion.",
        }
        threat = {
            "capability": "Adversary narrative apparatus can amplify leaks.",
            "will": "Demonstrated willingness to contest information space.",
            "vulnerability": "Alliance audiences sensitive to covert methods.",
        }
    else:
        deltas["NI-2"] = {
            "delta": 1,
            "rationale": "Economic statecraft package supports tech/industrial posture.",
        }
        threat = None
    return {
        "orientation": orientation,
        "needs_human": False,
        "domain_deltas": deltas,
        "threat_cross_check": threat,
        "evidence_refs": ["FO1.0_pilot"],
    }


def _glasl_for_action(entry: dict, stage_before: int) -> dict:
    lever = entry["worksheet"]["classification"]["lever"]
    delta = 1 if lever == "NE" else 0
    return {
        "stage_before": stage_before,
        "delta": delta,
        "stage_after": max(1, min(9, stage_before + delta)),
        "rationale": (
            "NE informational pressure raises public prestige contest."
            if delta
            else "Economic package remains within coalition/reputation competition."
        ),
        "needs_human": False,
    }


def _info_for_ne(entry: dict) -> dict:
    return {
        "needs_human": False,
        "summary": f"Pilot information brief for {entry['title']}: influence/wedge dynamics.",
        "audiences": "Allied elites, domestic sector stakeholders, adversary propaganda organs.",
        "narratives": "Blue frames as competitive statecraft; Red frames as interference.",
        "second_order_effects": "Possible ally hedging if methods appear covert or extralegal.",
        "sme_questions": "Should White Cell attribute publicly? Which Green audiences matter?",
        "suggested_sme_edits": "Replace pilot placeholder with Verba/HARE-informed language.",
    }


def _dipl_for_diplomatic(entry: dict) -> dict:
    return {
        "top_layer": "D/I",
        "category": "Signaling / Strategic Communication",
        "band": "Pressure",
        "policy_style": "Agenda-Shaping / Norm-Setting",
        "rationale": f"Pilot index for {entry['title']} as pressure-band signaling.",
        "needs_human": False,
    }


def run() -> int:
    pilot = json.loads(WORKSHEETS.read_text(encoding="utf-8"))
    orientation = pilot.get("orientation", "reframing")
    stage = 4
    count = 0
    for entry in pilot["actions"]:
        iop = instrument_from_pilot_entry(entry)
        # Infer move from action_id M1- / M2-
        move = 1 if entry["action_id"].startswith("M1") else 2
        action = {
            "id": entry["action_id"],
            "action_id": entry["action_id"],
            "mechanism": iop,
            "goal": entry.get("title"),
            "team": "blue",
            "move": move,
            "ally_contingencies": "",
        }
        kwargs = {
            "macro_worksheet": entry["worksheet"] if iop == "Economic" else {
                **entry["worksheet"],
                "classification": {
                    **entry["worksheet"]["classification"],
                    "lever": "NE",
                    "instrument": None,
                },
            },
            "ni_worksheet": _ni_for_action(entry, orientation),
            "glasl_worksheet": _glasl_for_action(entry, stage),
            "exec_year": entry.get("exec_year", 2026),
            "orientation": orientation,
            "persist": True,
            "pilot_synthetic": True,
        }
        if iop == "Informational":
            kwargs["info_brief"] = _info_for_ne(entry)
        if iop == "Diplomatic":
            kwargs["diplomacy_worksheet"] = _dipl_for_diplomatic(entry)

        record = adjudicate_multitrack(action, **kwargs)
        gl = record["tracks"]["glasl"]
        if gl.get("status") == "pending":
            stage = gl["stage_after"]
        count += 1
        print(
            f"{entry['action_id']}: IOP={iop} "
            f"macro={record['tracks']['routing']['tracks']['macro']} "
            f"info={record['tracks']['routing']['tracks']['information']} "
            f"dipl={record['tracks']['routing']['tracks']['diplomacy']} "
            f"glasl={gl.get('stage_before')}→{gl.get('stage_after')}"
        )

    print(f"Adjudicated {count} pilot actions")
    regenerate_reports()
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
