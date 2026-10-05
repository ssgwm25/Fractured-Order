"""Unit tests for multi-track agent prompt / extract helpers (no live Cursor)."""
from __future__ import annotations

import json

import adjudicate
import track_prompts
from tracks.router import build_routing_record


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


def test_green_proposal_prompts_preserve_canonical_action_input_and_routing():
    details = (
        "Proposal Details\n"
        "Objective: Coordinate the shared logistics corridor.\n"
        "Proposed Activity: \n"
        'Revision Metadata: {"revisionNumber":1}'
    )
    action = {
        "id": "green-proposal-1",
        "team": "green",
        "move": 1,
        "goal": "Green corridor proposal",
        "mechanism": "Proposal",
        "artifact_type": "proposal",
        "expected_outcomes": "Preserve joint access.",
        "ally_contingencies": details,
    }
    original = dict(action)
    prompts = [
        adjudicate.build_prompt(action, "reframing", submission_month="2026-10"),
        track_prompts.build_ni_prompt(action, "reframing", glasl_stage=4),
        track_prompts.build_glasl_prompt(action, "reframing", stage_before=4),
        track_prompts.build_diplomacy_prompt(action, "reframing"),
        track_prompts.build_info_prompt(action, "reframing"),
    ]

    for prompt in prompts:
        assert f'"title": {json.dumps(action["goal"])}' in prompt
        assert f'"expected_outcomes": {json.dumps(action["expected_outcomes"])}' in prompt
        assert f'"details": {json.dumps(details)}' in prompt

    routing = build_routing_record(action)
    assert routing["tracks"]["diplomacy"] is True
    assert routing["tracks"]["information"] is True
    assert routing["tracks"]["macro"] is False
    assert action == original


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


def test_missing_so_stub_only_rescores_when_so_available():
    import run_pli

    so_stub = {
        "action_id": "z",
        "status": "needs_human",
        "record": {
            "needs_human_reason": (
                "No declared Strategic Orientation on record for team 'blue' "
                "- Fit cannot be scored (trial codebook, Layer 3b)."
            ),
        },
    }
    assert run_pli._is_missing_so_only_stub(so_stub) is True
    assert run_pli._should_skip_existing_adjudication(so_stub) is True
    assert (
        run_pli._should_skip_existing_adjudication(
            so_stub, orientation_now_available=False
        )
        is True
    )
    assert (
        run_pli._should_skip_existing_adjudication(
            so_stub, orientation_now_available=True
        )
        is False
    )


def test_resolve_declared_orientation_uses_blue_so_for_green_proposals():
    import run_pli

    calls: list[tuple[str, str]] = []

    class FakeDb:
        def select(self, table, params):
            calls.append((params.get("team"), params.get("mechanism")))
            if params.get("team") == "eq.blue":
                return [
                    {
                        "ally_contingencies": "Orientation: reframe\n",
                        "artifact_payload": None,
                    }
                ]
            return []

    green = {
        "id": "g1",
        "session_id": "sess-1",
        "team": "green",
        "mechanism": "Proposal",
        "artifact_type": "proposal",
    }
    orientation = run_pli.resolve_declared_orientation(FakeDb(), green)
    assert orientation == "reframing"
    assert any(team == "eq.blue" for team, _ in calls)
    assert run_pli.missing_orientation_reason(green).startswith(
        "Blue SO required for Green proposal NI"
    )

    blue = {
        "id": "b1",
        "session_id": "sess-1",
        "team": "blue",
        "mechanism": "Economic",
    }
    assert run_pli.missing_orientation_reason(blue).startswith(
        "No declared Strategic Orientation on record for team 'blue'"
    )
