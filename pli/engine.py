"""PLI deterministic adjudication engine (quarterly grid).

Everything in this module is rule application against the tables in
``codebook/codebook_data.json``. There is no model call and no estimation here:
given the same worksheet, the engine always produces the same scores and
quarterly trend-line deltas, so an SME can recompute any number by hand from the
codebook tables.

FO 2.0 anchors actions to ``submission_month`` (YYYY-MM). Onset, Implementation
delay, ramp-in, persistence, and decay are all measured in quarters.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

CODEBOOK_PATH = Path(__file__).parent / "codebook" / "codebook_data.json"

with open(CODEBOOK_PATH, encoding="utf-8") as fh:
    CODEBOOK: dict[str, Any] = json.load(fh)

INDICATORS: list[str] = CODEBOOK["indicators"]
QUARTERS: list[str] = CODEBOOK["baseline_quarters"]
# Compatibility alias for callers still importing YEARS.
YEARS: list[str] = QUARTERS
HORIZON_END: str = QUARTERS[-1]
QUARTER_INDEX: dict[str, int] = {q: i for i, q in enumerate(QUARTERS)}

_MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")


class WorksheetError(ValueError):
    """The agent worksheet violates the codebook contract."""


def quarter_label(year: int, quarter: int) -> str:
    return f"{year}Q{quarter}"


def month_to_quarter(submission_month: str) -> str:
    """Map YYYY-MM to calendar quarter label (1-3→Q1 … 10-12→Q4)."""
    m = _MONTH_RE.match(submission_month or "")
    if not m:
        raise WorksheetError(
            f"submission_month must be YYYY-MM, got {submission_month!r}"
        )
    year = int(m.group(1))
    month = int(m.group(2))
    if month < 1 or month > 12:
        raise WorksheetError(f"Invalid month in submission_month: {submission_month!r}")
    q = (month - 1) // 3 + 1
    label = quarter_label(year, q)
    if label not in QUARTER_INDEX:
        raise WorksheetError(
            f"submission_month {submission_month} maps to {label}, "
            f"outside horizon {QUARTERS[0]}-{HORIZON_END}"
        )
    return label


def exec_year_to_default_month(exec_year: int) -> str:
    """Back-compat: annual exec_year → January of that year (Q1 anchor)."""
    return f"{exec_year:04d}-01"


def shift_quarter(label: str, offset: int) -> str | None:
    idx = QUARTER_INDEX.get(label)
    if idx is None:
        return None
    j = idx + offset
    if j < 0 or j >= len(QUARTERS):
        return None
    return QUARTERS[j]


# ---------------------------------------------------------------------------
# Implementation score (Layer 3a): precedent tier + modifiers
# ---------------------------------------------------------------------------

def compute_implementation_score(tier: int, modifiers: dict[str, bool]) -> dict[str, Any]:
    """Apply the precedent test arithmetic from the trial codebook."""
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


def validate_fit_score(
    band: str,
    score: int,
    orientation: str,
    *,
    rationale: str | None = None,
    mechanism_rationale: str | None = None,
) -> dict[str, Any]:
    """Validate the agent's Fit selection against the anchor bands."""
    anchors = CODEBOOK["fit_anchors"]
    if band not in anchors:
        raise WorksheetError(f"Unknown Fit anchor band: {band!r}")
    lo, hi = (int(part) for part in band.split("-"))
    if not (lo <= score <= hi):
        raise WorksheetError(f"Fit score {score} outside anchor band {band}")
    if orientation not in CODEBOOK["orientations"]:
        raise WorksheetError(f"Unknown orientation: {orientation!r}")
    narrative = (rationale or mechanism_rationale or "").strip() or None
    out: dict[str, Any] = {
        "band": band,
        "score": score,
        "orientation": orientation,
        "anchor": anchors[band],
    }
    if narrative:
        # Keep both keys: schema uses rationale; SME UI also reads mechanism_rationale.
        out["rationale"] = narrative
        out["mechanism_rationale"] = narrative
    return out


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


