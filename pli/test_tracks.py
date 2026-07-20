"""Unit tests for multi-track routing and engines."""
from __future__ import annotations

import pytest

from tracks.diplomacy_engine import validate_diplomacy_worksheet
from tracks.glasl_engine import validate_glasl_worksheet
from tracks.info_brief import validate_info_brief
from tracks.ni_engine import validate_ni_worksheet
from tracks.router import build_routing_record, normalize_instrument_of_power, route_tracks
from tracks import TrackError
from adjudicate_router import adjudicate_multitrack


def test_normalize_instrument_of_power():
    assert normalize_instrument_of_power("Economic") == "Economic"
    assert normalize_instrument_of_power("diplomatic") == "Diplomatic"
    assert normalize_instrument_of_power("Informational") == "Informational"


def test_route_economic():
    tracks = route_tracks("Economic")
    assert tracks["macro"] is True
    assert tracks["diplomacy"] is False
    assert tracks["information"] is False
    assert tracks["national_interest"] is True
    assert tracks["glasl"] is True


def test_route_diplomatic():
    tracks = route_tracks("Diplomatic")
    assert tracks["macro"] is False
    assert tracks["diplomacy"] is True
    assert tracks["information"] is False


def test_route_informational():
    tracks = route_tracks("Informational")
    assert tracks["information"] is True
    assert tracks["diplomacy"] is False


def test_route_military():
    tracks = route_tracks("Military")
    assert tracks["macro"] is False
    assert tracks["diplomacy"] is False
    assert tracks["information"] is False
    assert tracks["national_interest"] is True


def test_build_routing_parses_ui_levers():
    action = {
        "mechanism": "Economic",
        "ally_contingencies": 'Levers: ["Export Controls", "Industrial Policy"]',
    }
    rec = build_routing_record(action)
    assert rec["ui_levers"] == ["Export Controls", "Industrial Policy"]
    assert "L2" in rec["ui_lever_priors"]
    assert "L7" in rec["ui_lever_priors"]


def test_ni_engine_happy_path():
    ws = {
        "orientation": "reframing",
        "needs_human": False,
        "domain_deltas": {
            f"NI-{i}": {"delta": 0, "rationale": "Neutral second-order effects noted."}
            for i in range(1, 7)
        },
        "threat_cross_check": None,
    }
    ws["domain_deltas"]["NI-2"] = {
        "delta": 1,
        "rationale": "Advances industrial capacity under reframing.",
    }
    out = validate_ni_worksheet(ws, glasl_stage_after=4)
    assert out["status"] == "pending"
    assert out["domain_deltas"]["NI-2"]["delta"] == 1
    assert out["cross_domain_alert"] is False


def test_ni_requires_threat_on_negative():
    ws = {
        "orientation": "pressure",
        "needs_human": False,
        "domain_deltas": {
            f"NI-{i}": {"delta": 0, "rationale": "Neutral second-order effects noted."}
            for i in range(1, 7)
        },
        "threat_cross_check": None,
    }
    ws["domain_deltas"]["NI-3"] = {
        "delta": -1,
        "rationale": "Partners hedge after unilateral pressure.",
    }
    with pytest.raises(TrackError):
        validate_ni_worksheet(ws)


def test_ni_vital_requires_justification():
    ws = {
        "orientation": "pressure",
        "needs_human": False,
        "domain_deltas": {
            f"NI-{i}": {"delta": 0, "rationale": "Neutral second-order effects noted."}
            for i in range(1, 7)
        },
        "threat_cross_check": None,
    }
    ws["domain_deltas"]["NI-1"] = {
        "delta": 2,
        "rationale": "Homeland stake elevated.",
    }
    with pytest.raises(TrackError):
        validate_ni_worksheet(ws)


