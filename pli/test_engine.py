"""Unit tests for the deterministic PLI engine (quarterly grid).

Acceptance: capacity (L7) ramps across quarters after submission; coercive
trade (L1) moves within the first 1–2 quarters; mid-Fit decays over quarters
rather than annual cliffs. Constant annual bricks alone must not satisfy these.
"""
import pytest

from engine import (
    QUARTERS,
    WorksheetError,
    adjudicate_from_worksheet,
    compute_deltas,
    compute_implementation_score,
    compute_quarter_weights,
    month_to_quarter,
    validate_fit_score,
)


# ---------------------------------------------------------------------------
# Implementation score arithmetic
# ---------------------------------------------------------------------------

def test_worked_example_implementation_score():
    # Tier 2, no modifiers -> midpoint 6.5, round down -> 6
    result = compute_implementation_score(2, {})
    assert result["score"] == 6


def test_tier1_with_funding_and_partners():
    result = compute_implementation_score(
        1, {"funding_available": True, "partners_committed": True}
    )
    assert result["score"] == 10


def test_tier3_with_double_negative_capped_at_band_edge():
    result = compute_implementation_score(
        3, {"timeline_mismatch": True, "multi_authority_coordination": True}
    )
    assert result["score"] == 2


def test_tier4_capped_at_two():
    result = compute_implementation_score(4, {"funding_available": True})
    assert result["score"] == 2


def test_unknown_modifier_rejected():
    with pytest.raises(WorksheetError):
        compute_implementation_score(2, {"made_up_modifier": True})


def test_unknown_tier_rejected():
    with pytest.raises(WorksheetError):
        compute_implementation_score(7, {})


# ---------------------------------------------------------------------------
# Fit validation / month mapping
# ---------------------------------------------------------------------------

def test_fit_band_and_score_must_agree():
    assert validate_fit_score("7-8", 8, "reframing")["score"] == 8
    with pytest.raises(WorksheetError):
        validate_fit_score("7-8", 5, "reframing")
    with pytest.raises(WorksheetError):
        validate_fit_score("7-8", 8, "dominance")


def test_month_to_quarter_mapping():
    assert month_to_quarter("2026-01") == "2026Q1"
    assert month_to_quarter("2026-04") == "2026Q2"
    assert month_to_quarter("2026-07") == "2026Q3"
    assert month_to_quarter("2026-12") == "2026Q4"
    with pytest.raises(WorksheetError):
        month_to_quarter("2026-13")


def test_quarter_grid_covers_fo_horizon():
    assert QUARTERS[0] == "2026Q1"
    assert QUARTERS[-1] == "2034Q4"
    assert len(QUARTERS) == 36


# ---------------------------------------------------------------------------
# Profiled weights (no annual bricks)
# ---------------------------------------------------------------------------

def test_ramp_plateau_decay_shape():
    # ramp 2, plateau 2, decay 2 → six active quarters with non-constant shape
    w = compute_quarter_weights(
        8,
        0,
        ramp_in_quarters=2,
        decay_quarters=2,
        persistence=2,
        duration_quarters=None,
        duration_extension_quarters=0,
    )
    assert w[:6] == [0.5, 1.0, 1.0, 1.0, 0.5, 0.0]
    assert all(x == 0.0 for x in w[6:])


def test_horizon_persistence_holds_after_ramp():
    w = compute_quarter_weights(
        6,
        1,
        ramp_in_quarters=2,
        decay_quarters=0,
        persistence="horizon",
        duration_quarters=None,
        duration_extension_quarters=0,
    )
    assert w == [0.0, 0.5, 1.0, 1.0, 1.0, 1.0]


# ---------------------------------------------------------------------------
# Worked example (L7 / Impl 6 / Fit 8 / submit 2026-01)
# ---------------------------------------------------------------------------

@pytest.fixture()
def worked_example():
    return compute_deltas(
        lever="L7",
        direction="inducement",
        implementation_score=6,
        fit_score=8,
        submission_month="2026-01",
    )


def test_worked_example_is_quarterly(worked_example):
    assert worked_example["time_grid"] == "quarterly"
    assert worked_example["quarters"] == QUARTERS
    assert worked_example["codebook_version"].endswith("quarterly")
    assert len(worked_example["indicators"]["real_gdp_growth"]["deltas"]) == 36


