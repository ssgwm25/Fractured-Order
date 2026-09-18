# GC-02: Regional Green storage foundation

Implementation source dated 2026-09-18; **database verification pending**. This builds
on the existing [GC-01 contract](green-regional-contract.md). Its identity matrix,
legacy inversion, two-Notetaker allocation, and unresolved roster decision remain
the specification. No candidate roster has been approved or merged.

The additive migration is
[`data/2026-09-18_green_regional_storage.sql`](../../data/2026-09-18_green_regional_storage.sql).
Apply it only after the complete setup ledger, including both August 26 migrations.
No existing decision, snapshot, thread round, role, or historical delegation is
backfilled. The existing runtime remains a unified-session client.

## Storage implemented

| Surface | Persisted contract |
| --- | --- |
| Sessions | `session_topology_version`: historical NULL reads as 1; future default 1; 2 reserves regional Green; other values fail. `green_roster_version` references an administrator-recorded approval; `green_roster_snapshot` must exactly match that immutable approval, including approver/time. |
| Approval | `green_roster_approvals` is empty on installation, inaccessible to browser roles, and append-only. Snapshot contains `asian_pacific` and `europe` entity arrays, `aliases`, and `source_references`; entries must be the authority's explicitly approved IDs/labels. This is storage-shape validation, not entity membership validation. |
| Freeze | First seat or evidence insert locks the session row, appends `session_topology_locks`, and records server-owned `topology_frozen_at`. Changing topology/roster is rejected thereafter, including after disconnect/removal. Setup also checks pre-migration evidence across all session-owned tables. Empty game-state initialization and grants alone do not freeze setup. |
| Seats | Nullable `delegation_id`; exactly six explicit regional role IDs from GC-01; no regional role in v1, no unified Green role in v2, no non-Green delegation. An active regional role is unique within its session. Regional seat owner/role/delegation cannot be changed in place. V1 reassignment behavior is retained. |
| Actions, orientations, proposals, RFIs | Immutable `(session_id, team, delegation_id)`. New v2 Green requires `asian_pacific` or `europe`; other teams and v1 require NULL. V2 team strings are canonical. Action payloads include server-generated `ownership_scope` with topology and roster version. |
| Orientation uniqueness | Separate partial unique indexes for NULL and non-NULL delegation. One live unified/non-Green orientation per session/team and one per regional Green delegation; soft-deletion semantics remain unchanged. |
| Review history | `delegation_id` derives from the referenced artifact; session/team and both stored snapshots must match. Review rows reject update/delete. Existing RPC revision checks and before/after snapshots remain intact. |
| Communications | `owner_team`/`delegation_id` describe source artifact ownership. `sender_delegation_id`, `recipient_delegation_id`, and `recipient_scope` describe transport, independently. Thread roots/parents/review references are validated in the same session and recipient thread; server metadata and recipient snapshots retain `ownership_scope`. |
| Timeline | `owner_team`/`delegation_id` identify a linked artifact separately from the existing event `team` (often White Cell). Linked action/RFI/communication session must match. New regional timeline rows are immutable. |
| Links and logs | New action log, action relationship and RFI/action link references must belong to the same session. V2 RFI/action links stay in one ownership scope; Green-to-Green relationship links cannot bridge private regions. Existing hash-chain inputs already include the action's new ownership fields; no historical event or hash is rewritten. |
| Notes | V2 uses `scoped_notetaker_data`, one physical row per session/seat/move. The old `notetaker_data` table is prohibited for every v2 team, preventing mixed-region JSON disclosure. Regional notes have no legacy-note fallback. |

The SQL reader resolves note authority through `auth.uid()` -> participant ->
active session seat, with current heartbeat, lifecycle, and live-session checks.
It ignores mutable global `participants.role`. Notetakers read their own seat's
row only; White Cell with a grant for that session and Game Master can read both.
No new SME powers are granted. Unknown or multiple active seats fail closed.
The 90-second freshness check matches the current default; GC-03 must align the
final seat resolver with the authoritative heartbeat/timeout contract.

