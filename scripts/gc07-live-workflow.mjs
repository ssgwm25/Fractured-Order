import { check, one, rows, denied, regions, writeArgs, assertBlockedMutation } from './gc07-live-contract.mjs';

export async function notificationWorkflow(session, { rpc, request, record, fresh }) {
    const wc = session.actors.find(a => a.role === 'whitecell_lead');
    for (const team of ['blue','red']) {
        await fresh(session);
        const author = session.actors.find(a => a.role === `${team}_scribe`);
        const filter = `session_id=eq.${session.id}&team=eq.${team}&artifact_type=eq.action&select=*`;
        const action = one(await request(wc, `/rest/v1/actions?${filter}`));
        check(action.goal === `GC07 synthetic notification fixture ${team}` && action.workflow_state === 'submitted_to_white_cell', 'expected synthetic submitted action');
        const read = who => request(who, `/rest/v1/communications?session_id=eq.${session.id}&type=eq.ACTION_NOTIFICATION&metadata->>shared_action_id=eq.${action.id}&select=*`);
        const args = { requested_action_id: action.id, requested_team: team, requested_expected_revision: action.revision_number,
            requested_reviewer_notes: 'GC07 synthetic approval only', requested_notification_teams: ['green'],
            requested_notification_content: 'GC07 synthetic approved action notification' };
        check(rows(await read(wc)).length === 0, 'action notification delivered before approval');
        denied(await rpc(author,'operator_complete_action_with_notifications',args));
        denied(await rpc(wc,'operator_complete_action_with_notifications',{ ...args,requested_notification_teams: ['industry'] }));
        check(rows(await read(wc)).length === 0 && one(await request(wc, `/rest/v1/actions?${filter}`)).workflow_state === 'submitted_to_white_cell', 'denied notification altered submitted action');
        const approved = one(await rpc(wc,'operator_complete_action_with_notifications',args));
        check(approved.artifact?.workflow_state === 'completed' && approved.communications?.length === 1, 'atomic action completion/delivery');
        const message = approved.communications[0];
        check(message.metadata?.notification_delivery === 'approved', 'approval provenance missing');
        if (session.model !== 'unified') check(message.recipient_scope === 'both_green_delegations'
            && JSON.stringify(message.metadata.resolved_delivery_audience) === JSON.stringify(regions), 'action notification must reach both regions');
        const readers = session.actors.filter(a => session.model === 'unified' ? a.role.startsWith('green_')
            : ['green_asian_pacific_scribe','green_europe_scribe','green_shared_facilitator'].includes(a.role));
        for (const who of readers) check(rows(await read(who)).some(c => c.id === message.id), 'approved action notification missing for intended reader');
        await record(`${session.model}: ${team} notification denied before approval and delivered after approval`, { artifactId: action.id,message });
    }
}

