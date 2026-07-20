# Petrihos Lever Index (PLI)

Automated multi-track adjudication for **Fractured Order** exercises delivered on **Plenum** (Statecraft Simulations Group).

PLI runs parallel tracks after White Cell completeness. Plenum **Instrument of Power** (`actions.mechanism`: Diplomatic / Informational / Military / Economic) sets the **default** lane map — it is not the sole routing authority. Actions may bundle multiple tools or be mislabeled; agent/SME check text and authorities against the label and may open a cited secondary facet or flag `needs_human`:

| Track | When | Output | SME seat |
|-------|------|--------|----------|
| **Macro** | Economic (default) | Lever/instrument, Implementation, Fit, quarterly indicator deltas + charts | Macro / White Cell |
| **Diplomacy index** | Diplomatic (default); secondary facet when cited | Four-field taxonomy code (not a score) | Diplomacy Index & Information SME |
| **Information brief** | Informational (default); secondary facet when cited | Unscored SME text brief | Diplomacy Index & Information SME |
| **National Interest** | Always | Six-domain National War College tier deltas (NI-1…NI-6) | National Interest & Escalation SME |
| **Glasl escalation** | Always | Stage before/after + Δ | National Interest & Escalation SME |

**SME staffing (game director):** National Interest and Escalation are the **same person**; Diplomacy Index and Information are the **same person**. Tracks remain analytically separate; only the human reviewer seat is paired.

**Charts:** use ``pli_charts.py`` and ``generate_fo10_report_charts.py`` (unchanged visual language). Report wrappers only package those charts with auto-traced narratives.

## Repository layout

| Path | Purpose |
|------|---------|
| `engine.py` | Deterministic macro scoring and quarterly trend-line math |
| `submission_timing.py` | Fixed 6-month action cadence → `submission_month` for live FO 2.0 |
| `adjudicate.py` | Cursor agent interpretive layer (DIME-aware classification) |
| `adjudicate_router.py` | Multi-track orchestrator (offline store + session Glasl state) |
| `tracks/` | NI / Glasl / Diplomacy / Info validators + DIME router |
| `schemas/` | Track-specific JSON schemas |
| `run_pli.py` | Supabase orchestrator for live Plenum sessions |
| `pli_charts.py` | **Canonical chart generator** |
| `reports/` | Per-action / per-move / per-simulation PDF+markdown wrappers |
| `codebook/` | Authoritative codebooks + `01_PLI_MASTER_CODEBOOK.md` + annotated bib + `PLENUM_Adjudication_Workflow.png` |
| `generate_master_codebook_pdf.py` | Writes `PLI_Master_Codebook.pdf` to Desktop + `deliverables/` |
| `generate_annotated_bibliography_pdf.py` | Writes `PLI_Annotated_Bibliography.pdf` to Desktop + `deliverables/` |
| `compose_master_codebook.py` | Rebuilds final master markdown from authoritative parts |
| `pli_pdf.py` + `assets/` | Self-contained PDF brand helpers (no sibling-repo dependency) |
| `deliverables/` | In-repo copies of the Master Codebook and Annotated Bibliography PDFs |
| `adjudications/` | Offline adjudication JSON (Plenum-ready shape; gitignored except `.gitkeep`) |
| `pilot/` | FO 1.0 Blue corpus replay (`worksheets.json`, macro + multi-track pilots) |
| `archive/` | Validation logs, live-pilot script, unused track prompt builders |
| `plenum/` | Plenum integration package (live multi-track + SME consoles) |

## Quick start (offline, no agent)

```bash
pip install -r requirements.txt
python -m pytest test_engine.py test_tracks.py -q
python pilot/run_multitrack_pilot.py
python reports/regenerate_all.py
```

Outputs:
- `adjudications/<action_id>.json` — multi-track records
- `reports/out/actions/` — per-action `.md` + `.pdf`
- `reports/out/moves/` — regenerating per-move reports
- `reports/out/simulation/` — regenerating simulation report + existing FO charts
- `deliverables/` — Master Codebook + Annotated Bibliography PDFs (also copied to Desktop)

### Adjudicate one action offline (with worksheets)

