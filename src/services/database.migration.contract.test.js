import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const GLOBAL_WHITE_CELL_ROLE_CONTRACT_PATH = new URL(
    '../../data/2026-04-09_global_white_cell_role_contract.sql',
    import.meta.url
);
const WHITE_CELL_BACKEND_ALIGNMENT_PATH = new URL(
    '../../data/2026-04-17_white_cell_backend_alignment.sql',
    import.meta.url
);
const SEAT_CLAIM_ROLE_NORMALIZATION_PATH = new URL(
    '../../data/2026-04-17_seat_claim_role_input_normalization.sql',
    import.meta.url
);
const OPERATOR_CODE_RUNTIME_CONFIG_PATH = new URL(
    '../../data/2026-06-02_operator_code_runtime_config_table.sql',
    import.meta.url
);
const PROPOSAL_RESPONSE_FINALIZATION_LOCK_PATH = new URL(
    '../../data/2026-06-03_proposal_response_finalization_lock.sql',
    import.meta.url
);
const RESEARCH_EXPORT_CAPTURE_PATH = new URL(
    '../../data/2026-06-04_research_export_capture.sql',
    import.meta.url
);
const INDUSTRY_TEAM_ROLE_CONTRACT_PATH = new URL(
    '../../data/2026-06-25_industry_team_role_contract.sql',
    import.meta.url
);
const SCRIBE_ACTION_SUBMIT_POLICY_PATH = new URL(
    '../../data/2026-06-25_scribe_action_submit_policy.sql',
    import.meta.url
);
const PARTICIPANT_ROLE_RESOLVER_NORMALIZATION_PATH = new URL(
    '../../data/2026-06-25_participant_role_resolver_normalization.sql',
    import.meta.url
);
const TIMER_ALLOCATIONS_GAME_STATE_PATH = new URL(
    '../../data/2026-06-25_timer_allocations_game_state.sql',
    import.meta.url
);
const WHITE_CELL_PLUGINS_GAME_STATE_PATH = new URL(
    '../../data/2026-06-28_white_cell_plugins_game_state.sql',
    import.meta.url
);
const INTERCOM_STORAGE_BUCKET_PATH = new URL(
    '../../data/2026-06-28_intercom_storage_bucket.sql',
    import.meta.url
);
const ACTION_ARTIFACT_WORKFLOW_INTEGRITY_PATH = new URL(
    '../../data/2026-07-14_action_artifact_workflow_integrity.sql',
    import.meta.url
);
const SCRIBE_PROPOSAL_SUBMIT_POLICY_PATH = new URL(
    '../../data/2026-07-21_scribe_proposal_submit_policy.sql',
    import.meta.url
);
const INDUSTRY_SUBMISSION_PERMISSIONS_PATH = new URL(
    '../../data/2026-07-29_industry_submission_permissions.sql',
    import.meta.url
);
const TEAM_NEUTRAL_ARTIFACT_REVIEW_PATH = new URL(
    '../../data/2026-08-05_team_neutral_artifact_review.sql',
    import.meta.url
);
const FACILITATOR_RFI_COMMUNICATIONS_PATH = new URL(
    '../../data/2026-08-06_facilitator_rfi_communications.sql',
    import.meta.url
);
const PROPOSAL_RECIPIENT_THREADS_PATH = new URL(
    '../../data/2026-08-06_proposal_recipient_threads.sql',
    import.meta.url
);
const REQUESTS_RESPONDED_BY_SCHEMA_REPAIR_PATH = new URL(
    '../../data/2026-08-11_requests_responded_by_schema_repair.sql',
    import.meta.url
);
const SESSION_ARCHIVE_TRANSITION_PATH = new URL(
    '../../data/2026-08-12_session_archive_transition.sql',
    import.meta.url
);
const RFI_ANSWER_COMPLETION_TRIGGER_PATH = new URL(
    '../../data/2026-08-13_rfi_answer_completion_trigger.sql',
    import.meta.url
);
const STRATEGIC_ORIENTATION_TEAM_CANONICALIZATION_PATH = new URL(
    '../../data/2026-08-13_strategic_orientation_team_canonicalization.sql',
    import.meta.url
);
const ACTION_NOTIFICATION_DELIVERY_PATH = new URL(
    '../../data/2026-08-13_action_notification_delivery.sql',
    import.meta.url
);
const ACTION_NOTIFICATION_TYPE_CONTRACT_PATH = new URL(
    '../../data/2026-08-13_action_notification_type_contract.sql',
    import.meta.url
);
const ACTION_NOTIFICATION_TITLE_SNAPSHOT_PATH = new URL(
    '../../data/2026-08-14_action_notification_title_snapshot.sql',
    import.meta.url
);
const SME_HANDOFFS_PATH = new URL(
    '../../data/2026-07-20_sme_handoffs.sql',
    import.meta.url
);
const CURRENT_BUILD_SUPABASE_PATCH_PATH = new URL(
    '../../data/CURRENT_BUILD_SUPABASE_PATCH.sql',
    import.meta.url
);
const DEPRECATED_CONSOLIDATED_SCHEMA_PATHS = [
    new URL('../../data/COMPLETE_SCHEMA.sql', import.meta.url),
    new URL('../../data/updated_supabase_schema.sql', import.meta.url),
    new URL('../../data/updated_supabase_migration.sql', import.meta.url)
];

function normalizeLineEndings(value) {
    return value.replace(/\r\n/g, '\n');
}

