"""Glasl escalation deterministic engine."""
from __future__ import annotations

from typing import Any

from tracks import DATA, TrackError

STAGES = {int(k): v for k, v in DATA["glasl"]["stages"].items()}
MAX_ABS = int(DATA["glasl"]["max_abs_delta_without_human"])
DEFAULT_START = int(DATA["glasl"]["default_start_stage"])


def clamp_stage(stage: int) -> int:
    return max(1, min(9, stage))


def validate_glasl_worksheet(
    worksheet: dict[str, Any],
    *,
    session_stage: int | None = None,
) -> dict[str, Any]:
    """Apply and validate a Glasl stage transition."""
    if worksheet.get("needs_human") and abs(int(worksheet.get("delta", 0))) <= MAX_ABS:
        # Agent asked for human even within band — pass through without applying
        return {
            "status": "needs_human",
            "needs_human_reason": worksheet.get("needs_human_reason"),
            "stage_before": worksheet.get("stage_before", session_stage),
            "delta": worksheet.get("delta"),
            "stage_after": worksheet.get("stage_after"),
            "trace": ["needs_human flagged by agent"],
            "worksheet": worksheet,
        }

    stage_before = worksheet.get("stage_before")
    if stage_before is None:
        stage_before = session_stage if session_stage is not None else DEFAULT_START
    stage_before = int(stage_before)
    if stage_before not in STAGES:
        raise TrackError(f"Invalid stage_before: {stage_before}")

    try:
        delta = int(worksheet["delta"])
    except (KeyError, TypeError, ValueError) as err:
        raise TrackError("Glasl worksheet requires integer delta") from err

    if abs(delta) > MAX_ABS and not worksheet.get("needs_human"):
        raise TrackError(
            f"|delta|={abs(delta)} > {MAX_ABS} requires needs_human=true"
        )

    expected_after = clamp_stage(stage_before + delta)
    stage_after = worksheet.get("stage_after")
    if stage_after is None:
        stage_after = expected_after
    else:
        stage_after = int(stage_after)
        if stage_after != expected_after:
            raise TrackError(
                f"stage_after {stage_after} != clamp({stage_before}+{delta})={expected_after}"
            )

    rationale = (worksheet.get("rationale") or "").strip()
    if len(rationale) < 12:
        raise TrackError("Glasl rationale too short")

    label_before = STAGES[stage_before]
    label_after = STAGES[stage_after]
    trace = [
        f"stage_before={stage_before} ({label_before})",
        f"delta={delta:+d}",
        f"stage_after={stage_after} ({label_after})",
        f"rationale: {rationale}",
    ]

    status = "needs_human" if worksheet.get("needs_human") else "pending"
    return {
        "status": status,
        "needs_human_reason": worksheet.get("needs_human_reason"),
        "stage_before": stage_before,
        "stage_before_label": label_before,
        "delta": delta,
        "stage_after": stage_after,
        "stage_after_label": label_after,
        "rationale": rationale,
        "trace": trace,
        "worksheet": worksheet,
    }
