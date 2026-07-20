# PLI × Plenum integration guide

This document describes how the Petrihos Lever Index pipeline connects to a **Fractured Order on Plenum** deployment (Supabase backend + GitHub Pages frontend).

## Architecture

```
White Cell marks Blue action complete
        │
        ├─► sme_handoffs (TSJ + Verba queues)     ← app-side; never gates PLI
        │
        ▼
GitHub Actions: PLI Adjudication workflow (run_pli.py)
        │
        ├─ agents → macro / Glasl / NI (+ Dip / Info when routed)
        └─ adjudicate_router → multi-track record + seat_reviews
        │
        ▼
Supabase: pli_adjudications
        │
        ├─► sme.html — Econ → NI/Escalation + Dip & Info (after Macro finalize/skip)
        └─► whitecell.html — Lead read-only view of finalized seats
```

Writes to `pli_adjudications` use the **service-role key** in GitHub Actions only. Browser clients can **read** (RLS) and SME consoles can **UPDATE** matching seats; White Cell cannot UPDATE PLI rows.

## Step 1 — Database migrations

Apply in order (repo `data/` copies):

```
data/2026-07-17_pli_adjudications.sql          # multi-track record + seat_reviews
data/2026-07-20_sme_handoffs.sql               # handoffs + SME surface authorize
data/2026-07-20_sme_pli_write_hardening.sql    # deny whitecell PLI UPDATE; tighten handoff UPDATE
```

**Prerequisite:** live-demo RLS helpers (`live_demo_can_read_session`, `live_demo_can_write_session_surface`, `live_demo_has_operator_grant`).

## Step 2 — Frontend surfaces

### SME console (`sme.html` + `src/roles/sme.js`)

Landing **SME ACCESS** roles: Econ, NI/Escalation, Dip & Info, TSJ, Verba (shared operator code).

| SME role | UI |
|----------|-----|
| `sme_econ` | Macro seat Approve / Override |
| `sme_ni_escalation` | NI + Glasl seat (unlocks after Macro `approved`/`overridden`/`skipped`) |
| `sme_diplomacy_information` | Diplomacy + Information seat (same unlock) |
| `sme_tsj` / `sme_verba` | Handoff queues only (non-blocking) |

### White Cell Lead (`whitecell.html`)

Three PLI panels mount with `PLI_VIEW_MODES.LEAD_READONLY` and `canReview === false`:

- `#pliAdjudicationPanel` — Macro
- `#pliDiplomacyInfoPanel` — Dip & Info
- `#pliNiEscalationPanel` — NI/Escalation

### database.js

- `fetchPliAdjudications(sessionId, filters?)`
- `reviewPliSeat(adjudicationId, seatId, review)` — SME seat allowlist + re-finalize guard
- `ensureSmeHandoffs` / `acknowledgeSmeHandoff` — TSJ/Verba only for ack

## Step 3 — GitHub Actions

Use `.github/workflows/pli-adjudicate.yml`. Secrets:

| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `CURSOR_API_KEY` | Cursor API key |

Trigger manually (**Actions → PLI Adjudication → Run workflow**) or rely on the weekday schedule.

## Step 4 — Routing, seats, and Glasl

`run_pli.py` looks up each team's declared **Strategic Orientation** before scoring Fit. Missing orientation still writes a stub row with **routing-aware** `seat_reviews` (Dip `skipped` when not routed; Macro `needs_human` only when routed; NI always `needs_human`).

| Concept | Meaning |
|---------|---------|
| Track `skipped_ne` | Router did not open that track for this IOP |
| Seat `skipped` | No work for that SME seat (e.g. neither Dip nor Info routed) |
| Macro finalize / skip | Unlocks NI and Dip SME seats in the app |

**Glasl:** `stage_after` is recorded on write but session stage does **not** advance until NI/Escalation is finalized. Offline uses `finalize_glasl_stage`; live `run_pli.sync_live_glasl_stage` rehydrates from the newest approved/overridden NI seat (GHA filesystem session JSON is ephemeral).

### FO 2.0 submission month (6-month cadence)

1. Explicit `action.submission_month` / `game_month` if present
2. Otherwise **six-month cadence**: sort session actions by `created_at`, assign `2027-01 + index × 6 months`

### SME staffing (game director)

| SME seat | Tracks |
|----------|--------|
| Econ | Macro |
| National Interest & Escalation | National Interest + Glasl |
| Diplomacy Index & Information | Diplomacy + Information |
| TSJ / Verba | Narrative handoffs only (do not gate PLI) |

## Step 5 — Smoke test

```bash
pip install -r requirements.txt
python -m pytest test_engine.py test_tracks.py test_run_pli_seats.py -q

export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export CURSOR_API_KEY=...
export PLI_DRY_RUN=1
export PLI_SESSION_ID=<uuid>   # optional
python run_pli.py
```

Then: Econ SME → approve Macro → NI/Dip unlock → finalize → White Cell Lead sees read-only outputs. Confirm TSJ/Verba queues can stay pending without blocking PLI.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Workflow skips immediately | Secrets not configured |
| White Cell panel empty / error | Migration not applied or RLS blocks read |
| NI/Dip locked after Macro | Macro seat not yet `approved`/`overridden`/`skipped` |
| Dip seat stuck `needs_human` with no Dip tracks | Stale stub before routing-aware missing-orientation fix — re-run PLI or patch seat |
| All actions `needs_human` | Agent worksheet validation failed twice — SME adjudicates manually |
| Glasl stage resets between GHA runs | Expected until NI seat finalized; then `sync_live_glasl_stage` applies |
| Windows local agent fails | Run `win_bridge_patch.apply()` before Cursor SDK (see `adjudicate.py`) |
