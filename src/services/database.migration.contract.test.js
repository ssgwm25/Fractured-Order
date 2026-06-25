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
const CURRENT_BUILD_SUPABASE_PATCH_PATH = new URL(
    '../../data/CURRENT_BUILD_SUPABASE_PATCH.sql',
    import.meta.url
);

function normalizeLineEndings(value) {
    return value.replace(/\r\n/g, '\n');
}

function extractFunctionBody(sql, functionName) {
    const functionPattern = new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?AS \\\$\\$([\\s\\S]*?)\\$\\$;`,
        'm'
    );
    const match = sql.match(functionPattern);

    expect(match, `Expected SQL contract for ${functionName} to exist.`).not.toBeNull();

    return normalizeLineEndings(match[1]);
}

describe('database migration contracts', () => {
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
});