def test_ni_cross_domain_alert():
    ws = {
        "orientation": "pressure",
        "needs_human": False,
        "domain_deltas": {
            f"NI-{i}": {"delta": 0, "rationale": "Neutral second-order effects noted."}
            for i in range(1, 7)
        },
        "threat_cross_check": {
            "capability": "PRC can retaliate in minerals.",
            "will": "Beijing has signaled willingness.",
            "vulnerability": "US firms exposed in supply chains.",
        },
    }
    ws["domain_deltas"]["NI-2"] = {
        "delta": 1,
        "rationale": "Tech leadership gains from controls.",
    }
    ws["domain_deltas"]["NI-3"] = {
        "delta": -1,
        "rationale": "Allies resist secondary sanctions.",
    }
    out = validate_ni_worksheet(ws, glasl_stage_after=6)
    assert out["cross_domain_alert"] is True


def test_glasl_transition():
    out = validate_glasl_worksheet(
        {
            "stage_before": 4,
            "delta": 1,
            "stage_after": 5,
            "rationale": "Public loss of face via prestige messaging attack.",
            "needs_human": False,
        },
        session_stage=4,
    )
    assert out["stage_after"] == 5
    assert out["status"] == "pending"


def test_glasl_rejects_large_jump_without_human():
    with pytest.raises(TrackError):
        validate_glasl_worksheet(
            {
                "stage_before": 4,
                "delta": 3,
                "rationale": "Jumping too far without SME flag.",
                "needs_human": False,
            }
        )


def test_diplomacy_index():
    out = validate_diplomacy_worksheet(
        {
            "top_layer": "D/E",
            "category": "Coalition-Building / Partner Alignment",
            "band": "Pressure",
            "policy_style": "Agenda-Shaping / Norm-Setting",
            "rationale": "Joint statement organizes partner pressure on PRC.",
            "needs_human": False,
        }
    )
    assert "Coalition-Building" in out["code_string"]
    assert out["status"] == "pending"


def test_diplomacy_rejects_band_mismatch():
    with pytest.raises(TrackError):
        validate_diplomacy_worksheet(
            {
                "top_layer": "D",
                "category": "Bilateral Diplomacy",
                "band": "Pressure",
                "policy_style": "Consultative / Exploratory",
                "rationale": "Category belongs to Positioning, not Pressure.",
                "needs_human": False,
            }
        )


def test_info_brief_no_scores():
    out = validate_info_brief(
        {
            "needs_human": False,
            "summary": "Covert leak aims to split elite consensus in target sector.",
            "audiences": "Domestic tech elites; allied regulators; PRC propaganda organs.",
            "narratives": "Blue frames as transparency; Red frames as lawfare.",
            "second_order_effects": "May accelerate BRICS+ narrative of US unreliability.",
            "sme_questions": "Is attribution credible? Which allied publics matter most?",
            "suggested_sme_edits": "Tighten audience list; drop speculative Global South claim.",
        }
    )
    assert out["status"] == "pending"


def test_info_brief_rejects_score_field():
    with pytest.raises(TrackError):
        validate_info_brief(
            {
                "needs_human": False,
                "summary": "x" * 20,
                "audiences": "x" * 20,
                "narratives": "x" * 20,
                "second_order_effects": "x" * 20,
                "sme_questions": "x" * 20,
                "suggested_sme_edits": "x" * 20,
                "score": 7,
            }
        )


