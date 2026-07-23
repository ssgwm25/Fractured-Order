"""Seat-review helpers on the live PLI orchestrator (no agent / network)."""

from __future__ import annotations

from run_pli import (
    SEAT_DIP_INFO,
    SEAT_MACRO,
    SEAT_NI_ESC,
    build_record,
    build_seat_reviews,
    is_pli_candidate,
)
from tracks.router import build_routing_record, is_green_proposal


def test_build_seat_reviews_skips_unrouted_dip():
    mt = {
        "status": "pending",
        "tracks": {
            "routing": {
                "tracks": {
                    "macro": True,
                    "diplomacy": False,
                    "information": False,
                    "national_interest": True,
                    "glasl": True,
                }
            },
            "macro": {"status": "pending"},
            "national_interest": {"status": "pending"},
            "glasl": {"status": "pending"},
        },
        "track_statuses": {
            "macro": "pending",
            "national_interest": "pending",
            "glasl": "pending",
            "diplomacy": "skipped_ne",
            "information": "skipped_ne",
        },
    }
    seats = build_seat_reviews(mt)
    assert seats[SEAT_MACRO]["status"] == "pending"
    assert seats[SEAT_DIP_INFO]["status"] == "skipped"
    assert seats[SEAT_NI_ESC]["status"] == "pending"


def test_missing_orientation_seats_are_routing_aware():
    economic = build_record(
        {
            "id": "a-econ",
            "session_id": "sess-1",
            "team": "blue",
            "move": 1,
            "mechanism": "Economic",
            "goal": "Tariff package",
            "created_at": "2026-01-01T00:00:00Z",
        },
        None,
        {"1": 2026},
        peer_actions=[],
    )
    assert economic["seat_reviews"][SEAT_MACRO]["status"] == "needs_human"
    assert economic["seat_reviews"][SEAT_DIP_INFO]["status"] == "skipped"
    assert economic["seat_reviews"][SEAT_NI_ESC]["status"] == "needs_human"

    diplomatic = build_record(
        {
            "id": "a-dip",
            "session_id": "sess-1",
            "team": "blue",
            "move": 1,
            "mechanism": "Diplomatic",
            "goal": "Summit demarche",
            "created_at": "2026-01-01T00:00:00Z",
        },
        None,
        {"1": 2026},
        peer_actions=[],
    )
    assert diplomatic["seat_reviews"][SEAT_MACRO]["status"] == "skipped"
    assert diplomatic["seat_reviews"][SEAT_DIP_INFO]["status"] == "needs_human"
    assert diplomatic["seat_reviews"][SEAT_NI_ESC]["status"] == "needs_human"


def test_green_proposal_is_pli_candidate_industry_is_not():
    green = {
        "id": "g1",
        "team": "green",
        "mechanism": "Proposal",
        "artifact_type": "proposal",
        "goal": "Green proposal for Blue",
    }
    industry = {
        "id": "i1",
        "team": "industry",
        "mechanism": "Proposal",
        "artifact_type": "proposal",
        "goal": "Industry proposal",
    }
    assert is_green_proposal(green) is True
    assert is_pli_candidate(green) is True
    assert is_pli_candidate(industry) is False


def test_green_proposal_routes_dip_info_macro_skipped():
    green = {
        "id": "g2",
        "team": "green",
        "mechanism": "Proposal",
        "artifact_type": "proposal",
        "goal": "Coordinate export posture",
        "ally_contingencies": "Proposal Details\nObjective: Align partners",
    }
    routing = build_routing_record(green)
    assert routing["instrument_of_power"] == "Diplomatic"
    assert routing["tracks"]["macro"] is False
    assert routing["tracks"]["diplomacy"] is True
    assert routing["tracks"]["information"] is True
    assert routing["artifact_kind"] == "green_proposal"

    stub = build_record(
        {
            **green,
            "session_id": "sess-1",
            "move": 1,
            "created_at": "2026-01-01T00:00:00Z",
        },
        None,
        {"1": 2026},
        peer_actions=[],
    )
    assert stub["seat_reviews"][SEAT_MACRO]["status"] == "skipped"
    assert stub["seat_reviews"][SEAT_DIP_INFO]["status"] == "needs_human"
    assert stub["seat_reviews"][SEAT_NI_ESC]["status"] == "needs_human"