def test_capacity_gdp_ramps_across_quarters(worked_example):
    """Source 10: authorization ≫ first-year outlay — multi-quarter ramp, not a brick."""
    gdp = worked_example["indicators"]["real_gdp_growth"]
    # Impl 5-6: delay 4Q; L7 GDP onset 8Q → start 2029Q1 (index 12)
    assert gdp["start_quarter"] == "2029Q1"
    assert gdp["onset_quarters"] == 8
    assert gdp["ramp_in_quarters"] == 12
    assert gdp["delta_value"] == 0.2  # M downgraded one step → s
    deltas = gdp["deltas"]
    assert all(d == 0.0 for d in deltas[:12])
    # Rising path over several quarters (not a flat annual brick)
    rising = deltas[12:12 + 12]
    assert rising[0] < rising[5] < rising[11]
    assert rising[0] > 0.0
    assert rising[11] == pytest.approx(0.2, abs=0.01)
    assert gdp["verdict"] == "favorable"


def test_capacity_investment_moves_before_gdp(worked_example):
    inv = worked_example["indicators"]["fixed_investment_growth"]
    # onset 4 + delay 4 → 2028Q1; peak S→M=0.5
    assert inv["start_quarter"] == "2028Q1"
    assert inv["delta_value"] == 0.5
    assert any(abs(d) > 0 for d in inv["deltas"][8:12])  # before GDP start
    assert inv["verdict"] == "favorable"


def test_l7_inflation_is_transitory_duration(worked_example):
    infl = worked_example["indicators"]["pce_inflation"]
    assert infl["duration_quarters"] == 8
    active = [i for i, d in enumerate(infl["deltas"]) if abs(d) > 1e-12]
    assert active
    assert (max(active) - min(active) + 1) <= 8
    assert infl["verdict"] == "unfavorable"


def test_post_action_equals_baseline_plus_delta(worked_example):
    for ind in worked_example["indicators"].values():
        for b, d, p in zip(ind["baseline"], ind["deltas"], ind["post_action"]):
            assert p == pytest.approx(round(b + d, 2))


# ---------------------------------------------------------------------------
# Coercive trade timing (Source 7)
# ---------------------------------------------------------------------------

def test_l1_trade_moves_within_first_two_quarters():
    result = compute_deltas(
        "L1", "coercive", 10, 9, submission_month="2026-04"
    )
    trade = result["indicators"]["trade_volume_growth"]
    assert result["submission_quarter"] == "2026Q2"
    assert trade["onset_quarters"] == 0
    assert trade["start_quarter"] == "2026Q2"
    # Ramp-in 2: partial then full within two quarters of submission
    idx = QUARTERS.index("2026Q2")
    assert trade["deltas"][idx] < 0
    assert abs(trade["deltas"][idx + 1]) >= abs(trade["deltas"][idx])
    assert trade["deltas"][idx + 1] == pytest.approx(-0.8, abs=0.01)


def test_direction_flip_inverts_signs():
    result = compute_deltas(
        "L1", "inducement", 10, 9, submission_month="2026-01"
    )
    trade = result["indicators"]["trade_volume_growth"]
    assert trade["sign_flipped"] is True
    assert trade["deltas"][1] == pytest.approx(0.8, abs=0.01)


# ---------------------------------------------------------------------------
# Band edges and special cases
# ---------------------------------------------------------------------------

def test_implementation_band_1_2_produces_no_effect():
    result = compute_deltas("L7", "inducement", 2, 8, submission_month="2026-01")
    assert result["no_effect"] is True
    assert all(ind["deltas"] == [0.0] * 36 for ind in result["indicators"].values())


def test_fit_band_1_2_produces_no_effect_and_flag():
    result = compute_deltas("L1", "coercive", 9, 1, submission_month="2026-01")
    assert result["no_effect"] is True
    assert "strategic_incoherence" in result["flags"]


def test_mid_fit_decays_over_quarters_not_annual_cliff():
    result = compute_deltas(
        "L7", "inducement", 10, 5, submission_month="2026-01"
    )
    inv = result["indicators"]["fixed_investment_growth"]
    # Fit 5-6: persistence 8Q after ramp; decay 8Q — multi-quarter fade
    deltas = inv["deltas"]
    nonzero = [d for d in deltas if abs(d) > 1e-12]
    assert len(nonzero) > 4
    # Find peak region then decay: last nonzero should be smaller than peak
    peak = max(nonzero, key=abs)
    last = nonzero[-1]
    assert abs(last) < abs(peak)
    # Must not be a single 2-year brick pattern of length 2
    assert len(nonzero) != 2