For legacy retirement, a first audit insert after deletion retains the freeze
marker without updating the immutable session tombstone. Protected historical
session rows are likewise never changed merely to stamp a freeze timestamp.

For communication scope, `role` is narrower than `delegation`; `team` applies to
non-regional audiences; `session` is explicit `all`; and
`both_green_delegations` is an explicit White Cell announcement with no single
recipient delegation. Bare `green` on unrelated v2 messages is rejected. A linked
RFI answer or proposal reply derives its Green addressee from the source record.
Pending proposal responses still go to White Cell. The August 15 preparation
trigger runs first, preserving recipient redaction and White Cell review.

## Deliberate activation boundary and necessary dependencies

GC-02 installs an explicit server closure for **all authenticated v2 operational
writes**, including writes inside existing SECURITY DEFINER RPCs. No new browser
seat can be claimed, and no regional UI is enabled. The foundation is exercisable
by database-owner fixtures in an isolated rehearsal database after a synthetic
approval. This is not a production activation procedure.
Browser database roles also remain closed when their JWT identity is missing;
an absent `auth.uid()` alone does not establish privileged write authority.

Restrictive RLS intersects existing permissive policies on current session-owned
tables. V2 records are visible only to authorized operators until GC-03 supplies
the reviewed capability matrix; scoped notes have their own seat-bound SELECT
policy. This closure includes research copies, logs, timeline and shared JSON.
No browser filtering is used as an access control. The legacy append RPC's retry
read is also closed for v2; its original implementation is retained privately as
`gc02_unified_append_proposal_thread_message`, without browser EXECUTE grants.

Necessary scope beyond columns is limited to these server closure/immutability
triggers, restrictive policies, scoped-note RPC/reader, raw evidence RPC, and
client guards. Implementing the complete GC-03 capability/claim machinery or
GC-11 publication schema here would expand the numbered task. Those remain
dependencies, not claimed completion:

- **D-02:** explicit exercise-owner roster choice, aliases, source references,
  approver and timestamp. A database administrator records that approval. No
  browser API can approve a roster. Do not insert either candidate merely to
  remove a blocker. Membership validation remains unimplemented pending choice.
- **GC-03:** regional claim/rejoin/heartbeat/removal authorization, semantic
  capabilities, per-scope artifact/communication SELECT and mutation rules, mock
  parity and real Supabase tests. Replace the staging closure only with all these
  controls in place. Preserve the protected retired archive. The current removal
  RPC deletes seats; v2 note references deliberately use `ON DELETE RESTRICT`.
  Regional removal therefore needs a retained-seat/tombstone design before
  activation, rather than deleting note authorship. Regional archive RPCs also
  require the later lifecycle authorization; do not force them past the closure.
- **GC-04–10:** live routes and context, five-orientation completion, regional
  workflow producers, communication audiences, realtime recovery, decks, notes
  UI and PLI attribution. Scoring is unchanged by this migration.
- **GC-11:** versioned CSV/JSONL/HTML/LaTeX publication projections. The current
  research export client refuses v2 instead of silently dropping region fields.
  Unified exports keep their existing format and behavior.

Replacement chain inspected: July 14 integrity and audit; July 29 role resolvers
and returns; August 5 workflow/review; both August 6 communication/thread owners;
August 13 orientation canonicalization and answer trigger; August 14 notification
snapshot; August 15 response preparation/forwarding; August 18 session access
helpers; August 26 training decommission and name snapshots. Existing workflow
normalizers, operator-review RPCs, role resolvers, and PLI logic are retained.
The only prior index replaced is `idx_actions_one_orientation_per_session_team`.

## Setup, note and evidence APIs

`configure_session_green_topology(uuid, integer, text)` is Game Master-only.
The existing create RPC still produces v1 through the column default for old
clients. Configure an empty session to v2 before any seat/evidence write. A v2
setup can have no approved roster, but operational writes then fail; the approved
version and exact snapshot are required even for privileged fixture writes.
Changing an already-frozen session is never the recovery path.

