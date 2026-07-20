"""Information brief validator — text only, no scores."""
from __future__ import annotations

from typing import Any

from tracks import DATA, TrackError

REQUIRED = list(DATA["information"]["required_sections"])
FORBIDDEN = set(DATA["information"]["forbidden_score_keys"])


def validate_info_brief(brief: dict[str, Any]) -> dict[str, Any]:
    """Pass-through schema check; does not rewrite SME-facing text."""
    for key in brief.keys():
        lower = key.lower()
        if lower in FORBIDDEN or any(f in lower for f in FORBIDDEN):
            raise TrackError(
                f"Information brief must not include score-like field {key!r}"
            )

    if brief.get("needs_human"):
        return {
            "status": "needs_human",
            "needs_human_reason": brief.get("needs_human_reason"),
            "brief": brief,
            "trace": ["needs_human flagged by agent"],
        }

    missing = [s for s in REQUIRED if len(str(brief.get(s) or "").strip()) < 8]
    if missing:
        raise TrackError(f"Information brief missing sections: {missing}")

    sections = {s: str(brief[s]).strip() for s in REQUIRED}
    return {
        "status": "pending",
        "sections": sections,
        "evidence_notes": brief.get("evidence_notes"),
        "trace": [
            "unscored information brief validated",
            f"summary_chars={len(sections['summary'])}",
        ],
        "brief": brief,
    }
