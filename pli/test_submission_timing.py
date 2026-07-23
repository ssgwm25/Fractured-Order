"""Unit tests for FO 2.0 six-month submission_month cadence."""
from __future__ import annotations

from submission_timing import (
    ACTION_SPACING_MONTHS,
    add_months,
    derive_submission_month,
    month_from_six_month_cadence,
    months_between_inclusive,
)


def test_months_between_and_add():
    assert months_between_inclusive("2027-01", "2030-12") == 48
    assert add_months("2027-01", 11) == "2027-12"
    assert add_months("2027-01", 12) == "2028-01"
    assert add_months("2027-01", 6) == "2027-07"


def test_six_month_cadence_grid():
    assert ACTION_SPACING_MONTHS == 6
    assert month_from_six_month_cadence(0) == "2027-01"
    assert month_from_six_month_cadence(1) == "2027-07"
    assert month_from_six_month_cadence(2) == "2028-01"
    assert month_from_six_month_cadence(3) == "2028-07"


def test_explicit_action_month_wins():
    out = derive_submission_month(
        {"id": "a1", "move": 1, "submission_month": "2028-06"},
        peer_actions=[
            {"id": "a0", "move": 1, "created_at": "2026-01-01T09:00:00Z"},
            {"id": "a1", "move": 1, "created_at": "2026-01-01T10:00:00Z"},
        ],
    )
    assert out["submission_month"] == "2028-06"
    assert out["source"] == "action.submission_month"


def test_session_actions_are_six_months_apart():
    peers = [
        {"id": "a1", "move": 1, "created_at": "2026-01-01T10:00:00Z"},
        {"id": "a2", "move": 1, "created_at": "2026-01-01T11:00:00Z"},
        {"id": "a3", "move": 2, "created_at": "2026-01-01T12:00:00Z"},
    ]
    months = [
        derive_submission_month(a, peer_actions=peers)["submission_month"]
        for a in peers
    ]
    assert months == ["2027-01", "2027-07", "2028-01"]
    sources = {
        derive_submission_month(a, peer_actions=peers)["source"] for a in peers
    }
    assert sources == {"six_month_cadence"}


def test_timer_kwargs_ignored():
    """Legacy timer / game_state kwargs must not change the cadence."""
    action = {"id": "a1", "move": 1, "created_at": "2026-01-01T10:00:00Z"}
    out = derive_submission_month(
        action,
        peer_actions=[action],
        game_state={
            "move": 1,
            "timer_seconds": 0,
            "timer_allocations": {"move_1": 5400},
        },
    )
    assert out["source"] == "six_month_cadence"
    assert out["submission_month"] == "2027-01"


def test_beyond_grid_still_clamps():
    out = derive_submission_month(
        {"id": "a1", "move": 3, "submission_month": "2035-06"},
    )
    assert out["submission_month_raw"] == "2035-06"
    assert out["submission_month"] == "2034-12"
    assert out["clamped_to_horizon"] is True


def test_long_sequence_clamps_past_horizon():
    # 2027-01 + 16*6m = 2035-01 → clamp to 2034-12
    peers = [
        {"id": f"a{i}", "move": 1, "created_at": f"2026-01-01T{i:02d}:00:00Z"}
        for i in range(17)
    ]
    out = derive_submission_month(peers[-1], peer_actions=peers)
    assert out["ordinal_index"] == 16
    assert out["submission_month_raw"] == "2035-01"
    assert out["submission_month"] == "2034-12"
    assert out["clamped_to_horizon"] is True
