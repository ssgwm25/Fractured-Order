"""Frozen pre-quarterly (annual-brick) PLI engine — comparison snapshot only.

This module is **not** the live adjudication path. Live FO 2.0 uses ``engine.py``
with ``codebook/codebook_data.json`` (quarterly grid + stacking). Load the paired
freeze file ``codebook/codebook_data.annual_baseline.json`` (trial-2026-07-02)
when comparing against the old annual-brick behavior.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

CODEBOOK_PATH = Path(__file__).parent / "codebook" / "codebook_data.annual_baseline.json"

with open(CODEBOOK_PATH, encoding="utf-8") as fh:
    CODEBOOK: dict[str, Any] = json.load(fh)

INDICATORS: list[str] = CODEBOOK["indicators"]
YEARS: list[int] = CODEBOOK["baseline_years"]
HORIZON_END: int = YEARS[-1]


class WorksheetError(ValueError):
    """The agent worksheet violates the codebook contract."""


# ---------------------------------------------------------------------------
# Implementation score (Layer 3a): precedent tier + modifiers
# ---------------------------------------------------------------------------

def compute_implementation_score(tier: int, modifiers: dict[str, bool]) -> dict[str, Any]:
    """Apply the precedent test arithmetic from the trial codebook.

    Start at the tier midpoint, add each modifier that holds, floor the
    result, allow at most one point of band-edge crossing, clamp to 1-10,
    and cap Tier 4 at 2.
    """
    tiers = CODEBOOK["precedent_tiers"]
    key = str(tier)
    if key not in tiers:
        raise WorksheetError(f"Unknown precedent tier: {tier!r}")

    tier_info = tiers[key]
    midpoint: float = tier_info["midpoint"]
    lo, hi = tier_info["base_range"]

    modifier_table = CODEBOOK["implementation_modifiers"]
    applied: dict[str, int] = {}
    for name, active in (modifiers or {}).items():
        if name not in modifier_table:
            raise WorksheetError(f"Unknown implementation modifier: {name!r}")
        if active:
            applied[name] = modifier_table[name]

    raw = midpoint + sum(applied.values())
    score = math.floor(raw)

    edge = CODEBOOK["band_edge_crossing_limit"]
    score = max(lo - edge, min(hi + edge, score))
    score = max(1, min(10, score))

    cap = CODEBOOK["tier_cap"].get(key)
    if cap is not None:
        score = min(score, cap)

    return {
        "tier": tier,
        "tier_label": tier_info["label"],
        "midpoint": midpoint,
        "modifiers_applied": applied,
        "raw": raw,
        "score": score,
    }


# ---------------------------------------------------------------------------
# Fit score (Layer 3b): anchor-band validation
# ---------------------------------------------------------------------------

def validate_fit_score(band: str, score: int, orientation: str) -> dict[str, Any]:
    """Validate the agent's Fit selection against the anchor bands."""
    anchors = CODEBOOK["fit_anchors"]
    if band not in anchors:
        raise WorksheetError(f"Unknown Fit anchor band: {band!r}")
    lo, hi = (int(part) for part in band.split("-"))
    if not (lo <= score <= hi):
        raise WorksheetError(f"Fit score {score} outside anchor band {band}")
    if orientation not in CODEBOOK["orientations"]:
        raise WorksheetError(f"Unknown orientation: {orientation!r}")
    return {
        "band": band,
        "score": score,
        "orientation": orientation,
        "anchor": anchors[band],
    }


# ---------------------------------------------------------------------------
# Band lookups
# ---------------------------------------------------------------------------

