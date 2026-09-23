# GC-11 Regional Research Exports

GC-11 is the publication boundary for canonical research archives. It adds
regional Green attribution without making PLI part of the research product.
Research archives use schema `2.0.0` and format revision `11`.

## Runtime contract

Apply `data/2026-10-01_gc11_research_export_context.sql` after
`data/2026-09-30_gc08_unified_seat_removal_history.sql`. The migration installs
the authenticated, operator-gated `export_gc11_research_context` RPC. The RPC is
read-only and returns:

- raw `session_topology_version`, `green_roster_version`, and
  `green_roster_snapshot`
- raw persisted `green_seat_model`
- a separately labeled effective model and whether it was derived
- immutable unified-seat removal receipts for participant history
- `pli_included: false`

The compatibility map is deliberately narrow:

| Persisted topology | Persisted model | Effective export label |
| --- | --- | --- |
| NULL or 1 | NULL | `unified_v1` |
| 2 | NULL | `regional_pairs_v1` |
| 2 | `shared_facilitator_v1` | `shared_facilitator_v1` |
| Any other combination | Any other value | `unknown` / `unknown_combination` |

Unknown combinations are exported and flagged. They never cause delegation to
be guessed or historical rows to be rewritten.

## Attribution contract

Participant and artifact projections keep these concepts separate:

- parent team (`green` for both regional delegations)
- artifact delegation (`asian_pacific`, `europe`, or NULL for unified/legacy)
- original persisted role
- semantic role
- submitting role
- submitting-seat delegation

For a shared-facilitator submission, the artifact retains its own delegation
while `submitting_seat_delegation_id` remains NULL. Aggregation uses distinct
artifact IDs. The manifest reports counts by delegation plus any conflicting
artifact IDs; it never double-counts a shared submitter as an artifact owner.

Participant exports include live seats and retained unified-seat removal
receipts. Removed rows are explicitly marked `seat_status: removed` and
`history_source: gc08_unified_seat_removal`.

Proposal forwarding provenance remains workflow evidence rather than PLI data.
The `forwarded_utc` projection is sourced from the persisted
`PROPOSAL_FORWARDED` communication or immutable round-zero thread message; it
is never inferred from an adjudication timestamp.

## PLI separation

PLI is a separate tool and deliverable. The research export fetch path does not
query `research_adjudication_content`, `pli_adjudications`, or
`sme_pli_packets`. Research archives do not emit adjudication-content files,
outcome-taxonomy files, PLI scores, PLI outcomes, PLI notes, result narratives,
or packets. Known PLI fields are stripped recursively from compatibility input,
and PLI/adjudication events are excluded from the research event projection.

Every session and cross-session manifest declares `pli_included: false` and
`excluded_data: ["pli"]`. HTML and LaTeX reports state the same boundary.
Cross-session packaging rejects pre-GC-11 archive objects; rebuild those
sessions from persisted source records so legacy PLI files cannot be nested in
a schema 2.0 archive.

## Verification

The human operator runs:

```powershell
npm test -- src/features/export/researchExport.test.js src/services/database.research-export.test.js src/services/database.participants-history.test.js src/services/supabaseMock.gc08-removal-history.test.js tests/unit/gc11-research-export-contract.test.js
npm run build
```

Pass means all focused tests succeed and the build completes. The tests pin the
compatibility mapping, raw/effective model split, regional and shared-facilitator
ownership, removed-seat history, distinct-ID reconciliation, mixed-session
indexing, operator-only SQL surface, and absence of PLI output files/content.

For a staged database check, authenticate as Game Master or White Cell and call:

```sql
select public.export_gc11_research_context('<session-uuid>'::uuid);
```

Pass means the response matches the persisted session topology, roster, and
model, includes the expected removal receipts, and says `"pli_included": false`.
An anonymous caller or a participant without an operator grant must receive
`GC11_OPERATOR_REQUIRED`.

## Containment

If export attribution is wrong, stop new research exports and repair forward.
Keep the RPC, raw session fields, regional delegation columns, workflow history,
and removal receipts. Do not backfill legacy delegation, rewrite a persisted
seat model, weaken operator authorization, or copy PLI data into the archive.