def _profile_weight(
    k: int,
    *,
    ramp_in: int,
    plateau: int | None,
    decay: int,
    hard_cap: int | None,
) -> float:
    """Weight in [0,1] for quarter offset ``k`` from ``start_quarter`` (k=0 is first active).

    Path: linear ramp → plateau at 1 → linear decay to 0.
    ``plateau is None`` means hold to horizon (until ``hard_cap`` if set).
    ``hard_cap`` is max active length from start; when set with decay, the final
    ``decay`` quarters of the cap taper even under horizon persistence.
    """
    if k < 0:
        return 0.0
    if hard_cap is not None and k >= hard_cap:
        return 0.0

    ramp = max(int(ramp_in), 0)
    dec = max(int(decay), 0)

    if ramp > 0 and k < ramp:
        w = (k + 1) / ramp
        # If hard-capped with decay, still allow taper inside the ramp window.
        if hard_cap is not None and dec > 0 and k >= hard_cap - dec:
            taper = max(0.0, 1.0 - ((k - (hard_cap - dec)) + 1) / dec)
            return min(w, taper)
        return w

    after_ramp = 0 if ramp == 0 else k - ramp

    if plateau is None:
        if hard_cap is not None and dec > 0 and k >= hard_cap - dec:
            j = k - (hard_cap - dec)
            return max(0.0, 1.0 - (j + 1) / dec)
        return 1.0

    plateau_len = max(int(plateau), 0)
    if after_ramp < plateau_len:
        return 1.0
    if dec <= 0:
        return 0.0
    j = after_ramp - plateau_len
    if j >= dec:
        return 0.0
    return max(0.0, 1.0 - (j + 1) / dec)


def compute_quarter_weights(
    n_quarters: int,
    start_index: int,
    *,
    ramp_in_quarters: int,
    decay_quarters: int,
    persistence: Any,
    duration_quarters: int | None,
    duration_extension_quarters: int,
) -> list[float]:
    """Build per-quarter weights for one indicator effect."""
    hard_cap = None
    if duration_quarters is not None:
        hard_cap = int(duration_quarters) + int(duration_extension_quarters)

    plateau: int | None
    if persistence == "horizon":
        plateau = None
    else:
        plateau = max(int(persistence), 0)

    weights = [0.0] * n_quarters
    for i in range(n_quarters):
        weights[i] = round(
            _profile_weight(
                i - start_index,
                ramp_in=ramp_in_quarters,
                plateau=plateau,
                decay=decay_quarters,
                hard_cap=hard_cap,
            ),
            4,
        )
    return weights


