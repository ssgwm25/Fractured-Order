"""Run FO 1.0 Green Cell actions through full multi-track PLI (offline).

Preserves Appendix B chronological order. Writes adjudications/G-*.json,
per-action reports, and a combined Desktop PDF.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from adjudicate_router import (  # noqa: E402
    SESSION_STATE_PATH,
    adjudicate_multitrack,
)
from reports.generate_action_report import write_action_report  # noqa: E402
from reports.generate_green_desktop_pdf import write_green_desktop_pdf  # noqa: E402
from reports.trace_narrative import move_rollups  # noqa: E402

CORPUS = HERE / "green_actions.json"
ADJ_DIR = ROOT / "adjudications"
OUT_ACTIONS = ROOT / "reports" / "out" / "green" / "actions"


def _ne_macro_stub(iop: str, month: str, orientation: str) -> dict:
    return {
        "needs_human": False,
        "needs_human_reason": None,
        "classification": {
            "lever": "NE",
            "instrument": None,
            "secondary_instrument": None,
            "direction": "mixed",
            "rule_citation": (
                f"Instrument of Power={iop}: non-economic filing; "
                "macro lever vector is NE (no indicator deltas)"
            ),
        },
        "precedent": {
            "tier": 4,
            "citations": [],
            "rationale": "Not applicable — non-economic action routed out of macro adjudication",
        },
        "modifiers": {
            "funding_available": False,
            "partners_committed": False,
            "timeline_mismatch": False,
            "multi_authority_coordination": False,
        },
        "fit": {
            "band": "5-6",
            "score": 5,
            "orientation": orientation,
            "rationale": "Not applicable — non-economic action; NI and Glasl tracks adjudicate separately",
        },
        "instrument_of_power": iop,
        "ne_facets": {
            "diplomacy": iop == "Diplomatic",
            "information": iop == "Informational",
        },
        "secondary_facet_citation": None,
        "submission_month": month,
    }


def _macro_worksheet(entry: dict) -> dict:
    iop = entry["instrument_of_power"]
    month = entry["submission_month"]
    orientation = entry["orientation"]
    if iop != "Economic":
        return _ne_macro_stub(iop, month, orientation)

    m = entry["macro"]
    return {
        "needs_human": False,
        "needs_human_reason": None,
        "classification": {
            "lever": m["lever"],
            "instrument": m["instrument"],
            "secondary_instrument": m.get("secondary_instrument"),
            "direction": m["direction"],
            "rule_citation": m["rule_citation"],
        },
        "precedent": {
            "tier": m["precedent_tier"],
            "citations": m["citations"],
            "rationale": m["precedent_rationale"],
        },
        "modifiers": m["modifiers"],
        "modifier_rationales": m.get("modifier_rationales") or {},
        "fit": {
            "band": m["fit_band"],
            "score": m["fit_score"],
            "orientation": orientation,
            "rationale": m["fit_rationale"],
        },
        "instrument_of_power": "Economic",
        "ne_facets": {"diplomacy": False, "information": False},
        "secondary_facet_citation": (
            "Action packages bilateral/multilateral diplomatic delivery with an economic instrument"
            if entry.get("secondary_diplomacy")
            else None
        ),
        "submission_month": month,
    }


def _ni_worksheet(entry: dict) -> dict:
    deltas = {
        f"NI-{i}": {"delta": 0, "rationale": "No material domain move on this filing."}
        for i in range(1, 7)
    }
    for domain, delta in (entry.get("ni_focus") or {}).items():
        deltas[domain] = {
            "delta": int(delta),
            "rationale": (
                f"{entry['actor']} action advances {domain} via "
                f"{entry['title'][:60]}."
            ),
        }
    threat = None
    for domain, delta in (entry.get("ni_neg") or {}).items():
        deltas[domain] = {
            "delta": int(delta),
            "rationale": (
                f"Secondary cost on {domain} from public pressure / "
                f"dependency-cut politics around {entry['title'][:40]}."
            ),
        }
        threat = {
            "capability": "Adversary can amplify partner-cost narratives and market stress.",
            "will": "Demonstrated willingness to contest Green alignment choices.",
            "vulnerability": "Domestic and allied audiences remain sensitive to escalation costs.",
        }
    return {
        "orientation": entry["orientation"],
        "needs_human": False,
        "domain_deltas": deltas,
        "threat_cross_check": threat,
        "evidence_refs": [
            "FO1.0_Appendix_B_Green_Cell_Action_Table",
            "Green_Cell_Diplomatic_Hierarchy_Assessment_Moves_1_2",
        ],
    }


def _glasl_worksheet(entry: dict, stage_before: int) -> dict:
    delta = int(entry.get("glasl_delta") or 0)
    after = max(1, min(9, stage_before + delta))
    if delta > 0:
        rationale = (
            f"Pressure-band / coercive content raises public prestige contest "
            f"({entry['actor']}: {entry['title']})."
        )
    elif delta < 0:
        rationale = (
            f"De-escalatory outreach lowers conflict intensity "
            f"({entry['actor']}: {entry['title']})."
        )
    else:
        rationale = (
            f"Positioning / relationship-building remains inside coalition and "
            f"reputation competition without stage jump ({entry['actor']})."
        )
    return {
        "stage_before": stage_before,
        "delta": delta,
        "stage_after": after,
        "rationale": rationale,
        "needs_human": False,
    }


def _reset_green_outputs() -> None:
    ADJ_DIR.mkdir(parents=True, exist_ok=True)
    for path in ADJ_DIR.glob("G-*.json"):
        path.unlink()
    if SESSION_STATE_PATH.exists():
        SESSION_STATE_PATH.unlink()
    if OUT_ACTIONS.exists():
        shutil.rmtree(OUT_ACTIONS)
    OUT_ACTIONS.mkdir(parents=True, exist_ok=True)


def run() -> int:
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    actions = corpus["actions"]
    # Hard guarantee: Appendix B chronological order (move, seq)
    actions = sorted(actions, key=lambda a: (a["move"], a["seq"]))

    _reset_green_outputs()

    records: list[dict] = []
    stage = 4
    for entry in actions:
        iop = entry["instrument_of_power"]
        action = {
            "id": entry["action_id"],
            "action_id": entry["action_id"],
            "mechanism": iop,
            "goal": f"{entry['actor']}: {entry['title']}",
            "team": "green",
            "move": entry["move"],
            "sector": entry["actor"],
            "ally_contingencies": (
                f"Actor={entry['actor']}; Orientation={entry['orientation']}; "
                f"AppendixB_seq=M{entry['move']}-{entry['seq']}"
            ),
        }
        kwargs: dict = {
            "macro_worksheet": _macro_worksheet(entry),
            "ni_worksheet": _ni_worksheet(entry),
            "glasl_worksheet": _glasl_worksheet(entry, stage),
            "exec_year": 2027 if entry["move"] == 1 else 2029,
            "orientation": entry["orientation"],
            "persist": True,
            "pilot_synthetic": True,
            "secondary_diplomacy": bool(entry.get("secondary_diplomacy")),
        }
        if iop == "Diplomatic" or entry.get("secondary_diplomacy"):
            kwargs["diplomacy_worksheet"] = {
                **entry["diplomacy"],
                "needs_human": False,
            }
        if iop == "Informational":
            kwargs["info_brief"] = {
                **entry["info"],
                "needs_human": False,
            }
            if entry.get("secondary_diplomacy") and "diplomacy" in entry:
                kwargs["diplomacy_worksheet"] = {
                    **entry["diplomacy"],
                    "needs_human": False,
                }
                kwargs["secondary_diplomacy"] = True

        record = adjudicate_multitrack(action, **kwargs)
        gl = record["tracks"]["glasl"]
        if gl.get("status") == "pending":
            stage = gl["stage_after"]
        records.append(record)

        write_action_report(record, out_dir=OUT_ACTIONS)
        routing = record["tracks"]["routing"]["tracks"]
        print(
            f"{entry['action_id']}  M{entry['move']}-{entry['seq']:02d}  "
            f"{entry['actor']:<6}  IOP={iop:<13}  "
            f"macro={routing['macro']} dipl={routing['diplomacy']} "
            f"info={routing['information']}  "
            f"glasl={gl.get('stage_before')}->{gl.get('stage_after')}"
        )

    rollup_md = move_rollups(records)
    rollup_path = ROOT / "reports" / "out" / "green" / "green_rollup.md"
    rollup_path.parent.mkdir(parents=True, exist_ok=True)
    rollup_path.write_text(rollup_md, encoding="utf-8")

    desktop_pdf = write_green_desktop_pdf(records, corpus_meta=corpus)
    print(f"\nAdjudicated {len(records)} Green actions in chronological order")
    print(f"Desktop PDF: {desktop_pdf}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