// The injected participant transport always uses the actor's hosted Auth JWT.
// No Management API or role/header override is available to this workflow.
export async function workflow(session, { rpc, request, record, fresh }) {
    const actor = role => session.actors.find(a => a.role === role);
    const wc = actor('whitecell_lead');
    const fac = region => actor(session.model === 'unified' ? 'green_scribe' : session.model === 'shared'
        ? 'green_shared_facilitator' : `green_${region}_facilitator`);
    const scribe = region => actor(`green_${region}_scribe`);
    const read = (who, table, filter) => request(who, `/rest/v1/${table}?session_id=eq.${session.id}&${filter}&select=*`);
    const visible = async (who, table, id, count = 1) => {
        const found = rows(await read(who, table, `id=eq.${id}`));
        check(found.length === count, `${who.role} ${table} ${id}: expected ${count} visible rows`);
        return found[0];
    };
    const write = (who, region, rfi, key, query) => rpc(who, 'write_regional_rfi', writeArgs(session, region, rfi, key, query));
    const answer = (who, region, rfi) => rpc(who, 'operator_answer_regional_rfi', {
        requested_session_id: session.id, requested_delegation_id: region, requested_request_id: rfi.id,
        requested_expected_revision: rfi.revision_number, requested_response: 'GC07 synthetic answer'
    });
    const send = (who, region) => rpc(who, 'send_regional_direct_message', { requested_session_id: session.id,
        requested_delegation_id: region, requested_content: 'GC07 synthetic private coordination', requested_client_key: 'direct-retry' });
    const note = (label, details = {}) => record(`${session.model}: ${label}`, details);
    if (session.model === 'unified') {
        const rfi = one(await request(fac(), '/rest/v1/requests', 'POST', { session_id: session.id, team: 'green',
            query: 'GC07 synthetic unified question?', categories: ['Other'], move: 1, phase: 1 }));
        const answered = one(await rpc(wc, 'operator_answer_request', { requested_request_id: rfi.id, requested_response: 'GC07 legacy answer' }));
        check(answered.id === rfi.id && answered.delegation_id === null && answered.status === 'answered', 'legacy RFI identity/answer');
        await visible(actor('green_facilitator'), 'requests', rfi.id);
        await note('legacy RFI creation and answer without relabeling', answered);
        return;
    }
    // Settle both HTTP requests before propagating any failure to fixture cleanup.
    const parallel = await Promise.allSettled(regions.map(region => write(fac(region), region)));
    check(parallel.every(r => r.status === 'fulfilled'), 'both regional HTTP creates must settle successfully');
    const created = parallel.map(r => one(r.value));
    check(created[0].id !== created[1].id, 'same retry key must not merge regional RFIs');
    await note('concurrent hosted regional creates', created);
    for (const [index, region] of regions.entries()) {
        await fresh(session);
        const other = regions.find(r => r !== region), original = created[index];
        check(original.delegation_id === region && original.revision_number === 1, 'RFI scope/revision');
        check(one(await write(fac(region), region)).id === original.id, 'RFI retry duplicated');
        await visible(scribe(region), 'requests', original.id);
        await visible(scribe(other), 'requests', original.id, 0);
        if (session.model === 'pairs') {
            await visible(fac(other), 'requests', original.id, 0);
            denied(await write(fac(other), region));
        }
        denied(await write(fac(region), null));
        denied(await write(scribe(region), region));
        denied(await send(scribe(region), region));
        denied(await answer(fac(region), region, original));
        const before = await visible(fac(region), 'requests', original.id);
        assertBlockedMutation(await request(fac(region), `/rest/v1/requests?id=eq.${original.id}`, 'PATCH',
            { delegation_id: other }), before, await visible(fac(region), 'requests', original.id));
        const returned = one(await rpc(wc, 'operator_review_artifact', { requested_artifact_kind: 'rfi',
            requested_artifact_id: original.id, requested_review_decision: 'return_for_clarification', requested_team: 'green',
            requested_expected_revision: original.revision_number, requested_reviewer_notes: 'GC07 synthetic clarification' })).artifact;
        check(returned.id === original.id && returned.revision_number === 2 && returned.delegation_id === region, 'return owner/revision');
        const history = rows(await read(fac(region), 'artifact_workflow_reviews', `artifact_id=eq.${original.id}`));
        check(history.length > 0, 'review history must be readable');
        denied(await answer(wc, region, returned), ['23514']);
        denied(await write(fac(region), region, original, null, 'GC07 stale corrected question?'), ['PT409']);
        denied(await write(fac(region), other, returned, null, 'GC07 forged correction question?'));
        const corrected = one(await write(fac(region), region, returned, null, 'GC07 corrected regional question?'));
        check(corrected.id === original.id && corrected.revision_number === 2 && corrected.workflow_state === 'resubmitted', 'same revision correction');
        denied(await answer(wc, region, original), ['PT409']);
        denied(await rpc(wc, 'operator_answer_request', { requested_request_id: original.id, requested_response: 'Denied bypass' }));
        const completed = one(await answer(wc, region, corrected));
        check(completed.workflow_state === 'completed' && completed.id === original.id, 'answer completion');
        const replies = rows(await read(scribe(region), 'communications', `linked_request_id=eq.${original.id}`));
        check(replies.length === 1 && replies[0].recipient_scope === 'delegation' && replies[0].recipient_delegation_id === region, 'answer audience');
        await visible(scribe(other), 'communications', replies[0].id, 0);
        check(JSON.stringify(rows(await read(fac(region), 'artifact_workflow_reviews', `artifact_id=eq.${original.id}`))) === JSON.stringify(history), 'review history changed');
        const direct = one(await send(fac(region), region));
        check(one(await send(fac(region), region)).id === direct.id && direct.delegation_id === region
            && direct.from_role === fac(region).role && direct.to_role === 'white_cell', 'direct sender/scope/retry');
        await visible(wc, 'communications', direct.id);
        for (const r of regions) await visible(scribe(r), 'communications', direct.id, 0);
        if (session.model === 'pairs') await visible(fac(other), 'communications', direct.id, 0);
        await note(`${region} RFI cycle and private direct isolation`, { completed, replies, direct, reviewIds: history.map(h => h.id) });
    }
    await fresh(session);
    const targets = ['green_asian_pacific', 'green_europe', 'green', 'green_europe_scribe'];
    for (const target of targets) {
        const c = one(await rpc(wc, 'operator_send_communication', { requested_session_id: session.id,
            requested_to_role: target, requested_type: 'GUIDANCE', requested_content: 'GC07 synthetic audience check',
            requested_metadata: { recipient_team: 'green', content_kind: 'TRIBE_STREET_JOURNAL' } }));
        const expected = target === 'green' ? regions : target.endsWith('_scribe') ? [target] : [target.slice(6)];
        check(JSON.stringify(c.metadata?.resolved_delivery_audience) === JSON.stringify(expected), 'canonical audience receipt');
        for (const region of regions) {
            await visible(scribe(region), 'communications', c.id, target === 'green' || target === `green_${region}`
                || target === `green_${region}_scribe` ? 1 : 0);
        }
        if (target.endsWith('_scribe')) await visible(fac('europe'), 'communications', c.id, 0);
        await note(`${target} persisted audience and actual recipient reads`, c);
    }
    denied(await rpc(wc, 'operator_send_communication', { requested_session_id: session.id, requested_to_role: 'green',
        requested_type: 'GUIDANCE', requested_content: 'GC07 forbidden broadened audience',
        requested_metadata: { recipient_role: 'green_europe_scribe' } }), ['23514']);
    const deckRoles = session.model === 'shared' ? ['green_shared_facilitator'] : regions.map(r => `green_${r}_facilitator`);
    for (const target of deckRoles) {
        const c = one(await rpc(wc, 'operator_send_communication', { requested_session_id: session.id, requested_to_role: target,
            requested_type: 'GUIDANCE', requested_content: 'GC07 synthetic repository deck assignment',
            requested_metadata: { content_kind: 'DECK_ASSIGNMENT' } }));
        await visible(actor(target), 'communications', c.id);
        for (const region of regions) await visible(scribe(region), 'communications', c.id, 0);
        await note('deck notice role isolation (transport only)', c);
    }
}