def compute_deltas(
    lever: str,
    direction: str,
    implementation_score: int,
    fit_score: int,
    exec_year: int | None = None,
    submission_month: str | None = None,
) -> dict[str, Any]:
    """Compute per-indicator quarterly deltas for one action.

    Traceability: (1) lever → matrix row; (2) direction → sign; (3) Implementation
    → magnitude/onset delay; (4) Fit → persistence; (5) submission_month (or
    legacy exec_year → YYYY-01).
    """
    if lever == "NE":
        return _no_effect_result(lever, "non-economic action: no lever vector")

    matrix = CODEBOOK["directionality_matrix"]
    if lever not in matrix:
        raise WorksheetError(f"Unknown lever: {lever!r}")
    if direction not in ("coercive", "inducement", "mixed"):
        raise WorksheetError(f"Unknown direction: {direction!r}")

    if submission_month:
        submission_quarter = month_to_quarter(submission_month)
    elif exec_year is not None:
        submission_month = exec_year_to_default_month(int(exec_year))
        submission_quarter = month_to_quarter(submission_month)
    else:
        raise WorksheetError("submission_month or exec_year is required")

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
        result["submission_month"] = submission_month
        result["submission_quarter"] = submission_quarter
        return result
    if fit_rules.get("no_effect"):
        result = _no_effect_result(lever, f"Fit band {fit_band}: no sustained macroeconomic effect")
        result["flags"] = flags
        result["implementation_band"] = impl_band
        result["fit_band"] = fit_band
        result["submission_month"] = submission_month
        result["submission_quarter"] = submission_quarter
        return result

    default_direction = CODEBOOK["lever_default_direction"][lever]
    flip = direction != "mixed" and direction != default_direction

    class_values = CODEBOOK["magnitude_classes"]
    delay = int(impl_rules.get("onset_delay_quarters", impl_rules.get("onset_delay", 0) * 4))
    persistence = fit_rules["persistence"]
    dur_ext = int(
        fit_rules.get(
            "duration_extension_quarters",
            fit_rules.get("duration_extension", 0) * 4,
        )
    )

    submit_idx = QUARTER_INDEX[submission_quarter]
    indicators_out: dict[str, Any] = {}

    for indicator in INDICATORS:
        entry = matrix[lever][indicator]
        sign = entry["sign"] * (-1 if flip else 1)
        cls = _downgrade(entry["class"], impl_rules["downgrades"])
        magnitude = class_values[cls]
        peak_delta = round(sign * magnitude, 2)

        onset_q = int(entry.get("onset_quarters", entry.get("onset", 0) * 4))
        ramp_in = int(entry.get("ramp_in_quarters", 0))
        decay_q = int(entry.get("decay_quarters", 0))
        duration_q = entry.get("duration_quarters")
        if duration_q is None and entry.get("duration") is not None:
            duration_q = int(entry["duration"]) * 4

        start_idx = submit_idx + onset_q + delay
        start_label = QUARTERS[start_idx] if 0 <= start_idx < len(QUARTERS) else None

        if peak_delta == 0 or start_label is None or start_idx >= len(QUARTERS):
            weights = [0.0] * len(QUARTERS)
            deltas = [0.0] * len(QUARTERS)
            if peak_delta != 0 and start_idx >= len(QUARTERS):
                flag = "onset_beyond_horizon"
                if flag not in flags:
                    flags.append(flag)
            start_label = None
        else:
            weights = compute_quarter_weights(
                len(QUARTERS),
                start_idx,
                ramp_in_quarters=ramp_in,
                decay_quarters=decay_q,
                persistence=persistence,
                duration_quarters=duration_q,
                duration_extension_quarters=dur_ext,
            )
            deltas = [round(peak_delta * w, 2) for w in weights]

        base = CODEBOOK["baseline"][indicator]
        post = [round(b + d, 2) for b, d in zip(base, deltas)]
        net = sum(deltas) * CODEBOOK["favorable_direction"][indicator]
        verdict = "favorable" if net > 0 else ("unfavorable" if net < 0 else "neutral")

        active = [i for i, d in enumerate(deltas) if abs(d) > 1e-12]
        window_q = (max(active) - min(active) + 1) if active else 0

        indicators_out[indicator] = {
            "label": CODEBOOK["indicator_labels"][indicator],
            "matrix_sign": entry["sign"],
            "sign_flipped": flip,
            "matrix_class": entry["class"],
            "effective_class": cls,
            "delta_value": peak_delta,
            "onset_quarters": onset_q,
            "onset_delay_quarters": delay,
            "ramp_in_quarters": ramp_in,
            "decay_quarters": decay_q,
            "duration_quarters": duration_q,
            "bib": entry.get("bib"),
            "start_quarter": start_label if peak_delta != 0 else None,
            "effect_window_quarters": window_q if peak_delta != 0 else 0,
            "weights": weights,
            "baseline": base,
            "deltas": deltas,
            "post_action": post,
            "favorable_direction": CODEBOOK["favorable_direction"][indicator],
            "verdict": verdict,
            # Legacy keys for older chart code during migration:
            "onset_years": onset_q / 4.0,
            "start_year": int(start_label[:4]) if start_label else None,
            "effect_window_years": window_q / 4.0,
        }

    return {
        "lever": lever,
        "direction": direction,
        "direction_flip_applied": flip,
        "implementation_band": impl_band,
        "fit_band": fit_band,
        "submission_month": submission_month,
        "submission_quarter": submission_quarter,
        "exec_year": int(submission_month[:4]),
        "quarters": QUARTERS,
        "years": QUARTERS,
        "indicators": indicators_out,
        "flags": flags,
        "codebook_version": CODEBOOK["version"],
        "time_grid": "quarterly",
    }


def _no_effect_result(lever: str, reason: str) -> dict[str, Any]:
    indicators_out = {}
    for indicator in INDICATORS:
        base = CODEBOOK["baseline"][indicator]
        indicators_out[indicator] = {
            "label": CODEBOOK["indicator_labels"][indicator],
            "delta_value": 0.0,
            "start_quarter": None,
            "effect_window_quarters": 0,
            "weights": [0.0] * len(QUARTERS),
            "baseline": base,
            "deltas": [0.0] * len(QUARTERS),
            "post_action": list(base),
            "favorable_direction": CODEBOOK["favorable_direction"][indicator],
            "verdict": "neutral",
            "onset_years": 0,
            "start_year": None,
            "effect_window_years": 0,
        }
    return {
        "lever": lever,
        "no_effect": True,
        "no_effect_reason": reason,
        "quarters": QUARTERS,
        "years": QUARTERS,
        "indicators": indicators_out,
        "flags": [],
        "codebook_version": CODEBOOK["version"],
        "time_grid": "quarterly",
    }


