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
- RLS enabled on session, participant, game-state, action, request, communication, timeline, notetaker, operator-grant, and research tables.
- Privileged operator writes kept behind RPCs.

## SQL Setup Order

Use the current hardening path for live environments:

1. Apply the complete/current schema baseline used for this repository.
2. Apply dated hardening migrations in order.
3. For existing live-demo projects, make sure `data/2026-06-25_industry_team_role_contract.sql`, `data/2026-06-25_scribe_action_submit_policy.sql`, `data/2026-06-25_participant_role_resolver_normalization.sql`, and `data/2026-06-25_timer_allocations_game_state.sql` have been applied.
4. Apply `data/CURRENT_BUILD_SUPABASE_PATCH.sql` when the current build requires it.
5. Verify RPCs and RLS policies before a demo.

Do not treat legacy broad-policy files such as `data/updated_supabase_schema.sql` as final production state. They are historical/setup artifacts and must be followed by the hardening migrations.

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
- same-team Scribes can submit facilitator-forwarded action and Strategic Orientation drafts to White Cell
- White Cell can persist timer allocations for Strategic Orientation and Moves 1-3 through `operator_update_game_state`
- direct browser writes remain bounded by RLS
- research export RPCs return expected runtime configuration
