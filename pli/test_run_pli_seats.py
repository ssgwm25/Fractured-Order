"""Seat-review helpers on the live PLI orchestrator (no agent / network)."""

from __future__ import annotations

from run_pli import SEAT_DIP_INFO, SEAT_MACRO, SEAT_NI_ESC, build_record, build_seat_reviews


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