def test_multitrack_economic_offline(tmp_path, monkeypatch):
    monkeypatch.setattr("adjudicate_router.ADJ_DIR", tmp_path)
    monkeypatch.setattr("adjudicate_router.SESSION_STATE_PATH", tmp_path / "_session_state.json")

    macro_ws = {
        "needs_human": False,
        "needs_human_reason": None,
        "classification": {
            "lever": "L7",
            "instrument": "I7.01",
            "direction": "inducement",
            "rule_citation": "Tie-break rule 8: domestic subsidy -> L7",
        },
        "precedent": {
            "tier": 2,
            "citations": ["CHIPS and Science Act of 2022"],
            "rationale": "Existing authority, limited prior use for this package.",
        },
        "modifiers": {
            "funding_available": False,
            "partners_committed": False,
            "timeline_mismatch": False,
            "multi_authority_coordination": False,
        },
        "fit": {
            "band": "7-8",
            "score": 8,
            "orientation": "reframing",
            "rationale": "Domestic capacity building advances reframing.",
        },
    }
    ni_ws = {
        "orientation": "reframing",
        "needs_human": False,
        "domain_deltas": {
            "NI-1": {"delta": 0, "rationale": "No homeland posture change."},
            "NI-2": {"delta": 1, "rationale": "Industrial capacity gain."},
            "NI-3": {"delta": 0, "rationale": "Partners not central to this package."},
            "NI-4": {"delta": 0, "rationale": "Indirect Indo-Pacific effects only."},
            "NI-5": {"delta": 0, "rationale": "Standards unchanged this move."},
            "NI-6": {"delta": 0, "rationale": "Domestic politics manageable."},
        },
        "threat_cross_check": None,
        "evidence_refs": ["NSS_2017"],
    }
    glasl_ws = {
        "stage_before": 4,
        "delta": 0,
        "stage_after": 4,
        "rationale": "Domestic inducement stays within coalition competition.",
        "needs_human": False,
    }
    action = {
        "id": "TEST-ECON-1",
        "mechanism": "Economic",
        "goal": "Domestic capacity package",
        "team": "blue",
        "move": 1,
        "ally_contingencies": 'Levers: ["Industrial Policy"]',
    }
    record = adjudicate_multitrack(
        action,
        macro_worksheet=macro_ws,
        ni_worksheet=ni_ws,
        glasl_worksheet=glasl_ws,
        persist=True,
    )
    assert record["tracks"]["routing"]["tracks"]["macro"] is True
    assert record["tracks"]["macro"]["implementation"]["score"] == 6
    assert record["tracks"]["diplomacy"] is None
    assert (tmp_path / "TEST-ECON-1.json").exists()


def test_multitrack_informational_routes_info(tmp_path, monkeypatch):
    monkeypatch.setattr("adjudicate_router.ADJ_DIR", tmp_path)
    monkeypatch.setattr("adjudicate_router.SESSION_STATE_PATH", tmp_path / "_session_state.json")

    info = {
        "needs_human": False,
        "summary": "Influence campaign targets elite cohesion abroad.",
        "audiences": "Allied policy elites and domestic tech media.",
        "narratives": "Blue transparency vs Red interference frame.",
        "second_order_effects": "Risk of blowback if attribution fails.",
        "sme_questions": "What is the attribution standard?",
        "suggested_sme_edits": "Name the primary allied audience.",
    }
    ni_ws = {
        "orientation": "pressure",
        "needs_human": False,
        "domain_deltas": {
            f"NI-{i}": {"delta": 0, "rationale": "Limited domain movement this action."}
            for i in range(1, 7)
        },
        "threat_cross_check": None,
    }
    glasl_ws = {
        "delta": 1,
        "stage_after": 5,
        "rationale": "Public prestige contest moves to loss-of-face dynamics.",
        "needs_human": False,
    }
    action = {
        "id": "TEST-INFO-1",
        "mechanism": "Informational",
        "goal": "Wedges and Incentive",
        "team": "blue",
        "move": 1,
    }
    record = adjudicate_multitrack(
        action,
        ni_worksheet=ni_ws,
        glasl_worksheet=glasl_ws,
        info_brief=info,
        persist=True,
    )
    assert record["tracks"]["routing"]["tracks"]["information"] is True
    assert record["tracks"]["routing"]["tracks"]["macro"] is False
    assert record["tracks"]["information"]["status"] == "pending"
    assert record["tracks"]["glasl"]["stage_after"] == 5


def _neutral_ni(orientation: str = "pressure") -> dict:
    return {
        "orientation": orientation,
        "needs_human": False,
        "domain_deltas": {
            f"NI-{i}": {"delta": 0, "rationale": "Limited domain movement this action."}
            for i in range(1, 7)
        },
        "threat_cross_check": None,
    }


def _glasl(delta: int = 0, before: int = 4) -> dict:
    after = max(1, min(9, before + delta))
    return {
        "stage_before": before,
        "delta": delta,
        "stage_after": after,
        "rationale": "Stage movement consistent with action character.",
        "needs_human": False,
    }