def _band_for(score: int, table: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    for band, rules in table.items():
        lo, hi = (int(part) for part in band.split("-"))
        if lo <= score <= hi:
            return band, rules
    raise WorksheetError(f"Score {score} matches no band in {sorted(table)}")


def _downgrade(cls: str, steps: int) -> str:
    table = CODEBOOK["magnitude_downgrade"]
    for _ in range(steps):
        cls = table[cls]
    return cls


# ---------------------------------------------------------------------------
# Trend-line deltas
# ---------------------------------------------------------------------------

def compute_deltas(
    lever: str,
    direction: str,
    implementation_score: int,
    fit_score: int,
    exec_year: int,
) -> dict[str, Any]:
    """Compute the per-indicator six-year deltas for one action.

    Traceability chain (recorded in the output): (1) lever -> matrix row;
    (2) direction facet -> sign check; (3) Implementation score ->
    magnitude/onset band; (4) Fit score -> persistence band; (5) execution
    year.
    """
    if lever == "NE":
        return _no_effect_result(lever, "non-economic action: no lever vector")

    matrix = CODEBOOK["directionality_matrix"]
    if lever not in matrix:
        raise WorksheetError(f"Unknown lever: {lever!r}")
    if direction not in ("coercive", "inducement", "mixed"):
        raise WorksheetError(f"Unknown direction: {direction!r}")
    if exec_year not in YEARS:
        raise WorksheetError(f"Execution year {exec_year} outside horizon {YEARS[0]}-{HORIZON_END}")

    impl_band, impl_rules = _band_for(implementation_score, CODEBOOK["implementation_bands"])
    fit_band, fit_rules = _band_for(fit_score, CODEBOOK["fit_bands"])

    flags: list[str] = []
    if fit_rules.get("flag"):
        flags.append(fit_rules["flag"])

    if impl_rules.get("no_effect"):
        result = _no_effect_result(lever, f"Implementation band {impl_band}: action fails to execute")
        result["flags"] = flags
        result["implementation_band"] = impl_band
        result["fit_band"] = fit_band
        return result
    if fit_rules.get("no_effect"):
        result = _no_effect_result(lever, f"Fit band {fit_band}: no sustained macroeconomic effect")
        result["flags"] = flags
        result["implementation_band"] = impl_band
        result["fit_band"] = fit_band
        return result

    default_direction = CODEBOOK["lever_default_direction"][lever]
    flip = direction != "mixed" and direction != default_direction

    class_values = CODEBOOK["magnitude_classes"]
    indicators_out: dict[str, Any] = {}

    for indicator in INDICATORS:
        entry = matrix[lever][indicator]
        sign = entry["sign"] * (-1 if flip else 1)
        cls = _downgrade(entry["class"], impl_rules["downgrades"])
        magnitude = class_values[cls]
        delta_value = round(sign * magnitude, 2)

        onset = entry["onset"] + impl_rules["onset_delay"]
        start_year = exec_year + onset

        # Persistence window from the Fit band, bounded by any natural
        # transitory duration in the matrix entry (e.g., build-phase
        # inflation) and by the 2031 horizon.
        persistence = fit_rules["persistence"]
        window = (HORIZON_END - start_year + 1) if persistence == "horizon" else persistence
        duration = entry.get("duration")
        if duration is not None:
            window = min(window, duration + fit_rules.get("duration_extension", 0))

        deltas = []
        for year in YEARS:
            active = delta_value != 0 and start_year <= year < start_year + max(window, 0)
            deltas.append(delta_value if active else 0.0)

        base = CODEBOOK["baseline"][indicator]
        post = [round(b + d, 2) for b, d in zip(base, deltas)]
        net = sum(deltas) * CODEBOOK["favorable_direction"][indicator]
        verdict = "favorable" if net > 0 else ("unfavorable" if net < 0 else "neutral")

        indicators_out[indicator] = {
            "label": CODEBOOK["indicator_labels"][indicator],
            "matrix_sign": entry["sign"],
            "sign_flipped": flip,
            "matrix_class": entry["class"],
            "effective_class": cls,
            "delta_value": delta_value,
            "onset_years": onset,
            "start_year": start_year if delta_value != 0 else None,
            "effect_window_years": window if delta_value != 0 else 0,
            "baseline": base,
            "deltas": deltas,
            "post_action": post,
            "favorable_direction": CODEBOOK["favorable_direction"][indicator],
            "verdict": verdict,
        }

    return {
        "lever": lever,
        "direction": direction,
        "direction_flip_applied": flip,
        "implementation_band": impl_band,
        "fit_band": fit_band,
        "exec_year": exec_year,
        "years": YEARS,
        "indicators": indicators_out,
        "flags": flags,
        "codebook_version": CODEBOOK["version"],
    }


def _no_effect_result(lever: str, reason: str) -> dict[str, Any]:
    indicators_out = {}
    for indicator in INDICATORS:
        base = CODEBOOK["baseline"][indicator]
        indicators_out[indicator] = {
            "label": CODEBOOK["indicator_labels"][indicator],
            "delta_value": 0.0,
            "start_year": None,
            "effect_window_years": 0,
            "baseline": base,
            "deltas": [0.0] * len(YEARS),
            "post_action": list(base),
            "favorable_direction": CODEBOOK["favorable_direction"][indicator],
            "verdict": "neutral",
        }
    return {
        "lever": lever,
        "no_effect": True,
        "no_effect_reason": reason,
        "years": YEARS,
        "indicators": indicators_out,
        "flags": [],
        "codebook_version": CODEBOOK["version"],
    }


# ---------------------------------------------------------------------------
# Full adjudication from an agent worksheet
# ---------------------------------------------------------------------------

def adjudicate_from_worksheet(worksheet: dict[str, Any], exec_year: int) -> dict[str, Any]:
    """Run the deterministic half of the pipeline on an agent worksheet."""
    classification = worksheet["classification"]
    precedent = worksheet["precedent"]
    fit = worksheet["fit"]

    if classification["lever"] == "NE":
        # Non-economic actions route out of macro adjudication entirely
        # (Glasl / National Interest are separate tracks). No scores apply.
        return {
            "classification": classification,
            "precedent": None,
            "implementation": None,
            "fit": None,
            "trend": _no_effect_result("NE", "non-economic action: no lever vector"),
            "exec_year": exec_year,
            "codebook_version": CODEBOOK["version"],
        }

    impl = compute_implementation_score(precedent["tier"], worksheet.get("modifiers", {}))
    fit_validated = validate_fit_score(fit["band"], fit["score"], fit["orientation"])

    trend = compute_deltas(
        lever=classification["lever"],
        direction=classification["direction"],
        implementation_score=impl["score"],
        fit_score=fit_validated["score"],
        exec_year=exec_year,
    )

    return {
        "classification": classification,
        "precedent": precedent,
        "implementation": impl,
        "fit": fit_validated,
        "trend": trend,
        "exec_year": exec_year,
        "codebook_version": CODEBOOK["version"],
    }
