"""Smoke tests for per-action visual PDF reports."""
from __future__ import annotations

from pathlib import Path

import pytest

from adjudicate_router import adjudicate_multitrack
from reports.generate_action_report import write_action_report
from reports.trace_narrative import record_to_markdown


@pytest.fixture
def economic_record(tmp_path, monkeypatch):
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
        "id": "TEST-ECON-REPORT-1",
        "mechanism": "Economic",
        "goal": "Domestic capacity package",
        "team": "blue",
        "move": 1,
        "ally_contingencies": 'Levers: ["Industrial Policy"]',
    }
    return adjudicate_multitrack(
        action,
        macro_worksheet=macro_ws,
        ni_worksheet=ni_ws,
        glasl_worksheet=glasl_ws,
        persist=False,
    )


def test_write_action_report_embeds_charts_and_full_narratives(economic_record, tmp_path):
    out = tmp_path / "reports"
    paths = write_action_report(economic_record, out_dir=out)

    md_path = paths["markdown"]
    pdf_path = paths["pdf"]
    chart_dir = paths["charts"]

    assert md_path.exists()
    assert pdf_path.exists()
    assert pdf_path.stat().st_size > 20_000  # visual PDF should be non-trivial

    md = md_path.read_text(encoding="utf-8")
    assert "Macroeconomic adjudication" in md
    assert "## National Interest\n" in md
    assert "National Interest (impact on Blue)" not in md
    assert "Escalation (Glasl)" in md
    assert "Industrial capacity gain" in md
    assert "Domestic inducement stays within coalition competition" in md

    # Full markdown narratives must not be truncated in the sidecar
    full_md = record_to_markdown(economic_record)
    assert md == full_md

    assert chart_dir.is_dir()
    pngs = list(chart_dir.rglob("*.png"))
    assert pngs, "expected Macro / NI / Glasl chart PNGs"

    # Macro SME panels when trend has indicators
    macro = (economic_record.get("tracks") or {}).get("macro") or {}
    trend = macro.get("trend") or {}
    if trend and not trend.get("no_effect") and trend.get("indicators"):
        macro_pngs = list((chart_dir / "macro").glob("*.png"))
        assert len(macro_pngs) >= 1
    assert (chart_dir / "national_interest.png").exists()
    assert (chart_dir / "glasl.png").exists()


@pytest.fixture
def green_proposal_dip_info_record(tmp_path, monkeypatch):
    """Green Proposal routes Diplomatic + Information (Macro skipped)."""
    monkeypatch.setattr("adjudicate_router.ADJ_DIR", tmp_path)
    monkeypatch.setattr("adjudicate_router.SESSION_STATE_PATH", tmp_path / "_session_state.json")

    return adjudicate_multitrack(
        {
            "id": "TEST-GREEN-PROP-DIP-INFO",
            "mechanism": "Proposal",
            "goal": "EU: consultations plus public messaging on supply-chain resilience",
            "team": "green",
            "move": 1,
            "sector": "EU",
        },
        ni_worksheet={
            "orientation": "stabilization",
            "needs_human": False,
            "domain_deltas": {
                "NI-1": {"delta": 0, "rationale": "No homeland posture change."},
                "NI-2": {"delta": 1, "rationale": "Resilience advances industrial posture."},
                "NI-3": {"delta": 1, "rationale": "Consultations reinforce partner cohesion."},
                "NI-4": {"delta": 0, "rationale": "Indirect Indo-Pacific effects only."},
                "NI-5": {"delta": 0, "rationale": "Standards unchanged this move."},
                "NI-6": {"delta": 0, "rationale": "Domestic politics manageable."},
            },
            "threat_cross_check": None,
            "evidence_refs": ["FO1.0_Green_proposal_test"],
        },
        glasl_worksheet={
            "stage_before": 4,
            "delta": 0,
            "stage_after": 4,
            "rationale": "Positioning-band consultations stay inside coalition competition.",
            "needs_human": False,
        },
        diplomacy_worksheet={
            "needs_human": False,
            "top_layer": "D/I",
            "category": "Multilateral / Institutional Diplomacy",
            "band": "Positioning",
            "policy_style": "Consultative / Exploratory",
            "rationale": "EU pairs consultations with a coordinated public messaging lane.",
        },
        info_brief={
            "needs_human": False,
            "summary": "Green proposal packages diplomacy with an unscored information brief.",
            "audiences": "EU capitals, allied industrial ministries, domestic tech media.",
            "narratives": "Green frames resilience as shared autonomy; adversary frames bloc-building.",
            "second_order_effects": "Public signaling may outrun private consultation.",
            "sme_questions": "Which allied publics are primary?",
            "suggested_sme_edits": "Name the primary allied audience explicitly.",
        },
        orientation="stabilization",
        persist=False,
        pilot_synthetic=True,
    )


def test_green_proposal_report_embeds_diplomacy_and_information(
    green_proposal_dip_info_record, tmp_path
):
    routing = green_proposal_dip_info_record["tracks"]["routing"]["tracks"]
    assert routing["diplomacy"] is True
    assert routing["information"] is True
    assert routing["macro"] is False

    out = tmp_path / "green_reports"
    paths = write_action_report(green_proposal_dip_info_record, out_dir=out)

    assert paths["pdf"].exists()
    assert paths["pdf"].stat().st_size > 15_000

    md = paths["markdown"].read_text(encoding="utf-8")
    assert "Diplomacy index" in md
    assert "Information brief" in md
    assert "Positioning" in md
    assert "unscored information brief" in md
    assert "Macroeconomic adjudication" not in md
    assert "## National Interest (impact on Blue)\n" in md
    assert md == record_to_markdown(green_proposal_dip_info_record)

    from reports.action_visual_summaries import diplomacy_action_narrative

    prose = diplomacy_action_narrative(green_proposal_dip_info_record)
    assert "White Cell talking points" in prose
    assert "Positioning" in prose
    assert "categorical code path" in prose

    chart_dir = paths["charts"]
    assert (chart_dir / "diplomacy.png").exists()
    assert (chart_dir / "information.png").exists()
    assert (chart_dir / "national_interest.png").exists()
    assert (chart_dir / "glasl.png").exists()
    # Macro skipped — no SME indicator panels and no macro section in PDF/md
    assert not list((chart_dir / "macro").glob("*.png")) if (chart_dir / "macro").exists() else True