def test_multitrack_diplomatic_routes_diplomacy(tmp_path, monkeypatch):
    monkeypatch.setattr("adjudicate_router.ADJ_DIR", tmp_path)
    monkeypatch.setattr("adjudicate_router.SESSION_STATE_PATH", tmp_path / "_session_state.json")

    dipl = {
        "needs_human": False,
        "top_layer": "D/E",
        "category": "Coalition-Building / Partner Alignment",
        "band": "Pressure",
        "policy_style": "Agenda-Shaping / Norm-Setting",
        "rationale": "Alliance coordination is the main delivery mechanism.",
    }
    record = adjudicate_multitrack(
        {
            "id": "TEST-DIPL-1",
            "mechanism": "Diplomatic",
            "goal": "Partner alignment package",
            "team": "blue",
            "move": 1,
        },
        ni_worksheet=_neutral_ni("stabilization"),
        glasl_worksheet=_glasl(0, 3),
        diplomacy_worksheet=dipl,
        persist=True,
    )
    assert record["tracks"]["routing"]["tracks"]["diplomacy"] is True
    assert record["tracks"]["routing"]["tracks"]["macro"] is False
    assert record["tracks"]["diplomacy"]["status"] == "pending"
    assert record["tracks"]["information"] is None


def test_multitrack_military_routes_ni_glasl_only(tmp_path, monkeypatch):
    monkeypatch.setattr("adjudicate_router.ADJ_DIR", tmp_path)
    monkeypatch.setattr("adjudicate_router.SESSION_STATE_PATH", tmp_path / "_session_state.json")

    record = adjudicate_multitrack(
        {
            "id": "TEST-MIL-1",
            "mechanism": "Military",
            "goal": "Force posture adjustment",
            "team": "blue",
            "move": 1,
        },
        ni_worksheet=_neutral_ni("pressure"),
        glasl_worksheet=_glasl(1, 5),
        persist=True,
    )
    rt = record["tracks"]["routing"]["tracks"]
    assert rt["macro"] is False
    assert rt["diplomacy"] is False
    assert rt["information"] is False
    assert rt["national_interest"] is True
    assert rt["glasl"] is True
    assert record["tracks"]["glasl"]["stage_after"] == 6


def test_secondary_diplomacy_on_economic(tmp_path, monkeypatch):
    monkeypatch.setattr("adjudicate_router.ADJ_DIR", tmp_path)
    monkeypatch.setattr("adjudicate_router.SESSION_STATE_PATH", tmp_path / "_session_state.json")

    macro_ws = {
        "needs_human": False,
        "needs_human_reason": None,
        "classification": {
            "lever": "L1",
            "instrument": "I1.01",
            "direction": "coercive",
            "rule_citation": "Tie-break rule 5: tariff -> L1",
        },
        "precedent": {
            "tier": 1,
            "citations": ["Trade Act of 1974"],
            "rationale": "Standing tariff authority.",
        },
        "modifiers": {
            "funding_available": True,
            "partners_committed": False,
            "timeline_mismatch": False,
            "multi_authority_coordination": False,
        },
        "fit": {
            "band": "7-8",
            "score": 7,
            "orientation": "pressure",
            "rationale": "Tariff pressure advances declared orientation.",
        },
    }
    dipl = {
        "needs_human": False,
        "top_layer": "D/E",
        "category": "Signaling / Strategic Communication",
        "band": "Pressure",
        "policy_style": "Directive / Exclusionary",
        "rationale": "Tariff paired with bilateral bargaining lane.",
    }
    record = adjudicate_multitrack(
        {
            "id": "TEST-SEC-DIPL",
            "mechanism": "Economic",
            "goal": "Tariff with talks",
            "team": "blue",
            "move": 1,
        },
        macro_worksheet=macro_ws,
        ni_worksheet=_neutral_ni("pressure"),
        glasl_worksheet=_glasl(0, 4),
        diplomacy_worksheet=dipl,
        secondary_diplomacy=True,
        persist=True,
    )
    assert record["tracks"]["routing"]["tracks"]["macro"] is True
    assert record["tracks"]["routing"]["tracks"]["diplomacy"] is True
    assert record["tracks"]["diplomacy"]["status"] == "pending"


