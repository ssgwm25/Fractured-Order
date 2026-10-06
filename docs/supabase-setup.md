# Supabase Setup

This app is backend-required. Browser clients use Supabase anonymous auth, then operate through session-code lookup, seat-claim RPCs, operator grants, and row-level security.

## Credential Boundary

Use these browser-public Vite values:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

The anon key is safe-to-expose browser configuration. It is stored as a GitHub repository secret for workflow injection, but it is still public after the static build. Never use a service-role/backend key in `.env.local`, GitHub Pages secrets, HTML, JavaScript, or any `VITE_*` variable.

## Required Supabase Settings

- Anonymous auth enabled.
- Realtime enabled for the live demo tables used by the app.
- Realtime broadcast enabled for the session-scoped Intercom channel used by the operator Intercom plugin.
- Private Storage bucket `intercom-announcements` available for Intercom clips larger than the inline broadcast threshold.
- Session Recorder does not require a Supabase Storage bucket; it records a local browser audio download and stores only artifact metadata/reference rows for research export.
- RLS enabled on session, participant, game-state, action, request, artifact-workflow-review, communication, timeline, notetaker, operator-grant, and research tables.
- Privileged operator writes kept behind RPCs.

## SQL Setup Order

The only supported operational path is the forward-only dated migration ledger
below, applied to an already-provisioned database and recorded in the deployment
change log. Do not sort or omit files; same-day migrations have intentional
ordering. Apply each migration only when it is absent from that environment's
verified migration record; reapply a function/policy owner only when a reviewed
repair step below explicitly requires it.

Apply and verify this ledger in a dedicated rehearsal project before deploying
the corresponding frontend. Production rollout is migration-first. After any
workflow write, containment is frontend-first rollback while additive schema
and immutable review, proposal-thread, and RFI history remain in place.

This repository does not currently contain a supported single-file greenfield
schema. `data/COMPLETE_SCHEMA.sql`, `data/updated_supabase_schema.sql`, and
`data/updated_supabase_migration.sql` are deprecated historical snapshots with
superseded broad policies and partial workflow behavior. They are not a base,
shortcut, recovery path, or complete current install. `data/CURRENT_BUILD_SUPABASE_PATCH.sql`
is also not part of the normal ledger; use it only in a separately reviewed
legacy-project repair. If a project does not already have the pre-ledger base
tables, stop and obtain a verified base snapshot rather than assembling one
from these historical files.

Apply the authoritative ledger in this exact order:

1. `data/2026-04-07_secure_session_join_contract.sql`
2. `data/2026-04-08_live_demo_role_seat_contract.sql`
3. `data/2026-04-08_live_demo_rls_hardening.sql`
4. `data/2026-04-08_facilitator_join_session_access_fix.sql`
5. `data/2026-04-08_operator_auth_digest_fix.sql`
6. `data/2026-04-09_global_white_cell_role_contract.sql`
7. `data/2026-04-16_game_master_remove_session_participant.sql`
8. `data/2026-04-17_seat_claim_role_input_normalization.sql`
9. `data/2026-04-17_white_cell_backend_alignment.sql`
10. `data/2026-06-02_operator_code_runtime_config_table.sql`
11. `data/2026-06-03_proposal_response_finalization_lock.sql`
12. `data/2026-06-04_research_export_capture.sql`
13. `data/2026-06-18_participant_auth_identity_reconcile.sql`
14. `data/2026-06-25_industry_team_role_contract.sql`
15. `data/2026-06-25_scribe_action_submit_policy.sql`
16. `data/2026-06-25_participant_role_resolver_normalization.sql`
17. `data/2026-06-25_timer_allocations_game_state.sql`
18. `data/2026-06-28_white_cell_plugins_game_state.sql`
19. `data/2026-06-28_intercom_storage_bucket.sql`
20. `data/2026-07-14_action_artifact_workflow_integrity.sql`
21. `data/2026-07-17_pli_adjudications.sql`
22. `data/2026-07-20_sme_handoffs.sql`
23. `data/2026-07-20_staff_access_code_only.sql`
24. `data/2026-07-20_sme_pli_write_hardening.sql`
25. `data/2026-07-20_operator_grants_sme_surface.sql`
26. `data/2026-07-21_scribe_proposal_submit_policy.sql`
27. `data/2026-07-29_sme_handoffs_backfill.sql`
28. `data/2026-07-29_industry_submission_permissions.sql`
29. `data/2026-07-29_return_action_to_blue.sql`
30. `data/2026-08-05_team_neutral_artifact_review.sql`
31. `data/2026-08-06_facilitator_rfi_communications.sql`
32. `data/2026-08-06_proposal_recipient_threads.sql`
33. `data/2026-08-11_requests_responded_by_schema_repair.sql`
34. `data/2026-08-12_session_archive_transition.sql`
35. `data/2026-08-13_rfi_answer_completion_trigger.sql`
36. `data/2026-08-13_strategic_orientation_team_canonicalization.sql`
37. `data/2026-08-13_action_notification_delivery.sql`
38. `data/2026-08-13_action_notification_type_contract.sql`
39. `data/2026-08-14_action_notification_title_snapshot.sql`
40. `data/2026-08-15_proposal_forwarding_integrity.sql`
41. `data/2026-08-17_game_master_session_retirement.sql`
42. `data/2026-08-18_ssg_training_session.sql`
43. `data/2026-08-18_training_mastery_progress.sql`
44. `data/2026-08-25_sme_pli_packets.sql`
45. `data/2026-08-26_decommission_ssg_training.sql`
46. `data/2026-08-26_session_role_name_snapshots.sql`
47. `data/2026-09-18_green_regional_storage.sql`
48. `data/2026-09-19_green_regional_authorization.sql`
49. `data/2026-09-20_gc03_terminal_revision_conflicts.sql`
50. `data/2026-09-21_gc03_recipient_forward_uniqueness.sql`
51. `data/2026-09-22_gc04_session_context.sql`
52. `data/2026-09-23_gc04_legacy_session_topology.sql`
53. `data/2026-09-24_gc04a_shared_facilitator.sql`
54. `data/2026-09-25_gc05_regional_orientations.sql`
55. `data/2026-09-26_gc06_regional_proposals.sql`
56. `data/2026-09-27_gc06_released_thread_round_order.sql`
57. `data/2026-09-28_gc07_regional_messaging.sql`
58. `data/2026-09-29_gc08_session_administration.sql`
59. `data/2026-09-30_gc08_unified_seat_removal_history.sql`
60. `data/2026-10-01_gc11_research_export_context.sql`
61. `data/2026-10-02_pli_regional_dispatch_and_realtime.sql`
62. `data/2026-10-03_sme_instant_action_delivery.sql`
63. `data/2026-10-04_sme_pli_regional_read.sql`
64. `data/2026-10-05_green_proposal_activity_projection.sql`
65. `data/2026-10-06_industry_proposals.sql`

