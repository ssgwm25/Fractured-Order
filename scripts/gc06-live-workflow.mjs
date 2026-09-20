import { randomUUID } from 'node:crypto';
import { check, one, rows, denied, payload, writeArgs, regions, assertBlockedMutation } from './gc06-live-contract.mjs';

// All operations here use real hosted Auth tokens through the injected transport.
// The Management API is deliberately absent from the participant workflow.
export async function workflow(session, io) {
    const { rpc, request, record, fresh } = io;
    const actor = role => session.actors.find(a => a.role === role);
    const wc = actor('whitecell_lead');
    const author = region => actor(session.model === 'unified' ? 'green_facilitator' : `green_${region}_scribe`);
    const facilitator = region => actor(session.model === 'unified' ? 'green_scribe' : session.model === 'shared' ?
        'green_shared_facilitator' : `green_${region}_facilitator`);
    const write = (who, region, op, a, key, overrides) => rpc(who, 'write_regional_proposal', writeArgs(session, region, op, a, key, overrides));
    const read = (who, table, query) => request(who, `/rest/v1/${table}?${query}`, 'GET');
    const visible = async (who, table, id, expected = 1, column = 'id') => {
        const found = rows(await read(who, table, `${column}=eq.${id}&select=*`));
        check(found.length === expected, `${who.role}: ${table} visibility expected ${expected}, got ${found.length}`); return found;
    };
    const patch = (who, id, body) => request(who, `/rest/v1/actions?id=eq.${id}`, 'PATCH', body);
    const append = (who, parent, key = 'same-thread-key', content = 'GC06 synthetic negotiation') => rpc(who, 'append_proposal_thread_message', {
        requested_parent_message_id: parent.id, requested_content: content, requested_message_type: 'negotiation_message',
        requested_facilitator_decision: null, requested_client_message_id: session.model === 'unified'
            ? `${session.id}:${who.userId}:${parent.metadata.thread_id}:${key}` : key
    });
    const approve = async (a, team) => one(await rpc(wc, 'operator_review_proposal', {
        requested_action_id: a.id, requested_review_decision: 'forward_to_recipient', requested_recipient_team: team,
        requested_expected_revision: a.revision_number, requested_adjudication_notes: 'GC06 synthetic approval only'
    }));
    const returned = async (a, kind = 'action') => one(await rpc(wc, 'operator_review_artifact', {
        requested_artifact_kind: kind, requested_artifact_id: a.id, requested_review_decision: 'return_to_team',
        requested_team: 'green', requested_expected_revision: a.revision_number, requested_reviewer_notes: 'GC06 synthetic correction'
    })).artifact;
    const release = async pending => one(await rpc(wc, 'operator_forward_proposal_response', {
        requested_review_communication_id: pending.id
    })).communication;
    const note = (label, detail = {}) => record(`${session.model}: ${label}`, detail);
    const result = {};
    const workRegions = session.model === 'unified' ? ['europe'] : regions;
    // Start both hosted requests before awaiting either; SQL races separately prove lock contention.
    if (session.model !== 'unified') {
        const drafts = await Promise.allSettled(workRegions.map(region => write(author(region), region, 'save')));
        for (let i = 0; i < drafts.length; i++) {
            check(drafts[i].status === 'fulfilled', 'both draft HTTP requests settled successfully');
            result[workRegions[i]] = one(drafts[i].value);
        }
        check(result.europe.id !== result.asian_pacific.id, 'parallel regional drafts must remain separate');
        await note('parallel drafts, same client key', result);
    }
    for (const region of workRegions) {
        await fresh(session);
        const scribe = author(region), fac = facilitator(region), owner = session.model === 'unified' ? null : region;
        const other = session.model === 'unified' ? null : author(regions.find(r => r !== region));
        let a = result[region];
        if (session.model === 'unified') {
            a = one(await request(scribe, '/rest/v1/actions', 'POST', { session_id: session.id, team: 'green', move: 1, phase: 1,
                mechanism: 'Proposal', artifact_type: 'proposal', proposal_recipient_team: 'blue', ...payload(region, 'Forwarded') }));
            a = one(await patch(fac, a.id, { status: 'submitted' }));
        } else {
            check(a.delegation_id === owner && a.workflow_state === 'draft', 'draft owner/state');
            const retry = one(await write(scribe, region, 'save'));
            check(retry.id === a.id, 'draft retry must return same artifact');
            if (session.model === 'shared') await visible(fac, 'actions', a.id, 0);
            await visible(other, 'actions', a.id, 0);
            denied(await write(fac, region, 'edit', a), ['23514']);
            const before = (await visible(scribe, 'actions', a.id))[0];
            const direct = await patch(fac, a.id, { goal: 'GC06 forbidden edit of an unforwarded draft' });
            assertBlockedMutation(direct, before, (await visible(scribe, 'actions', a.id))[0]);
            await note(`${region} direct RLS draft mutation blocked`, { response: direct, artifactId: a.id });
            denied(await write(other, region, 'forward', a));
            if (session.model === 'pairs') denied(await write(facilitator(regions.find(r => r !== region)), region, 'submit', a));
            denied(await write(scribe, region, 'save', null, 'invalid-origin', { requested_payload: payload(region, 'Draft', 'Unrepresented originator') }), ['23514']);
            a = one(await write(scribe, region, 'forward', a));
            for (const forged of [{ delegation_id: regions.find(r => r !== region) }, { artifact_type: 'orientation_and_forecast' }]) {
                const before = (await visible(scribe, 'actions', a.id))[0];
                assertBlockedMutation(await patch(fac, a.id, forged), before, (await visible(scribe, 'actions', a.id))[0]);
            }
            const old = a;
            a = one(await write(fac, region, 'edit', a));
            denied(await write(fac, region, 'submit', old), ['PT409']);
            const beforeSubmit = a;
            denied(await write(fac, region, 'submit', a, 'stale-revision', { requested_expected_revision: 999 }), ['PT409']);
            a = one(await write(fac, region, 'submit', a));
            denied(await write(fac, region, 'submit', beforeSubmit), ['PT409']);
            check(a.delegation_id === owner && a.workflow_state === 'submitted_to_white_cell', 'submitted owner/state');
        }
        await note(`${region} handoff and submit`, a);
        // Approve only Blue before return; the second revision must require fresh independent approvals.
        const original = (await approve(a, 'blue')).communication;
        a = await returned(a);
        check(a.id && a.delegation_id === owner && a.revision_number === 2, 'return increments revision without changing owner');
        if (other) {
            check(a.proposal_handoff_revision === null, 'return must clear handoff');
            check(a.artifact_payload?.proposal_recipient_review_history?.['1']?.blue?.communication_id === original.id,
                'return preserves prior Blue approval history');
            await visible(other, 'actions', a.id, 0);
            await visible(other, 'artifact_workflow_reviews', a.id, 0, 'artifact_id');
            check(rows(await read(fac, 'artifact_workflow_reviews', `artifact_id=eq.${a.id}&select=id`)).length > 0, 'Facilitator receives review');
            denied(await write(fac, region, 'submit', a), ['23514']);
            denied(await write(other, region, 'forward', a));
            const corrected = { ...payload(region, 'Forwarded'), goal: `GC06 synthetic corrected ${region}` };
            a = one(await write(scribe, region, 'forward', a, 'correction', { requested_payload: corrected }));
            a = one(await write(fac, region, 'submit', a));
        } else {
            one(await patch(scribe, a.id, { goal: 'GC06 synthetic unified correction' }));
            a = one(await patch(fac, a.id, { status: 'submitted' }));
        }
        check(a.workflow_state === 'resubmitted' && a.revision_number === 2 && a.delegation_id === owner, 'corrected resubmission');
        // Legacy unified routing remains its existing revision contract; regional roots are revision-specific.
        if (other) denied(await append(actor('blue_scribe'), original, 'old-revision'));
        const blueApproval = await approve(a, 'blue'), redApproval = await approve(a, 'red');
        const roots = { blue: blueApproval.communication, red: redApproval.communication };
        check(roots.blue.id !== roots.red.id && redApproval.action.workflow_state === 'completed', 'separate Blue/Red approvals');
        if (other) check(roots.blue.id !== original.id, 'fresh revision creates new root');
        await note(`${region} return, correction, separate approvals`, { action: redApproval.action, original, roots });
        for (const team of ['blue', 'red']) {
            await fresh(session);
            const recipient = actor(`${team}_scribe`), foreign = actor(`${team === 'blue' ? 'red' : 'blue'}_scribe`);
            denied(await append(foreign, roots[team], 'wrong-recipient'));
            const pending = one(await append(recipient, roots[team]));
            check(pending.type === 'PROPOSAL_RESPONSE_REVIEW', 'recipient response requires White Cell review');
            check(one(await append(recipient, roots[team])).id === pending.id, 'thread retry idempotency');
            denied(await append(recipient, roots[team], 'duplicate-round'), ['PT409']);
            const released = await release(pending);
            check(released.delegation_id === owner, 'released response keeps owner');
            await visible(fac, 'communications', released.id);
            await visible(scribe, 'communications', released.id);
            await visible(foreign, 'communications', released.id, 0);
            if (other) await visible(other, 'communications', released.id, 0);
            const followup = one(await append(fac, released));
            check(Number(followup.metadata.round_number) === 2 && followup.metadata.parent_message_id === released.id,
                'append-only second round uses released parent');
            if (other) {
                check(followup.sender_delegation_id === region, 'shared/paired response delegation');
                for (const [field, value] of Object.entries({ source_proposal_id: randomUUID(), source_team: 'industry',
                    recipient_team: team === 'blue' ? 'red' : 'blue', thread_id: randomUUID(), source_revision: 999 })) {
                    denied(await request(fac, '/rest/v1/communications', 'POST', { session_id: session.id, from_role: fac.role,
                        to_role: 'white_cell', type: 'PROPOSAL_RESPONSE_REVIEW', content: 'GC06 denied forgery',
                        metadata: { ...followup.metadata, [field]: value } }), ['42501', '23514']);
                }
            }
            denied(await append(recipient, roots[team], 'stale-parent'), ['PT409']);
            const response = await release(followup);
            await visible(recipient, 'communications', response.id);
            await visible(foreign, 'communications', response.id, 0);
            const oldRoot = (await visible(wc, 'communications', roots[team].id))[0];
            check(JSON.stringify(oldRoot.metadata) === JSON.stringify(roots[team].metadata), 'root metadata retained');
            await note(`${region} ${team} isolated rounds`, { pending, released, followup, response });
        }
        result[region] = redApproval.action;
    }
    if (session.model !== 'unified') {
        // Keep the orientation capability enabled while proving a proposal RPC cannot authorize it.
        for (const region of regions) {
            await fresh(session);
            const details = ['Strategic Orientation Details', 'Contract Version: 2', 'Period: pre_move_1',
                'Artifact Type: orientation_and_forecast', 'Team: green',
                'Own Orientation: {"id":"pressure","label":"Pressure","tag":"Focus on affecting PRC GDP growth"}',
                'Forecast Targets: [{"key":"blue","orientation":"pressure"}]',
                'Strategy Description: GC06 synthetic orientation regression', 'Scribe Handoff: Forwarded'].join('\n');
            const args = a => ({ requested_session_id: session.id, requested_delegation_id: region,
                requested_action_id: a?.id ?? null, requested_expected_revision: a?.revision_number ?? null,
                requested_expected_row_version: a?.row_version ?? null });
            const handoff = a => rpc(author(region), 'handoff_regional_orientation', { ...args(a), requested_details: details, requested_goal: 'GC06 synthetic orientation' });
            const submit = a => rpc(facilitator(region), 'submit_regional_orientation', args(a));
            let orientation = one(await handoff());
            denied(await write(facilitator(region), region, 'submit', orientation));
            orientation = one(await submit(orientation));
            orientation = await returned(orientation, 'strategic_orientation');
            orientation = one(await handoff(orientation));
            orientation = one(await submit(orientation));
            check(orientation.revision_number === 2 && orientation.workflow_state === 'resubmitted', 'orientation return still works');
            await note(`${region} orientation compatibility and source-type denial`, orientation);
        }
    }
    if (session.model === 'shared') {
        const fac = facilitator('europe');
        denied(await request(fac, '/rest/v1/requests', 'POST', { session_id: session.id, team: 'green', delegation_id: 'europe', query: 'GC06 forbidden synthetic RFI' }));
        denied(await request(fac, '/rest/v1/communications', 'POST', { session_id: session.id, from_role: fac.role, to_role: 'white_cell',
            type: 'direct', content: 'GC06 forbidden synthetic direct message' }), ['42501', '23514']);
        await note('GC07 RFI and direct-message creation remain closed');
    }
    return result;
}
