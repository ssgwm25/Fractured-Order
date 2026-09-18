// Pure verification contracts: importing this file performs no I/O.
export const BOUNDARY_TABLES = [
    'game_state', 'session_participants', 'actions', 'requests', 'communications', 'timeline',
    'notetaker_data', 'artifact_workflow_reviews', 'action_logs', 'reports', 'move_completions',
    'game_state_transitions', 'participant_activity', 'data_completeness_checks', 'action_relationships',
    'rfi_action_links', 'pli_adjudications', 'sme_handoffs', 'sme_pli_packets', 'research_audit_event_log',
    'research_participant', 'research_note', 'research_draft_revision', 'research_state_transition',
    'research_action_content', 'research_proposal_content', 'research_adjudication_content',
    'research_move_response_content', 'research_rfi_content', 'research_interaction_edge',
    'research_data_quality_event', 'research_derived_participant_metrics', 'research_derived_session_metrics',
    'research_identity_map'
];
export const uuid = value => {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        throw new Error('Invalid fixture UUID');
    }
    return value;
};
export const sqlId = value => `'${uuid(value)}'`;
export function check(value, label) { if (!value) throw new Error(`FAIL: ${label}`); }
export function ok(response, label) {
    check(Number.isInteger(response?.status) && response.status >= 200 && response.status < 300, label);
    return response.data;
}
export function rows(response, label) {
    const data = ok(response, label);
    check(Array.isArray(data), `${label}: expected array`);
    return data;
}
export function denied(response, label, code = '42501', message) {
    check([400, 403, 409].includes(response?.status) && response.data?.code === code
        && (!message || response.data.message === message), label);
}
export function conflict(response, label, message) {
    check(response?.status === 409 && response.data?.code === 'PT409'
        && (!message || response.data.message === message), label);
}
export const TERMINAL_CONFLICT_FUNCTIONS = {
    save_scoped_notetaker_data: 1, operator_review_artifact: 2, operator_review_proposal: 1,
    gc02_unified_append_proposal_thread_message: 1, operator_forward_proposal_response: 1
};
export function hidden(response, label) { check(rows(response, label).length === 0, label); }
export function unchanged(response, label) {
    if (response?.status === 403 && response.data?.code === '42501') return;
    if (response?.status === 400 && response.data?.code === '23514'
        && /GC02_.*IMMUTABLE|immutable/i.test(response.data.message || '')) return;
    hidden(response, label);
}
export function one(response, label) {
    const data = rows(response, label); check(data.length === 1, `${label}: exactly one existing row`); return data[0];
}
export function assertInventory(data) {
    const normalizeIndex = expression => (expression || '').replace(/[\s()]/g, '').toLowerCase();
    const rootPredicate = "type='proposal_forwarded'::textandnullifmetadata->>'source_proposal_id'::text,''::textisnotnull";
    for (const [name, keys, predicate] of [
        ['communications_proposal_recipient_root_unique', ["metadata->>'source_proposal_id'::text", "lowermetadata->>'recipient_team'::text"], rootPredicate],
        ['idx_communications_one_forward_per_proposal', ["metadata->>'source_proposal_id'::text"],
            rootPredicate + "andnullifbtrimmetadata->>'thread_id'::text,''::textisnull"]
    ]) {
        const index = data.indexes?.find(i => i.name === name);
        check(index?.unique === true && index.valid === true && index.ready === true
            && JSON.stringify(index.keys?.map(normalizeIndex)) === JSON.stringify(keys)
            && normalizeIndex(index.predicate) === predicate,
        `recipient forward index ${name}; apply 2026-09-21_gc03_recipient_forward_uniqueness.sql before a new run`);
    }
    for (const [name, sites] of Object.entries(TERMINAL_CONFLICT_FUNCTIONS)) {
        const definitions = data.functions.filter(f => f.name === name);
        check(definitions.length === 1 && definitions[0].definition?.split("ERRCODE = 'PT409'").length - 1 === sites
            && !/ERRCODE\s*=\s*'40001'/i.test(definitions[0].definition),
        `terminal conflicts in ${name}; apply 2026-09-20_gc03_terminal_revision_conflicts.sql before a new run`);
    }
    for (const table of BOUNDARY_TABLES) {
        const entry = data.tables.find(t => t.name === table);
        check(entry?.rls === true && entry.authority_trigger === true, `RLS/trigger on ${table}`);
        const p = data.policies.find(p => p.tablename === table && p.policyname === 'green_storage_boundary');
        const expression = new RegExp(`^\\(*(?:public\\.)?green_can_read_record\\('${table}'::text,to_jsonb\\(${table}(?:\\.\\*)?\\)\\)\\)*$`);
        check(p?.permissive === 'RESTRICTIVE' && p.cmd === 'ALL' && p.roles.includes('authenticated')
            && expression.test(p.qual?.replace(/\s/g, '')) && expression.test(p.with_check?.replace(/\s/g, '')), `restrictive boundary on ${table}`);
    }
    const note = data.policies.find(p => p.tablename === 'research_note_revision' && p.policyname === 'green_note_revision_boundary');
    check(note?.permissive === 'RESTRICTIVE' && note.cmd === 'ALL'
        && note.qual?.includes('green_can_read_record') && note.with_check?.includes('green_can_read_record'), 'note revision boundary');
    for (const name of ['scoped_notetaker_data', 'research_note_revision']) {
        check(data.tables.some(t => t.name === name && t.rls === true), `${name} RLS enabled`);
    }
    const requiredPrivate = ['gc03_legacy_claim', 'gc03_legacy_heartbeat', 'gc03_legacy_remove',
        'gc03_legacy_disconnect', 'gc03_legacy_release', 'gc02_unified_append_proposal_thread_message'];
    for (const name of requiredPrivate) check(data.functions.some(f => f.name === name), `private implementation ${name} exists`);
    for (const f of data.functions.filter(f => f.name.startsWith('gc03_') || f.name.startsWith('gc02_unified_'))) {
        check(f.anon_execute === false && f.authenticated_execute === false, `${f.name} cannot bypass wrappers`);
    }
}
export function assertEdgeLogs(expected, data) {
    check(data && !data.error && Array.isArray(data.result), 'successful log query');
    for (const request of expected) {
        uuid(request.correlationId);
        const events = data.result.map(row => {
            try { return JSON.parse(row.event_message); } catch { return null; }
        }).filter(event => event?.request_id === request.correlationId);
        check(events.length > 0, `server log for ${request.correlationId}`);
        check(events.every(e => e.event === 'derived_authorization' && e.authorized === false
            && e.external_dispatch_started === false && e.operation === request.operation
            && e.deployment_id === request.deploymentId), `matching version and no dispatch for ${request.correlationId}`);
    }
    check(expected.length === 6 && new Set(expected.map(e => e.correlationId)).size === 6, 'six independent Edge rejections');
}
export function logQuery(expected) {
    check(expected.length === 6, 'six Edge request IDs required');
    return `SELECT timestamp, id, event_message FROM logs WHERE source = 'function_logs' AND (`
        + expected.map(e => `event_message LIKE '%${uuid(e.correlationId)}%'`).join(' OR ')
        + ') ORDER BY timestamp ASC LIMIT 100';
}
