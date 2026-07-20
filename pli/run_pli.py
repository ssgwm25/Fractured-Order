"""PLI pipeline orchestrator (multi-track).

Runs inside the GitHub Actions workflow (or locally by White Cell):

1. Pull finalized (``status='submitted'``) actions from Supabase that have no
   PLI adjudication record yet.
2. Look up the acting team's declared Strategic Orientation artifact.
3. Ground ``submission_month`` on a fixed 6-month action cadence
   (``submission_timing.py``), run Cursor agents for macro + Glasl + NI
   (and Diplomacy / Information when routed), then assemble tracks via
   ``adjudicate_router``.
4. Write one ``pli_adjudications`` row per action with the multi-track record,
   ``seat_reviews``, and aggregate ``status`` for SME consoles (White Cell Lead
   is read-only).

Environment:
    SUPABASE_URL                Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY   service-role key (server-side only)
    CURSOR_API_KEY              Cursor API key for the agent
    PLI_SESSION_ID              optional: restrict to one session
    PLI_MOVE_YEARS              optional JSON: {"1": 2027, "2": 2030, "3": 2032}
                                (legacy exec_year back-compat only)
    PLI_AGENT_MODEL             optional model id (default composer-2.5)
    PLI_DRY_RUN                 optional: "1" = adjudicate but do not write
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

import requests

import adjudicate
import adjudicate_router
import engine
from submission_timing import derive_submission_month
from tracks.router import build_routing_record, normalize_instrument_of_power

STRATEGIC_ORIENTATION_MECHANISM = "Strategic Orientation"
# Non-DIME artifact mechanisms that must not enter the PLI router.
SKIP_MECHANISMS = {
    "strategic orientation",
    "proposal",
}
SKIP_ARTIFACT_TYPES = {
    "proposal",
    "strategic_orientation_selection",
    "strategic_orientation_forecast",
}
DEFAULT_MOVE_YEARS = {"1": 2027, "2": 2030, "3": 2032}

SEAT_MACRO = "macro"
SEAT_DIP_INFO = "diplomacy_information"
SEAT_NI_ESC = "national_interest_escalation"

# needs_human stubs that should be re-scored when the pipeline gains new agents
# or orientation parsing fixes — not every SME-flagged needs_human forever.
RESCORE_REASON_MARKERS = (
    "Missing NI agent worksheet",
    "Missing Glasl agent worksheet",
    "Missing Diplomacy agent worksheet",
    "Missing Information brief",
    "No declared Strategic Orientation",
    "Macro agent worksheet missing",
    "Placeholder; replace with agent worksheet",
    "Placeholder neutral delta",
)


def _collect_needs_human_reasons(row: dict[str, Any]) -> list[str]:
    record = row.get("record") or {}
    reasons = [str(record.get("needs_human_reason") or "")]
    tracks = record.get("tracks") or {}
    for key in ("macro", "national_interest", "glasl", "diplomacy", "information"):
        block = tracks.get(key) or {}
        reasons.append(str(block.get("needs_human_reason") or ""))
        worksheet = block.get("worksheet") or {}
        if isinstance(worksheet, dict):
            reasons.append(str(worksheet.get("needs_human_reason") or ""))
            for entry in (worksheet.get("domain_deltas") or {}).values():
                if isinstance(entry, dict):
                    reasons.append(str(entry.get("rationale") or ""))
        reasons.append(str(block.get("rationale") or ""))
    return reasons


def _should_skip_existing_adjudication(row: dict[str, Any]) -> bool:
    status = row.get("status")
    if status not in (None, "needs_human"):
        return True
    if status != "needs_human":
        return False
    reasons = _collect_needs_human_reasons(row)
    return not any(
        marker in reason for reason in reasons for marker in RESCORE_REASON_MARKERS
    )


def _env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"Missing required environment variable: {name}", file=sys.stderr)
        sys.exit(1)
    return value


class SupabaseRest:
    """Minimal PostgREST client using the service-role key."""

    def __init__(self, url: str, service_key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }

    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        response = requests.get(
            f"{self.base}/{table}", headers=self.headers, params=params, timeout=30
        )
        response.raise_for_status()
        return response.json()

    def insert(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        response = requests.post(
            f"{self.base}/{table}",
            headers={**self.headers, "Prefer": "return=representation"},
            json=row,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        return data[0] if isinstance(data, list) else data

    def upsert(self, table: str, row: dict[str, Any], *, on_conflict: str) -> dict[str, Any]:
        response = requests.post(
            f"{self.base}/{table}",
            headers={
                **self.headers,
                "Prefer": "return=representation,resolution=merge-duplicates",
            },
            params={"on_conflict": on_conflict},
            json=row,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        return data[0] if isinstance(data, list) else data


def is_pli_candidate(action: dict[str, Any]) -> bool:
    """True when the row is a DIME-routable team action (not proposal/SO)."""
    artifact = str(action.get("artifact_type") or "").strip().lower()
    if artifact in SKIP_ARTIFACT_TYPES:
        return False
    mechanism = str(action.get("mechanism") or "").strip()
    if mechanism.lower() in SKIP_MECHANISMS:
        return False
    return normalize_instrument_of_power(mechanism) is not None


def fetch_pending_actions(db: SupabaseRest, session_id: str | None) -> list[dict[str, Any]]:
    # Include both submitted and White-Cell-deliberated actions. Operators often
    # record deliberation before PLI runs; those rows leave status='submitted'
    # and would otherwise never enter the macro SME queue.
    params = {
        "select": "*",
        "status": "in.(submitted,adjudicated)",
        "is_deleted": "eq.false",
        "mechanism": f"neq.{STRATEGIC_ORIENTATION_MECHANISM}",
        "order": "created_at.asc",
    }
    if session_id:
        params["session_id"] = f"eq.{session_id}"
    actions = db.select("actions", params)

    # Skip finished rows. Re-score only stubbed needs_human rows (missing
    # worksheets / missing orientation) so agent-flagged SME work does not
    # burn another full multi-agent run on every schedule tick.
    existing = db.select("pli_adjudications", {"select": "action_id,status,record"})
    skip_ids = {
        row["action_id"] for row in existing if _should_skip_existing_adjudication(row)
    }
    pending: list[dict[str, Any]] = []
    ineligible = 0
    for action in actions:
        if action["id"] in skip_ids:
            continue
        if is_pli_candidate(action):
            pending.append(action)
        else:
            ineligible += 1
    if ineligible:
        print(f"Skipping {ineligible} submitted non-DIME row(s) (proposals / SO / unroutable)")
    return pending


def fetch_session_actions(db: SupabaseRest, session_id: str) -> list[dict[str, Any]]:
    """All non-orientation actions in the session (for 6-month cadence ordering)."""
    return db.select(
        "actions",
        {
            "select": "id,move,created_at,submission_month,game_month",
            "session_id": f"eq.{session_id}",
            "is_deleted": "eq.false",
            "mechanism": f"neq.{STRATEGIC_ORIENTATION_MECHANISM}",
            "order": "created_at.asc",
        },
    )


def fetch_session_adjudications(
    db: SupabaseRest, session_id: str
) -> list[dict[str, Any]]:
    return db.select(
        "pli_adjudications",
        {
            "select": "action_id,session_id,status,record,codebook_version",
            "session_id": f"eq.{session_id}",
            "order": "created_at.asc",
        },
    )


def sync_live_glasl_stage(db: SupabaseRest, session_id: str) -> int:
    """Hydrate ephemeral session Glasl stage from finalized NI/Escalation seats.

    GitHub Actions runners do not keep ``_session_state_*.json`` across runs.
    Applied stage therefore comes from the newest adjudication whose
    national_interest_escalation seat is approved or overridden.
    """
    rows = db.select(
        "pli_adjudications",
        {
            "select": "seat_reviews,record,created_at",
            "session_id": f"eq.{session_id}",
            "order": "created_at.desc",
        },
    )
    state = adjudicate_router.load_session_state(session_id)
    applied = adjudicate_router.resolve_applied_glasl_stage_from_rows(rows)
    if applied is not None:
        state["glasl_stage"] = applied
        adjudicate_router.save_session_state(state, session_id)
        return applied
    return int(state.get("glasl_stage") or 4)


# Plenum UI ids (reframe) vs PLI codebook tokens (reframing).
ORIENTATION_ALIASES = {
    "pressure": "pressure",
    "stabilization": "stabilization",
    "reframing": "reframing",
    "reframe": "reframing",
}


def normalize_declared_orientation(value: str | None) -> str | None:
    if not value:
        return None
    return ORIENTATION_ALIASES.get(str(value).strip().lower())


def parse_orientation_from_details(details: str) -> str | None:
    for line in (details or "").split("\n"):
        stripped = line.strip()
        if stripped.lower().startswith("orientation:"):
            return normalize_declared_orientation(stripped.split(":", 1)[1])
    return None


def parse_orientation_from_payload(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    so = payload.get("strategic_orientation") or payload
    if not isinstance(so, dict):
        return None
    return normalize_declared_orientation(
        so.get("orientation") or so.get("orientationKey")
    )


def fetch_declared_orientation(db: SupabaseRest, session_id: str, team: str) -> str | None:
    """Read the team's Strategic Orientation artifact and parse the selection."""
    select_attempts = (
        "ally_contingencies,artifact_payload,created_at",
        "ally_contingencies,created_at",
    )
    rows: list[dict[str, Any]] = []
    for select_cols in select_attempts:
        try:
            rows = db.select(
                "actions",
                {
                    "select": select_cols,
                    "session_id": f"eq.{session_id}",
                    "team": f"eq.{team}",
                    "mechanism": f"eq.{STRATEGIC_ORIENTATION_MECHANISM}",
                    "is_deleted": "eq.false",
                    "order": "created_at.desc",
                    "limit": "1",
                },
            )
            break
        except requests.HTTPError:
            rows = []
    if not rows:
        # Fallback: artifact_type column used by newer FO schema
        try:
            rows = db.select(
                "actions",
                {
                    "select": "ally_contingencies,artifact_payload,created_at",
                    "session_id": f"eq.{session_id}",
                    "team": f"eq.{team}",
                    "artifact_type": "eq.strategic_orientation_selection",
                    "is_deleted": "eq.false",
                    "order": "created_at.desc",
                    "limit": "1",
                },
            )
        except requests.HTTPError:
            rows = []
    if not rows:
        return None

    row = rows[0]
    return (
        parse_orientation_from_details(row.get("ally_contingencies") or "")
        or parse_orientation_from_payload(row.get("artifact_payload"))
    )


