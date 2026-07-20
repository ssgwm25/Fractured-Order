"""Diplomacy indexing validator (no numeric score)."""
from __future__ import annotations

from typing import Any

from tracks import DATA, TrackError

BANDS = DATA["diplomacy"]["bands"]
STYLES = set(DATA["diplomacy"]["policy_styles"])
TOP_LAYERS = set(DATA["diplomacy"]["top_layers"])
CATEGORY_TO_BAND = {
    cat: band for band, cats in BANDS.items() for cat in cats
}


def normalize_code(
    top_layer: str, category: str, band: str, policy_style: str
) -> str:
    return f"{top_layer} | {category} | {band} | {policy_style}"


def validate_diplomacy_worksheet(worksheet: dict[str, Any]) -> dict[str, Any]:
    if worksheet.get("needs_human"):
        return {
            "status": "needs_human",
            "needs_human_reason": worksheet.get("needs_human_reason"),
            "worksheet": worksheet,
            "trace": ["needs_human flagged by agent"],
        }

    top_layer = (worksheet.get("top_layer") or "").strip()
    category = (worksheet.get("category") or "").strip()
    band = (worksheet.get("band") or "").strip()
    policy_style = (worksheet.get("policy_style") or "").strip()

    if top_layer not in TOP_LAYERS:
        raise TrackError(f"Invalid top_layer: {top_layer!r} (allowed: {sorted(TOP_LAYERS)})")

    if band not in BANDS:
        raise TrackError(f"Invalid diplomatic band: {band!r}")
    if category not in BANDS[band]:
        expected = CATEGORY_TO_BAND.get(category)
        raise TrackError(
            f"Category {category!r} not in band {band!r}"
            + (f" (belongs to {expected})" if expected else "")
        )
    if policy_style not in STYLES:
        raise TrackError(f"Invalid policy_style: {policy_style!r}")

    rationale = (worksheet.get("rationale") or "").strip()
    if len(rationale) < 12:
        raise TrackError("Diplomacy rationale too short")

    code = worksheet.get("code_string") or normalize_code(
        top_layer, category, band, policy_style
    )
    expected_code = normalize_code(top_layer, category, band, policy_style)
    if code.strip() != expected_code:
        code = expected_code

    return {
        "status": "pending",
        "top_layer": top_layer,
        "category": category,
        "band": band,
        "policy_style": policy_style,
        "code_string": code,
        "rationale": rationale,
        "trace": [f"indexed as {code}", f"rationale: {rationale}"],
        "worksheet": worksheet,
    }
