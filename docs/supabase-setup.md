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

The August 6 proposal-recipient migration remains the current owner of
communications RLS and proposal-review behavior. The August 11 migration is an
additive request-schema repair and does not replace any policy or function. The
final August 12 migration replaces evidence-destroying session deletion with
audited archival. If July 14, August 5, or the earlier August 6 policy migration
is reapplied during repair, reapply
`data/2026-08-06_proposal_recipient_threads.sql`, then apply
`data/2026-08-11_requests_responded_by_schema_repair.sql`, then apply
`data/2026-08-12_session_archive_transition.sql`. Verify RPCs,
triggers, policies, columns, and grants before a demo; a missing migration
record or failed verification is a deployment blocker.

## Session Archival

Apply `data/2026-08-12_session_archive_transition.sql` before deploying the
matching frontend. Game Master and White Cell session controls then archive a
session instead of deleting it. Archival changes the session status to
`archived`, closes its active participant seats, blocks further live writes,
and appends `SESSION_CLOSED` to the immutable research event chain. All session
records and dependent evidence remain stored. The deprecated
`delete_live_demo_session` RPC is retained only as a non-destructive rolling
deployment wrapper and also archives.

Export and validate the research archive before selecting Archive. Archived
sessions leave active lists and cannot be joined. They remain available as
database evidence; no browser RPC hard-deletes them.

Verify the contract after applying the migration:

```sql
select proname
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public'
  and proname in ('archive_live_demo_session', 'delete_live_demo_session')
order by proname;

select id, name, status, updated_at
from public.sessions
where id = '<archived-session-uuid>';

select event_type, entity_type, entity_id, event_ts_utc
from public.research_audit_event_log
where session_id = '<archived-session-uuid>'
order by event_id desc
limit 1;
```

Pass: both RPC names are returned; the selected session has status `archived`;
and its newest audit row is `SESSION_CLOSED` for entity type `session`. Existing
actions, RFIs, timeline rows, participant seats, and research rows are still
present.

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
    'idx_actions_one_orientation_per_session_team',
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

Pass: seven action columns, three unique indexes, two action triggers, and four Industry submission policies are returned. Proposal review through the current UI produces one recipient-specific forwarding communication per approved intended recipient, matching timeline rows, action-log revisions, and hash-chained research audit events; approving one recipient leaves every other recipient unchanged.

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

## Facilitator RFIs And Direct Communications

Apply `data/2026-08-06_facilitator_rfi_communications.sql` after the team-neutral artifact-review migration. The compatibility identifiers remain inverted: the actual Facilitator is stored as `*_scribe`, and the user-facing Scribe is stored as `*_facilitator`. The migration therefore gives the `scribe` surface same-team RFI insert and returned-RFI resubmission authority, removes write authority from the `facilitator` surface, limits participant reads to their own team's RFIs, and allows session-scoped direct text between the actual Facilitator and White Cell. It also reasserts Industry Facilitator submission of forwarded Strategic Orientation and proposal drafts.

Apply `data/2026-08-06_proposal_recipient_threads.sql` after the Facilitator RFI migration. It supersedes the June final-response lock and the earlier August communications policy without rewriting historical rows. New White Cell reviews approve one intended recipient at a time and create an independent round-zero thread; later messages may be written only through `append_proposal_thread_message`. Pass conditions are: the round and client-message unique indexes exist, thread rows reject update/delete, direct `PROPOSAL_RESPONSE` inserts fail, Blue/Red and cross-session access fail closed, and completing all intended approvals leaves `outcome` null.

Apply `data/2026-08-11_requests_responded_by_schema_repair.sql` last. It adds
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
select proname
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public'
and proname in (
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
  'live_demo_software_build_hash'
);
```

Pass: every listed RPC exists.

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
- public clients cannot list all sessions from the landing page
- role seat limits are enforced by `claim_session_role_seat`
- White Cell and Game Master actions require operator grants
- stored participant roles are normalized before RLS derives write surface/team
- the Industry Scribe can create same-team Strategic Orientation forecasts and proposals while cross-team inserts still fail
- same-team Facilitators, currently stored as legacy `*_scribe` seats, can submit Scribe-forwarded actions, Strategic Orientation drafts, and proposals to White Cell
- same-team Facilitators can create/resubmit RFIs and send direct text to White Cell; Scribes retain read-only RFI history and other teams cannot read those records
- action artifacts have a first-class type, workflow state, monotonic row version, structured snapshot, and server-owned transition timestamps
- Blue and Red action returns, Strategic Orientation review, and RFI clarification returns use one revision-aware White Cell RPC; completed artifacts reject further review writes
- each session/team has at most one active Strategic Orientation artifact and each proposal has at most one forwarding communication per intended recipient
- each `operator_review_proposal` call atomically records one recipient approval, round-zero communication, and recipient-specific timeline row; completing the final intended approval closes the artifact workflow without creating an outcome
- each `append_proposal_thread_message` call atomically creates one immutable next round, and stale parents, duplicate client IDs, cross-team access, and cross-session access fail closed
- every action creation, revision, handoff, submission, deletion, and adjudication is represented in action logs and the research audit chain
- White Cell can persist timer allocations for Strategic Orientation and Moves 1-3 through `operator_update_game_state`
- White Cell can persist Intercom and Session Recorder plugin enablement plus bounded Session Recorder runtime notice fields in `game_state.plugin_state` through `operator_update_game_state`
- White Cell and Game Master Intercom can broadcast inline clips and can upload larger clips to `intercom-announcements`
- White Cell and Game Master Session Recorder can produce a downloadable local audio file and research export artifact metadata without a new Storage bucket
- direct browser writes remain bounded by RLS
- research export RPCs return expected runtime configuration