def _seat_entry(status: str) -> dict[str, Any]:
    return {
        "status": status,
        "sme_reviewer": None,
        "reviewed_at": None,
        "override_value": None,
        "override_rationale": None,
    }


def build_seat_reviews(mt_record: dict[str, Any]) -> dict[str, Any]:
    """Initialize three SME seat review slots from multi-track routing/status."""
    tracks = mt_record.get("tracks") or {}
    routing = (tracks.get("routing") or {}).get("tracks") or {}
    track_statuses = mt_record.get("track_statuses") or {}

    def track_seat_status(names: list[str], *, always: bool = False) -> str:
        active = [n for n in names if always or routing.get(n)]
        if not active:
            return "skipped"
        statuses = [track_statuses.get(n) or (tracks.get(n) or {}).get("status") for n in active]
        statuses = [s for s in statuses if s]
        if not statuses:
            return "pending"
        if any(s == "needs_human" for s in statuses):
            return "needs_human"
        if all(s == "skipped_ne" for s in statuses):
            return "skipped"
        return "pending"

    return {
        SEAT_MACRO: _seat_entry(track_seat_status(["macro"])),
        SEAT_DIP_INFO: _seat_entry(
            track_seat_status(["diplomacy", "information"])
        ),
        SEAT_NI_ESC: _seat_entry(
            track_seat_status(["national_interest", "glasl"], always=True)
        ),
    }


