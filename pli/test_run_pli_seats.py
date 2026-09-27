"""Seat-review helpers on the live PLI orchestrator (no agent / network)."""

from __future__ import annotations

from run_pli import (
    SEAT_DIP_INFO,
    SEAT_MACRO,
    SEAT_NI_ESC,
    build_record,
    build_seat_reviews,
    fetch_eligible_session_ids,
    fetch_pending_actions,
    is_pli_candidate,
    write_adjudication_rows,
)
from tracks.router import build_routing_record, is_green_proposal


class _FakeDb:
    """Records PostgREST calls; serves canned rows per table."""

    def __init__(self, tables: dict[str, list[dict]], *, fail_upsert_for: set[str] = ()):
        self.tables = tables
        self.selects: list[tuple[str, dict]] = []
        self.upserts: list[dict] = []
        self.fail_upsert_for = set(fail_upsert_for)

    def select(self, table, params):
        self.selects.append((table, dict(params)))
        return list(self.tables.get(table, []))

    def upsert(self, table, row, *, on_conflict):
        if row.get("session_id") in self.fail_upsert_for:
            raise RuntimeError("42501 GC02_SESSION_CLOSED")
        self.upserts.append(row)
        return row


def _dime_action(action_id: str, session_id: str) -> dict:
    return {
        "id": action_id,
        "session_id": session_id,
        "team": "blue",
        "goal": f"goal-{action_id}",
        "mechanism": "Diplomatic",
        "status": "submitted",
        "is_deleted": False,
    }


def test_eligible_sessions_query_requires_active_unprotected_live_exercise():
    db = _FakeDb({"sessions": [{"id": "s-active"}]})

    assert fetch_eligible_session_ids(db, None) == ["s-active"]
    table, params = db.selects[0]
    assert table == "sessions"
    assert params["status"] == "eq.active"
    assert params["session_classification"] == "eq.live_exercise"
    assert params["is_protected"] == "eq.false"
    assert "id" not in params

    db = _FakeDb({"sessions": []})
    assert fetch_eligible_session_ids(db, "s-explicit") == []
    assert db.selects[0][1]["id"] == "eq.s-explicit"


def test_pending_actions_are_scoped_to_eligible_sessions(capsys):
    db = _FakeDb(
        {
            "sessions": [{"id": "s-live"}, {"id": "s-live-2"}],
            "actions": [_dime_action("a1", "s-live")],
            "pli_adjudications": [],
        }
    )

    pending = fetch_pending_actions(db, None)

    assert [a["id"] for a in pending] == ["a1"]
    by_table = {table: params for table, params in db.selects}
    assert by_table["actions"]["session_id"] == "in.(s-live,s-live-2)"
    assert by_table["pli_adjudications"]["session_id"] == "in.(s-live,s-live-2)"


def test_pending_actions_short_circuit_without_eligible_session(capsys):
    db = _FakeDb({"sessions": [], "actions": [_dime_action("a1", "s-closed")]})

    assert fetch_pending_actions(db, None) == []
    assert [table for table, _ in db.selects] == ["sessions"]
    assert "nothing to adjudicate" in capsys.readouterr().out


def test_write_adjudication_rows_continues_past_rejected_write(capsys):
    db = _FakeDb({}, fail_upsert_for={"s-closed"})
    rows = [
        {"action_id": "a1", "session_id": "s-closed", "record": {}},
        {"action_id": "a2", "session_id": "s-live", "record": {}},
    ]

    written = write_adjudication_rows(db, rows, dry_run=False)

    assert written == 1
    assert [row["action_id"] for row in db.upserts] == ["a2"]
    assert "GC02_SESSION_CLOSED" in capsys.readouterr().err


def test_write_adjudication_rows_dry_run_writes_nothing():
    db = _FakeDb({})
    rows = [{"action_id": "a1", "session_id": "s-live", "record": {"k": 1}}]

    assert write_adjudication_rows(db, rows, dry_run=True) == 1
    assert db.upserts == []


