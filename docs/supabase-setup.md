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
- RLS enabled on session, participant, game-state, action, request, communication, timeline, notetaker, operator-grant, and research tables.
- Privileged operator writes kept behind RPCs.

## SQL Setup Order

Use the current hardening path for live environments:

1. Apply the complete/current schema baseline used for this repository.
2. Apply dated hardening migrations in order.
3. For existing live-demo projects, make sure `data/2026-06-25_industry_team_role_contract.sql`, `data/2026-06-25_scribe_action_submit_policy.sql`, `data/2026-06-25_participant_role_resolver_normalization.sql`, `data/2026-06-25_timer_allocations_game_state.sql`, `data/2026-06-28_white_cell_plugins_game_state.sql`, and `data/2026-06-28_intercom_storage_bucket.sql` have been applied in that order.
4. Apply `data/CURRENT_BUILD_SUPABASE_PATCH.sql` when the current build requires it.
5. Verify RPCs and RLS policies before a demo.

## Intercom Storage

The Intercom plugin records short browser audio clips. Clips at or below 48 KB are sent as base64 metadata over the session Realtime broadcast channel. Larger clips upload to the private `intercom-announcements` bucket and broadcast only lightweight metadata.

Storage object paths use:

```text
<session-uuid>/<announcement-id>.<webm|ogg|mp4>
```

Apply `data/2026-06-28_intercom_storage_bucket.sql` after the plugin-state game-state patch. Pass: authenticated Scribe clients can read clips for their joined session, and White Cell or Game Master operators with a valid grant can upload clips for that session. No service-role key or backend-only credential is required in the browser.

If the operator UI reports `Bucket not found` when sending to Scribes, the browser recorded a clip larger than the inline threshold and the Supabase project is missing `intercom-announcements`. Apply `data/2026-06-28_intercom_storage_bucket.sql` in the Supabase SQL editor, then retry.

Do not treat legacy broad-policy files such as `data/updated_supabase_schema.sql` as final production state. They are historical/setup artifacts and must be followed by the hardening migrations.

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
- same-team Facilitators, currently stored as legacy `*_scribe` seats, can submit Scribe-forwarded action and Strategic Orientation drafts to White Cell
- White Cell can persist timer allocations for Strategic Orientation and Moves 1-3 through `operator_update_game_state`
- White Cell can persist Intercom and Session Recorder plugin enablement plus bounded Session Recorder runtime notice fields in `game_state.plugin_state` through `operator_update_game_state`
- White Cell and Game Master Intercom can broadcast inline clips and can upload larger clips to `intercom-announcements`
- White Cell and Game Master Session Recorder can produce a downloadable local audio file and research export artifact metadata without a new Storage bucket
- direct browser writes remain bounded by RLS
- research export RPCs return expected runtime configuration