def aggregate_status(seat_reviews: dict[str, Any], mt_status: str) -> str:
    """Roll seat + pipeline status into the row-level status for RLS/UI."""
    active = [
        (seat.get("status") or "pending")
        for seat in seat_reviews.values()
        if (seat.get("status") or "pending") != "skipped"
    ]
    if not active:
        return "pending"
    if any(s == "needs_human" for s in active) or mt_status == "needs_human":
        return "needs_human"
    if all(s in ("approved", "overridden") for s in active):
        if any(s == "overridden" for s in active):
            return "overridden"
        return "approved"
    return "pending"


def _macro_aliases(mt_record: dict[str, Any], worksheet: dict[str, Any] | None) -> dict[str, Any]:
    """Legacy top-level worksheet/adjudication keys for macro SME UI."""
    macro = (mt_record.get("tracks") or {}).get("macro") or {}
    adjudication = None
    if macro and macro.get("status") not in (None, "needs_human"):
        adjudication = {
            "classification": macro.get("classification"),
            "precedent": macro.get("precedent"),
            "implementation": macro.get("implementation"),
            "fit": macro.get("fit"),
            "trend": macro.get("trend"),
            "flags": macro.get("flags"),
        }
    return {
        "worksheet": worksheet or macro.get("worksheet"),
        "adjudication": adjudication,
    }