`save_scoped_notetaker_data(uuid, integer, integer, jsonb, jsonb, jsonb, bigint)`
resolves seat/team/delegation server-side and uses an expected revision (0 for
create). It accepts one seat's dynamics, external factors and observations, not
`team_entries` or `participant_entries` wrappers. It remains blocked by the
GC-02 activation trigger. The client has separate `saveScopedNotetakerData` and
`fetchScopedNotetakerData` methods; failures never fall back to shared storage.

`export_green_storage_evidence(uuid)` / `database.fetchRegionalStorageEvidence`
returns raw scoped records under operator authorization in one database snapshot:
session/roster, seats/name snapshots, actions, RFIs, reviews with both snapshots,
communications with full thread metadata, timeline, scoped notes, artifact links, action logs and
the captured research audit chain. Its marker is `storage_evidence_version =
gc02-1`. Save the returned JSON in the approved evidence system. This is a storage
preservation export, not a reconciled research publication or release gate.

## Human-run verification

The human reported 34 passing tests across the original five focused files, then
a Supabase migration failure: SQLSTATE `42601` at the communication ownership
`CASE` expression. The two affected `IF` conditions now parenthesize their SQL
`CASE` expressions. The human subsequently supplied the rollback-check result:
`GC-02 rollback-only check completed`, three NULL object values, and
`has_topology_column = false`. This is evidence that the corrected migration and
included sequential SQL assertions completed and their schema changes rolled
back in that execution. The human then reported a successful run of the separate
installation migration in the actual Supabase project. The subsequent supplied
post-install result shows `green_roster_approvals`, `scoped_notetaker_data`,
`capture_green_communication_scope()`, and `has_topology_column = true`, confirming
those installed objects are present.

These are human-run results; the agent has executed neither SQL nor tests.
The revised JavaScript suite, concurrency checks, hosted authorization evidence,
and roster approval remain pending. This object inspection does not establish
every deployed policy, grant or function definition.
No source revision or migration-ledger artifact was supplied with the results;
no overall gate is declared passed. Do not reapply the accepted migration.
Run from the repository root:

```powershell
npm test -- src/services/database.green-storage.test.js src/services/database.notetaker.test.js src/services/database.research-export.test.js tests/unit/green-regional-contract.test.js tests/unit/green-regional-sql-contract.test.js tests/unit/repo-docs-contract.test.js
git diff --check
```

Pass: all focused tests pass; scope survives normalization/export; note payloads
exclude caller-owned authority; shared-ledger misuse and server errors fail
without fallback; legacy note merges and export tests still pass; no whitespace
errors. The two new SQL source checks prevent recurrence of the reported ungrouped
`CASE` expressions; they do not compile SQL. These tests are not database
authorization evidence.

After confirming the setup ledger on a **dedicated rehearsal database**, use
`PGSERVICE=fractured_order_rehearsal` with a locally configured database-owner
service (credentials stay outside Git and the browser):

```powershell
$env:PGSERVICE = 'fractured_order_rehearsal'
psql -X -v ON_ERROR_STOP=1 -f data/2026-09-18_green_regional_storage.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/green-regional-storage.sql
```

Apply the migration once, only when absent from the verified ledger. Missing
prerequisites or a failed statement must abort; do not disable a trigger or restore
an old policy to get a pass. The SQL regression ends with the assertion-completed
message and `ROLLBACK`, exit code 0. It uses synthetic approval/seat/artifact
fixtures, changes to `authenticated` with distinct identities for actual RLS
SELECT checks, and rolls all fixtures back. No fixture approves the exercise
roster. It checks independent/duplicate orientations, invalid and immutable
scope, frozen setup, roster preservation, cross-session references, review and
thread snapshots, explicit audiences, private note rows, revoked-seat access,
and legacy retirement when the deletion event is the first captured evidence.

### When no separate test project is available

For the reported failed installation, the human confirmed the read-only recovery
query returned three NULLs and `false`. A local convenience file was prepared at
`test-results/green-regional-rollback-check.sql` for checking the existing project.
It combines the corrected migration and SQL regression into **one transaction**,
removes their separate transaction boundaries, and ends with `ROLLBACK`. The
human's successful result is recorded above. The file is a generated, ignored artifact; the migration and
regression remain the canonical sources. Regenerate it if either source changes.

