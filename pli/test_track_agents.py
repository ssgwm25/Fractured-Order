"""Unit tests for multi-track agent prompt / extract helpers (no live Cursor)."""
from __future__ import annotations

import adjudicate
import track_prompts


def test_track_prompts_build():
    action = {
        "id": "a1",
        "team": "blue",
        "move": 1,
        "goal": "Expand secondary sanctions",
        "mechanism": "Economic",
        "ally_contingencies": "UI Levers: L3",
    }
    assert "NI CODEBOOK" in track_prompts.build_ni_prompt(action, "reframing", glasl_stage=4)
    assert "GLASL CODEBOOK" in track_prompts.build_glasl_prompt(
        action, "reframing", stage_before=4
    )
    assert "DIPLOMACY CODEBOOK" in track_prompts.build_diplomacy_prompt(action, "reframing")
    assert "INFORMATION BRIEF" in track_prompts.build_info_prompt(action, "reframing")


def test_extract_ni_worksheet():
    payload = {
        "needs_human": False,
        "orientation": "reframing",
        "domain_deltas": {
            "NI-1": {"delta": 0, "rationale": "No homeland access change."},
            "NI-2": {"delta": 1, "rationale": "Supports tech leadership."},
            "NI-3": {"delta": 0, "rationale": "Deterrence posture unchanged."},
            "NI-4": {"delta": 0, "rationale": "Alliance cohesion neutral."},
            "NI-5": {"delta": 0, "rationale": "Values narrative unchanged."},
            "NI-6": {"delta": 0, "rationale": "Global commons unaffected."},
        },
        "threat_cross_check": None,
        "evidence_refs": ["NSS 2022"],
    }
    text = "```json\n" + __import__("json").dumps(payload) + "\n```"
    out = adjudicate.extract_json_worksheet(text, adjudicate.NI_SCHEMA)
    assert out["domain_deltas"]["NI-2"]["delta"] == 1


def test_extract_glasl_worksheet():
    payload = {
        "needs_human": False,
        "stage_before": 4,
        "delta": 0,
        "stage_after": 4,
        "rationale": "Secondary sanctions stay inside coalition pressure band.",
    }
    text = "```json\n" + __import__("json").dumps(payload) + "\n```"
    out = adjudicate.extract_json_worksheet(text, adjudicate.GLASL_SCHEMA)
    assert out["delta"] == 0


def test_rescore_markers_catch_missing_worksheets():
    import run_pli

    stub = {
        "action_id": "x",
        "status": "needs_human",
        "record": {
            "tracks": {
                "national_interest": {
                    "needs_human_reason": "Missing NI agent worksheet",
                },
                "glasl": {
                    "needs_human_reason": "Missing Glasl agent worksheet",
                },
            }
        },
    }
    assert run_pli._should_skip_existing_adjudication(stub) is False

    sme_flagged = {
        "action_id": "y",
        "status": "needs_human",
        "record": {
            "needs_human_reason": "SME wants dual-lane review",
            "tracks": {
                "national_interest": {"needs_human_reason": "SME wants dual-lane review"},
                "glasl": {"status": "pending"},
            },
        },
    }
    assert run_pli._should_skip_existing_adjudication(sme_flagged) is True