def adjudicate_from_worksheet(
    worksheet: dict[str, Any],
    exec_year: int | None = None,
    submission_month: str | None = None,
) -> dict[str, Any]:
    """Run the deterministic half of the pipeline on an agent worksheet."""
    classification = worksheet["classification"]
    precedent = worksheet["precedent"]
    fit = worksheet["fit"]

    month = submission_month or worksheet.get("submission_month")
    if month is None and exec_year is not None:
        month = exec_year_to_default_month(int(exec_year))
    if month is None:
        raise WorksheetError("submission_month is required for FO 2.0 quarterly adjudication")

    if classification["lever"] == "NE":
        trend = _no_effect_result("NE", "non-economic action: no lever vector")
        trend["submission_month"] = month
        trend["submission_quarter"] = month_to_quarter(month)
        return {
            "classification": classification,
            "precedent": None,
            "implementation": None,
            "fit": None,
            "trend": trend,
            "submission_month": month,
            "exec_year": int(month[:4]),
            "codebook_version": CODEBOOK["version"],
        }

    impl = compute_implementation_score(precedent["tier"], worksheet.get("modifiers", {}))
    fit_validated = validate_fit_score(
        fit["band"],
        fit["score"],
        fit["orientation"],
        rationale=fit.get("rationale"),
        mechanism_rationale=fit.get("mechanism_rationale"),
    )

    trend = compute_deltas(
        lever=classification["lever"],
        direction=classification["direction"],
        implementation_score=impl["score"],
        fit_score=fit_validated["score"],
        submission_month=month,
    )

    return {
        "classification": classification,
        "precedent": precedent,
        "implementation": impl,
        "fit": fit_validated,
        "trend": trend,
        "submission_month": month,
        "exec_year": int(month[:4]),
        "codebook_version": CODEBOOK["version"],
    }


# ---------------------------------------------------------------------------
# Multi-action stacking (FO 2.0)
# ---------------------------------------------------------------------------

def stacking_cap_value() -> float:
    """Absolute clamp from codebook same_quarter_cap_class (default S)."""
    cls = CODEBOOK.get("same_quarter_cap_class", "S")
    return float(CODEBOOK["magnitude_classes"][cls])


def resolve_stacking_policy(policy: str | None = None) -> str:
    allowed = CODEBOOK.get("stacking_policies", ["uncapped", "same_quarter", "per_move"])
    resolved = policy or CODEBOOK.get("stacking_policy_default", "uncapped")
    if resolved not in allowed:
        raise WorksheetError(
            f"Unknown stacking_policy {resolved!r}; expected one of {allowed}"
        )
    return resolved


def _zero_indicator_series() -> dict[str, list[float]]:
    n = len(QUARTERS)
    return {ind: [0.0] * n for ind in INDICATORS}


def _add_indicator_series(
    a: dict[str, list[float]], b: dict[str, list[float]]
) -> dict[str, list[float]]:
    n = len(QUARTERS)
    return {
        ind: [round(a[ind][i] + b[ind][i], 4) for i in range(n)]
        for ind in INDICATORS
    }


def _clamp_indicator_series(
    series: dict[str, list[float]], cap: float
) -> dict[str, list[float]]:
    n = len(QUARTERS)
    return {
        ind: [max(-cap, min(cap, round(v, 4))) for v in series[ind][:n]]
        for ind in INDICATORS
    }


def _normalize_action_deltas(
    action_deltas: dict[str, list[float]],
) -> dict[str, list[float]]:
    """Ensure all indicators present and length == n_quarters."""
    n = len(QUARTERS)
    out = _zero_indicator_series()
    for ind in INDICATORS:
        vals = list(action_deltas.get(ind, [0.0] * n))
        if len(vals) < n:
            vals = vals + [0.0] * (n - len(vals))
        out[ind] = [float(v) for v in vals[:n]]
    return out