Run its complete contents in one Supabase SQL Editor execution as database owner,
while nobody is using the app. It takes real table locks and can block other
activity. The file sets a 3-second lock timeout, 60-second per-statement timeout,
and 60-second idle-transaction timeout. A timeout/error is a failed check; do not
disable safeguards or execute the remaining statements separately. If a failed
transaction stays open, use `ROLLBACK;` in that connection to release its locks.

Expected final result: `GC-02 rollback-only check completed`, three NULLs, and
`has_topology_column = false`. All schema and row changes, including synthetic
fixtures, must roll back. PostgreSQL sequences can advance despite rollback,
leaving unused numeric ID gaps. Never change this file's final `ROLLBACK` to
`COMMIT`: that would persist synthetic fixtures. Installation, when appropriate,
uses the separate migration file. This check provides sequential database
evidence, not proof of concurrent behavior, hosted authorization or activation.

After the separate installation migration succeeds, rerun the read-only object
query in the recovery section below. Its expected **installed** result is the
two table names, the function name, and `has_topology_column = true`. The rollback
check expects absent objects and must not be rerun over an installed migration.
Preserve the result and migration execution record with the source revision.
The next implementation prompt is GC-03 (secure regional seat claims and
permissions); successful storage installation does not open regional play.

Also capture a two-connection race in the rehearsal environment: hold a first
seat/artifact insertion open in connection A; attempt topology/roster change in
connection B; commit A. B must reject with `GC02_TOPOLOGY_FROZEN`, never commit a
new topology. Repeat with the topology change winning first: the stale-scope
artifact must fail. Fresh contention output is still required; the sequential
SQL regression does not establish race behavior or performance.

Before activation, separately exercise the deployed Supabase REST/RPC boundary
with distinct authenticated identities, stale/revoked seats, White Cell, Game
Master and SME grants, and capture the current migration state and source
revision. The staged SQL suite does not prove GC-03 claims, full workflows,
realtime delivery, exports, or hosted authorization. No gate is declared passed.

## Failure handling and recovery

For the reported `42601` installation failure, the file's `BEGIN`/`COMMIT` wraps
all changes. If the entire file was run together, the failed transaction should
not commit earlier statements. Do not assume this when selected fragments were
run separately. In a new Supabase SQL Editor query, inspect state without changing
data:

```sql
SELECT
    to_regclass('public.green_roster_approvals') AS roster_table,
    to_regclass('public.scoped_notetaker_data') AS scoped_notes_table,
    to_regprocedure('public.capture_green_communication_scope()') AS scope_function,
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sessions'
          AND column_name = 'session_topology_version'
    ) AS has_topology_column;
```

For a first failed full-file installation, expect three NULLs and `false`. Any
present object is a reason to inspect the applied state before retrying; do not
drop objects, make this migration silently idempotent, or paste only the remaining
statements. If the same connection reports an aborted transaction (`25P02`), run
`ROLLBACK;` there to end that failed transaction before the read-only inspection.
Validate the corrected complete file and SQL regression in the dedicated rehearsal
project, or use the single-transaction rollback-only alternative above when no
separate project is available, before retrying installation. A successful installation still does
not establish the authorization gate or activate regional play.

SQLSTATE `23514` with `GC02_*` identifies invalid scope, frozen setup or evidence
mismatch; `42501` identifies missing authority or the deliberate activation
closure; `40001` identifies a note revision conflict; `23505` identifies duplicate
orientation/seat keys. Preserve the database error code and request correlation
from Supabase logs without logging decision/note bodies. Refetch current state
for concurrency conflicts. For ownership or topology errors, stop and review the
session/seat and approved version; never retry under the other region or clear a
freeze. For `ACTIVATION_PENDING_GC03`, keep operating a v1 session until the later
authorization work is reviewed and verified.

Rollback is containment plus a forward fix. Retain columns, indexes, approvals,
freeze markers, scoped note rows and immutable scope/snapshots. Keep the raw
evidence RPC available to authorized operators. Do not merge regional records
into unified Green or return scoped notes to the legacy JSON ledger. See the
[rollback runbook](../supabase-rollback.md).