def test_ne_lever_has_no_macro_effect():
    result = compute_deltas("NE", "mixed", 5, 5, submission_month="2026-01")
    assert result["no_effect"] is True


def test_effect_starting_beyond_horizon_is_all_zero():
    result = compute_deltas(
        "L7", "inducement", 6, 8, submission_month="2032-01"
    )
    gdp = result["indicators"]["real_gdp_growth"]
    assert gdp["start_quarter"] is None
    assert gdp["deltas"] == [0.0] * 36
    assert "onset_beyond_horizon" in result["flags"]


def test_invalid_submission_month_rejected():
    with pytest.raises(WorksheetError):
        compute_deltas("L7", "inducement", 6, 8, submission_month="2035-01")


def test_exec_year_backcompat_maps_to_january():
    result = compute_deltas("L1", "coercive", 10, 9, exec_year=2026)
    assert result["submission_month"] == "2026-01"
    assert result["submission_quarter"] == "2026Q1"


def test_rejects_constant_annual_brick_as_only_dynamic():
    """Guard: profiled series must vary within the first active year for L1."""
    result = compute_deltas(
        "L1", "coercive", 10, 9, submission_month="2026-01"
    )
    trade = result["indicators"]["trade_volume_growth"]["deltas"][:4]
    assert len(set(round(x, 4) for x in trade)) > 1


# ---------------------------------------------------------------------------
# Full worksheet path
# ---------------------------------------------------------------------------

def test_adjudicate_from_worksheet_roundtrip():
    worksheet = {
        "classification": {
            "lever": "L7",
            "instrument": "I7.01",
            "direction": "inducement",
            "rule_citation": "Tie-break rule 8: domestic subsidy -> L7",
        },
        "precedent": {
            "tier": 2,
            "citations": ["CHIPS and Science Act of 2022 (Pub. L. 117-167)"],
            "rationale": "Authority class exists; new appropriations required",
        },
        "modifiers": {},
        "fit": {
            "band": "7-8",
            "score": 8,
            "orientation": "reframing",
            "rationale": "Capacity-building under declared Reframing orientation",
        },
        "submission_month": "2026-01",
    }
    record = adjudicate_from_worksheet(worksheet)
    assert record["implementation"]["score"] == 6
    assert record["fit"]["score"] == 8
    assert record["fit"]["rationale"] == "Capacity-building under declared Reframing orientation"
    assert record["fit"]["mechanism_rationale"] == record["fit"]["rationale"]
    assert record["submission_month"] == "2026-01"
    gdp = record["trend"]["indicators"]["real_gdp_growth"]
    assert gdp["start_quarter"] == "2029Q1"
    assert gdp["deltas"][12] > 0


def test_adjudicate_l10_territory_basing_chagos_style():
    """Chagos-style sovereignty purchase scores under L10 (not NE / needs_human stub)."""
    worksheet = {
        "classification": {
            "lever": "L10",
            "instrument": "I10.01",
            "direction": "inducement",
            "rule_citation": (
                "Tie-break rule 11: sovereign territory purchase/cession "
                "for basing and SLOC access -> L10 / I10.01"
            ),
        },
        "precedent": {
            "tier": 2,
            "citations": [
                "Historical Louisiana Purchase / Alaska Purchase analogs; "
                "modern basing treaties require bilateral consent"
            ],
            "rationale": (
                "Authority class for negotiated territorial transfer exists; "
                "new appropriations and UK legislative cession required"
            ),
        },
        "modifiers": {
            "partners_committed": True,
            "funding_available": True,
        },
        "fit": {
            "band": "7-8",
            "score": 7,
            "orientation": "reframing",
            "rationale": "Strategic access bargain under declared Reframing orientation",
        },
        "submission_month": "2026-01",
        "needs_human": False,
        "instrument_of_power": "Economic",
        "ne_facets": {"diplomacy": False, "information": False},
    }
    record = adjudicate_from_worksheet(worksheet)
    assert record["classification"]["lever"] == "L10"
    assert record["classification"]["instrument"] == "I10.01"
    assert record["implementation"]["score"] >= 5
    assert "real_gdp_growth" in record["trend"]["indicators"]
    gdp = record["trend"]["indicators"]["real_gdp_growth"]
    assert any(v != 0 for v in gdp["deltas"])


# ---------------------------------------------------------------------------
# Multi-action stacking (FO 2.0)
# ---------------------------------------------------------------------------

def _flat_delta(value: float) -> dict[str, list[float]]:
    from engine import INDICATORS, QUARTERS
    return {ind: [value] * len(QUARTERS) for ind in INDICATORS}