The October 6 Industry proposal migration validates the completed Industry
Strategic Plan reference and required Blue/Red recipients, assigns proposal
numbers and baseline references under an advisory transaction lock, prevents a
second sector proposal until Proposal 1 is completed, and blocks move advance
until all three Industry sectors have a completed proposal. Its restrictive
policies apply proposal visibility to the action and related review, audit,
timeline, and communication rows. See
[Industry proposals](architecture/industry-proposals.md) for the workflow and
rehearsal checks. No historical action is rewritten.

The October 5 proposal projection repair recreates
`prepare_proposal_communication()` so Green recipient snapshots use `objective`
and omit the Industry-only `proposedActivity` field. Industry snapshots prefer a
nonempty structured `artifact_payload.proposal.proposedActivity` and retain the
legacy text fallback. The migration changes only the derived communication
projection: it does not update historical actions, `ally_contingencies`, PLI
tables, or existing communications. Recipient and Facilitator views defensively
suppress all Industry-only detail rows on existing Green snapshots, including
shifted legacy labels and `proposedActivity`; do not rewrite historical action or
PLI records to repair their display. PLI continues reading the canonical
`actions` row, including `goal`, `expected_outcomes`, and `ally_contingencies`.

The October 4 SME read repair lets a matching SME operator grant pass the
restrictive `green_storage_boundary` on `pli_adjudications`, `sme_handoffs`
and `sme_pli_packets` in topology-2 sessions. White Cell already passed as
`green_storage_operator`; SMEs did not, so Econ/NI/Dip/TSJ/Verba queues were
empty while Lead still saw pending review. Pass: `green_can_read_record` for
those tables returns true for an SME grant holder on a regional session.

The October 3 SME delivery repair opens TSJ/Verba handoffs and a
queue-visible `pli_adjudications` stub in the same transaction as White Cell
accept (every completed non-orientation action, not only Blue). Industry
proposals still skip the PLI stub. Scoring replaces the stub later; a failed
handoff or stub write warns and does not roll back the accept. Pass: accepting
an action in an active live session immediately inserts two `sme_handoffs`
rows and one `queue_stub` adjudication, and SME consoles refresh on the
existing realtime publication.

The October 2 PLI repair removes the topology-v1 requirement from
`green_authorize_derived_operation` so White Cell action-complete can dispatch
the PLI Adjudication workflow for regional sessions; the caller must still be
authenticated and hold a Game Master or matching White Cell grant on an active,
unprotected live exercise. It also adds `pli_adjudications`, `sme_handoffs` and
`sme_pli_packets` to the `supabase_realtime` publication so SME consoles refresh
on change. Existing RLS still filters every realtime event. Pass: a White Cell
completion in a topology-2 session returns `200 dispatched` from
`trigger-pli-adjudication`, and `pg_publication_tables` lists the three tables.

GC-11 adds the operator-only `export_gc11_research_context` projection used by
research archive schema 2.0. It preserves raw topology, roster, persisted Green
seat model, and immutable unified-seat removal evidence, and returns the
effective compatibility label separately. The function does not query or expose
PLI tables. Apply it only after both GC-08 migrations, then follow
[GC-11 research export verification](architecture/gc11-research-exports.md).

The September 30 GC08 repair atomically retains immutable, private unified-seat
removal receipts before legacy live-seat deletion. It does not backfill deleted
history or change regional tombstones, capacity or claim/restore contracts.
Follow [unified removal verification](architecture/gc08-unified-seat-removal-repair.md)
for the narrow tests, rollback-only installed SQL checks and pending fresh hosted
fixtures. Implementation is supplied; migration and test evidence remain required.

GC-08 adds Game Master-authorized roster discovery and atomic, idempotent session
creation. The old `create_live_demo_session(TEXT,TEXT,TEXT)` remains unified.
The new UI requires `list_approved_green_rosters()` and
`create_configured_live_session(TEXT,TEXT,TEXT,TEXT,TEXT,UUID)`; missing RPCs block
creation rather than falling back to a different setup. No approvals are seeded.
Apply only after GC-04A through GC-07, including the September 27 repair. See
[GC-08 setup, recovery and verification](architecture/gc08-session-administration.md).
Implementation and tests are supplied; no fresh migration/test evidence is claimed.

GC-07 enables scoped Green Facilitator RFIs and direct messages with explicit
region/revision RPCs in shared and paired sessions. White Cell audiences resolve
to a delegation, both Green delegations, or an individual role; a Blue/Red request
to inform Green still needs White Cell approval and resolves to both regions.
It retains the GC-05/06 helpers, proposal approvals and private-note boundary.
Apply once after September 27, then use the
[GC-07 verification runbook](architecture/gc07-regional-messaging.md). No migration
or gate execution is implied by this ledger entry. Do not reapply older helper
definitions over this stage. Unified sessions retain their existing RPC/table paths.

GC-06 adds proposal-specific regional draft/handoff/edit/submission and approved
recipient-thread authority. Apply after GC-05; it preserves orientations and
keeps shared RFIs, direct creation and notes closed. It requires a real approved
registry entry frozen on the session; it does not register or convert a roster.
Regional recipient approvals are now unique per proposal, recipient and revision;
unified history keeps the previous rule. See the [GC-06 runbook](architecture/gc06-regional-proposals.md)
for exact verification, required evidence and drift handling. The September 27
repair makes released replies outrank their retained review requests at the same
round number. Unreviewed higher rounds still block a new response; stale-parent
conflicts remain PT409. Apply this repair before rerunning the GC-06 SQL suite.

GC-05 adds revision-bound regional Scribe handoff and Facilitator submission for
Strategic Orientation, its White Cell return/correction cycle, and a database
move/phase gate requiring five regional or four unified submissions. Apply once
after the complete ledger above, before the matching frontend. It preserves
GC-04A's proposal/thread/RFI/direct-message denials and does not create an
operational roster or creation UI. See the [GC-05 verification runbook](architecture/gc05-regional-orientations.md)
for the self-contained SQL rehearsal, local commands, pass conditions and evidence
still required. No GC-05 migration or tests were executed by the agent.

