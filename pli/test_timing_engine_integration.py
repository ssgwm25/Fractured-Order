"""End-to-end: six-month cadence → engine adjudication."""
from __future__ import annotations

import pytest

from engine import WorksheetError, adjudicate_from_worksheet, month_to_quarter
from submission_timing import derive_submission_month


def test_six_month_cadence_feeds_engine_worksheet():
    peers = [
        {"id": "a0", "move": 1, "created_at": "2026-07-13T11:00:00Z"},
        {"id": "a1", "move": 1, "created_at": "2026-07-13T12:00:00Z"},
    ]
    timing = derive_submission_month(peers[1], peer_actions=peers)
    month = timing["submission_month"]
    assert timing["source"] == "six_month_cadence"
    assert month == "2027-07"
    assert month_to_quarter(month) == "2027Q3"

    worksheet = {
        "classification": {
            "lever": "L1",
            "instrument": "I1.01",
            "direction": "coercive",
            "rule_citation": "Boundary rule for trade coercion test",
        },
        "precedent": {
            "tier": 1,
            "citations": ["Section 301, Trade Act of 1974"],
            "rationale": "Standing tariff authority with clear statutory analog",
        },
        "modifiers": {
            "funding_available": True,
            "partners_committed": False,
            "timeline_mismatch": False,
            "multi_authority_coordination": False,
        },
        "fit": {
            "band": "9-10",
            "score": 9,
            "orientation": "pressure",
            "rationale": "Direct coercive trade pressure under declared Pressure",
        },
        "needs_human": False,
        "instrument_of_power": "Economic",
        "ne_facets": {"diplomacy": False, "information": False},
        "submission_month": "2099-01",  # intentional wrong agent value
    }
    record = adjudicate_from_worksheet(worksheet, submission_month=month)
    assert record["submission_month"] == month
    assert record["trend"]["submission_month"] == month
    assert record["trend"]["submission_quarter"] == month_to_quarter(month)


def test_orchestrator_month_rejects_out_of_horizon_when_not_clamped_first():
    with pytest.raises(WorksheetError):
        adjudicate_from_worksheet(
            {
                "classification": {
                    "lever": "L7",
                    "instrument": "I7.01",
                    "direction": "inducement",
                    "rule_citation": "Capacity industrial policy boundary",
                },
                "precedent": {
                    "tier": 2,
                    "citations": ["CHIPS Act"],
                    "rationale": "Recent industrial capacity authority",
                },
                "modifiers": {
                    "funding_available": True,
                    "partners_committed": False,
                    "timeline_mismatch": False,
                    "multi_authority_coordination": False,
                },
                "fit": {
                    "band": "7-8",
                    "score": 8,
                    "orientation": "reframing",
                    "rationale": "Capacity-building under declared Reframing",
                },
                "needs_human": False,
                "instrument_of_power": "Economic",
                "ne_facets": {"diplomacy": False, "information": False},
                "submission_month": "2035-01",
            }
        )
