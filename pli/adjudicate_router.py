"""Multi-track adjudication orchestrator (offline-ready).

Routes on Plenum Instrument of Power, runs macro PLI when Economic,
always runs NI + Glasl, and conditionally runs Diplomacy / Information.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import engine
from tracks.diplomacy_engine import validate_diplomacy_worksheet
from tracks.glasl_engine import validate_glasl_worksheet
from tracks.info_brief import validate_info_brief
from tracks.ni_engine import validate_ni_worksheet
from tracks.router import (
    build_routing_record,
    normalize_instrument_of_power,
    save_adjudication,
)

HERE = Path(__file__).parent
ADJ_DIR = HERE / "adjudications"
SESSION_STATE_PATH = ADJ_DIR / "_session_state.json"


def session_state_path(session_id: str | None = None) -> Path:
    """Offline default file, or per-session file for live Plenum runs."""
    if session_id:
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in str(session_id))
        return ADJ_DIR / f"_session_state_{safe}.json"
    return SESSION_STATE_PATH


def load_session_state(session_id: str | None = None) -> dict[str, Any]:
    path = session_state_path(session_id)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    from tracks import DATA

    return {
        "glasl_stage": DATA["glasl"]["default_start_stage"],
        "actions": [],
        "session_id": session_id,
    }


def save_session_state(state: dict[str, Any], session_id: str | None = None) -> None:
    sid = session_id if session_id is not None else state.get("session_id")
    path = session_state_path(sid)
    path.parent.mkdir(parents=True, exist_ok=True)
    if sid and not state.get("session_id"):
        state = {**state, "session_id": sid}
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def adjudicate_multitrack(
    action: dict[str, Any],
    *,
    macro_worksheet: dict[str, Any] | None = None,
    ni_worksheet: dict[str, Any] | None = None,
    glasl_worksheet: dict[str, Any] | None = None,
    diplomacy_worksheet: dict[str, Any] | None = None,
    info_brief: dict[str, Any] | None = None,
    exec_year: int = 2026,
    orientation: str = "reframing",
    secondary_diplomacy: bool = False,
    secondary_information: bool = False,
    persist: bool = True,
    pilot_synthetic: bool = False,
    session_id: str | None = None,
    submission_month: str | None = None,
) -> dict[str, Any]:
    """Run deterministic track engines for one action.

    Agent worksheets may be supplied (from Cursor agents or pilot fixtures).
    Routing follows Instrument of Power as the default lane map; secondary
    diplomacy/information facets are opt-in when dual-lane evidence exists.
    Mislabeled or multi-tool filings should be flagged needs_human upstream.

    Offline Glasl stage defaults to ``adjudications/_session_state.json``.
    Live Plenum passes ``session_id`` so escalation state is scoped per session.
    """
    # Ensure mechanism is present for router
    if not action.get("mechanism") and action.get("instrument_of_power"):
        action = {**action, "mechanism": action["instrument_of_power"]}

    routing = build_routing_record(action)
    if secondary_diplomacy:
        routing["tracks"]["diplomacy"] = True
        routing["ne_facets"]["diplomacy"] = True
    if secondary_information:
        routing["tracks"]["information"] = True
        routing["ne_facets"]["information"] = True

    scoped_session = session_id or action.get("session_id")
    state = load_session_state(scoped_session)
    tracks_out: dict[str, Any] = {
        "routing": routing,
        "orientation": orientation,
        "macro": None,
        "national_interest": None,
        "glasl": None,
        "diplomacy": None,
        "information": None,
    }

    # --- Macro ---
    if routing["tracks"]["macro"]:
        if macro_worksheet is None:
            raise ValueError("Economic actions require macro_worksheet")
        # Conflict check: Economic IOP should not be classified NE without human
        lever = macro_worksheet.get("classification", {}).get("lever")
        if lever == "NE":
            macro_worksheet = {
                **macro_worksheet,
                "needs_human": True,
                "needs_human_reason": (
                    macro_worksheet.get("needs_human_reason")
                    or "Instrument of Power is Economic but agent classified NE"
                ),
            }
        if macro_worksheet.get("needs_human"):
            tracks_out["macro"] = {
                "status": "needs_human",
                "needs_human_reason": macro_worksheet.get("needs_human_reason"),
                "worksheet": macro_worksheet,
            }
        else:
            if submission_month:
                tracks_out["macro"] = {
                    "status": "pending",
                    **engine.adjudicate_from_worksheet(
                        macro_worksheet, submission_month=submission_month
                    ),
                }
            else:
                tracks_out["macro"] = {
                    "status": "pending",
                    **engine.adjudicate_from_worksheet(macro_worksheet, exec_year),
                }
    else:
        # Non-economic: still record NE early-return if a worksheet is provided
        if macro_worksheet and macro_worksheet.get("classification", {}).get("lever") == "NE":
            if submission_month:
                macro_engine = engine.adjudicate_from_worksheet(
                    macro_worksheet, submission_month=submission_month
                )
            else:
                macro_engine = engine.adjudicate_from_worksheet(macro_worksheet, exec_year)
            tracks_out["macro"] = {
                "status": "skipped_ne",
                **macro_engine,
            }
        else:
            # Synthetic NE no-effect record for report consistency
            tracks_out["macro"] = {
                "status": "skipped_ne",
                "classification": {
                    "lever": "NE",
                    "instrument": None,
                    "direction": "mixed",
                    "rule_citation": (
                        f"Instrument of Power={routing['instrument_of_power']}: "
                        "non-economic; no macro lever vector"
                    ),
                },
                "trend": {
                    "no_effect": True,
                    "reason": "non-economic action: no lever vector",
                },
            }

    # --- Glasl (always) ---
    if glasl_worksheet is None:
        glasl_worksheet = {
            "stage_before": state["glasl_stage"],
            "delta": 0,
            "stage_after": state["glasl_stage"],
            "rationale": "Placeholder neutral delta; replace with agent worksheet.",
            "needs_human": True,
            "needs_human_reason": "Missing Glasl agent worksheet",
        }
    else:
        glasl_worksheet = {
            **glasl_worksheet,
            "stage_before": glasl_worksheet.get("stage_before", state["glasl_stage"]),
        }
    glasl_record = validate_glasl_worksheet(
        glasl_worksheet, session_stage=state["glasl_stage"]
    )
    tracks_out["glasl"] = glasl_record

    # --- National Interest (always) ---
    if ni_worksheet is None:
        ni_worksheet = {
            "orientation": orientation,
            "domain_deltas": {
                d: {"delta": 0, "rationale": "Placeholder; replace with agent worksheet."}
                for d in [
                    "NI-1",
                    "NI-2",
                    "NI-3",
                    "NI-4",
                    "NI-5",
                    "NI-6",
                ]
            },
            "threat_cross_check": None,
            "needs_human": True,
            "needs_human_reason": "Missing NI agent worksheet",
        }
    ni_record = validate_ni_worksheet(
        ni_worksheet,
        glasl_stage_after=glasl_record.get("stage_after"),
    )
    tracks_out["national_interest"] = ni_record

    # --- Diplomacy (conditional) ---
    if routing["tracks"]["diplomacy"]:
        if diplomacy_worksheet is None:
            tracks_out["diplomacy"] = {
                "status": "needs_human",
                "needs_human_reason": "Missing Diplomacy agent worksheet",
            }
        else:
            tracks_out["diplomacy"] = validate_diplomacy_worksheet(diplomacy_worksheet)

    # --- Information (conditional) ---
    if routing["tracks"]["information"]:
        if info_brief is None:
            tracks_out["information"] = {
                "status": "needs_human",
                "needs_human_reason": "Missing Information brief",
            }
        else:
            tracks_out["information"] = validate_info_brief(info_brief)

    action_id = (
        action.get("id")
        or action.get("action_id")
        or action.get("client_id")
        or "unknown_action"
    )

    def _track_status(name: str) -> str | None:
        block = tracks_out.get(name)
        if block is None:
            return None
        return block.get("status")

    track_statuses = {
        name: _track_status(name)
        for name in ("macro", "national_interest", "glasl", "diplomacy", "information")
        if _track_status(name) is not None
    }
    if any(s == "needs_human" for s in track_statuses.values()):
        overall = "needs_human"
    elif all(s in ("pending", "skipped_ne", "approved") for s in track_statuses.values()):
        overall = "pending"
    else:
        overall = "pending"

    record = {
        "action_id": action_id,
        "action": {
            "goal": action.get("goal") or action.get("title"),
            "mechanism": action.get("mechanism"),
            "instrument_of_power": routing["instrument_of_power"],
            "team": action.get("team"),
            "move": action.get("move"),
            "sector": action.get("sector"),
            "targets": action.get("targets"),
            "expected_outcomes": action.get("expected_outcomes"),
        },
        "codebook_version": "adjudication-2026-07-17",
        "pilot_synthetic": bool(pilot_synthetic),
        "tracks": tracks_out,
        "track_statuses": track_statuses,
        "status": overall,
    }

    # Advance session Glasl stage when not needs_human
    if glasl_record.get("status") == "pending" and glasl_record.get("stage_after"):
        state["glasl_stage"] = glasl_record["stage_after"]
    if action_id not in state["actions"]:
        state["actions"].append(action_id)

    if persist:
        save_session_state(state, scoped_session)
        save_adjudication(record, ADJ_DIR / f"{action_id}.json")
    elif scoped_session:
        # Live path: keep Glasl stage advancing even when offline JSON is not written.
        save_session_state(state, scoped_session)

    return record


def instrument_from_pilot_entry(entry: dict[str, Any]) -> str:
    """Infer Instrument of Power for FO 1.0 pilot worksheets lacking DIME."""
    worksheet = entry.get("worksheet") or {}
    lever = worksheet.get("classification", {}).get("lever")
    if lever and lever != "NE":
        return "Economic"
    blob = json.dumps(entry).lower()
    # Prefer Informational for covert / IO / wedge cases (FO M1-A1)
    if any(k in blob for k in ("informational", "information", "covert", "wedge", "leak", "io ")):
        return "Informational"
    if "diplom" in blob:
        return "Diplomatic"
    if "military" in blob or "kinetic" in blob:
        return "Military"
    return "Informational"
