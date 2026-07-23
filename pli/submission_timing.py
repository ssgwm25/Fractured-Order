"""Ground FO 2.0 ``submission_month`` on a fixed 6-month action cadence.

Game-director design (FO 2.0): actions are **not** grounded by the Plenum
wall-clock timer. Chronological filings in a session are spaced **six months
apart** on the diegetic calendar, starting at the sequence origin (default
``2027-01``).

Precedence when resolving a month for an action:
  1. Explicit ``action.submission_month`` / ``game_month`` if already stamped
  2. Session chronology: sort peers by ``created_at``, assign
     ``start + index * 6`` months (``six_month_cadence``)
"""
from __future__ import annotations

from typing import Any

ACTION_SPACING_MONTHS = 6
DEFAULT_SEQUENCE_START_MONTH = "2027-01"

# Live PLI quarterly grid ends 2034Q4 — clamp beyond that.
DEFAULT_HORIZON_START_MONTH = "2026-01"
DEFAULT_HORIZON_END_MONTH = "2034-12"

_MONTH_RE_LEN = 7  # YYYY-MM


def clamp_month_to_horizon(
    month: str,
    *,
    start_month: str = DEFAULT_HORIZON_START_MONTH,
    end_month: str = DEFAULT_HORIZON_END_MONTH,
) -> tuple[str, bool]:
    """Return (month, was_clamped). String compare is safe for YYYY-MM."""
    if month < start_month:
        return start_month, True
    if month > end_month:
        return end_month, True
    return month, False


def _parse_yyyy_mm(value: str) -> tuple[int, int]:
    year_s, month_s = value.split("-", 1)
    year, month = int(year_s), int(month_s)
    if not (1 <= month <= 12):
        raise ValueError(f"Invalid month in {value!r}")
    return year, month


def _format_yyyy_mm(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def add_months(start_month: str, offset: int) -> str:
    year, month = _parse_yyyy_mm(start_month)
    idx = year * 12 + (month - 1) + int(offset)
    return _format_yyyy_mm(idx // 12, idx % 12 + 1)


def months_between_inclusive(start_month: str, end_month: str) -> int:
    """Number of calendar months from start through end inclusive."""
    ys, ms = _parse_yyyy_mm(start_month)
    ye, me = _parse_yyyy_mm(end_month)
    return (ye - ys) * 12 + (me - ms) + 1


def normalize_submission_month(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if len(text) >= _MONTH_RE_LEN and text[4] == "-":
        candidate = text[:7]
        try:
            _parse_yyyy_mm(candidate)
            return candidate
        except ValueError:
            return None
    return None


def sort_actions_chronologically(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        actions,
        key=lambda a: (
            str(a.get("created_at") or ""),
            str(a.get("id") or a.get("action_id") or ""),
        ),
    )


def month_from_six_month_cadence(
    index: int,
    *,
    start_month: str = DEFAULT_SEQUENCE_START_MONTH,
    spacing_months: int = ACTION_SPACING_MONTHS,
) -> str:
    """Map 0-based chronological index → YYYY-MM on a fixed spacing grid."""
    return add_months(start_month, max(0, int(index)) * int(spacing_months))


def derive_submission_month(
    action: dict[str, Any],
    *,
    peer_actions: list[dict[str, Any]] | None = None,
    sequence_start_month: str = DEFAULT_SEQUENCE_START_MONTH,
    spacing_months: int = ACTION_SPACING_MONTHS,
    horizon_start_month: str = DEFAULT_HORIZON_START_MONTH,
    horizon_end_month: str = DEFAULT_HORIZON_END_MONTH,
    **_ignored: Any,
) -> dict[str, Any]:
    """Resolve ``submission_month`` and return trace metadata for the record.

    ``**_ignored`` accepts legacy kwargs (``game_state``, ``epochs``, ``now``)
    so older callers keep working; timer/epoch inputs are intentionally unused.
    """
    move = int(action.get("move") or 1)

    def _finish(raw_month: str, **meta: Any) -> dict[str, Any]:
        clamped, was_clamped = clamp_month_to_horizon(
            raw_month,
            start_month=horizon_start_month,
            end_month=horizon_end_month,
        )
        out = {
            "submission_month": clamped,
            "move": move,
            "spacing_months": spacing_months,
            "sequence_start_month": sequence_start_month,
            **meta,
        }
        if was_clamped:
            out["submission_month_raw"] = raw_month
            out["clamped_to_horizon"] = True
            out["horizon_end_month"] = horizon_end_month
        return out

    explicit = normalize_submission_month(
        action.get("submission_month") or action.get("game_month")
    )
    if explicit:
        return _finish(explicit, source="action.submission_month")

    peers = list(peer_actions) if peer_actions else [action]
    if not any(
        str(a.get("id") or a.get("action_id"))
        == str(action.get("id") or action.get("action_id"))
        for a in peers
    ):
        peers = peers + [action]

    peers_sorted = sort_actions_chronologically(peers)
    ids = [str(a.get("id") or a.get("action_id")) for a in peers_sorted]
    action_id = str(action.get("id") or action.get("action_id"))
    try:
        index = ids.index(action_id)
    except ValueError:
        index = 0

    month = month_from_six_month_cadence(
        index,
        start_month=sequence_start_month,
        spacing_months=spacing_months,
    )
    return _finish(
        month,
        source="six_month_cadence",
        ordinal_index=index,
        ordinal_count=len(peers_sorted),
    )
