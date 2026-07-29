"""L10 instrument validation and agent cross-check for multi-digit lever codes."""
from __future__ import annotations

import pytest

from adjudicate import _cross_check


def _base_worksheet(*, lever: str, instrument: str | None) -> dict:
    return {
        "classification": {
            "lever": lever,
            "instrument": instrument,
            "direction": "inducement",
            "rule_citation": "Tie-break rule 11: territory / basing -> L10",
        },
        "precedent": {
            "tier": 3,
            "citations": ["Historical purchase analogs"],
            "rationale": "Rare modern pathway",
        },
        "modifiers": {},
        "fit": {
            "band": "7-8",
            "score": 7,
            "orientation": "reframing",
            "rationale": "Strategic access under Reframing",
        },
        "needs_human": False,
        "instrument_of_power": "Economic",
        "ne_facets": {"diplomacy": False, "information": False},
        "submission_month": "2026-01",
    }


def test_cross_check_accepts_l10_i10():
    _cross_check(_base_worksheet(lever="L10", instrument="I10.01"))


def test_cross_check_rejects_l10_with_l1_instrument():
    with pytest.raises(ValueError, match="does not belong"):
        _cross_check(_base_worksheet(lever="L10", instrument="I1.01"))


def test_cross_check_rejects_l1_with_i10_instrument():
    ws = _base_worksheet(lever="L1", instrument="I10.01")
    ws["classification"]["rule_citation"] = "Should fail digit match"
    with pytest.raises(ValueError, match="does not belong"):
        _cross_check(ws)