def stack_action_deltas(
    action_deltas: list[dict[str, list[float]]],
    *,
    policy: str | None = None,
    move_ids: list[int] | None = None,
) -> dict[str, Any]:
    """Stack per-action quarterly delta maps into one cumulative series.

    Policies:
      - uncapped: elementwise sum (FO 2.0 default)
      - same_quarter: after each action, clamp cumulative per quarter to +/-S
      - per_move: uncapped within a move; clamp each move's contribution to +/-S
        then add to the running game total. ``move_ids`` are grouped by move
        value (order-independent); requires move_ids aligned 1:1 with actions.

    Returns dict with cumulative ``deltas``, ``stacking_policy``, ``cap``, and
    ``codebook_version`` for traceability.
    """
    resolved = resolve_stacking_policy(policy)
    cap = stacking_cap_value()
    n_actions = len(action_deltas)

    if resolved == "per_move":
        if move_ids is None or len(move_ids) != n_actions:
            raise WorksheetError(
                "per_move stacking requires move_ids with one entry per action"
            )

    normalized = [_normalize_action_deltas(d) for d in action_deltas]
    running = _zero_indicator_series()

    if resolved == "uncapped":
        for d in normalized:
            running = _add_indicator_series(running, d)

    elif resolved == "same_quarter":
        for d in normalized:
            running = _clamp_indicator_series(
                _add_indicator_series(running, d), cap
            )

    elif resolved == "per_move":
        assert move_ids is not None
        # Group by move id regardless of caller order (stable by first appearance).
        order: list[int] = []
        buckets: dict[int, list[dict[str, list[float]]]] = {}
        for move, series in zip(move_ids, normalized):
            key = int(move)
            if key not in buckets:
                order.append(key)
                buckets[key] = []
            buckets[key].append(series)
        for move in order:
            move_buf = _zero_indicator_series()
            for series in buckets[move]:
                move_buf = _add_indicator_series(move_buf, series)
            running = _add_indicator_series(
                running, _clamp_indicator_series(move_buf, cap)
            )

    else:
        raise WorksheetError(f"Unhandled stacking_policy {resolved!r}")

    # Final rounding for display stability
    deltas = {
        ind: [round(v, 2) for v in running[ind]]
        for ind in INDICATORS
    }
    return {
        "deltas": deltas,
        "stacking_policy": resolved,
        "cap": cap if resolved != "uncapped" else None,
        "cap_class": CODEBOOK.get("same_quarter_cap_class", "S"),
        "quarters": list(QUARTERS),
        "codebook_version": CODEBOOK["version"],
    }


def post_action_from_stacked(
    stacked_deltas: dict[str, list[float]],
) -> dict[str, list[float]]:
    """baseline + cumulative deltas for each indicator."""
    return {
        ind: [
            round(CODEBOOK["baseline"][ind][i] + stacked_deltas[ind][i], 2)
            for i in range(len(QUARTERS))
        ]
        for ind in INDICATORS
    }


def extract_action_delta_map(trend: dict[str, Any] | None) -> dict[str, list[float]] | None:
    """Pull per-indicator quarterly deltas from an adjudication trend block."""
    if not trend or not isinstance(trend.get("indicators"), dict):
        return None
    if trend.get("no_effect"):
        return _zero_indicator_series()
    out = _zero_indicator_series()
    n = len(QUARTERS)
    for ind in INDICATORS:
        entry = trend["indicators"].get(ind) or {}
        vals = list(entry.get("deltas") or [0.0] * n)
        if len(vals) < n:
            vals = vals + [0.0] * (n - len(vals))
        out[ind] = [float(v) for v in vals[:n]]
    return out


def stack_from_adjudication_records(
    records: list[dict[str, Any]],
    *,
    policy: str | None = None,
) -> dict[str, Any] | None:
    """Stack macro deltas from pli_adjudications-shaped rows (or engine records).

    Accepts either full DB rows ``{record: {adjudication: {trend}, move}}`` or bare
    adjudication dicts with a ``trend`` key. Returns None when no usable trends.
    """
    deltas: list[dict[str, list[float]]] = []
    move_ids: list[int] = []
    action_ids: list[str] = []

    for row in records:
        payload = row.get("record") if isinstance(row.get("record"), dict) else row
        if not isinstance(payload, dict):
            continue
        adjudication = payload.get("adjudication")
        if not isinstance(adjudication, dict) and "trend" in payload:
            adjudication = payload
        if not isinstance(adjudication, dict):
            continue
        trend = adjudication.get("trend")
        series = extract_action_delta_map(trend)
        if series is None:
            continue
        deltas.append(series)
        move = (
            payload.get("move")
            or row.get("move")
            or row.get("action_move")
            or 1
        )
        try:
            move_ids.append(int(move))
        except (TypeError, ValueError):
            move_ids.append(1)
        action_ids.append(
            str(row.get("action_id") or payload.get("action_id") or len(action_ids))
        )

    if not deltas:
        return None

    resolved = resolve_stacking_policy(policy)
    stacked = stack_action_deltas(
        deltas,
        policy=resolved,
        move_ids=move_ids if resolved == "per_move" else None,
    )
    stacked["post_action"] = post_action_from_stacked(stacked["deltas"])
    stacked["action_ids"] = action_ids
    stacked["action_count"] = len(deltas)
    return stacked