GC-04A adds the explicit `shared_facilitator_v1` staffing model, authenticated
setup/claim/restore checks and a single shared Green Facilitator seat. Existing
sessions remain unified or paired regional sessions. Apply once after September
23 and retain the September 20/21 workflow repairs. Its operational mutations
remain closed at this foundation stage: GC-05 adds orientation-only authority,
GC-06 adds proposals/approved threads, and GC-07 adds scoped RFIs/direct messages.
Each later migration must preserve earlier capabilities and remaining denials;
Game Master atomic creation/UI is supplied by GC-08 and requires its migration. See the
[GC-04A installation and verification runbook](architecture/gc04a-shared-facilitator.md)
for the self-contained SQL Editor suite and exact local commands. No migration
or verification was executed by the agent for GC-04A.

The September 23 compatibility fix reports historical NULL topology as version 1
in authenticated lookup and seat-restore responses, matching GC-02 semantics.
It does not update historical rows or convert unified Green sessions to regional.
Apply this new file once after September 22; do not rerun September 22's CREATE
FUNCTION migration. No frontend rebuild is required for this database fix.
See the [legacy-session verification procedure](architecture/gc04-regional-context.md#legacy-session-topology-compatibility)
for the PLENUM2026 read-only check, regression commands and expected results.

GC-04 adds topology to code lookup and authenticated seat restoration before
participant workspace startup. Apply its migration before the matching frontend;
missing topology/RPC blocks joining. See [GC-04 context verification](architecture/gc04-regional-context.md)
for commands, expected results, recovery and remaining evidence. No GC-04 gate
has been verified by the coding agent.

The September 21 GC-03 dependency repairs the July proposal-wide forward index
that prevented the August RPC from approving a second recipient. It installs
`communications_proposal_recipient_root_unique` for one forward per proposal
and recipient, and limits `idx_communications_one_forward_per_proposal` to
historical messages without a thread. No existing message is changed. Unexpected
index drift or duplicate evidence aborts the migration; never delete history to
force installation. Run `tests/sql/gc03-recipient-forward-uniqueness.sql` afterward
to verify the installed expressions on rollback-only temporary fixtures, then
the hosted completion matrix. See the completion guide for exact commands.

If GC-03 provisioning stops at an anonymous Auth rate limit before session setup,
use the completion guide's `resume-auth RUN_UUID` workflow after the limit
recovers. It refreshes saved identities and creates only missing actors, retains
prior reports, and refuses any run that already attempted fixture setup. Do not
raise Auth limits, change policies or create repeated fresh runs to bypass this
failure. Token checkpoints remain local under ignored `test-results/`.

The GC-02 migration installs staged regional storage, not regional play.
Read [Regional Green storage](architecture/green-regional-storage.md) before
applying it. No roster is seeded or approved; all authenticated v2 operational
writes remain closed until GC-03 is installed. Unified sessions retain their existing UI.
The two orientation indexes described there replace the July session/team index.

GC-03 replaces the staging closure with seat-derived regional authorization.
Read [Regional Green authorization](architecture/green-regional-authorization.md)
for exact verification commands, retained revocations, the policy inventory and
remaining activation dependencies. The human reported 69 passing tests across
seven focused files, the expected rollback-check screenshot, and subsequently
all three installation markers as `true` after the standalone migration steps.
GC-03 markers are now present in the queried database; do not reapply the migration.
The human subsequently passed both two-connection contention checks and the
committed-count check in the existing project on `2026-09-18`, recorded in
[hosted verification evidence](architecture/gc03-hosted-verification.md#evidence-limits).
The focused hosted participant API matrix also passed on `2026-09-18`, with
112 recorded HTTP responses and the expected six Edge authorization denials.
The later completion record supplies the broader hosted lifecycle/workflow
evidence. The human also supplied the rollback-only recipient-index assertion
success screenshot, completing the requested GC-03 verification evidence.
Do not reconstruct missing historical migration transcripts. The human owns
prompt sign-off; no prompt-status table is changed here.
An approved roster and later regional UI/workflow gates are still required.
Do not reapply GC-02 over GC-03 or expose its private compatibility functions.
GC-03 also changes `trigger-pli-adjudication` and `pli-report-narrative`: deploy
their guarded entrypoints after the migration. The user chose the existing
project because no rehearsal database is available; the authorization notes
provide explicit project-targeted deployment commands and remaining limitations.
The human supplied successful CLI deployments of both functions to
`gsromgrxgrwwfywaoyme`, including the shared authorization helper in both uploads.
The API report verifies HTTP 403 authorization responses from both functions
for both regional Facilitators and the other-session identity. Deployment
version IDs and matching no-dispatch denial logs are now recorded in the
successful completion log report linked below.
They use Supabase's built-in `SUPABASE_URL` and `SUPABASE_ANON_KEY` to validate the
caller through PostgREST and deny regional derived work pending scoped inputs.
The database migration alone does not close the old Edge dispatch path.

For the remaining GC-03 evidence, use the
[completion verification procedure](architecture/gc03-completion-verification.md).
Run `78414608-28d8-4e03-b247-b38e5fec3b49` passed the complete hosted matrix and
archived all five sessions. The read-only log retry
`logs-results-1789765902941.json` matches all six denials to deployed versions
5 (adjudication) and 8 (narrative). The human also supplied 45 passing offline
tests. Both database repairs are confirmed by the live inventory. Keep all
successful and failed reports and archived history. Do not repeat installation,
Auth provisioning or hosted tests for this completed run. The completion record
records the final rollback-only SQL success screenshot and readiness for human
GC-03 sign-off. No additional verification run is required for this implementation.

The August 6 proposal-recipient migration owns the base communications RLS and
proposal-review behavior; GC-02 intersects those policies with its regional
restriction and wraps the append RPC. The August 11 migration is an
additive request-schema repair and does not replace any policy or function. The
August 12 migration replaces evidence-destroying session deletion with audited
archival. The August 17 migration adds the Game Master-only archived-session
retirement state: the UI calls it Delete, while the database retains the session
row and all dependent evidence with status `deleted` and a `SESSION_DELETED`
audit event. The first August 13 migration prevents the legacy linked-response
trigger from rewriting a terminal RFI after the protected answer procedure has
already completed it. The next August 13 migration canonicalizes four-team
Strategic Orientation types before constraint enforcement. The action-delivery
migration atomically completes Blue/Red actions and delivers only the authored
Green/Industry notification requests approved by White Cell. The final repair
extends the communications type constraint to admit those `ACTION_NOTIFICATION`
records while retaining every previously supported type. If July 14, August
5, or the earlier August 6 policy migration
is reapplied during repair, reapply
`data/2026-08-06_proposal_recipient_threads.sql`, then apply
`data/2026-08-11_requests_responded_by_schema_repair.sql`, then apply
`data/2026-08-12_session_archive_transition.sql`, then apply
`data/2026-08-13_rfi_answer_completion_trigger.sql`, then apply
`data/2026-08-13_strategic_orientation_team_canonicalization.sql`, then apply
`data/2026-08-13_action_notification_delivery.sql`, then apply
`data/2026-08-13_action_notification_type_contract.sql`, then apply
`data/2026-08-14_action_notification_title_snapshot.sql`, then apply
`data/2026-08-15_proposal_forwarding_integrity.sql`, then apply
`data/2026-08-17_game_master_session_retirement.sql`, then apply
`data/2026-08-18_ssg_training_session.sql`, then apply
`data/2026-08-18_training_mastery_progress.sql`, then apply
`data/2026-08-25_sme_pli_packets.sql`, then apply
`data/2026-08-26_decommission_ssg_training.sql`, then apply
`data/2026-08-26_session_role_name_snapshots.sql`. The GC-02 migration is a
one-time additive owner: do not blindly reapply it during repair. If an earlier
owner is reapplied after GC-02, stop and review the regional wrapper, restrictive
policies, trigger ordering and orientation indexes before further operation;
reinstall them through a reviewed forward repair. Verify RPCs,
triggers, policies, columns, and grants before a demo; a missing migration
record or failed verification is a deployment blocker.

## Historical SSG Training Migrations (Superseded)

This section documents the historical state established by the August 18
migrations because they remain forward-migration prerequisites. It is not the
current runtime contract. Do not stop at this state or restore its RPCs,
policies, grants, template code, or browser activation path. The required
August 26 decommission described immediately below supersedes it.

Apply `data/2026-08-18_ssg_training_session.sql` after the Game Master session
retirement migration, followed by
`data/2026-08-18_training_mastery_progress.sql`. The pair adds the constrained `live_exercise` and
`training_template` classifications plus the `is_protected` database flag,
then idempotently creates or repairs the single active `TRAINING2026` template
at its reserved UUID. A pre-existing different session using that code blocks
the migration; it is never relabelled or treated as fabricated training data.

`TRAINING2026` is code-restricted, not identity-verified. Anonymous Supabase
auth remains the browser identity boundary. The shared code opens only the
training bootstrap RPC; RLS and every mutation RPC additionally require the
attempt's `auth_user_id` to equal `auth.uid()`. The 12 allowed profiles are the
cross-product of Blue, Red, Green, and Industry with semantic Scribe,
Facilitator, and Notetaker roles. Operator, SME, White Cell, and Observer roles
are not accepted training profiles.

Both initial start/resume and refresh activation return the protected
session-experience metadata (`training_template`, `is_protected = true`, and
`ssg-training`). `get_training_attempt_bootstrap` accepts an attempt ID only as
a lookup key and returns data only when its owner still matches `auth.uid()`;
browser storage or a URL flag is never sufficient to activate training.

The template is not a live exercise and must not be returned by the public live
join RPC or active/archived operator lists. SQL triggers reject every update or
delete of the protected row and reject any `game_state` or
`session_participants` insert/update that references it. Starting or resuming
training writes only `training_attempts` and bounded
`training_progress_events`; it does not claim a participant seat, start a
heartbeat, create game state, join a Realtime channel, or append research audit
evidence. Those two training tables are deliberately absent from research
export queries and session evidence manifests. Progress rows contain only an
allowlisted event type, bounded step identifier, bounded result code, profile,
attempt ownership, and server timestamp—never full answers, narration,
transcripts, or dummy artifact bodies. Every mutation compares an expected
attempt revision while holding the owner row lock. A stale revision fails
without changing progress; the browser refetches the owner bootstrap and never
overwrites the newer revision.

`reset_training_attempt` requires the selected attempt ID, `auth.uid()` owner,
and expected revision. It retires that one attempt as `reset` and creates a
pristine attempt for the same semantic profile in one transaction. It never
deletes history or touches another role, team, owner, or tab. Completion is
guarded by all seven versioned curriculum-step mastery events and remains
training-only; it is absent from live evidence and research exports.

Verify the contract after applying the migration:

```sql
select id, name, status, session_code, session_classification, is_protected,
       deleted_at
from public.sessions
where id = '00000000-0000-4000-8000-000000002026'::uuid;

select trigger_name, event_object_table, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'protect_training_template_session',
    'prevent_training_template_game_state',
    'prevent_training_template_participant_seat',
    'bound_training_progress_events'
  )
order by trigger_name, event_manipulation;

select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('training_attempts', 'training_progress_events')
order by tablename, policyname;

select p.oid::regprocedure::text as function_signature,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'start_or_resume_training_attempt',
    'get_training_attempt_bootstrap',
    'record_training_progress_event',
    'reset_training_attempt'
  )
order by function_signature;

select count(*) as forbidden_live_rows
from (
  select session_id from public.game_state
  union all
  select session_id from public.session_participants
) live_rows
where session_id = '00000000-0000-4000-8000-000000002026'::uuid;
```

Pass: the reserved template appears exactly once as active,
`training_template`, and protected; all four trigger names are represented;
both training tables expose owner-only SELECT policies and no authenticated
INSERT, UPDATE, or DELETE policy; all four exact RPC signatures are executable by
`authenticated`; and `forbidden_live_rows` is zero. Rehearse two anonymous
identities with the exact uppercase code: each receives a different attempt,
each reads only its own rows, an invalid or differently cased code returns the
same generic access error, and using the other learner's attempt UUID cannot
read or mutate it.

Operationally, `TRAINING_REVISION_CONFLICT` means another tab or request has a
newer owner revision: refresh the attempt bootstrap and preserve the newer
server state. A reset failure leaves the selected attempt unchanged; do not
manually update status or revision. Repeated media-degraded or mastery writes
with the same event key are successful idempotent reads, not duplicate events.

Browser logs use the single `training_event` message with a bounded
`request_id`, event, semantic role, team, step ID, result code, reason code,
and non-negative revision. The only event names are `start`,
`media_degradation`, `step_mastery`, `reset`, `completion`, `failure`, and
`role_switch`; unknown names are dropped. Investigate `revision_conflict`,
`progress_reconcile_failed`, `progress_write_failed`, `curriculum_mismatch`, `activation_failed`,
`reset_failed`, and `resume_rebuild_failed` by correlating the request ID with
the owner-scoped attempt revision. Never add answer text, narration,
transcripts, or fixture bodies to these records. Counts of the bounded
`training_progress_events.event_type` values are the authoritative operational
event totals; those rows remain outside live evidence and research exports.

## Retired SSG Training Archive And Reusable Session Code

Apply `data/2026-08-26_decommission_ssg_training.sql` after the historical
training migrations. The forward-only decommission removes the training RPC
surface and authenticated access to the historical training tables, converts
the fixed template into a protected, non-joinable archive, and clears its
session code and code metadata.

`TRAINING2026` is no longer reserved and has no special browser or database
behavior. It may be assigned to an ordinary `live_exercise` and then uses the
normal session lookup, seat, audit, export, archive, and deletion contracts.
Historical attempt and progress rows remain stored for administrators; they
are not relabelled as live evidence and are not deleted by the decommission.

Verify the current archive and removed access surface:

```sql
select id, name, status, session_code, session_classification, is_protected,
       deleted_at
from public.sessions
where id = '00000000-0000-4000-8000-000000002026'::uuid;

select trigger_name, event_object_table, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'protect_protected_session',
    'prevent_non_live_game_state',
    'prevent_non_live_participant_seat'
  )
order by trigger_name, event_manipulation;

select p.oid::regprocedure::text as forbidden_training_rpc
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'start_or_resume_training_attempt',
    'get_training_attempt_bootstrap',
    'record_training_progress_event',
    'reset_training_attempt'
  )
order by forbidden_training_rpc;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('training_attempts', 'training_progress_events')
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

Pass: the fixed UUID appears exactly once as `archived`,
`retired_training_archive`, protected, and code-free; all three current trigger
names are represented for their declared events; `forbidden_training_rpc` has
zero rows; and the grants query has zero rows. If `TRAINING2026` is assigned to
a new live session, the ordinary join lookup must return that session without
starting or resuming a historical training attempt.

## Session-Role Display-Name Snapshots

Apply `data/2026-08-26_session_role_name_snapshots.sql` after the decommission.
It backfills `session_participants.display_name_snapshot`, captures the current
participant name whenever a session-role seat is first claimed or reassigned,
and rejects later edits to a populated snapshot. Active rosters prefer that
immutable value over the mutable browser identity in `participants.name`, so a
person's name remains attached to the specific role they used in that session.

Verify the trigger contract:

```sql
select trigger_name, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'session_participants'
  and trigger_name = 'capture_session_role_display_name_snapshot'
order by event_manipulation;
```

Pass: exactly two rows are returned, one for `INSERT` and one for `UPDATE`.

## Session Archival And Game Master Deletion

Apply `data/2026-08-12_session_archive_transition.sql` before deploying the
matching frontend. Game Master and White Cell session controls then archive a
session instead of deleting it. Archival changes the session status to
`archived`, closes its active participant seats, blocks further live writes,
and appends `SESSION_CLOSED` to the immutable research event chain. All session
records and dependent evidence remain stored.

Apply `data/2026-08-17_game_master_session_retirement.sql` after the archive
transition. The Game Master console then lists archived sessions separately and
offers Delete only on archived sessions. Delete changes status to `deleted`,
records `deleted_at`, and appends `SESSION_DELETED`; it does not physically
delete the session or a dependent row. White Cell may archive but cannot delete.

Export and validate the research archive before selecting Archive. Archived
sessions leave active lists, cannot be joined, and remain visible to Game Master
for review or deletion. Deleted sessions leave both Game Master lists but remain
available as database evidence; no browser RPC hard-deletes them.

Verify the contract after applying both lifecycle migrations:

```sql
select proname
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public'
  and proname in ('archive_live_demo_session', 'delete_live_demo_session')
order by proname;

select id, name, status, updated_at, deleted_at
from public.sessions
where id = '<session-uuid>';

select event_type, entity_type, entity_id, event_ts_utc
from public.research_audit_event_log
where session_id = '<session-uuid>'
order by event_id desc
limit 2;
```

Pass after Archive: both RPC names are returned; the selected session has status
`archived`; and its newest audit row is `SESSION_CLOSED` for entity type
`session`. Pass after Game Master Delete: the same row has status `deleted`,
`deleted_at` is populated, the newest audit row is `SESSION_DELETED`, the prior
`SESSION_CLOSED` row remains, and existing actions, RFIs, timeline rows,
participant seats, and research rows are still present.

## Intercom Storage

The Intercom plugin records short browser audio clips. Clips at or below 48 KB are sent as base64 metadata over the session Realtime broadcast channel. Larger clips upload to the private `intercom-announcements` bucket and broadcast only lightweight metadata.

Storage object paths use:

```text
<session-uuid>/<announcement-id>.<webm|ogg|mp4>
```

Apply `data/2026-06-28_intercom_storage_bucket.sql` after the plugin-state game-state patch. Pass: authenticated Scribe clients can read clips for their joined session, and White Cell or Game Master operators with a valid grant can upload clips for that session. No service-role key or backend-only credential is required in the browser.

If the operator UI reports `Bucket not found` when sending to Scribes, the browser recorded a clip larger than the inline threshold and the Supabase project is missing `intercom-announcements`. Apply `data/2026-06-28_intercom_storage_bucket.sql` in the Supabase SQL editor, then retry.

Do not execute any of the deprecated consolidated SQL snapshots named above.
Their headers intentionally direct operators back to the dated ledger.

## Action Artifact And Workflow Integrity

Apply `data/2026-07-14_action_artifact_workflow_integrity.sql` to make action, proposal, Strategic Orientation, forecast, and move-response meaning explicit in the database. The migration deterministically classifies existing rows from the current legacy prefixes, adds structured payload and workflow fields, makes lifecycle timestamps server-owned, rejects status regression and post-submission content changes, and logs every action mutation. Draft updates and submission now filter on the returned `row_version`; a stale browser receives a refresh-before-save error instead of overwriting a newer revision.

After the workflow-integrity migration, apply `data/2026-07-21_scribe_proposal_submit_policy.sql` and `data/2026-07-29_industry_submission_permissions.sql`. The first permits the legacy `*_scribe` Facilitator seat to submit a Scribe-forwarded proposal. The second normalizes existing Industry seat identities and reasserts Industry draft/submission permissions. The later August 6 migration intentionally replaces its older RFI policies. None of these migrations permits cross-team writes or participant adjudication.

The `actions_artifact_team_check` constraint deliberately retains the original
database compatibility classification: Blue Strategic Orientation rows use
`strategic_orientation_selection`, while Red, Green, and Industry use
`strategic_orientation_forecast`. Contract-v2 payloads still retain each
team's complete own-orientation, forecast, and narrative envelope in
`artifact_payload`; do not broaden or drop the team constraint. A Blue insert
failing this constraint indicates a stale frontend that classified the
combined envelope as a forecast, not a missing database migration.

The migration fails closed instead of guessing when it finds any of these conditions:

- an active proposal without a Blue or Red recipient
- an adjudicated action without an outcome or lifecycle timestamps
- more than one active Strategic Orientation artifact for the same session and team
- more than one `PROPOSAL_FORWARDED` communication for the same proposal

Resolve the cited row IDs as an explicit data-repair operation, then reapply the migration. Do not delete or relabel a legitimate artifact merely to make the migration pass.

The July migration originally made `operator_review_proposal` a proposal-wide final decision. After all dated migrations are applied, `data/2026-08-06_proposal_recipient_threads.sql` replaces that signature: each call approves one intended recipient, creates only that recipient's round-zero thread, and leaves every other recipient unchanged. A same-recipient retry returns the committed root; a later round uses `append_proposal_thread_message` and never updates an earlier response.

After applying the migration, verify the operational contract:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'actions'
  and column_name in (
    'artifact_type',
    'workflow_state',
    'artifact_payload',
    'forecast_targets',
    'proposal_recipient_team',
    'idempotency_key',
    'row_version'
  )
order by column_name;

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_actions_one_unified_orientation',
    'idx_actions_one_regional_orientation',
    'idx_actions_session_idempotency_key',
    'idx_communications_one_forward_per_proposal'
  )
order by indexname;

select trigger_name
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'actions'
  and trigger_name in (
    'normalize_action_workflow_write',
    'audit_action_workflow_write'
  )
order by trigger_name;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and policyname in (
    'actions_industry_submission_insert',
    'actions_industry_submission_update',
    'requests_industry_submission_insert',
    'requests_industry_submission_update'
  )
order by tablename, policyname;
```

After GC-02, the orientation check requires both partial indexes (NULL and
non-NULL delegation); the original session/team orientation index must be absent.
The remaining July checks are historical to that migration: later RFI policies
supersede the Industry request policies. Use the current policy checks below and
the GC-02 SQL regression for final-state evidence. Proposal review through the
current unified UI must still produce one recipient-specific forwarding
communication per approved intended recipient, matching timeline rows,
action-log revisions, and hash-chained research events.

## Team-Neutral Artifact Review Workflow

Apply `data/2026-08-05_team_neutral_artifact_review.sql` after the July workflow, PLI, Industry-permission, and Blue-return migrations. It adds workflow/revision metadata without updating historical `actions` or `requests` rows. Untouched rows therefore retain their original database values: historical `returned_to_blue` remains stored as `returned_to_blue`, and NULL revision metadata is exposed by the client as a labeled legacy default rather than a fabricated database history.

The new columns, constraints, normalization functions/triggers,
`artifact_workflow_reviews` table, RLS policy, grants, compatibility wrapper,
and comments are additive workflow objects. Do not drop them during application
rollback after any review write. Do not rewrite historical `returned_to_blue`
rows to `returned_to_team`, assign them synthetic revisions, or insert review
history for transitions that did not occur under this contract.

New White Cell review code must call `operator_review_artifact` with the persisted submitting team and the revision currently displayed to the reviewer. The same authorization and transaction handle Blue and Red action returns, Strategic Orientation completion/return, and RFI clarification returns. Returns require notes. A revision mismatch, team mismatch, missing White Cell grant, or completed artifact fails without a partial artifact, PLI, or review-log write. Completion maps the compatibility `status` to `adjudicated`, sets `workflow_state` to `completed`, and deliberately leaves `outcome` NULL.

For operational reversal, follow `docs/supabase-rollback.md`. Do not drop additive metadata or review history after the RPC has accepted a write.

Verify the contract after applying the migration:

```sql
select table_name, column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'actions' and column_name in (
      'workflow_state', 'revision_number', 'prior_workflow_state',
      'reviewed_at', 'reviewed_by_role', 'review_notes', 'completed_at'
    ))
    or
    (table_name = 'requests' and column_name in (
      'workflow_state', 'revision_number', 'prior_workflow_state',
      'reviewed_at', 'reviewed_by_role', 'review_notes', 'completed_at'
    ))
  )
order by table_name, column_name;

select proname, proacl
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public'
  and proname in ('operator_review_artifact', 'operator_return_action_to_blue')
order by proname;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'artifact_workflow_reviews';
```

Pass: fourteen metadata columns are returned; both RPCs exist with authenticated execution; and `artifact_workflow_reviews` has a SELECT policy but no authenticated INSERT, UPDATE, or DELETE policy. A transactional rehearsal should additionally show one review row with matching prior/new snapshots and no outcome for a completed Action or Strategic Orientation.

### White Cell proposal-review schema drift

The current browser intentionally depends on both of these exact RPC
signatures:

```text
operator_review_artifact(text,uuid,text,text,bigint,text)
operator_review_proposal(uuid,text,text,text,integer)
```

A PostgREST 404 saying that it cannot find the five-argument
`operator_review_proposal`, together with a database error saying that only
Blue or Red action artifacts can use the action-review path, is not a frontend
routing failure. It means the deployed database is still exposing pre-August
review functions: the recipient-thread owner from
`data/2026-08-06_proposal_recipient_threads.sql` is absent, and the
team-neutral proposal-return behavior from
`data/2026-08-05_team_neutral_artifact_review.sql` is absent or has been
superseded.

Inspect function identities rather than checking names alone:

```sql
select p.oid::regprocedure::text as function_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('operator_review_artifact', 'operator_review_proposal')
order by function_signature;
```

Pass: exactly the two signatures above are returned. An older four-argument
`operator_review_proposal`, a missing five-argument overload, or any extra
legacy overload is a deployment blocker.

Repair migration-first; do not add a browser fallback to an older RPC because
the older proposal function finalizes the proposal as one unit and cannot
preserve independent recipient approvals. Compare the environment's verified
migration record with the ledger above. Starting at the first absent entry,
apply `data/2026-08-05_team_neutral_artifact_review.sql`,
`data/2026-08-06_facilitator_rfi_communications.sql`, and
`data/2026-08-06_proposal_recipient_threads.sql` in ledger order, followed by
every absent later migration through the current final migration. If the
migration record claims these owners ran but the signatures are stale, treat
that mismatch as a reviewed repair: reapply the August 5 owner, the two August
6 migrations in order, and every later owner listed in the repair sequence at
the top of this document. After the transaction commits, request a PostgREST
schema-cache reload:

```sql
notify pgrst, 'reload schema';
```

Then rerun the signature query before retrying either White Cell operation.
Do not treat the cache reload alone as a repair when either exact signature is
missing.

## Facilitator RFIs And Direct Communications

Apply `data/2026-08-06_facilitator_rfi_communications.sql` after the team-neutral artifact-review migration. The compatibility identifiers remain inverted: the actual Facilitator is stored as `*_scribe`, and the user-facing Scribe is stored as `*_facilitator`. The migration therefore gives the `scribe` surface same-team RFI insert and returned-RFI resubmission authority, removes write authority from the `facilitator` surface, limits participant reads to their own team's RFIs, and allows session-scoped direct text between the actual Facilitator and White Cell. It also reasserts Industry Facilitator submission of forwarded Strategic Orientation and proposal drafts.

Apply `data/2026-08-06_proposal_recipient_threads.sql` after the Facilitator RFI migration. It supersedes the June final-response lock and the earlier August communications policy without rewriting historical rows. New White Cell reviews approve one intended recipient at a time and create an independent round-zero thread; later messages may be written only through `append_proposal_thread_message`. Pass conditions are: the round and client-message unique indexes exist, thread rows reject update/delete, direct `PROPOSAL_RESPONSE` inserts fail, Blue/Red and cross-session access fail closed, and completing all intended approvals leaves `outcome` null.

Apply `data/2026-08-15_proposal_forwarding_integrity.sql` after the August 14 snapshot repair. It reconciles structured and legacy recipient lists before proposal completion, builds recipient snapshots with full proposal substance but no intended-partner routing fields, and converts proposed response rounds into immutable White Cell review records. White Cell forwards each response through `operator_forward_proposal_response`; only that RPC creates the next team-visible thread round. Pass: a Blue-and-Red proposal creates both round-zero threads, each snapshot includes objective/originators/focus/timing/outcomes without `recipientTeams` or `intendedPartners`, the proposing team cannot see a pending response, and the response appears after White Cell forwards it.

Apply `data/2026-08-25_sme_pli_packets.sql` after the training mastery progress migration. It stores copy-ready PLI packets for Tribe Street Journal and Verba SMEs after Econ, NI, or Dip-Info approve or override a seat. It does not replace `sme_handoffs`, which remain the White Cell action-complete narrative queues. Pass: the unique `(adjudication_id, pli_seat, handoff_seat)` constraint exists; SME, White Cell, and Game Master can select, insert, and update; packets stay pending until the matching TSJ or Verba SME marks them done.

Apply `data/2026-08-11_requests_responded_by_schema_repair.sql` after the
proposal-recipient migration. It adds
the nullable `requests.responded_by` field required by
`guard_facilitator_request_write()` without rewriting historical RFIs or
changing RLS. This is also the forward repair when a Facilitator RFI returns
HTTP 400 with `record "new" has no field "responded_by"`; do not remove or
weaken the trigger to make the insert pass.

Verify the repaired row shape:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'requests'
  and column_name = 'responded_by';
```

Pass: exactly one row is returned with `data_type = text` and
`is_nullable = YES`. A new Facilitator RFI remains pending with
`responded_by IS NULL`; White Cell may populate it only when recording the
answer through the existing authorized workflow.

Apply `data/2026-08-13_rfi_answer_completion_trigger.sql` after the archival
migration. It keeps `operator_answer_request()` as the only terminal request
write while preserving the linked `rfi_response` communication used for answer
history. Without this repair, inserting that communication invokes the legacy
response synchronizer, which attempts to update the newly completed request;
the immutability guard rejects the second write and rolls back the answer.

Verify the repaired trigger function:

```sql
select pg_get_functiondef('public.update_request_response_time()'::regprocedure);
```

Pass: the function retains the linked `rfi_response` path and its request
update is restricted by both `status NOT IN ('answered', 'withdrawn')` and
`workflow_state <> 'completed'`. Rehearse submit, return, edit, resubmit, and
answer on one RFI ID; the final request is `answered` / `completed`, the linked
response communication exists once, and the immutable clarification review
remains queryable.

Apply `data/2026-08-13_strategic_orientation_team_canonicalization.sql` before
the action-notification delivery migration.
It canonicalizes Strategic Orientation compatibility types before the existing
workflow normalizer and `actions_artifact_team_check` run. It applies to both
inserts and updates: Blue becomes `strategic_orientation_selection`; Red,
Green, and Industry become `strategic_orientation_forecast`. It does not alter
existing rows, expand the allowed teams, or weaken the team constraint.

Verify the canonicalization trigger:

```sql
select
    t.tgname,
    p.proname
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.actions'::regclass
  and not t.tgisinternal
  and t.tgname in (
      'canonicalize_strategic_orientation_artifact_type',
      'normalize_action_workflow_write'
  )
order by t.tgname;
```

Pass: both rows are returned, with the canonicalization trigger sorting before
the workflow normalizer. Rehearse create and draft-edit for Blue, Red, Green,
and Industry; all four retain `orientation_and_forecast` inside
`artifact_payload`, while the action row uses the team-compatible database
type. Any fifth or mismatched team remains rejected.

Apply `data/2026-08-13_action_notification_delivery.sql`, then apply
`data/2026-08-13_action_notification_type_contract.sql` last. The first adds
`operator_complete_action_with_notifications`, which uses the existing
fail-closed artifact-review and White Cell communication functions in one
transaction. White Cell may approve only Green and/or Industry when that team
appears in the submitted action's `artifact_payload.action.notificationTeams`.
If completion or any approved delivery fails, neither the completion nor any
notification is committed. The forward repair expands
`communications_type_check` to include `ACTION_NOTIFICATION`; projects that
already installed the RPC must apply the repair before retrying acceptance.

Verify the atomic completion RPC:

```sql
select
    p.proname,
    has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
    ) as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'operator_complete_action_with_notifications';
```

Pass: exactly one row is returned and `authenticated_can_execute` is true.

Verify the repaired communication type contract:

```sql
select pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
where c.conrelid = 'public.communications'::regclass
  and c.conname = 'communications_type_check';
```

Pass: exactly one row is returned and `constraint_definition` contains
`ACTION_NOTIFICATION` together with the previously supported communication
types. Absence is a deployment blocker.

Apply `data/2026-08-14_action_notification_title_snapshot.sql` after the
delivery and type-contract migrations above. It replaces
`operator_complete_action_with_notifications` again, this time merging the
submitting action's title into the `action_snapshot` metadata so Green and
Industry recipients can render the same team-labeled, informational
notification card as the Red Team share path. No table, trigger, or policy
changes; only the function body changes.

Verify the snapshot now carries a title:

```sql
select pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'operator_complete_action_with_notifications';
```

Pass: `function_definition` contains `COALESCE(NULLIF(BTRIM(action_row.goal), ''), 'Untitled action')`.

Rehearse a Blue action requesting both recipients: the Review Action modal
shows both preselected approval controls, acceptance creates exactly one
`ACTION_NOTIFICATION` communication for Green and one for Industry with the
same action ID/revision, both teams receive the completed detail, and the
completed White Cell card reports both deliveries. Deselecting a requested
team creates no communication for it; selecting an unrequested or unsupported
team fails without completing the action.

Verify the current policies:

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('requests', 'communications', 'actions')
  and policyname in (
    'requests_live_demo_read',
    'requests_live_demo_insert',
    'requests_live_demo_update',
    'communications_live_demo_read',
    'communications_live_demo_insert',
    'actions_industry_submission_update'
  )
order by tablename, policyname;
```

Pass: exactly six rows are returned. In a four-seat rehearsal, each actual Facilitator can create a same-team RFI and direct message; the paired Scribe cannot create an RFI; another team cannot read either record; White Cell can return the RFI only with notes; and the Facilitator resubmits the same RFI ID with the next revision. Current RFI forms and current-run exports contain only category, question, workflow, revision, return, resubmission, and answer-history data; retired fields may appear only in explicitly labelled legacy evidence.

## Session Recorder Artifact Metadata

The Session Recorder plugin records longer White Cell or Game Master session audio with browser `getUserMedia` and `MediaRecorder`. The actual audio remains a local browser Blob/download and must be kept with the post-game ZIP by the operator. The research archive stores reference metadata in `session_recording_artifacts.csv` and `session_recording_artifacts.json`, and `report.html` includes a Session Recordings section so reviewers can see that a recording exists.

Artifact metadata is held in the operator browser's local storage until exported or discarded. It includes session ID, recording ID, UTC start/stop, duration, MIME type, file size, operator role/user, plugin ID, filename, storage reference, object URL lifecycle, requested constraints, selected MIME type, and requested/used bitrate. No service-role key, backend-only credential, or reusable API key is exposed to the browser for this feature.

The participant recording notice is driven by bounded runtime fields in `game_state.plugin_state` while Session Recorder is enabled and active. Pass: starting a recording sets the notice state, pause updates it, and stop or plugin disable clears it.

## Required RPC Checklist

Run this in Supabase SQL editor:

```sql
select
  p.proname,
  p.oid::regprocedure::text as function_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
and p.proname in (
  'lookup_joinable_session_by_code',
  'authorize_demo_operator',
  'create_live_demo_session',
  'archive_live_demo_session',
  'delete_live_demo_session',
  'claim_session_role_seat',
  'heartbeat_session_role_seat',
  'disconnect_session_role_seat',
  'list_active_session_participants',
  'operator_update_game_state',
  'operator_adjudicate_action',
  'operator_review_artifact',
  'operator_review_proposal',
  'append_proposal_thread_message',
  'operator_answer_request',
  'operator_send_communication',
  'update_proposal_recipient_status',
  'live_demo_research_capture_mode',
  'live_demo_software_build_hash',
  'start_or_resume_training_attempt',
  'get_training_attempt_bootstrap',
  'record_training_progress_event',
  'reset_training_attempt'
)
order by p.proname, function_signature;
```

Pass: every listed RPC exists, there are no unintended legacy overloads, and
the review rows include exactly
`operator_review_artifact(text,uuid,text,text,bigint,text)` and
`operator_review_proposal(uuid,text,text,text,integer)`. Checking `proname`
alone is insufficient because PostgREST resolves calls by parameter signature.

## RLS Broad-Policy Check

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
and policyname ilike '%Allow all operations%';
```

Pass: no broad allow-all policies remain on live demo tables.

## Browser Runtime Check

If Supabase configuration is missing or placeholder-valued, the browser shows a blocking backend configuration notice. That is expected fail-closed behavior. Fix `.env.local` or GitHub repository secrets, rebuild, and reload.

## Demo Readiness Pass Conditions

- anonymous sign-in succeeds
- session-code lookup returns only active joinable sessions
- the retired training archive remains protected, archived, code-free, and unable to own participant seats or game state
- no training RPC is callable and historical training tables expose no `PUBLIC`, `anon`, or `authenticated` grants
- `TRAINING2026` follows the ordinary live-session path when assigned to a new exercise
- active rosters use the immutable session-role display-name snapshot captured for each claimed seat
- historical training attempts and progress events remain absent from live research exports and evidence manifests
- public clients cannot list all sessions from the landing page
- role seat limits are enforced by `claim_session_role_seat`
- White Cell and Game Master actions require operator grants
- stored participant roles are normalized before RLS derives write surface/team
- the Industry Scribe can create same-team Strategic Orientation forecasts and proposals while cross-team inserts still fail
- same-team Facilitators, currently stored as legacy `*_scribe` seats, can submit Scribe-forwarded actions, Strategic Orientation drafts, and proposals to White Cell
- same-team Facilitators can create/resubmit RFIs and send direct text to White Cell; Scribes retain read-only RFI history and other teams cannot read those records
- action artifacts have a first-class type, workflow state, monotonic row version, structured snapshot, and server-owned transition timestamps
- Blue and Red action returns, Strategic Orientation review, and RFI clarification returns use one revision-aware White Cell RPC; completed artifacts reject further review writes
- each session/team has at most one active Strategic Orientation artifact and each proposal has at most one forwarding communication per intended recipient (per revision for regional proposals after GC-06)
- each `operator_review_proposal` call atomically records one recipient approval, round-zero communication, and recipient-specific timeline row; completing the final intended approval closes the artifact workflow without creating an outcome
- each `append_proposal_thread_message` call atomically creates one immutable next round, and stale parents, duplicate client IDs, cross-team access, and cross-session access fail closed
- every action creation, revision, handoff, submission, deletion, and adjudication is represented in action logs and the research audit chain
- White Cell can persist timer allocations for Strategic Orientation and Moves 1-3 through `operator_update_game_state`
- White Cell can persist Intercom and Session Recorder plugin enablement plus bounded Session Recorder runtime notice fields in `game_state.plugin_state` through `operator_update_game_state`
- White Cell and Game Master Intercom can broadcast inline clips and can upload larger clips to `intercom-announcements`
- White Cell and Game Master Session Recorder can produce a downloadable local audio file and research export artifact metadata without a new Storage bucket
- direct browser writes remain bounded by RLS
- research export RPCs return expected runtime configuration
