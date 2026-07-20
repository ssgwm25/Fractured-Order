"""DIME Instrument-of-Power routing for multi-track adjudication.

Instrument of Power is the default lane map, not the sole authority: callers may
enable secondary diplomacy/information facets when dual-lane evidence exists, and
agents should flag needs_human when the stated mechanism conflicts with content.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from tracks import DATA, TrackError

INSTRUMENTS = set(DATA["instruments_of_power"])
ROUTING = DATA["routing"]
UI_LEVER_PRIORS = DATA["ui_lever_priors"]

LEVER_LINE = re.compile(
    r"Levers?:\s*(\[[^\]]*\]|[^;\n]+)",
    re.IGNORECASE,
)


def normalize_instrument_of_power(mechanism: str | None) -> str | None:
    """Map Plenum actions.mechanism to a DIME Instrument of Power."""
    if not mechanism:
        return None
    text = mechanism.strip()
    # Exact UI values
    for name in INSTRUMENTS:
        if text.lower() == name.lower():
            return name
    # Common aliases from FO 1.0 / free text
    aliases = {
        "diplomacy": "Diplomatic",
        "diplomatic": "Diplomatic",
        "information": "Informational",
        "informational": "Informational",
        "info": "Informational",
        "military": "Military",
        "economic": "Economic",
        "econ": "Economic",
    }
    return aliases.get(text.lower())


def parse_ui_levers(ally_contingencies: str | None) -> list[str]:
    if not ally_contingencies:
        return []
    match = LEVER_LINE.search(ally_contingencies)
    if not match:
        return []
    raw = match.group(1).strip()
    if raw.startswith("["):
        try:
            values = json.loads(raw.replace("'", '"'))
            return [str(v) for v in values]
        except json.JSONDecodeError:
            raw = raw.strip("[]")
    return [part.strip().strip("'\"") for part in raw.split(",") if part.strip()]


def route_tracks(
    instrument_of_power: str,
    *,
    secondary_diplomacy: bool = False,
    secondary_information: bool = False,
) -> dict[str, bool]:
    """Return which tracks to run for a submitted Instrument of Power."""
    if instrument_of_power not in ROUTING:
        raise TrackError(f"Unknown Instrument of Power: {instrument_of_power!r}")
    base = dict(ROUTING[instrument_of_power])
    tracks = {
        "macro": bool(base["macro"]),
        "diplomacy": bool(base["diplomacy"]) or secondary_diplomacy,
        "information": bool(base["information"]) or secondary_information,
        "national_interest": bool(base["national_interest"]),
        "glasl": bool(base["glasl"]),
    }
    return tracks


def default_ne_facets(instrument_of_power: str) -> dict[str, bool]:
    tracks = route_tracks(instrument_of_power)
    return {
        "diplomacy": tracks["diplomacy"],
        "information": tracks["information"],
    }


def build_routing_record(action: dict[str, Any]) -> dict[str, Any]:
    """Derive routing from a Plenum-shaped action dict."""
    mechanism = action.get("mechanism") or action.get("instrument_of_power")
    iop = normalize_instrument_of_power(mechanism)
    if iop is None:
        # Fall back: if pilot already classified NE without DIME, treat carefully
        raise TrackError(
            f"Cannot route action without Instrument of Power; mechanism={mechanism!r}"
        )

    levers = parse_ui_levers(action.get("ally_contingencies") or action.get("details"))
    lever_priors = [UI_LEVER_PRIORS[l] for l in levers if l in UI_LEVER_PRIORS]
    tracks = route_tracks(iop)
    return {
        "instrument_of_power": iop,
        "ui_levers": levers,
        "ui_lever_priors": lever_priors,
        "tracks": tracks,
        "ne_facets": {
            "diplomacy": tracks["diplomacy"],
            "information": tracks["information"],
        },
        "default_lever": ROUTING[iop]["default_lever"],
    }


def save_adjudication(record: dict[str, Any], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return path