def test_secondary_information_on_diplomatic(tmp_path, monkeypatch):
    monkeypatch.setattr("adjudicate_router.ADJ_DIR", tmp_path)
    monkeypatch.setattr("adjudicate_router.SESSION_STATE_PATH", tmp_path / "_session_state.json")

    dipl = {
        "needs_human": False,
        "top_layer": "D/I",
        "category": "Public Diplomacy → Outreach / Audience Engagement",
        "band": "Relationship-Building",
        "policy_style": "Facilitative / Capacity-Building",
        "rationale": "Public diplomacy with explicit info-lane overlay.",
    }
    info = {
        "needs_human": False,
        "summary": "Public messaging aims to shape allied elite opinion.",
        "audiences": "Allied policy elites and domestic media.",
        "narratives": "Blue partnership frame vs Red interference frame.",
        "second_order_effects": "Risk of narrative blowback if overclaimed.",
        "sme_questions": "Which allied publics are primary?",
        "suggested_sme_edits": "Name the primary audience explicitly.",
    }
    record = adjudicate_multitrack(
        {
            "id": "TEST-SEC-INFO",
            "mechanism": "Diplomatic",
            "goal": "Public diplomacy package",
            "team": "blue",
            "move": 1,
        },
        ni_worksheet=_neutral_ni("stabilization"),
        glasl_worksheet=_glasl(0, 3),
        diplomacy_worksheet=dipl,
        info_brief=info,
        secondary_information=True,
        persist=True,
    )
    assert record["tracks"]["routing"]["tracks"]["diplomacy"] is True
    assert record["tracks"]["routing"]["tracks"]["information"] is True


def test_glasl_session_state_persists_across_actions(tmp_path, monkeypatch):
    monkeypatch.setattr("adjudicate_router.ADJ_DIR", tmp_path)
    state_path = tmp_path / "_session_state.json"
    monkeypatch.setattr("adjudicate_router.SESSION_STATE_PATH", state_path)

    first = adjudicate_multitrack(
        {
            "id": "TEST-GLASL-1",
            "mechanism": "Military",
            "goal": "First escalation step",
            "team": "blue",
            "move": 1,
        },
        ni_worksheet=_neutral_ni("pressure"),
        glasl_worksheet=_glasl(1, 4),
        persist=True,
    )
    assert first["tracks"]["glasl"]["stage_after"] == 5
    saved = __import__("json").loads(state_path.read_text(encoding="utf-8"))
    assert saved["glasl_stage"] == 5

    second = adjudicate_multitrack(
        {
            "id": "TEST-GLASL-2",
            "mechanism": "Military",
            "goal": "Second escalation step",
            "team": "blue",
            "move": 1,
        },
        ni_worksheet=_neutral_ni("pressure"),
        # stage_before omitted — router should use session state (5)
        glasl_worksheet={
            "delta": 1,
            "stage_after": 6,
            "rationale": "Further escalation from prior stage.",
            "needs_human": False,
        },
        persist=True,
    )
    assert second["tracks"]["glasl"]["stage_after"] == 6
    saved2 = __import__("json").loads(state_path.read_text(encoding="utf-8"))
    assert saved2["glasl_stage"] == 6
    assert "TEST-GLASL-1" in saved2["actions"]
    assert "TEST-GLASL-2" in saved2["actions"]


def test_instrument_from_pilot_entry():
    from adjudicate_router import instrument_from_pilot_entry

    assert (
        instrument_from_pilot_entry(
            {"worksheet": {"classification": {"lever": "L7"}}}
        )
        == "Economic"
    )
    assert (
        instrument_from_pilot_entry(
            {
                "worksheet": {"classification": {"lever": "NE"}},
                "title": "Covert wedge leak",
            }
        )
        == "Informational"
    )
    assert (
        instrument_from_pilot_entry(
            {
                "worksheet": {"classification": {"lever": "NE"}},
                "title": "Diplomatic demarche",
            }
        )
        == "Diplomatic"
    )