```python
from adjudicate_router import adjudicate_multitrack
from reports.generate_action_report import write_action_report
from reports.generate_move_report import write_move_report, load_records
from reports.generate_simulation_report import write_simulation_report

record = adjudicate_multitrack(
    {"id": "M1-A7", "mechanism": "Economic", "goal": "...", "move": 1, "team": "blue"},
    macro_worksheet=...,  # from adjudicate.py or pilot
    ni_worksheet=...,
    glasl_worksheet=...,
)
write_action_report(record)
# Then regenerate move + simulation reports after each action
```

## Run in Plenum (live sessions)

See **[plenum/INTEGRATION.md](plenum/INTEGRATION.md)**. Live multi-track flow is wired:

1. White Cell marks a Blue action complete → TSJ + Verba handoff queues open (app-side; **never block PLI**).
2. GitHub Actions `run_pli.py` writes all tracks into `pli_adjudications` with three `seat_reviews`.
3. **Econ SME** finalizes Macro (or Macro is `skipped` for non-economic routing) → unlocks NI + Dip seats.
4. **NI/Escalation** and **Dip & Info** SMEs finalize in `sme.html`; White Cell Lead sees those tabs read-only.
5. Track routing may mark a track `skipped_ne` while the paired seat stays `skipped` when neither Dip nor Info is routed.

Glasl `stage_after` is proposed on PLI write but **session stage advances only after** the NI/Escalation seat is `approved`/`overridden` (offline: `finalize_glasl_stage`; live: next `run_pli` rehydrates from finalized seats). FO 2.0 `submission_month` uses a **6-month session cadence** (not the Plenum wall-clock timer).

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes (live) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (live) | Service role key (server-side only) |
| `CURSOR_API_KEY` | Yes (live) | Cursor API key for classification agent |
| `PLI_SESSION_ID` | No | Restrict run to one session UUID |
| `PLI_MOVE_YEARS` | No | JSON map, default `{"1":2026,"2":2027,"3":2028}` |
| `PLI_AGENT_MODEL` | No | Default `composer-2.5` |
| `PLI_DRY_RUN` | No | Set `1` to adjudicate without writing |

## Codebook authority (trial vs master)

| Artifact | Role |
|----------|------|
| `02_ECONOMIC_LEVER_MASTER_CODEBOOK.md` | Layer 1–2 lever/instrument authority (agent + compose) |
| `03_PLI_TRIAL_CODEBOOK.md` | Layer 3 Implementation / Fit / precedent + macro tables (engine still uses this) |
| `01_PLI_MASTER_CODEBOOK.md` | Composed SME Master (Parts I–V); rebuild with `compose_master_codebook.py` |
| `04`–`07` | National Interest, Glasl, Diplomacy, Information track codebooks |
| `codebook_data.json` | Live macro tables version `trial-2026-07-14-quarterly` |
| `codebook_data.annual_baseline.json` | Frozen pre-quarterly annual snapshot (`trial-2026-07-02`); not live |
| `engine.annual_baseline.py` | Frozen annual-brick engine paired with the snapshot above |
| `adjudication_data.json` | Multi-track routing/rules + SME pairing (`adjudication-2026-07-17`) |
| `PLI_Annotated_Bibliography.md` | Sources 1–22 across all tracks |

**Timeline note:** FO 2.0 adjudicates on a **quarterly grid** (`2026Q1`–`2034Q4`) with required `submission_month` and multi-action `stacking_policy` (default **`uncapped`**). Move epochs overlap on purpose (Move 1 ends `2030-12`, Move 2 starts `2030-01`). The FO report bridge (`generate_fo10_report_charts.py`) still plots **2027Q1–2032Q4** for the Blue corpus.

## Related repositories

| Repo | Role |
|------|------|
| [ssgwm25/Fractured-Order](https://github.com/ssgwm25/Fractured-Order) | Plenum delivery platform |
| [ssgwm25/petrihos-lever-index](https://github.com/ssgwm25/petrihos-lever-index) | This PLI pipeline |

## License

Internal SSG analytic tooling. Distribution subject to Statecraft Simulations Group policy.
