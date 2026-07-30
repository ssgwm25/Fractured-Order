"""I8.04 official gold/commodity price-intervention sales helpers."""
from __future__ import annotations

from adjudicate import _cross_check
from run_pli import RESCORE_REASON_MARKERS, _should_skip_existing_adjudication
from tracks.router import build_routing_record


def _base_worksheet(*, lever: str, instrument: str | None) -> dict:
    return {
        "classification": {
            "lever": lever,
            "instrument": instrument,
            "direction": "coercive",
            "rule_citation": "Tie-break rule 6: stockpiling/reserves -> L8; I8.04 gold price intervention",
        },
        "precedent": {
            "tier": 2,
            "citations": ["Historical official gold sales / reserve management analogs"],
            "rationale": "Official reserve sales authorities exist; price-fixing purpose is less routine",
        },
        "modifiers": {},
        "fit": {
            "band": "5-6",
            "score": 5,
            "orientation": "pressure",
            "rationale": "Official gold sell-off to move market prices under Pressure",
        },
        "needs_human": False,
        "instrument_of_power": "Economic",
        "ne_facets": {"diplomacy": False, "information": False},
        "submission_month": "2026-01",
    }


def test_cross_check_accepts_l8_i804():
    _cross_check(_base_worksheet(lever="L8", instrument="I8.04"))


def test_ui_lever_strategic_reserve_sales_maps_to_l8():
    action = {
        "mechanism": "Economic",
        "ally_contingencies": 'Levers: ["Strategic Reserve Sales"]',
    }
    rec = build_routing_record(action)
    assert rec["ui_levers"] == ["Strategic Reserve Sales"]
    assert rec["ui_lever_priors"] == ["L8"]


def test_rescore_marker_picks_up_gold_price_needs_human():
    assert "gold-price" in RESCORE_REASON_MARKERS
    assert "Magic" in RESCORE_REASON_MARKERS
    row = {
        "status": "needs_human",
        "record": {
            "tracks": {
                "macro": {
                    "needs_human_reason": (
                        "Hopelessly vague Economic filing: operative act is unspecified "
                        "gold-price 'fixing/manipulation' with empty Implementation/"
                        "Legislative fields, UI levers 'None selected', and details listing "
                        "bundled Instruments [Economic, Diplomacy, Magic]."
                    )
                }
            }
        },
    }
    assert _should_skip_existing_adjudication(row) is False
