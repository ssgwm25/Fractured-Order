"""National Interest section / chart titles (U.S./Blue-centric)."""

from __future__ import annotations

from typing import Any


def is_blue_team(team: Any) -> bool:
    return str(team or "").strip().lower() == "blue"


def national_interest_section_title(team: Any = None) -> str:
    """Heading for NI sections.

    NI always scores U.S./Blue interest movement. Non-Blue reports label that
    explicitly so readers do not read the section as the acting team's NI.
    """
    if is_blue_team(team):
        return "National Interest"
    return "National Interest (impact on Blue)"


def national_interest_chart_title(
    team: Any = None,
    *,
    detail: str = "domain tier deltas",
) -> str:
    base = national_interest_section_title(team)
    detail = (detail or "").strip()
    return f"{base} — {detail}" if detail else base
