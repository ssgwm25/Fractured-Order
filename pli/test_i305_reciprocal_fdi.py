"""I3.05 Reciprocal FDI Package classification helpers and rescore markers."""
from __future__ import annotations

from adjudicate import _cross_check
from run_pli import RESCORE_REASON_MARKERS, _should_skip_existing_adjudication
from tracks.router import build_routing_record


def _base_worksheet(*, lever: str, instrument: str | None) -> dict:
    return {
        "classification": {
            "lever": lever,
            "instrument": instrument,
            "direction": "mixed",
            "rule_citation": "Tie-break rule 3: investment screening / capital-flow -> L3; I3.05 package",
        },
        "precedent": {
            "tier": 2,
            "citations": ["FIRRMA / CFIUS reciprocal investment frameworks"],
            "rationale": "Existing screening authorities support reciprocal FDI packages",
        },
        "modifiers": {},
        "fit": {
            "band": "5-6",
            "score": 5,
            "orientation": "reframing",
            "rationale": "Security-restricted reciprocal investment under Reframing",
        },
        "needs_human": False,
        "instrument_of_power": "Economic",
        "ne_facets": {"diplomacy": False, "information": False},
        "submission_month": "2026-01",
    }


def test_cross_check_accepts_l3_i305():
    _cross_check(_base_worksheet(lever="L3", instrument="I3.05"))


def test_ui_lever_reciprocal_fdi_maps_to_l3():
    action = {
        "mechanism": "Economic",
        "ally_contingencies": 'Levers: ["Reciprocal FDI Package"]',
    }
    rec = build_routing_record(action)
    assert rec["ui_levers"] == ["Reciprocal FDI Package"]
    assert rec["ui_lever_priors"] == ["L3"]


def test_rescore_marker_picks_up_reciprocal_fdi_needs_human():
    assert "Reciprocal FDI Package" in RESCORE_REASON_MARKERS
    row = {
        "status": "needs_human",
        "record": {
            "tracks": {
                "macro": {
                    "needs_human_reason": (
                        "Economic IoP and FDI/security-restriction language support L3, "
                        "but the operative act is underspecified: 'Reciprocal FDI Package' "
                        "could be inbound security screening (I3.01)."
                    )
                }
            }
        },
    }
    assert _should_skip_existing_adjudication(row) is False