function extractFunctionBody(sql, functionName) {
    const functionPattern = new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?AS \\$([A-Za-z0-9_]*)\\$([\\s\\S]*?)\\$\\1\\$;`,
        'm'
    );
    const match = sql.match(functionPattern);

    expect(match, `Expected SQL contract for ${functionName} to exist.`).not.toBeNull();

    return normalizeLineEndings(match[2]);
}

describe('database migration contracts', () => {
    it('archives sessions without deleting immutable evidence', () => {
        const sql = readFileSync(SESSION_ARCHIVE_TRANSITION_PATH, 'utf8');
        const archiveBody = extractFunctionBody(sql, 'archive_live_demo_session');
        const compatibilityBody = extractFunctionBody(sql, 'delete_live_demo_session');
        const writeAccessBody = extractFunctionBody(sql, 'live_demo_can_write_session');

        expect(archiveBody).toContain("SET status = 'archived'");
        expect(archiveBody).toContain('SET is_active = false');
        expect(archiveBody).toContain("'SESSION_CLOSED'");
        expect(archiveBody).toContain('public.record_research_event(');
        expect(archiveBody).not.toMatch(/DELETE\s+FROM\s+public\.sessions/i);
        expect(compatibilityBody).toContain('public.archive_live_demo_session(requested_session_id)');
        expect(compatibilityBody).not.toMatch(/DELETE\s+FROM\s+public\.sessions/i);
        expect(writeAccessBody).toContain("s.status = 'active'");
        expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.archive_live_demo_session(UUID) TO authenticated;');
    });

    it('keeps first-time public seat claims on the internal stale-seat cleanup helper', () => {
        const sql = readFileSync(GLOBAL_WHITE_CELL_ROLE_CONTRACT_PATH, 'utf8');
        const claimSessionRoleSeatBody = extractFunctionBody(sql, 'claim_session_role_seat');

        expect(claimSessionRoleSeatBody).toContain('release_stale_session_role_seats_internal');
        expect(claimSessionRoleSeatBody).not.toContain(
            'release_stale_session_role_seats(requested_session_id, normalized_timeout_seconds)'
        );
    });

    it('ships the facilitator, scribe, and notetaker seat limits in the current role contract', () => {
        const sql = readFileSync(GLOBAL_WHITE_CELL_ROLE_CONTRACT_PATH, 'utf8');
        const seatLimitBody = extractFunctionBody(sql, 'get_session_role_seat_limit');

        expect(seatLimitBody).toContain("requested_role ~ '^(blue|red|green|industry)_facilitator$' THEN 1");
        expect(seatLimitBody).toContain("requested_role ~ '^(blue|red|green|industry)_scribe$' THEN 1");
        expect(seatLimitBody).toContain("requested_role ~ '^(blue|red|green|industry)_notetaker$' THEN 2");
        expect(seatLimitBody).not.toContain("requested_role = 'viewer'");
    });

    it('allows White Cell communications to target facilitator, scribe, and notetaker seats', () => {
        const sql = readFileSync(WHITE_CELL_BACKEND_ALIGNMENT_PATH, 'utf8');
        const sendCommunicationBody = extractFunctionBody(sql, 'operator_send_communication');

        expect(sendCommunicationBody).toContain("'blue_facilitator'");
        expect(sendCommunicationBody).toContain("'blue_scribe'");
        expect(sendCommunicationBody).toContain("'blue_notetaker'");
        expect(sendCommunicationBody).toContain("'industry'");
        expect(sendCommunicationBody).toContain("'industry_facilitator'");
        expect(sendCommunicationBody).toContain("'industry_scribe'");
        expect(sendCommunicationBody).toContain("'industry_notetaker'");
        expect(sendCommunicationBody).toContain('requested_metadata');
    });

    it('allows proposal communication types in the current communications contract', () => {
        const sql = readFileSync(WHITE_CELL_BACKEND_ALIGNMENT_PATH, 'utf8');

        expect(sql).toContain('DROP CONSTRAINT IF EXISTS communications_type_check');
        expect(sql).toContain("'PROPOSAL_FORWARDED'");
        expect(sql).toContain("'PROPOSAL_RESPONSE'");
        expect(sql).toContain('ADD CONSTRAINT communications_type_check');
    });

    it('keeps the current build communications patch idempotent when the type constraint already exists', () => {
        const sql = readFileSync(CURRENT_BUILD_SUPABASE_PATCH_PATH, 'utf8');

        expect(sql).toContain('DROP CONSTRAINT IF EXISTS communications_type_check');
        expect(sql).toContain("'PROPOSAL_FORWARDED'");
        expect(sql).toContain("'PROPOSAL_RESPONSE'");
        expect(sql).toContain('ADD CONSTRAINT communications_type_check');
    });

    it('ships a backend proposal recipient status RPC with the canonical inbox states', () => {
        const sql = readFileSync(WHITE_CELL_BACKEND_ALIGNMENT_PATH, 'utf8');
        const proposalStatusBody = extractFunctionBody(sql, 'update_proposal_recipient_status');

        expect(proposalStatusBody).toContain("'unread'");
        expect(proposalStatusBody).toContain("'acknowledged'");
        expect(proposalStatusBody).toContain("'responded'");
        expect(proposalStatusBody).toContain("'declined'");
        expect(proposalStatusBody).toContain("'ignored'");
        expect(proposalStatusBody).toContain("participant_surface NOT IN ('facilitator', 'scribe')");
        expect(proposalStatusBody).toContain("current_status IN ('responded', 'declined', 'ignored')");
        expect(proposalStatusBody).not.toContain('updated_at = NOW()');
    });

    it('extends participant removal to White Cell while still revoking linked White Cell grants', () => {
        const sql = readFileSync(WHITE_CELL_BACKEND_ALIGNMENT_PATH, 'utf8');
        const removeParticipantBody = extractFunctionBody(sql, 'operator_remove_session_participant');

        expect(removeParticipantBody).toContain("live_demo_has_operator_grant('gamemaster')");
        expect(removeParticipantBody).toContain("live_demo_has_operator_grant('whitecell')");
        expect(removeParticipantBody).toContain('DELETE FROM public.session_participants');
        expect(removeParticipantBody).toContain('DELETE FROM public.operator_grants');
        expect(removeParticipantBody).toContain("og.surface = 'whitecell'");
    });

    it('allows facilitator and scribe proposal responses through the hardened communications insert policy', () => {
        const sql = readFileSync(WHITE_CELL_BACKEND_ALIGNMENT_PATH, 'utf8');

        expect(sql).toContain('CREATE POLICY communications_live_demo_insert');
        expect(sql).toContain("live_demo_can_write_session_surface(session_id, ARRAY['facilitator', 'scribe']::TEXT[])");
        expect(sql).toContain("type = 'PROPOSAL_RESPONSE'");
        expect(sql).toContain("LOWER(BTRIM(to_role)) = 'white_cell'");
        expect(sql).toContain("LOWER(BTRIM(from_role)) = public.live_demo_participant_role(session_id)");
        expect(sql).toContain("forwarded.type = 'PROPOSAL_FORWARDED'");
        expect(sql).toContain("NOT IN ('responded', 'declined', 'ignored')");
    });

    it('ships a follow-up patch for already-provisioned databases that preserves the final response lock', () => {
        const sql = readFileSync(PROPOSAL_RESPONSE_FINALIZATION_LOCK_PATH, 'utf8');
        const proposalStatusBody = extractFunctionBody(sql, 'update_proposal_recipient_status');

        expect(proposalStatusBody).toContain("current_status IN ('responded', 'declined', 'ignored')");
        expect(sql).toContain('DROP POLICY IF EXISTS communications_live_demo_insert ON public.communications;');
        expect(sql).toContain("type = 'PROPOSAL_RESPONSE'");
        expect(sql).toContain("forwarded.type = 'PROPOSAL_FORWARDED'");
        expect(sql).toContain("NOT IN ('responded', 'declined', 'ignored')");
    });

    it('ships a follow-up patch that adds Industry to live Supabase role contracts', () => {
        const sql = readFileSync(INDUSTRY_TEAM_ROLE_CONTRACT_PATH, 'utf8');
        const seatLimitBody = extractFunctionBody(sql, 'get_session_role_seat_limit');
        const claimSeatBody = extractFunctionBody(sql, 'claim_session_role_seat');
        const sendCommunicationBody = extractFunctionBody(sql, 'operator_send_communication');

        expect(seatLimitBody).toContain("normalized_role ~ '^(blue|red|green|industry)_facilitator$' THEN 1");
        expect(seatLimitBody).toContain("normalized_role ~ '^(blue|red|green|industry)_scribe$' THEN 1");
        expect(seatLimitBody).toContain("normalized_role ~ '^(blue|red|green|industry)_notetaker$' THEN 2");
        expect(claimSeatBody).toContain("WHEN normalized_role ~ '^(blue|red|green|industry)_' THEN split_part(normalized_role, '_', 1)");
        expect(sendCommunicationBody).toContain("'industry'");
        expect(sendCommunicationBody).toContain("'industry_facilitator'");
        expect(sendCommunicationBody).toContain("'industry_scribe'");
        expect(sendCommunicationBody).toContain("'industry_notetaker'");
        expect(sql).toContain("WHEN forwarded.to_role IN ('blue', 'red', 'green', 'industry') THEN forwarded.to_role");
    });

    it('allows legacy same-team *_scribe seats to submit only forwarded action rows', () => {
        const sql = readFileSync(SCRIBE_ACTION_SUBMIT_POLICY_PATH, 'utf8');

        expect(sql).toContain('DROP POLICY IF EXISTS actions_live_demo_update ON public.actions;');
        expect(sql).toContain('CREATE POLICY actions_live_demo_update');
        expect(sql).toContain("live_demo_can_write_team_session(session_id, team, ARRAY['facilitator']::TEXT[])");
        expect(sql).toContain("live_demo_can_write_team_session(session_id, team, ARRAY['scribe']::TEXT[])");
        expect(sql).toContain("AND status = 'draft'");
        expect(sql).toContain("AND status IN ('draft', 'submitted')");
        expect(sql).toContain("LIKE '%scribe handoff: forwarded%'");
        expect(sql).toContain("LIKE 'strategic orientation details%'");
        expect(sql).toContain("LIKE 'blue team action details%'");
        expect(sql).toContain("status <> 'adjudicated'");
    });

    it('extends legacy same-team *_scribe submission rights to forwarded proposals', () => {
        const sql = readFileSync(SCRIBE_PROPOSAL_SUBMIT_POLICY_PATH, 'utf8');

        expect(sql).toContain('DROP POLICY IF EXISTS actions_live_demo_update ON public.actions;');
        expect(sql).toContain('CREATE POLICY actions_live_demo_update');
        expect(sql).toContain("live_demo_can_write_team_session(session_id, team, ARRAY['scribe']::TEXT[])");
        expect(sql).toContain("mechanism = 'Proposal'");
        expect(sql).toContain("LIKE 'proposal details%'");
        expect(sql).toContain("LIKE '%scribe handoff: forwarded%'");
        expect(sql).toContain("AND status IN ('draft', 'submitted')");
        expect(sql).toContain("status <> 'adjudicated'");
    });

    it('recovers Industry Scribe and Facilitator submission permissions without cross-team writes', () => {
        const sql = readFileSync(INDUSTRY_SUBMISSION_PERMISSIONS_PATH, 'utf8');
        const participantRoleBody = extractFunctionBody(sql, 'live_demo_participant_role');
        const participantSurfaceBody = extractFunctionBody(sql, 'live_demo_participant_surface');
        const participantTeamBody = extractFunctionBody(sql, 'live_demo_participant_team');

        expect(participantRoleBody).toContain(
            'public.live_demo_normalize_role(COALESCE(sp.role, p.role))'
        );
        expect(participantSurfaceBody).toContain(
            "resolved_role ~ '^(blue|red|green|industry)_facilitator$'"
        );
        expect(participantSurfaceBody).toContain(
            "resolved_role ~ '^sme_(econ|ni_escalation|diplomacy_information|tsj|verba)$'"
        );
        expect(participantTeamBody).toContain(
            "resolved_role ~ '^(blue|red|green|industry)_'"
        );
        expect(sql).toContain('CREATE POLICY actions_industry_submission_insert');
        expect(sql).toContain('CREATE POLICY actions_industry_submission_update');
        expect(sql).toContain('CREATE POLICY requests_industry_submission_insert');
        expect(sql).toContain('CREATE POLICY requests_industry_submission_update');
        expect(sql).toContain("LOWER(BTRIM(team)) = 'industry'");
        expect(sql).toContain("ARRAY['facilitator']::TEXT[]");
        expect(sql).toContain("ARRAY['scribe']::TEXT[]");
        expect(sql).toContain("workflow_state = 'forwarded_to_facilitator'");
        expect(sql).toContain("workflow_state = 'submitted_to_white_cell'");
        expect(sql).toContain("'strategic_orientation_forecast'");
        expect(sql).toContain("'proposal'");
        expect(sql).toContain("status <> 'adjudicated'");
        expect(sql).not.toContain("LOWER(BTRIM(team)) IN ('blue', 'red', 'green', 'industry')");
    });

    it('normalizes participant seat roles before RLS derives write surface and team', () => {
        const sql = readFileSync(PARTICIPANT_ROLE_RESOLVER_NORMALIZATION_PATH, 'utf8');
        const normalizeRoleBody = extractFunctionBody(sql, 'live_demo_normalize_role');
        const participantRoleBody = extractFunctionBody(sql, 'live_demo_participant_role');
        const participantSurfaceBody = extractFunctionBody(sql, 'live_demo_participant_surface');
        const participantTeamBody = extractFunctionBody(sql, 'live_demo_participant_team');
        const seatLimitBody = extractFunctionBody(sql, 'get_session_role_seat_limit');

        expect(normalizeRoleBody).toContain("regexp_replace(\n        LOWER(COALESCE(requested_role, '')),\n        '[^a-z_]+'");
        expect(normalizeRoleBody).toContain("RETURN 'whitecell_lead';");
        expect(participantRoleBody).toContain('public.live_demo_normalize_role(COALESCE(sp.role, p.role))');
        expect(participantSurfaceBody).toContain("resolved_role ~ '^(blue|red|green|industry)_facilitator$'");
        expect(participantSurfaceBody).toContain("resolved_role ~ '^whitecell(_lead|_support)?$'");
        expect(participantTeamBody).toContain("split_part(resolved_role, '_', 1)");
        expect(seatLimitBody).toContain('public.live_demo_normalize_role(requested_role)');
        expect(sql).toContain('UPDATE public.session_participants sp');
        expect(sql).toContain('UPDATE public.participants p');
        expect(sql).toContain('INSERT INTO public.game_state');
        expect(sql).toContain('ON CONFLICT (session_id) DO NOTHING;');
    });

    it('adds protected game-state timer allocations for White Cell run control', () => {
        const sql = readFileSync(TIMER_ALLOCATIONS_GAME_STATE_PATH, 'utf8');
        const updateGameStateBody = extractFunctionBody(sql, 'operator_update_game_state');

        expect(sql).toContain('ADD COLUMN IF NOT EXISTS timer_allocations JSONB');
        expect(sql).toContain("'strategic_orientation'");
        expect(sql).toContain("'move_1'");
        expect(sql).toContain("'move_2'");
        expect(sql).toContain("'move_3'");
        expect(sql).toContain('requested_timer_allocations JSONB DEFAULT NULL');
        expect(updateGameStateBody).toContain('public.normalize_game_state_timer_allocations(requested_timer_allocations)');
        expect(updateGameStateBody).toContain("public.live_demo_has_operator_grant('whitecell'");
        expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.operator_update_game_state(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ, JSONB) TO authenticated;');
    });

    it('adds protected game-state plugin state for White Cell plugin management', () => {
        const sql = readFileSync(WHITE_CELL_PLUGINS_GAME_STATE_PATH, 'utf8');
        const updateGameStateBody = extractFunctionBody(sql, 'operator_update_game_state');

        expect(sql).toContain('ADD COLUMN IF NOT EXISTS plugin_state JSONB');
        expect(sql).toContain('CREATE OR REPLACE FUNCTION public.normalize_game_state_plugin_state');
        expect(sql).toContain('requested_plugin_state JSONB DEFAULT NULL');
        expect(updateGameStateBody).toContain('public.normalize_game_state_plugin_state(requested_plugin_state)');
        expect(updateGameStateBody).toContain("public.live_demo_has_operator_grant('whitecell'");
        expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.operator_update_game_state(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ, JSONB, JSONB) TO authenticated;');
    });

    it('adds private intercom announcement storage for oversized voice clips', () => {
        const sql = readFileSync(INTERCOM_STORAGE_BUCKET_PATH, 'utf8');

        expect(sql).toContain("INSERT INTO storage.buckets");
        expect(sql).toContain("'intercom-announcements'");
        expect(sql).toContain('public = EXCLUDED.public');
        expect(sql).toContain("'audio/webm;codecs=opus'");
        expect(sql).toContain("'audio/webm'");
        expect(sql).toContain("'audio/ogg;codecs=opus'");
        expect(sql).toContain("'audio/ogg'");
        expect(sql).toContain("'audio/mp4'");
        expect(sql).toContain('CREATE OR REPLACE FUNCTION public.intercom_storage_session_id');
        expect(sql).toContain('CREATE POLICY intercom_announcements_session_read');
        expect(sql).toContain('public.live_demo_can_read_session(public.intercom_storage_session_id(name))');
        expect(sql).toContain('CREATE POLICY intercom_announcements_operator_insert');
        expect(sql).toContain("public.live_demo_has_operator_grant('gamemaster')");
        expect(sql).toContain("public.live_demo_has_operator_grant(\n                    'whitecell'");
        expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.intercom_storage_session_id(TEXT) TO authenticated;');
    });

    it('normalizes seat-claim role input before seat-limit evaluation', () => {
        const sql = readFileSync(SEAT_CLAIM_ROLE_NORMALIZATION_PATH, 'utf8');
        const seatLimitBody = extractFunctionBody(sql, 'get_session_role_seat_limit');
        const claimSeatBody = extractFunctionBody(sql, 'claim_session_role_seat');

        expect(seatLimitBody).toContain("regexp_replace(LOWER(COALESCE(requested_role, '')), '[^a-z_]+', '', 'g')");
        expect(claimSeatBody).toContain("regexp_replace(\n        LOWER(COALESCE(requested_role, '')),\n        '[^a-z_]+'");
        expect(claimSeatBody).toContain('sanitized_requested_role');
        expect(claimSeatBody).toContain('role_limit := public.get_session_role_seat_limit(normalized_role);');
        expect(claimSeatBody).not.toContain('role_limit INTEGER := public.get_session_role_seat_limit(normalized_role);');
        expect(claimSeatBody).toContain('public.get_session_role_seat_limit(normalized_role)');
    });

    it('moves operator code hash lookup into the protected runtime config table', () => {
        const sql = readFileSync(OPERATOR_CODE_RUNTIME_CONFIG_PATH, 'utf8');
        const operatorCodeHashBody = extractFunctionBody(sql, 'live_demo_operator_code_hash');

        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.live_demo_runtime_config');
        expect(sql).toContain("REVOKE ALL ON public.live_demo_runtime_config FROM anon;");
        expect(sql).toContain("REVOKE ALL ON public.live_demo_runtime_config FROM authenticated;");
        expect(sql).toContain("current_setting('app.settings.live_demo_operator_code_sha256', true)");
        expect(sql).toContain('SECURITY DEFINER');
        expect(operatorCodeHashBody).toContain('FROM public.live_demo_runtime_config');
        expect(operatorCodeHashBody).toContain("WHERE config_key = 'operator_code_sha256'");
        expect(operatorCodeHashBody).not.toContain('current_setting(');
    });

    it('ships the research capture runtime config and protected lookup helpers', () => {
        const sql = readFileSync(RESEARCH_EXPORT_CAPTURE_PATH, 'utf8');
        const captureModeBody = extractFunctionBody(sql, 'live_demo_research_capture_mode');
        const softwareBuildHashBody = extractFunctionBody(sql, 'live_demo_software_build_hash');

        expect(sql).toContain("VALUES ('research_capture_mode', 'research')");
        expect(sql).toContain("VALUES ('software_build_hash', '')");
        expect(captureModeBody).toContain("WHERE config_key = 'research_capture_mode'");
        expect(captureModeBody).toContain("THEN 'standard'");
        expect(captureModeBody).toContain("ELSE 'research'");
        expect(softwareBuildHashBody).toContain("WHERE config_key = 'software_build_hash'");
    });

    it('adds the research export schema and append-only audit spine', () => {
        const sql = readFileSync(RESEARCH_EXPORT_CAPTURE_PATH, 'utf8');
        const recordResearchEventBody = extractFunctionBody(sql, 'record_research_event');

        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.research_audit_event_log');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.research_note');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.research_draft_revision');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.research_action_content');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.research_proposal_content');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.research_move_response_content');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.research_rfi_content');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.research_export_codebook');
        expect(sql).toContain('research_audit_event_log is append-only');
        expect(recordResearchEventBody).toContain('extensions.digest');
        expect(recordResearchEventBody).toContain('previous_row.event_hash');
        expect(recordResearchEventBody).toContain('INSERT INTO public.research_audit_event_log');
    });

    it('adds first-class artifact and workflow contracts with fail-closed uniqueness', () => {
        const sql = readFileSync(ACTION_ARTIFACT_WORKFLOW_INTEGRITY_PATH, 'utf8');

        expect(sql).toContain('ADD COLUMN IF NOT EXISTS artifact_type TEXT');
        expect(sql).toContain('ADD COLUMN IF NOT EXISTS workflow_state TEXT');
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS artifact_payload JSONB NOT NULL DEFAULT '{}'::jsonb");
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS forecast_targets JSONB NOT NULL DEFAULT '[]'::jsonb");
        expect(sql).toContain('ADD COLUMN IF NOT EXISTS proposal_recipient_team TEXT');
        expect(sql).toContain('ADD COLUMN IF NOT EXISTS idempotency_key TEXT');
        expect(sql).toContain('ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1');
        expect(sql).toContain("'strategic_orientation_selection'");
        expect(sql).toContain("'strategic_orientation_forecast'");
        expect(sql).toContain("artifact_type <> 'strategic_orientation_selection' OR LOWER(team) = 'blue'");
        expect(sql).toContain("OR LOWER(team) IN ('red', 'green', 'industry')");
        expect(sql).toContain("'proposal'");
        expect(sql).toContain("'move_response'");
        expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_one_orientation_per_session_team');
        expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_session_idempotency_key');
        expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_communications_one_forward_per_proposal');
        expect(sql).toContain('Existing malformed rows are surfaced as blockers');
    });

    it('moves action lifecycle and audit truth into database triggers', () => {
        const sql = readFileSync(ACTION_ARTIFACT_WORKFLOW_INTEGRITY_PATH, 'utf8');
        const normalizeBody = extractFunctionBody(sql, 'normalize_action_workflow_write');
        const auditBody = extractFunctionBody(sql, 'audit_action_workflow_write');

        expect(normalizeBody).toContain('clock_timestamp()');
        expect(normalizeBody).toContain('does not match current game state');
        expect(normalizeBody).toContain('New artifacts must begin in draft or submitted state');
        expect(normalizeBody).toContain('Invalid action status transition');
        expect(normalizeBody).toContain('Submitted and adjudicated artifact content is immutable');
        expect(normalizeBody).toContain('Only draft artifacts can be soft deleted');
        expect(normalizeBody).toContain("OLD.status = 'draft' AND NEW.status = 'submitted'");
        expect(normalizeBody).toContain('NEW.draft_duration_seconds');
        expect(normalizeBody).toContain('NEW.submission_to_adjudication_seconds');
        expect(auditBody).toContain('INSERT INTO public.action_logs');
        expect(auditBody).toContain('pg_advisory_xact_lock');
        expect(auditBody).toContain('public.record_research_event');
        expect(sql).toContain('CREATE TRIGGER normalize_action_workflow_write');
        expect(sql).toContain('CREATE TRIGGER audit_action_workflow_write');
    });

    it('ships one atomic and idempotent proposal review and forwarding RPC', () => {
        const sql = readFileSync(ACTION_ARTIFACT_WORKFLOW_INTEGRITY_PATH, 'utf8');
        const reviewProposalBody = extractFunctionBody(sql, 'operator_review_proposal');

        expect(reviewProposalBody).toContain("normalized_decision NOT IN ('forward_to_recipient', 'request_changes', 'reject')");
        expect(reviewProposalBody).toContain('public.operator_adjudicate_action');
        expect(reviewProposalBody).toContain("'proposal_review_decision', normalized_decision");
        expect(reviewProposalBody).toContain("'PROPOSAL_FORWARDED'");
        expect(reviewProposalBody).toContain("'instruments', CASE");
        expect(reviewProposalBody).toContain("'Instruments'");
        expect(reviewProposalBody).toContain("'recipientTeams'");
        expect(reviewProposalBody).toContain("'focusSectors'");
        expect(reviewProposalBody).toContain("'supplyChainFocusDecision'");
        expect(reviewProposalBody).toContain("'supplyChainActionAngles'");
        expect(reviewProposalBody).toContain("'supplyChainAreas'");
        expect(reviewProposalBody).toContain("'industryFocus'");
        expect(reviewProposalBody).toContain("'countryFocus'");
        expect(reviewProposalBody).toContain("'proposedActivity'");
        expect(reviewProposalBody).toContain('INSERT INTO public.communications');
        expect(reviewProposalBody).toContain('INSERT INTO public.timeline');
        expect(reviewProposalBody).toContain("'idempotent_replay', true");
        expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.operator_review_proposal(UUID, TEXT, TEXT, TEXT) TO authenticated;');
    });

    it('adds team-neutral workflow metadata without backfilling historical rows', () => {
        const sql = readFileSync(TEAM_NEUTRAL_ARTIFACT_REVIEW_PATH, 'utf8');
        const schemaSection = sql.split('-- 2. ACTION WORKFLOW NORMALIZATION')[0];

        expect(schemaSection).toContain('ADD COLUMN IF NOT EXISTS revision_number BIGINT');
        expect(schemaSection).toContain('ADD COLUMN IF NOT EXISTS workflow_state TEXT');
        expect(schemaSection).toContain('CREATE TABLE IF NOT EXISTS public.artifact_workflow_reviews');
        expect(schemaSection).toContain("'draft'");
        expect(schemaSection).toContain("'forwarded_to_facilitator'");
        expect(schemaSection).toContain("'submitted_to_white_cell'");
        expect(schemaSection).toContain("'returned_to_team'");
        expect(schemaSection).toContain("'resubmitted'");
        expect(schemaSection).toContain("'completed'");
        expect(schemaSection).toContain("'returned_to_blue'");
        expect(schemaSection).not.toMatch(/UPDATE\s+public\.(actions|requests)\s+SET/i);
        expect(schemaSection).toContain('ALTER COLUMN revision_number SET DEFAULT 1');
        expect(schemaSection).toContain('Historical NULL revision_number values are');
    });

    it('keeps both workflow normalizers bound to the ordered trigger contract', () => {
        const integritySql = readFileSync(ACTION_ARTIFACT_WORKFLOW_INTEGRITY_PATH, 'utf8');
        const reviewSql = readFileSync(TEAM_NEUTRAL_ARTIFACT_REVIEW_PATH, 'utf8');
        const actionNormalizer = extractFunctionBody(reviewSql, 'normalize_action_workflow_write');
        const requestNormalizer = extractFunctionBody(reviewSql, 'normalize_request_workflow_write');

        expect(integritySql).toContain('CREATE TRIGGER normalize_action_workflow_write');
        expect(integritySql).toContain('EXECUTE FUNCTION public.normalize_action_workflow_write()');
        expect(reviewSql).toContain('CREATE OR REPLACE FUNCTION public.normalize_action_workflow_write()');
        expect(actionNormalizer).toContain("public.live_demo_participant_surface(NEW.session_id) = 'whitecell'");
        expect(actionNormalizer).toContain('public.live_demo_has_operator_grant(');
        expect(actionNormalizer).toContain("OLD.workflow_state = 'completed'");
        expect(actionNormalizer).toContain('Completed artifacts are immutable.');
        expect(reviewSql).toContain('DROP TRIGGER IF EXISTS normalize_request_workflow_write ON public.requests;');
        expect(reviewSql).toContain('CREATE TRIGGER normalize_request_workflow_write');
        expect(reviewSql).toContain('EXECUTE FUNCTION public.normalize_request_workflow_write()');
        expect(requestNormalizer).toContain("public.live_demo_participant_surface(NEW.session_id) = 'whitecell'");
        expect(requestNormalizer).toContain('public.live_demo_has_operator_grant(');
        expect(requestNormalizer).toContain("OLD.status IN ('answered', 'withdrawn')");
        expect(requestNormalizer).toContain('Completed artifacts are immutable.');
    });

    it('uses one fail-closed White Cell review contract for actions, proposals, orientations, and RFIs', () => {
        const sql = readFileSync(TEAM_NEUTRAL_ARTIFACT_REVIEW_PATH, 'utf8');
        const reviewBody = extractFunctionBody(sql, 'operator_review_artifact');
        const requestWorkflowBody = extractFunctionBody(sql, 'normalize_request_workflow_write');

        expect(reviewBody).toContain("normalized_kind NOT IN ('action', 'strategic_orientation', 'rfi')");
        expect(reviewBody).toContain("normalized_team NOT IN ('blue', 'red', 'green', 'industry')");
        expect(reviewBody).toContain("action_row.artifact_type IN ('action', 'move_response')");
        expect(reviewBody).toContain("normalized_team IN ('blue', 'red')");
        expect(reviewBody).toContain("action_row.artifact_type = 'proposal'");
        expect(reviewBody).toContain("normalized_team IN ('green', 'industry')");
        expect(reviewBody).toContain("'strategic_orientation_selection'");
        expect(reviewBody).toContain("'strategic_orientation_forecast'");
        expect(reviewBody).toContain("normalized_decision <> 'return_for_clarification'");
        expect(reviewBody).toContain("normalized_decision IN ('return_to_team', 'return_for_clarification')");
        expect(reviewBody).toContain('Reviewer notes are required for every return.');
        expect(reviewBody).toContain('Requested team does not match the artifact submitting team.');
        expect(reviewBody).toContain('White Cell operator authorization is required.');
        expect(reviewBody.match(/auth\.uid\(\) IS NULL/g)).toHaveLength(2);
        expect(reviewBody.match(/public\.live_demo_participant_surface\([^)]*\) <> 'whitecell'/g)).toHaveLength(2);
        expect(reviewBody.match(/public\.live_demo_has_operator_grant\(/g)).toHaveLength(2);
        expect(reviewBody).toContain('Stale artifact revision. Expected %, current %.');
        expect(reviewBody.match(/Stale artifact revision\. Expected %, current %\./g)).toHaveLength(2);
        expect(reviewBody).toContain("action_row.workflow_state = 'completed'");
        expect(reviewBody).toContain("request_row.status IN ('answered', 'withdrawn')");
        expect(reviewBody.match(/Completed artifacts are immutable\./g)).toHaveLength(2);
        expect(reviewBody).toContain("effective_workflow_state NOT IN ('submitted_to_white_cell', 'resubmitted')");
        expect(reviewBody.match(/FOR UPDATE;/g)).toHaveLength(2);
        expect(requestWorkflowBody).toContain("OLD.status IN ('answered', 'withdrawn')");
        expect(requestWorkflowBody).toContain('Completed artifacts are immutable.');
        expect(requestWorkflowBody).toContain('content_changed');
        expect(requestWorkflowBody).toContain("OLD.workflow_state = 'returned_to_team'");
        expect(requestWorkflowBody).toContain("NEW.workflow_state := 'resubmitted'");
        expect(sql).toContain('CREATE TRIGGER normalize_request_workflow_write');
    });

    it('completes without outcomes and atomically records review provenance', () => {
        const sql = readFileSync(TEAM_NEUTRAL_ARTIFACT_REVIEW_PATH, 'utf8');
        const reviewBody = extractFunctionBody(sql, 'operator_review_artifact');
        const legacyWrapperBody = extractFunctionBody(sql, 'operator_return_action_to_blue');

        expect(reviewBody).toContain("WHEN normalized_decision = 'complete' THEN 'adjudicated'");
        expect(reviewBody).toContain("WHEN normalized_decision = 'complete' THEN 'completed'");
        expect(reviewBody).toContain('outcome = NULL');
        expect(reviewBody).toContain("COALESCE(a.adjudication, '{}'::jsonb) - 'outcome'");
        expect(reviewBody).toContain('revision_number = next_revision');
        expect(reviewBody).toContain('prior_workflow_state = action_row.workflow_state');
        expect(reviewBody).toContain('reviewed_by_role = reviewer_role');
        expect(reviewBody).toContain('INSERT INTO public.artifact_workflow_reviews');
        expect(reviewBody.match(/INSERT INTO public\.artifact_workflow_reviews/g)).toHaveLength(2);
        expect(reviewBody).toContain('prior_state');
        expect(reviewBody).toContain('new_state');
        expect(reviewBody).toContain("to_regclass('public.pli_adjudications')");

        const rfiPathStart = reviewBody.indexOf('-- RFI clarification return path.');
        const actionPath = reviewBody.slice(0, rfiPathStart);
        const rfiPath = reviewBody.slice(rfiPathStart);

        expect(actionPath.indexOf('UPDATE public.actions a')).toBeGreaterThan(-1);
        expect(actionPath.indexOf('INSERT INTO public.artifact_workflow_reviews')).toBeGreaterThan(
            actionPath.indexOf('UPDATE public.actions a')
        );
        expect(rfiPath.indexOf('UPDATE public.requests r')).toBeGreaterThan(-1);
        expect(rfiPath.indexOf('INSERT INTO public.artifact_workflow_reviews')).toBeGreaterThan(
            rfiPath.indexOf('UPDATE public.requests r')
        );
        expect(legacyWrapperBody).toContain('public.operator_review_artifact');
        expect(legacyWrapperBody).toContain("LOWER(BTRIM(action_row.team)) <> 'blue'");
        expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.operator_review_artifact(TEXT, UUID, TEXT, TEXT, BIGINT, TEXT)');
    });

    it('keeps review history append-only behind session RLS and authenticated RPC grants', () => {
        const sql = normalizeLineEndings(
            readFileSync(TEAM_NEUTRAL_ARTIFACT_REVIEW_PATH, 'utf8')
        );

        expect(sql).toContain('ALTER TABLE public.artifact_workflow_reviews ENABLE ROW LEVEL SECURITY;');
        expect(sql).toContain('CREATE POLICY artifact_workflow_reviews_select');
        expect(sql).toContain('USING (public.live_demo_can_read_session(session_id));');
        expect(sql).toContain('REVOKE ALL ON public.artifact_workflow_reviews FROM PUBLIC;');
        expect(sql).toContain('REVOKE ALL ON public.artifact_workflow_reviews FROM anon;');
        expect(sql).toContain(
            'REVOKE INSERT, UPDATE, DELETE, TRUNCATE\n    ON public.artifact_workflow_reviews FROM authenticated;'
        );
        expect(sql).toContain('GRANT SELECT ON public.artifact_workflow_reviews TO authenticated;');
        expect(sql).not.toMatch(/CREATE POLICY artifact_workflow_reviews_[^;]*FOR (?:INSERT|UPDATE|DELETE|ALL)/);
        expect(sql).toContain("'Append-only White Cell artifact review transitions. Writes are owned by operator_review_artifact.';");

        expect(sql).toContain(
            'REVOKE ALL ON FUNCTION public.operator_review_artifact(TEXT, UUID, TEXT, TEXT, BIGINT, TEXT)\n    FROM PUBLIC;'
        );
        expect(sql).toContain(
            'REVOKE ALL ON FUNCTION public.operator_review_artifact(TEXT, UUID, TEXT, TEXT, BIGINT, TEXT)\n    FROM anon;'
        );
        expect(sql).toContain(
            'GRANT EXECUTE ON FUNCTION public.operator_review_artifact(TEXT, UUID, TEXT, TEXT, BIGINT, TEXT)\n    TO authenticated;'
        );
        expect(sql).toContain('REVOKE ALL ON FUNCTION public.operator_return_action_to_blue(UUID, TEXT) FROM PUBLIC;');
        expect(sql).toContain('REVOKE ALL ON FUNCTION public.operator_return_action_to_blue(UUID, TEXT) FROM anon;');
        expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.operator_return_action_to_blue(UUID, TEXT) TO authenticated;');
        expect(sql).toContain('COMMENT ON FUNCTION public.operator_review_artifact(TEXT, UUID, TEXT, TEXT, BIGINT, TEXT) IS');
        expect(sql).toContain('COMMENT ON FUNCTION public.operator_return_action_to_blue(UUID, TEXT) IS');
        expect(sql).toContain('COMMENT ON COLUMN public.actions.revision_number IS');
        expect(sql).toContain('COMMENT ON COLUMN public.requests.workflow_state IS');
        expect(sql).toContain('COMMENT ON COLUMN public.requests.revision_number IS');
    });

    it('assigns RFIs and direct White Cell text to the actual Facilitator seat with team isolation', () => {
        const sql = readFileSync(FACILITATOR_RFI_COMMUNICATIONS_PATH, 'utf8');

        expect(sql).toContain("ARRAY['scribe']::TEXT[]");
        expect(sql).toContain("workflow_state = 'submitted_to_white_cell'");
        expect(sql).toContain("workflow_state = 'returned_to_team'");
        expect(sql).toContain("LOWER(BTRIM(team)) = public.live_demo_participant_team(session_id)");
        expect(sql).toContain("LOWER(BTRIM(type)) = 'direct'");
        expect(sql).toContain("LOWER(BTRIM(to_role)) = 'white_cell'");
        expect(sql).toContain("metadata ->> 'source_team'");
        expect(sql).toContain("artifact_type IN ('strategic_orientation_forecast', 'proposal')");
        expect(sql).toContain('CREATE TRIGGER zz_guard_facilitator_request_write');
        expect(sql).toContain('Facilitators may only revise RFI question and category content.');
    });

    it('repairs the responder field required by the Facilitator RFI insert guard without rewriting history', () => {
        const repairSql = readFileSync(REQUESTS_RESPONDED_BY_SCHEMA_REPAIR_PATH, 'utf8');
        const currentBuildPatch = readFileSync(CURRENT_BUILD_SUPABASE_PATCH_PATH, 'utf8');

        expect(repairSql).toContain('ALTER TABLE public.requests');
        expect(repairSql).toContain('ADD COLUMN IF NOT EXISTS responded_by TEXT');
        expect(repairSql).not.toMatch(/\bUPDATE\s+public\.requests\b/i);
        expect(repairSql).not.toMatch(/\bDROP\s+(?:COLUMN|TABLE|TRIGGER|POLICY)\b/i);
        expect(currentBuildPatch).toContain('ADD COLUMN IF NOT EXISTS responded_by TEXT');
    });

    it('keeps linked RFI response history without rewriting a terminal request', () => {
        const repairSql = readFileSync(RFI_ANSWER_COMPLETION_TRIGGER_PATH, 'utf8');
        const currentBuildPatch = readFileSync(CURRENT_BUILD_SUPABASE_PATCH_PATH, 'utf8');

        for (const sql of [repairSql, currentBuildPatch]) {
            const functionBody = extractFunctionBody(sql, 'update_request_response_time');
            expect(functionBody).toContain("NEW.type IN ('rfi_response', 'RFI_RESPONSE')");
            expect(functionBody).toContain("status NOT IN ('answered', 'withdrawn')");
            expect(functionBody).toContain(
                "COALESCE(workflow_state, 'submitted_to_white_cell') <> 'completed'"
            );
        }

        expect(repairSql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|POLICY)/i);
        expect(repairSql).toContain('operator_answer_request remains the single completion write');
    });

    it('canonicalizes all four Strategic Orientation team types before constraint enforcement', () => {
        const sql = readFileSync(STRATEGIC_ORIENTATION_TEAM_CANONICALIZATION_PATH, 'utf8');
        const functionBody = extractFunctionBody(
            sql,
            'canonicalize_strategic_orientation_artifact_type'
        );

        expect(functionBody).toContain("normalized_team = 'blue'");
        expect(functionBody).toContain("NEW.artifact_type := 'strategic_orientation_selection'");
        expect(functionBody).toContain("normalized_team IN ('red', 'green', 'industry')");
        expect(functionBody).toContain("NEW.artifact_type := 'strategic_orientation_forecast'");
        expect(functionBody).toContain("USING ERRCODE = '23514'");
        expect(sql).toContain('CREATE TRIGGER canonicalize_strategic_orientation_artifact_type');
        expect(sql).toContain('BEFORE INSERT OR UPDATE ON public.actions');
        expect(sql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|CONSTRAINT|POLICY)/i);
        expect(sql).not.toMatch(/UPDATE\s+public\.actions/i);
    });

    it('atomically completes actions and informs only authored Green or Industry recipients', () => {
        const sql = normalizeLineEndings(readFileSync(ACTION_NOTIFICATION_DELIVERY_PATH, 'utf8'));
        const functionBody = extractFunctionBody(sql, 'operator_complete_action_with_notifications');
        const reviewCallIndex = functionBody.indexOf('public.operator_review_artifact(');
        const communicationCallIndex = functionBody.indexOf('public.operator_send_communication(');

        expect(functionBody).toContain("normalized_team NOT IN ('blue', 'red')");
        expect(functionBody).toContain("action_row.artifact_type NOT IN ('action', 'move_response')");
        expect(functionBody).toContain("selected.team NOT IN ('green', 'industry')");
        expect(functionBody).toContain("action_row.artifact_payload -> 'action' -> 'notificationTeams'");
        expect(functionBody).toContain('White Cell may only inform teams requested in the submitted action.');
        expect(functionBody).toContain("'ACTION_NOTIFICATION'");
        expect(functionBody).toContain("'notification_delivery', 'approved'");
        expect(functionBody).toContain("'action_snapshot'");
        expect(reviewCallIndex).toBeGreaterThan(-1);
        expect(communicationCallIndex).toBeGreaterThan(reviewCallIndex);
        expect(sql).toContain(
            'GRANT EXECUTE ON FUNCTION public.operator_complete_action_with_notifications(\n    UUID, TEXT, BIGINT, TEXT, TEXT[], TEXT\n) TO authenticated;'
        );
        expect(sql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|CONSTRAINT|POLICY)/i);
        expect(sql).not.toMatch(/UPDATE\s+public\.actions/i);
    });

    it('includes the action title in the atomic notification snapshot', () => {
        const sql = normalizeLineEndings(readFileSync(ACTION_NOTIFICATION_TITLE_SNAPSHOT_PATH, 'utf8'));
        const functionBody = extractFunctionBody(sql, 'operator_complete_action_with_notifications');

        expect(functionBody).toContain("'action_snapshot', COALESCE(action_row.artifact_payload -> 'action', '{}'::jsonb)");
        expect(functionBody).toContain("COALESCE(NULLIF(BTRIM(action_row.goal), ''), 'Untitled action')");
        expect(sql).toContain(
            'GRANT EXECUTE ON FUNCTION public.operator_complete_action_with_notifications(\n    UUID, TEXT, BIGINT, TEXT, TEXT[], TEXT\n) TO authenticated;'
        );
        expect(sql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|CONSTRAINT|POLICY)/i);
        expect(sql).not.toMatch(/UPDATE\s+public\.actions/i);
    });

    it('extends the communication type constraint for atomic action notifications', () => {
        const sql = normalizeLineEndings(readFileSync(ACTION_NOTIFICATION_TYPE_CONTRACT_PATH, 'utf8'));
        const allowedTypes = [
            'INJECT',
            'ANNOUNCEMENT',
            'GUIDANCE',
            'PROPOSAL_FORWARDED',
            'PROPOSAL_RESPONSE',
            'ACTION_NOTIFICATION',
            'rfi_response',
            'RFI_RESPONSE',
            'broadcast',
            'direct',
            'system',
            'game_update',
            'message'
        ];

        expect(sql).toContain('BEGIN;');
        expect(sql).toContain('DROP CONSTRAINT IF EXISTS communications_type_check');
        expect(sql).toContain('ADD CONSTRAINT communications_type_check');
        allowedTypes.forEach((type) => expect(sql).toContain(`'${type}'`));
        expect(sql).toContain('COMMIT;');
        expect(sql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|POLICY)/i);
        expect(sql).not.toMatch(/(?:UPDATE|DELETE\s+FROM)\s+public\.communications/i);
    });

    it('marks obsolete consolidated SQL artifacts as non-installable', () => {
        DEPRECATED_CONSOLIDATED_SCHEMA_PATHS.forEach((schemaPath) => {
            const sql = readFileSync(schemaPath, 'utf8');
            const header = sql.slice(0, 900);

            expect(header).toContain('DEPRECATED HISTORICAL');
            expect(header).toContain('NOT A CURRENT INSTALL PATH');
            expect(header).toContain('Do not execute');
            expect(header).toContain('docs/supabase-setup.md');
            expect(header).toContain('data/2026-08-05_team_neutral_artifact_review.sql');
        });
    });

    it('gates research-table reads through session access and keeps the identity map out of normal reads', () => {
        const sql = readFileSync(RESEARCH_EXPORT_CAPTURE_PATH, 'utf8');

        expect(sql).toContain('CREATE POLICY research_audit_event_log_select');
        expect(sql).toContain('USING (public.live_demo_can_read_session(session_id));');
        expect(sql).toContain('CREATE POLICY research_note_revision_select');
        expect(sql).toContain('EXISTS (');
        expect(sql).toContain('REVOKE ALL ON public.research_identity_map FROM authenticated;');
        expect(sql).toContain('CREATE POLICY research_export_codebook_select');
        expect(sql).toContain('USING (true);');
    });

    it('ships SME handoffs table and shared-code SME authorize surface', () => {
        const sql = readFileSync(SME_HANDOFFS_PATH, 'utf8');
        const authorizeBody = extractFunctionBody(sql, 'authorize_demo_operator');
        const seatLimitBody = extractFunctionBody(sql, 'get_session_role_seat_limit');
        const claimBody = extractFunctionBody(sql, 'claim_session_role_seat');
        const surfaceBody = extractFunctionBody(sql, 'live_demo_participant_surface');

        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.sme_handoffs');
        expect(sql).toContain("seat TEXT NOT NULL CHECK (seat IN ('tsj', 'verba'))");
        expect(sql).toContain('CONSTRAINT sme_handoffs_action_seat_unique UNIQUE (action_id, seat)');
        expect(authorizeBody).toContain("normalized_surface NOT IN ('gamemaster', 'whitecell', 'sme')");
        expect(authorizeBody).toContain("'sme_econ'");
        expect(authorizeBody).toContain("'sme_ni_escalation'");
        expect(authorizeBody).toContain("'sme_diplomacy_information'");
        expect(authorizeBody).toContain("'sme_tsj'");
        expect(authorizeBody).toContain("'sme_verba'");
        expect(seatLimitBody).toContain("'sme_econ'");
        expect(claimBody).toContain("SME seats require operator authorization.");
        expect(surfaceBody).toContain("RETURN 'sme'");
        expect(sql).toContain("ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]");
    });

    it('supersedes the one-shot proposal response lock with recipient-isolated append-only threads', () => {
        const sql = readFileSync(PROPOSAL_RECIPIENT_THREADS_PATH, 'utf8');
        const approvalBody = extractFunctionBody(sql, 'operator_review_proposal');
        const appendBody = extractFunctionBody(sql, 'append_proposal_thread_message');

        expect(sql).toContain('communications_proposal_thread_round_unique');
        expect(sql).toContain('communications_proposal_client_message_unique');
        expect(sql).toContain('guard_proposal_thread_message_immutability');
        expect(approvalBody).toContain("normalized_decision <> 'forward_to_recipient'");
        expect(approvalBody).toContain("'recipient_team', normalized_recipient");
        expect(approvalBody).toContain("'round_number', 0");
        expect(approvalBody).toContain("'message_type', 'proposal_forwarded'");
        expect(approvalBody).not.toContain('operator_adjudicate_action');
        expect(appendBody).toContain("parent_round + 1");
        expect(appendBody).toContain("'parent_message_id', parent_row.id");
        expect(appendBody).toContain("participant_team NOT IN (source_team, recipient_team)");
        expect(appendBody).toContain("Closed proposal threads are immutable.");
        expect(sql).toContain("type IN ('PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE')");
        expect(sql).toContain("public.live_demo_participant_team(session_id) IN (");
        expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.append_proposal_thread_message');
    });
});