def test_build_seat_reviews_skips_unrouted_dip():
    mt = {
        "status": "pending",
        "tracks": {
            "routing": {
                "tracks": {
                    "macro": True,
                    "diplomacy": False,
                    "information": False,
                    "national_interest": True,
                    "glasl": True,
                }
            },
            "macro": {"status": "pending"},
            "national_interest": {"status": "pending"},
            "glasl": {"status": "pending"},
        },
        "track_statuses": {
            "macro": "pending",
            "national_interest": "pending",
            "glasl": "pending",
            "diplomacy": "skipped_ne",
            "information": "skipped_ne",
        },
    }
    seats = build_seat_reviews(mt)
    assert seats[SEAT_MACRO]["status"] == "pending"
    assert seats[SEAT_DIP_INFO]["status"] == "skipped"
    assert seats[SEAT_NI_ESC]["status"] == "pending"


def test_missing_orientation_seats_are_routing_aware():
    economic = build_record(
        {
            "id": "a-econ",
            "session_id": "sess-1",
            "team": "blue",
            "move": 1,
            "mechanism": "Economic",
            "goal": "Tariff package",
            "created_at": "2026-01-01T00:00:00Z",
        },
        None,
        {"1": 2026},
        peer_actions=[],
    )
    assert economic["seat_reviews"][SEAT_MACRO]["status"] == "needs_human"
    assert economic["seat_reviews"][SEAT_DIP_INFO]["status"] == "skipped"
    assert economic["seat_reviews"][SEAT_NI_ESC]["status"] == "needs_human"

    diplomatic = build_record(
        {
            "id": "a-dip",
            "session_id": "sess-1",
            "team": "blue",
            "move": 1,
            "mechanism": "Diplomatic",
            "goal": "Summit demarche",
            "created_at": "2026-01-01T00:00:00Z",
        },
        None,
        {"1": 2026},
        peer_actions=[],
    )
    assert diplomatic["seat_reviews"][SEAT_MACRO]["status"] == "skipped"
    assert diplomatic["seat_reviews"][SEAT_DIP_INFO]["status"] == "needs_human"
    assert diplomatic["seat_reviews"][SEAT_NI_ESC]["status"] == "needs_human"


def test_green_proposal_is_pli_candidate_industry_is_not():
    green = {
        "id": "g1",
        "team": "green",
        "mechanism": "Proposal",
        "artifact_type": "proposal",
        "goal": "Green proposal for Blue",
    }
    industry = {
        "id": "i1",
        "team": "industry",
        "mechanism": "Proposal",
        "artifact_type": "proposal",
        "goal": "Industry proposal",
    }
    assert is_green_proposal(green) is True
    assert is_pli_candidate(green) is True
    assert is_pli_candidate(industry) is False


def test_green_proposal_routes_dip_info_macro_skipped():
    green = {
        "id": "g2",
        "team": "green",
        "mechanism": "Proposal",
        "artifact_type": "proposal",
        "goal": "Coordinate export posture",
        "ally_contingencies": "Proposal Details\nObjective: Align partners",
    }
    routing = build_routing_record(green)
    assert routing["instrument_of_power"] == "Diplomatic"
    assert routing["tracks"]["macro"] is False
    assert routing["tracks"]["diplomacy"] is True
    assert routing["tracks"]["information"] is True
    assert routing["artifact_kind"] == "green_proposal"

    stub = build_record(
        {
            **green,
            "session_id": "sess-1",
            "move": 1,
            "created_at": "2026-01-01T00:00:00Z",
        },
        None,
        {"1": 2026},
        peer_actions=[],
    )
    assert stub["seat_reviews"][SEAT_MACRO]["status"] == "skipped"
    assert stub["seat_reviews"][SEAT_DIP_INFO]["status"] == "needs_human"
    assert stub["seat_reviews"][SEAT_NI_ESC]["status"] == "needs_human"
