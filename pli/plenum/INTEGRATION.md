# PLI × Plenum integration guide

This document describes how to connect the Petrihos Lever Index pipeline to a **Fractured Order on Plenum** deployment (Supabase backend + GitHub Pages frontend).

## Architecture

```
Team Scribe submits action (status = submitted)
        │
        ▼
GitHub Actions: PLI Adjudication workflow
        │
        ├─ adjudicate.py  → agent worksheet (JSON)
        └─ engine.py      → scores + quarterly deltas (FO 2.0 stacking)
        │
        ▼
Supabase: pli_adjudications (status = pending | needs_human)
        │
        ▼
White Cell: PLI Adjudication panel (PliReview.js)
        Approve / Override (rationale required)
        │
        ▼
Teams read approved/overridden adjudication of record
```

Writes to `pli_adjudications` use the **service-role key** in GitHub Actions only. Browser clients can **read** (scoped by RLS) and **review** (White Cell / Game Master); they cannot insert adjudication rows.

## Step 1 — Database migration

Apply in the Supabase SQL editor (or your migration runner), in order:

```
plenum/migrations/2026-07-02_pli_adjudications.sql
```

Optional legacy columns from `2026-07-14_action_timer_stamps.sql` are **not** required for FO 2.0 timing (cadence is orchestrator-side). Keep the migration only if other tooling still reads those columns.

**Prerequisite:** `2026-04-08_live_demo_rls_hardening.sql` helper functions must already exist (`live_demo_can_read_session`, `live_demo_can_write_session_surface`, `live_demo_has_operator_grant`).

Verify:

```sql
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'pli_adjudications';
```

## Step 2 — White Cell UI

Copy the review panel into the Plenum app:

```
plenum/ui/PliReview.js  →  src/features/pli/PliReview.js
```

### whitecell.html

Add a sidebar link and section (see `blpetrihos-hub/fractured-order` `pli-integration` branch or the reference patch below):

- Sidebar item: `data-section="pliAdjudication"` — label **PLI Adjudication**
- Section: `#pliAdjudicationSection` with container `#pliAdjudicationPanel`
- Optional pending badge: `#pliBadge`

### whitecell.js

```javascript
import { createPliReview } from '../features/pli/PliReview.js';

// After session mount:
this.pliReview = createPliReview({
    container: document.getElementById('pliAdjudicationPanel'),
    getSessionId: () => this.sessionId,
    getReviewerName: () => this.operatorName
});
this.pliReview.refresh();

// On sidebar navigation to pliAdjudication:
this.pliReview?.refresh();
```

### database.js

Ensure these methods exist (copy from Fractured-Order `pli-integration` if missing):

- `fetchPliAdjudications(sessionId, filters?)`
- `reviewPliAdjudication(adjudicationId, review)`

## Step 3 — GitHub Actions

### Option A — Standalone PLI repo (this repository)

Use `.github/workflows/pli-adjudicate.yml` as committed here. Secrets on **this** repo:

| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `CURSOR_API_KEY` | Cursor API key |

Trigger manually (**Actions → PLI Adjudication → Run workflow**) or rely on the weekday schedule.

### Option B — Submodule inside Fractured-Order

1. Add this repo as `pli/` (submodule or subtree).
2. Copy `.github/workflows/pli-adjudicate.yml` to Fractured-Order `.github/workflows/`.
3. Set `working-directory: pli` on the run step.

## Step 4 — Strategic Orientation dependency

`run_pli.py` looks up each team's declared **Strategic Orientation** artifact before adjudicating actions. Ensure the `actions` table rows include `team`, `move`, `session_id`, and `status='submitted'`, and that orientation artifacts are stored per the live-demo schema.

### FO 2.0 submission month (6-month cadence)

Game-director design: actions are **not** grounded by the Plenum wall-clock timer. `run_pli.py` derives `submission_month` via `submission_timing.py` before the agent/engine run:

1. Explicit `action.submission_month` / `game_month` if present (preferred stamp)
2. Otherwise **six-month cadence**: sort the session’s actions by `created_at`, assign `2027-01 + index × 6 months` (`source: six_month_cadence`)

The orchestrator overwrites worksheet `submission_month` so the agent cannot invent timing. Trace metadata is stored on the adjudication record as `submission_timing`. White Cell shows `clamped_to_horizon` / `onset_beyond_horizon` when applicable.

**Horizon:** the live macro grid runs through **2034Q4**. Beyond-horizon months still clamp; onset past the last quarter flags `needs_human`.

**Live stacking:** `run_pli.py` attaches an uncapped `session_stack` to each new record; `PliReview.js` also recomputes a cumulative path across visible adjudications so SMEs can see higher-order multi-action effects.

### SME staffing (game director)

| SME seat | Tracks |
|----------|--------|
| National Interest & Escalation SME | National Interest + Glasl (same person) |
| Diplomacy Index & Information SME | Diplomacy indexing + Information brief (same person) |
| Macro / White Cell SME | Macroeconomic approve/override |

Machine-readable pairing: `codebook/adjudication_data.json` → `sme_role_pairing`.

### Fractured-Order live wiring (integrated)

When this package is vendored at `Fractured-Order/pli/`:

1. Apply `data/2026-07-17_pli_adjudications.sql` (multi-track `record` + `seat_reviews`).
2. White Cell mounts three SME panels from `src/features/pli/` (macro, Diplomacy+Information, NI+Escalation).
3. GitHub Action `.github/workflows/pli-adjudicate.yml` runs with `working-directory: pli`.
4. `run_pli.py` writes multi-track rows; Glasl session state is scoped per `session_id`.
5. Smoke-test one submitted action: PLI timing source should be `six_month_cadence` (or an explicit stamped month).

## Step 5 — Smoke test

```bash
# Engine self-check (no secrets)
pip install -r requirements.txt
python -m pytest test_engine.py -q

# Dry-run against live Supabase (secrets required)
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export CURSOR_API_KEY=...
export PLI_DRY_RUN=1
export PLI_SESSION_ID=<uuid>   # optional
python run_pli.py
```

Then open White Cell → **PLI Adjudication** and confirm `pending` rows appear with trend charts.

## Multi-track status (this phase)

`adjudicate_router.py` + `tracks/` implement National Interest, Glasl, Diplomacy indexing, and Information briefs **offline**. Live Supabase writes and White Cell panels for those tracks are **not wired yet** — `run_pli.py` remains macro-only against `pli_adjudications`. Offline Glasl stage lives in `adjudications/_session_state.json` (global local file); live Plenum will scope escalation state per `session_id`.

Offline multi-track replay:

```bash
python pilot/run_multitrack_pilot.py
python reports/regenerate_all.py
```

## FO 1.0 pilot replay (offline)

No Supabase required:

```bash
python pilot/run_pilot.py
python generate_sample_output.py   # HTML sample with charts
python generate_fo10_report_charts.py  # FO 1.0 report chart deliverables
```

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Workflow skips immediately | Secrets not configured (by design — see workflow notice) |
| White Cell panel empty / error | Migration not applied or RLS blocks read |
| All actions `needs_human` | Agent worksheet validation failed twice — SME adjudicates manually |
| Windows local agent fails | Run `win_bridge_patch.apply()` before Cursor SDK (see `adjudicate.py`) |
