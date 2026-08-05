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

Use the current hardening path for live environments:

1. Apply the complete/current schema baseline used for this repository.
2. Apply `data/CURRENT_BUILD_SUPABASE_PATCH.sql` when the selected baseline requires its compatibility columns.
3. For existing live-demo projects, make sure `data/2026-06-25_industry_team_role_contract.sql`, `data/2026-06-25_scribe_action_submit_policy.sql`, `data/2026-06-25_participant_role_resolver_normalization.sql`, `data/2026-06-25_timer_allocations_game_state.sql`, `data/2026-06-28_white_cell_plugins_game_state.sql`, `data/2026-06-28_intercom_storage_bucket.sql`, `data/2026-07-14_action_artifact_workflow_integrity.sql`, `data/2026-07-17_pli_adjudications.sql`, `data/2026-07-21_scribe_proposal_submit_policy.sql`, `data/2026-07-29_industry_submission_permissions.sql`, `data/2026-07-29_return_action_to_blue.sql`, and `data/2026-08-05_team_neutral_artifact_review.sql` have been applied in that order. The July integrity migration also requires `data/2026-06-04_research_export_capture.sql` from the earlier dated sequence. The July 29 recovery migration is required for existing projects where Industry Scribes or Facilitators receive RLS errors while creating Strategic Orientation forecasts, proposals, or RFIs, or while submitting a forwarded orientation or proposal. The August migration supersedes the Blue-only return implementation but retains its RPC as a compatibility wrapper.
4. Verify RPCs and RLS policies before a demo.

## Intercom Storage

The Intercom plugin records short browser audio clips. Clips at or below 48 KB are sent as base64 metadata over the session Realtime broadcast channel. Larger clips upload to the private `intercom-announcements` bucket and broadcast only lightweight metadata.

Storage object paths use:

```text
<session-uuid>/<announcement-id>.<webm|ogg|mp4>
```

Apply `data/2026-06-28_intercom_storage_bucket.sql` after the plugin-state game-state patch. Pass: authenticated Scribe clients can read clips for their joined session, and White Cell or Game Master operators with a valid grant can upload clips for that session. No service-role key or backend-only credential is required in the browser.

If the operator UI reports `Bucket not found` when sending to Scribes, the browser recorded a clip larger than the inline threshold and the Supabase project is missing `intercom-announcements`. Apply `data/2026-06-28_intercom_storage_bucket.sql` in the Supabase SQL editor, then retry.

Do not treat legacy broad-policy files such as `data/updated_supabase_schema.sql` as final production state. They are historical/setup artifacts and must be followed by the hardening migrations.

## Action Artifact And Workflow Integrity

Apply `data/2026-07-14_action_artifact_workflow_integrity.sql` to make action, proposal, Strategic Orientation, forecast, and move-response meaning explicit in the database. The migration deterministically classifies existing rows from the current legacy prefixes, adds structured payload and workflow fields, makes lifecycle timestamps server-owned, rejects status regression and post-submission content changes, and logs every action mutation. Draft updates and submission now filter on the returned `row_version`; a stale browser receives a refresh-before-save error instead of overwriting a newer revision.

After the workflow-integrity migration, apply `data/2026-07-21_scribe_proposal_submit_policy.sql` and `data/2026-07-29_industry_submission_permissions.sql`. The first permits the legacy `*_scribe` Facilitator seat to submit a Scribe-forwarded proposal. The second normalizes existing Industry seat identities and reasserts Industry-only action, Strategic Orientation, proposal, and RFI permissions. It does not permit cross-team writes, Facilitator creation of new artifacts, or participant adjudication.

The migration fails closed instead of guessing when it finds any of these conditions:

- an active proposal without a Blue or Red recipient
- an adjudicated action without an outcome or lifecycle timestamps
- more than one active Strategic Orientation artifact for the same session and team
- more than one `PROPOSAL_FORWARDED` communication for the same proposal

Resolve the cited row IDs as an explicit data-repair operation, then reapply the migration. Do not delete or relabel a legitimate artifact merely to make the migration pass.

White Cell proposal review now calls `operator_review_proposal`. The RPC adjudicates the proposal and writes its review timeline, forwarding communication, and forwarding timeline in one transaction. Its forwarded proposal snapshot preserves the Industry Instrument of Power selections recorded in the proposal details. Repeating the same completed decision returns the committed records with `idempotent_replay = true`; a conflicting second decision fails.

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

Pass: seven action columns, three unique indexes, two action triggers, and four Industry submission policies are returned. A proposal review performed through the UI produces one adjudicated proposal, at most one forwarded communication, the matching timeline rows, action-log revisions, and hash-chained research audit events.

## Team-Neutral Artifact Review Workflow

Apply `data/2026-08-05_team_neutral_artifact_review.sql` after the July workflow, PLI, Industry-permission, and Blue-return migrations. It adds workflow/revision metadata without updating historical `actions` or `requests` rows. Untouched rows therefore retain their original database values: historical `returned_to_blue` remains stored as `returned_to_blue`, and NULL revision metadata is exposed by the client as a labeled legacy default rather than a fabricated database history.

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
  'delete_live_demo_session',
  'claim_session_role_seat',
  'heartbeat_session_role_seat',
  'disconnect_session_role_seat',
  'list_active_session_participants',
  'operator_update_game_state',
  'operator_adjudicate_action',
  'operator_review_artifact',
  'operator_review_proposal',
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
- the Industry Scribe can create same-team Strategic Orientation forecasts, proposals, and RFIs while cross-team inserts still fail
- same-team Facilitators, currently stored as legacy `*_scribe` seats, can submit Scribe-forwarded actions, Strategic Orientation drafts, and proposals to White Cell
- action artifacts have a first-class type, workflow state, monotonic row version, structured snapshot, and server-owned transition timestamps
- Blue and Red action returns, Strategic Orientation review, and RFI clarification returns use one revision-aware White Cell RPC; completed artifacts reject further review writes
- each session/team has at most one active Strategic Orientation artifact and each proposal has at most one forwarding communication
- White Cell proposal review, adjudication, forwarding, and timeline records commit atomically through `operator_review_proposal`
- every action creation, revision, handoff, submission, deletion, and adjudication is represented in action logs and the research audit chain
- White Cell can persist timer allocations for Strategic Orientation and Moves 1-3 through `operator_update_game_state`
- White Cell can persist Intercom and Session Recorder plugin enablement plus bounded Session Recorder runtime notice fields in `game_state.plugin_state` through `operator_update_game_state`
- White Cell and Game Master Intercom can broadcast inline clips and can upload larger clips to `intercom-announcements`
- White Cell and Game Master Session Recorder can produce a downloadable local audio file and research export artifact metadata without a new Storage bucket
- direct browser writes remain bounded by RLS
- research export RPCs return expected runtime configuration
