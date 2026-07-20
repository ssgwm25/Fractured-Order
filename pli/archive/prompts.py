"""Prompt builders for NI, Glasl, Diplomacy, and Information track agents."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CODEBOOK = ROOT / "codebook"
SCHEMAS = ROOT / "schemas"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _action_block(action: dict[str, Any], orientation: str, extra: dict | None = None) -> str:
    payload = {
        "action_id": action.get("id") or action.get("action_id"),
        "team": action.get("team"),
        "move": action.get("move"),
        "title": action.get("goal") or action.get("title"),
        "instrument_of_power": action.get("mechanism") or action.get("instrument_of_power"),
        "sector": action.get("sector"),
        "targets": action.get("targets"),
        "expected_outcomes": action.get("expected_outcomes"),
        "details": action.get("ally_contingencies") or action.get("details"),
        "orientation": orientation,
    }
    if extra:
        payload.update(extra)
    return json.dumps(payload, indent=2, ensure_ascii=False)


def build_ni_prompt(
    action: dict[str, Any],
    orientation: str,
    *,
    macro_summary: str = "",
    glasl_stage: int | None = None,
) -> str:
    schema = _read(SCHEMAS / "ni_worksheet_schema.json")
    codebook = _read(CODEBOOK / "04_NATIONAL_INTEREST_CODEBOOK.md")
    return "\n\n".join(
        [
            "You are the PLI National Interest adjudication agent. Execute the NI codebook "
            "strictly. Output a six-domain National War College tier-delta vector. Do not invent a scalar score. "
            "Cite NSS / National War College evidence in evidence_refs. Reply with one fenced JSON worksheet only.",
            "=== NI CODEBOOK ===\n" + codebook,
            "=== JSON SCHEMA ===\n" + schema,
            f"=== ORIENTATION ===\n{orientation}",
            f"=== CURRENT GLASL STAGE ===\n{glasl_stage}",
            ("=== MACRO SUMMARY ===\n" + macro_summary) if macro_summary else "",
            "=== ACTION ===\n" + _action_block(action, orientation),
        ]
    )


def build_glasl_prompt(
    action: dict[str, Any],
    orientation: str,
    *,
    stage_before: int,
) -> str:
    schema = _read(SCHEMAS / "glasl_worksheet_schema.json")
    codebook = _read(CODEBOOK / "05_GLASL_ESCALATION_CODEBOOK.md")
    return "\n\n".join(
        [
            "You are the PLI Glasl escalation agent. Match the action to Glasl stage criteria "
            "and propose delta in {-2..+2} unless needs_human. stage_after must equal "
            "clamp(stage_before+delta, 1, 9). Reply with one fenced JSON worksheet only.",
            "=== GLASL CODEBOOK ===\n" + codebook,
            "=== JSON SCHEMA ===\n" + schema,
            f"=== STAGE BEFORE ===\n{stage_before}",
            "=== ACTION ===\n"
            + _action_block(action, orientation, {"stage_before": stage_before}),
        ]
    )


def build_diplomacy_prompt(action: dict[str, Any], orientation: str) -> str:
    schema = _read(SCHEMAS / "diplomacy_worksheet_schema.json")
    codebook = _read(CODEBOOK / "06_DIPLOMACY_INDEX_CODEBOOK.md")
    return "\n\n".join(
        [
            "You are the PLI Diplomacy Index agent. Assign a four-field index code only. "
            "No numeric score. Code by delivery mechanism. Reply with one fenced JSON only.",
            "=== DIPLOMACY CODEBOOK ===\n" + codebook,
            "=== JSON SCHEMA ===\n" + schema,
            "=== ACTION ===\n" + _action_block(action, orientation),
        ]
    )


def build_info_prompt(action: dict[str, Any], orientation: str) -> str:
    schema = _read(SCHEMAS / "info_brief_schema.json")
    spec = _read(CODEBOOK / "07_INFORMATION_BRIEF_SPEC.md")
    return "\n\n".join(
        [
            "You are the PLI Information brief agent. Produce an unscored SME text brief. "
            "Forbidden: any numeric score, band, delta, rating, or Likert field. "
            "Reply with one fenced JSON brief only.",
            "=== INFORMATION BRIEF SPEC ===\n" + spec,
            "=== JSON SCHEMA ===\n" + schema,
            "=== ACTION ===\n" + _action_block(action, orientation),
        ]
    )