def test_default_stacking_policy_is_uncapped():
    from engine import CODEBOOK, resolve_stacking_policy
    assert CODEBOOK["stacking_policy_default"] == "uncapped"
    assert resolve_stacking_policy(None) == "uncapped"


def test_uncapped_stack_can_exceed_s_cap():
    from engine import stack_action_deltas, stacking_cap_value
    a = _flat_delta(-0.5)
    b = _flat_delta(-0.5)
    out = stack_action_deltas([a, b], policy="uncapped")
    trade = out["deltas"]["trade_volume_growth"]
    assert abs(trade[0]) > stacking_cap_value()
    assert trade[0] == pytest.approx(-1.0)
    assert out["stacking_policy"] == "uncapped"
    assert out["cap"] is None


def test_same_quarter_stack_clamps_to_s():
    from engine import stack_action_deltas, stacking_cap_value
    a = _flat_delta(-0.5)
    b = _flat_delta(-0.5)
    out = stack_action_deltas([a, b], policy="same_quarter")
    trade = out["deltas"]["trade_volume_growth"]
    cap = stacking_cap_value()
    assert all(abs(v) <= cap + 1e-9 for v in trade)
    assert trade[0] == pytest.approx(-cap)
    assert out["stacking_policy"] == "same_quarter"


def test_per_move_clamps_within_move_allows_across_moves():
    from engine import stack_action_deltas, stacking_cap_value
    # Two Move-1 actions of +0.5 each -> move contribution clamped to +0.8
    # Move-2 +0.5 can raise further under per_move.
    m1a = _flat_delta(0.5)
    m1b = _flat_delta(0.5)
    m2 = _flat_delta(0.5)
    out = stack_action_deltas(
        [m1a, m1b, m2],
        policy="per_move",
        move_ids=[1, 1, 2],
    )
    gdp = out["deltas"]["real_gdp_growth"]
    cap = stacking_cap_value()
    # After move 1 alone would be 0.8; plus move 2 0.5 -> 1.3
    assert gdp[0] == pytest.approx(round(cap + 0.5, 2))
    assert abs(gdp[0]) > cap
    assert out["stacking_policy"] == "per_move"


def test_per_move_requires_move_ids():
    from engine import stack_action_deltas
    with pytest.raises(WorksheetError):
        stack_action_deltas([_flat_delta(0.1)], policy="per_move")


def test_per_move_is_order_independent():
    from engine import stack_action_deltas
    a = _flat_delta(0.5)
    b = _flat_delta(0.5)
    c = _flat_delta(0.5)
    ordered = stack_action_deltas([a, b, c], policy="per_move", move_ids=[1, 1, 2])
    interleaved = stack_action_deltas([a, c, b], policy="per_move", move_ids=[1, 2, 1])
    assert ordered["deltas"]["real_gdp_growth"] == interleaved["deltas"]["real_gdp_growth"]


def test_onset_beyond_horizon_flagged():
    result = compute_deltas(
        "L7", "inducement", 6, 8, submission_month="2034-10"
    )
    assert "onset_beyond_horizon" in result["flags"]
    assert all(d == 0.0 for d in result["indicators"]["real_gdp_growth"]["deltas"])


def test_stack_from_adjudication_records():
    from engine import stack_from_adjudication_records
    a = compute_deltas("L1", "coercive", 10, 9, submission_month="2027-01")
    b = compute_deltas("L1", "coercive", 10, 9, submission_month="2027-06")
    rows = [
        {"action_id": "a1", "record": {"move": 1, "adjudication": {"trend": a}}},
        {"action_id": "a2", "record": {"move": 1, "adjudication": {"trend": b}}},
    ]
    stacked = stack_from_adjudication_records(rows)
    assert stacked is not None
    assert stacked["action_count"] == 2
    assert stacked["stacking_policy"] == "uncapped"
    assert "post_action" in stacked
    trade = stacked["deltas"]["trade_volume_growth"]
    assert any(abs(v) > 0.8 for v in trade)


def test_post_action_from_stacked_adds_baseline():
    from engine import CODEBOOK, post_action_from_stacked, stack_action_deltas
    stacked = stack_action_deltas([_flat_delta(0.2)], policy="uncapped")
    post = post_action_from_stacked(stacked["deltas"])
    base0 = CODEBOOK["baseline"]["real_gdp_growth"][0]
    assert post["real_gdp_growth"][0] == pytest.approx(round(base0 + 0.2, 2))