def build_record(
    action: dict[str, Any],
    orientation: str | None,
    move_years: dict[str, int],
    *,
    peer_actions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Adjudicate one action across all PLI tracks and shape the DB row."""
    timing = derive_submission_month(action, peer_actions=peer_actions)
    submission_month = timing["submission_month"]
    exec_year = int(move_years.get(str(action.get("move")), int(submission_month[:4])))
    session_id = action["session_id"]

    if orientation is None:
        routing = build_routing_record(action)
        routed = routing.get("tracks") or {}
        record = {
            "needs_human_reason": (
                f"No declared Strategic Orientation on record for team "
                f"'{action.get('team')}' - Fit cannot be scored (trial codebook, Layer 3b)."
            ),
            "exec_year": exec_year,
            "move": action.get("move"),
            "submission_month": submission_month,
            "submission_timing": timing,
            "codebook_version": engine.CODEBOOK["version"],
            "tracks": {"routing": routing},
            "track_statuses": {},
            "status": "needs_human",
        }
        # Routing-aware seats: Dip stays skipped when not routed so NI unlock
        # is not blocked by a phantom Dip seat after Macro finalize.
        dip_routed = bool(routed.get("diplomacy") or routed.get("information"))
        seat_reviews = {
            SEAT_MACRO: _seat_entry("needs_human" if routed.get("macro") else "skipped"),
            SEAT_DIP_INFO: _seat_entry("needs_human" if dip_routed else "skipped"),
            SEAT_NI_ESC: _seat_entry("needs_human"),
        }
        return {
            "action_id": action["id"],
            "session_id": session_id,
            "status": "needs_human",
            "record": record,
            "codebook_version": engine.CODEBOOK["version"],
            "seat_reviews": seat_reviews,
        }

    routing_preview = build_routing_record(action)
    tracks_needed = routing_preview.get("tracks") or {}

    agent_result = adjudicate.adjudicate_action(
        action,
        orientation,
        submission_month=submission_month,
    )
    worksheet = agent_result.get("worksheet")
    if worksheet is not None:
        worksheet = dict(worksheet)
        worksheet["submission_month"] = submission_month

    # Secondary facets from agent ne_facets when present
    facets = (worksheet or {}).get("ne_facets") or {}
    secondary_diplomacy = bool(facets.get("diplomacy"))
    secondary_information = bool(facets.get("information"))
    if secondary_diplomacy:
        tracks_needed = {**tracks_needed, "diplomacy": True}
    if secondary_information:
        tracks_needed = {**tracks_needed, "information": True}

    # Economic filings require a macro worksheet; if the agent failed twice,
    # supply a needs_human stub so NI/Glasl (always-on) still persist.
    macro_for_router = worksheet
    if tracks_needed.get("macro") and macro_for_router is None:
        macro_for_router = {
            "needs_human": True,
            "needs_human_reason": agent_result.get("needs_human_reason")
            or "Macro agent worksheet missing after retries",
            "classification": {
                "lever": "NE",
                "instrument": None,
                "direction": "mixed",
                "rule_citation": "Agent failed; awaiting SME",
            },
            "precedent": {
                "tier": 1,
                "statutory_basis": [],
                "rationale": "needs_human",
                "modifiers": {
                    "funding_available": False,
                    "partners_committed": False,
                    "timeline_mismatch": False,
                    "multi_authority_coordination": False,
                },
            },
            "fit": {
                "orientation": orientation,
                "band": "weak",
                "score": 1,
                "mechanism_rationale": "needs_human",
            },
            "ne_facets": {"diplomacy": False, "information": False},
            "submission_month": submission_month,
        }

    session_state = adjudicate_router.load_session_state(session_id)
    stage_before = int(session_state.get("glasl_stage") or 4)

    glasl_result = adjudicate.adjudicate_glasl(
        action, orientation, stage_before=stage_before
    )
    glasl_worksheet = glasl_result.get("worksheet")
    glasl_stage_after = stage_before
    if glasl_worksheet is not None:
        glasl_stage_after = int(
            glasl_worksheet.get("stage_after")
            or (stage_before + int(glasl_worksheet.get("delta") or 0))
        )
        glasl_stage_after = max(1, min(9, glasl_stage_after))

    macro_summary = ""
    if worksheet is not None:
        classification = worksheet.get("classification") or {}
        fit = worksheet.get("fit") or {}
        macro_summary = (
            f"lever={classification.get('lever')} "
            f"instrument={classification.get('instrument')} "
            f"fit={fit.get('band')}/{fit.get('score')}"
        )

    ni_result = adjudicate.adjudicate_ni(
        action,
        orientation,
        glasl_stage=glasl_stage_after,
        macro_summary=macro_summary,
    )
    ni_worksheet = ni_result.get("worksheet")

    diplomacy_result: dict[str, Any] | None = None
    diplomacy_worksheet = None
    if tracks_needed.get("diplomacy"):
        diplomacy_result = adjudicate.adjudicate_diplomacy(action, orientation)
        diplomacy_worksheet = diplomacy_result.get("worksheet")

    info_result: dict[str, Any] | None = None
    info_brief = None
    if tracks_needed.get("information"):
        info_result = adjudicate.adjudicate_information(action, orientation)
        info_brief = info_result.get("worksheet")

    mt_record = adjudicate_router.adjudicate_multitrack(
        action,
        macro_worksheet=macro_for_router,
        ni_worksheet=ni_worksheet,
        glasl_worksheet=glasl_worksheet,
        diplomacy_worksheet=diplomacy_worksheet,
        info_brief=info_brief,
        orientation=orientation,
        exec_year=exec_year,
        submission_month=submission_month,
        secondary_diplomacy=secondary_diplomacy,
        secondary_information=secondary_information,
        persist=False,
        session_id=session_id,
    )

    aliases = _macro_aliases(mt_record, worksheet)
    track_agents: dict[str, Any] = {
        "macro": {
            "model": agent_result["model"],
            "attempts": agent_result["attempts"],
            "needs_human": agent_result.get("needs_human"),
        },
        "glasl": {
            "model": glasl_result["model"],
            "attempts": glasl_result["attempts"],
            "needs_human": glasl_result.get("needs_human"),
        },
        "national_interest": {
            "model": ni_result["model"],
            "attempts": ni_result["attempts"],
            "needs_human": ni_result.get("needs_human"),
        },
    }
    if diplomacy_result is not None:
        track_agents["diplomacy"] = {
            "model": diplomacy_result["model"],
            "attempts": diplomacy_result["attempts"],
            "needs_human": diplomacy_result.get("needs_human"),
        }
    if info_result is not None:
        track_agents["information"] = {
            "model": info_result["model"],
            "attempts": info_result["attempts"],
            "needs_human": info_result.get("needs_human"),
        }

    record: dict[str, Any] = {
        **mt_record,
        "agent": {
            "model": agent_result["model"],
            "attempts": agent_result["attempts"],
            "tracks": track_agents,
        },
        "declared_orientation": orientation,
        "exec_year": exec_year,
        "move": action.get("move"),
        "submission_month": submission_month,
        "submission_timing": timing,
        "codebook_version": engine.CODEBOOK["version"],
        "worksheet": aliases["worksheet"],
        "adjudication": aliases["adjudication"],
    }

    if agent_result["worksheet"] is None or agent_result["needs_human"]:
        record["needs_human_reason"] = agent_result.get("needs_human_reason")
    elif glasl_result["worksheet"] is None or glasl_result["needs_human"]:
        record["needs_human_reason"] = glasl_result.get("needs_human_reason")
    elif ni_result["worksheet"] is None or ni_result["needs_human"]:
        record["needs_human_reason"] = ni_result.get("needs_human_reason")

    # Surface horizon clamp / beyond-horizon onset for White Cell.
    timing_flags = []
    if timing.get("clamped_to_horizon"):
        timing_flags.append("clamped_to_horizon")
    trend = ((record.get("tracks") or {}).get("macro") or {}).get("trend") or {}
    trend_flags = list(trend.get("flags") or [])
    if "onset_beyond_horizon" in trend_flags:
        timing_flags.append("onset_beyond_horizon")
        record["needs_human_reason"] = (
            "One or more indicator onsets fall past the scored horizon "
            f"({engine.HORIZON_END}); confirm Move 3 timing or extend SME review."
        )
    if timing_flags and record.get("adjudication"):
        record["adjudication"].setdefault("flags", [])
        for flag in timing_flags:
            if flag not in record["adjudication"]["flags"]:
                record["adjudication"]["flags"].append(flag)

    seat_reviews = build_seat_reviews(mt_record)
    if "onset_beyond_horizon" in timing_flags:
        seat_reviews[SEAT_MACRO]["status"] = "needs_human"
        mt_record["status"] = "needs_human"

    status = aggregate_status(seat_reviews, mt_record.get("status") or "pending")

    return {
        "action_id": action["id"],
        "session_id": session_id,
        "status": status,
        "record": record,
        "codebook_version": engine.CODEBOOK["version"],
        "seat_reviews": seat_reviews,
    }


def main() -> int:
    db = SupabaseRest(_env("SUPABASE_URL"), _env("SUPABASE_SERVICE_ROLE_KEY"))
    _env("CURSOR_API_KEY")  # fail fast before any fetch if the agent key is absent

    session_id = os.environ.get("PLI_SESSION_ID", "").strip() or None
    move_years = {
        **DEFAULT_MOVE_YEARS,
        **json.loads(os.environ.get("PLI_MOVE_YEARS", "{}")),
    }
    move_years = {str(k): int(v) for k, v in move_years.items()}
    dry_run = os.environ.get("PLI_DRY_RUN", "").strip() == "1"

    actions = fetch_pending_actions(db, session_id)
    print(f"Found {len(actions)} submitted action(s) awaiting PLI adjudication")

    orientation_cache: dict[tuple[str, str], str | None] = {}
    peers_cache: dict[str, list[dict[str, Any]]] = {}
    glasl_synced: set[str] = set()
    failures = 0
    rows: list[dict[str, Any]] = []

    for action in actions:
        sid = action["session_id"]
        key = (sid, action.get("team") or "")
        if key not in orientation_cache:
            orientation_cache[key] = fetch_declared_orientation(db, *key)
        if sid not in peers_cache:
            try:
                peers_cache[sid] = fetch_session_actions(db, sid)
            except Exception:
                peers_cache[sid] = [
                    a for a in actions if a.get("session_id") == sid
                ]
        if sid not in glasl_synced:
            try:
                stage = sync_live_glasl_stage(db, sid)
                print(f"Session {sid}: Glasl stage_before={stage} (from finalized NI seats)")
            except Exception as err:
                print(
                    f"  WARN: Glasl stage sync failed for {sid}: {err}",
                    file=sys.stderr,
                )
            glasl_synced.add(sid)

        title = action.get("goal") or action.get("id")
        print(f"Adjudicating: [{action.get('team')}] {title}")
        try:
            row = build_record(
                action,
                orientation_cache[key],
                move_years,
                peer_actions=peers_cache[sid],
            )
            timing = (row.get("record") or {}).get("submission_timing") or {}
            print(
                f"  timing={timing.get('submission_month')} "
                f"via {timing.get('source')}"
                + (
                    f" (clamped from {timing.get('submission_month_raw')})"
                    if timing.get("clamped_to_horizon")
                    else ""
                )
            )
            seats = row.get("seat_reviews") or {}
            print(
                "  seats="
                + ",".join(f"{k}:{v.get('status')}" for k, v in seats.items())
            )
        except Exception as err:  # keep the batch going; one bad action isn't fatal
            print(f"  FAILED: {err}", file=sys.stderr)
            failures += 1
            continue

        rows.append(row)
        print(f"  -> status={row['status']}")

    # Attach uncapped session stack before write so White Cell sees cumulative paths.
    by_session: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_session.setdefault(row["session_id"], []).append(row)

    for sid, batch in by_session.items():
        try:
            prior = fetch_session_adjudications(db, sid)
        except Exception as err:
            print(f"  WARN: session stack fetch failed for {sid}: {err}", file=sys.stderr)
            prior = []
        by_action = {r["action_id"]: r for r in prior}
        for r in batch:
            by_action[r["action_id"]] = r
        # stack_from_adjudication_records expects record.adjudication.trend
        stacked = engine.stack_from_adjudication_records(list(by_action.values()))
        if not stacked:
            continue
        print(
            f"Session {sid}: stacked {stacked['action_count']} action(s) "
            f"policy={stacked['stacking_policy']}"
        )
        stack_payload = {
            "stacking_policy": stacked["stacking_policy"],
            "action_count": stacked["action_count"],
            "action_ids": stacked["action_ids"],
            "deltas": stacked["deltas"],
            "post_action": stacked["post_action"],
            "quarters": stacked["quarters"],
            "codebook_version": stacked["codebook_version"],
        }
        for row in batch:
            if isinstance(row.get("record"), dict):
                row["record"]["session_stack"] = stack_payload

    for row in rows:
        if dry_run:
            print(json.dumps(row["record"], indent=2)[:2000])
        else:
            db.upsert("pli_adjudications", row, on_conflict="action_id")

    print(f"Done. {len(actions) - failures} adjudicated, {failures} failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
