import { randomUUID } from 'node:crypto';
import { check, ok, rows, one, hidden, denied, conflict, unchanged, sqlId, BOUNDARY_TABLES } from './gc03-completion-contract.mjs';
import { fixtureGuard, transaction, expireSeatSql } from './gc03-completion-sql.mjs';
import { serializeProposalDetails } from '../src/features/actions/proposalDetails.js';

export const proposalFixtureDetails = scribeHandoff => serializeProposalDetails({
    recipientTeams: ['blue', 'red'], objective: 'GC03 synthetic verification only', scribeHandoff
});

export function assertFixtureRecipients(action, stage) {
    const recipients = action?.artifact_payload?.proposal?.recipientTeams;
    check(Array.isArray(recipients) && recipients.length === 2
        && recipients.includes('blue') && recipients.includes('red'), `${stage}: both fixture recipients retained`);
}

// All permission assertions use participant JWTs through PostgREST, including
// the synthetic White Cell accounts. Owner SQL only prepares/probes fixtures.
export async function completionMatrix({ m, users, request, sql, checkpoint }) {
    const sid = m.sessions.api, life = m.sessions.same;
    const rpc = (who, name, body) => request(who, `/rest/v1/rpc/${name}`, 'POST', body);
    const roles = { apS: 'green_asian_pacific_scribe', apF: 'green_asian_pacific_facilitator', apN: 'green_asian_pacific_notetaker',
        euS: 'green_europe_scribe', euF: 'green_europe_facilitator', euN: 'green_europe_notetaker', blue: 'blue_scribe', red: 'red_scribe',
        wc: 'whitecell_lead', wcLife: 'whitecell_lead', outsider: 'green_asian_pacific_scribe' };
    const seat = {}, seatSession = {};
    const claim = async (who, session = sid, role = roles[who]) => rpc(who, 'claim_session_role_seat', {
        requested_session_id: session, requested_role: role, requested_name: `GC03 TEST ${who}`,
        requested_client_id: `gc03-completion-${m.run}-${who}`, requested_timeout_seconds: 90
    });
    const heartbeat = (who, session = seatSession[who], id = seat[who].id) => rpc(who, 'heartbeat_session_role_seat', {
        requested_session_id: session, requested_session_participant_id: id
    });
    const renew = async () => { for (const who of Object.keys(seat)) ok(await heartbeat(who), `active lease ${who}`); };
    const read = (who, table, filter) => request(who, `/rest/v1/${table}?${filter}`);
    const mutation = (who, table, id, method, body) => request(who, `/rest/v1/${table}?id=eq.${id}`, method, body);
    const review = (who, kind, id, decision, revision) => rpc(who, 'operator_review_artifact', {
        requested_artifact_kind: kind, requested_artifact_id: id, requested_review_decision: decision,
        requested_team: 'green', requested_expected_revision: revision, requested_reviewer_notes: 'GC03 synthetic review only'
    });
    const assertPrivate = async (owner, attackers, table, id, patch) => {
        const original = one(await read(owner, table, `id=eq.${id}`), `${table} positive control`);
        for (const who of attackers) {
            hidden(await read(who, table, `id=eq.${id}`), `${who} cannot read ${table}`);
            unchanged(await mutation(who, table, id, 'PATCH', patch), `${who} cannot patch ${table}`);
            unchanged(await mutation(who, table, id, 'DELETE'), `${who} cannot delete ${table}`);
        }
        const retained = one(await read(owner, table, `id=eq.${id}`), `${table} retained`);
        check(JSON.stringify(retained) === JSON.stringify(original), `${table} unchanged after hostile requests`);
    };
    denied(await claim('apS', m.legacy), 'regional seat rejected in unified session', '42501', 'GC03_TOPOLOGY_ROLE_MISMATCH');
    denied(await claim('apS', sid, 'green_scribe'), 'ambiguous Green rejected in regional session', '42501', 'GC03_TOPOLOGY_ROLE_MISMATCH');
    for (const who of Object.keys(roles)) {
        seatSession[who] = who === 'outsider' ? m.sessions.foreign : who === 'wcLife' ? life : sid;
        seat[who] = ok(await claim(who, seatSession[who]), `claim ${who}`);
        check(seat[who]?.id && seat[who].role === roles[who], `claimed role ${who}`);
    }
    checkpoint('topology and authenticated seats');

    for (const region of ['ap', 'eu']) {
        await renew();
        const who = `${region}N`, other = region === 'ap' ? 'eu' : 'ap';
        const save = expected => rpc(who, 'save_scoped_notetaker_data', {
            requested_session_id: sid, requested_move: 1, requested_phase: 1,
            requested_dynamics: { observation: `GC03 synthetic revision ${expected + 1}` },
            requested_external: {}, requested_observations: [], requested_expected_revision: expected
        });
        const first = ok(await save(0), 'create private notes'), second = ok(await save(1), 'revise private notes');
        check(first.id === second.id && second.revision === 2, 'notes revise in place');
        conflict(await save(1), 'stale note revision rejected', 'GC02_NOTE_REVISION_CONFLICT');
        await assertPrivate(who, [`${other}N`, `${other}S`, `${other}F`, `${region}S`, 'outsider'],
            'scoped_notetaker_data', second.id, { dynamics_analysis: { observation: 'GC03 forbidden edit' } });
    }
    checkpoint('private notes, revision conflicts and cross-seat isolation');

    const completed = {}, rfis = {}, thread = {};
    for (const region of ['ap', 'eu']) {
        await renew();
        const s = `${region}S`, f = `${region}F`, other = region === 'ap' ? 'eu' : 'ap';
        const delegation = region === 'ap' ? 'asian_pacific' : 'europe';
        const attackers = [`${other}S`, `${other}F`, 'outsider'];
        const created = one(await request(s, '/rest/v1/actions', 'POST', {
            session_id: sid, team: 'green', delegation_id: delegation, move: 1, phase: 1, mechanism: 'Proposal', sector: '',
            artifact_type: 'proposal', proposal_recipient_team: 'blue', goal: 'GC03 synthetic workflow fixture',
            ally_contingencies: proposalFixtureDetails('Draft'),
            artifact_payload: { proposal: { recipientTeams: ['blue', 'red'], objective: 'GC03 synthetic verification only' } }
        }), 'draft proposal');
        assertFixtureRecipients(created, 'draft');
        const id = created.id;
        const handedOff = one(await mutation(s, 'actions', id, 'PATCH', { ally_contingencies: proposalFixtureDetails('Forwarded') }), 'handoff');
        assertFixtureRecipients(handedOff, 'handoff');
        const submitted = one(await mutation(f, 'actions', id, 'PATCH', { status: 'submitted' }), 'Facilitator submits');
        assertFixtureRecipients(submitted, 'submission');
        check(submitted.status === 'submitted', 'submitted status');
        for (const who of attackers) denied(await review(who, 'action', id, 'return_to_team', 1), 'unauthorized review');
        const returned = ok(await review('wc', 'action', id, 'return_to_team', 1), 'White Cell return');
        check(returned.artifact.revision_number === 2 && returned.review.prior_state.revision_number === 1
            && returned.review.new_state.revision_number === 2, 'immutable review before/after snapshots');
        await assertPrivate(f, attackers, 'artifact_workflow_reviews', returned.review.id, { reviewer_notes: 'GC03 forbidden edit' });
        const revised = one(await mutation(s, 'actions', id, 'PATCH', { goal: 'GC03 synthetic revised proposal' }), 'revise returned draft');
        assertFixtureRecipients(revised, 'revision');
        const resubmitted = one(await mutation(f, 'actions', id, 'PATCH', { status: 'submitted' }), 'resubmit');
        assertFixtureRecipients(resubmitted, 'resubmission');
        conflict(await review('wc', 'action', id, 'complete', 1), 'stale review rejected');
        thread[region] = {};
        for (const recipient of ['blue', 'red']) {
            const args = { requested_action_id: id, requested_review_decision: 'forward_to_recipient',
                requested_recipient_team: recipient, requested_expected_revision: 2,
                requested_adjudication_notes: 'GC03 synthetic forwarding only' };
            const approved = ok(await rpc('wc', 'operator_review_proposal', args), `${region} ${recipient} recipient approval`);
            thread[region][recipient] = approved.communication;
            check(approved.communication.metadata.recipient_team === recipient, 'recipient-specific root');
            check(!('recipientTeams' in approved.communication.metadata.proposal)
                && !('intendedPartners' in approved.communication.metadata.proposal), 'recipient snapshot excludes routing');
            const retry = ok(await rpc('wc', 'operator_review_proposal', args), 'approval retry');
            check(retry.idempotent_replay === true && retry.communication.id === approved.communication.id, 'approval retry retained root');
            for (const timeline of approved.timeline_events) await assertPrivate(f, attackers, 'timeline', timeline.id, { content: 'GC03 forbidden edit' });
        }
        completed[region] = one(await read(f, 'actions', `id=eq.${id}`), 'completed proposal');
        check(completed[region].workflow_state === 'completed' && completed[region].outcome === null, 'completion invents no outcome');
        unchanged(await mutation(s, 'actions', id, 'PATCH', { goal: 'GC03 forbidden completed edit' }), 'completed immutable');
        const reviewHistory = rows(await read(f, 'artifact_workflow_reviews', `artifact_id=eq.${id}&order=reviewed_at`), 'review history');
        check(reviewHistory.length === 2 && reviewHistory[0].id === returned.review.id, 'return and completion history retained');

        const rfi = one(await request(f, '/rest/v1/requests', 'POST', {
            session_id: sid, team: 'green', delegation_id: delegation, move: 1, phase: 1, query: 'GC03 synthetic clarification fixture'
        }), 'RFI submission');
        rfis[region] = rfi;
        const clarified = ok(await review('wc', 'rfi', rfi.id, 'return_for_clarification', 1), 'RFI return');
        check(clarified.artifact.revision_number === 2, 'RFI revision');
        one(await mutation(f, 'requests', rfi.id, 'PATCH', { query: 'GC03 synthetic revised question', workflow_state: 'resubmitted' }), 'RFI resubmission');
        const answered = ok(await rpc('wc', 'operator_answer_request', { requested_request_id: rfi.id,
            requested_response: 'GC03 synthetic answer, not an exercise decision' }), 'RFI answer');
        check(answered.workflow_state === 'completed' && answered.status === 'answered', 'RFI completed');
        await assertPrivate(f, attackers, 'requests', rfi.id, { query: 'GC03 forbidden edit' });
        const answers = rows(await read(f, 'communications', `linked_request_id=eq.${rfi.id}`), 'RFI answer communication');
        check(answers.length === 1, 'exactly one RFI answer');
        await assertPrivate(f, attackers, 'communications', answers[0].id, { content: 'GC03 forbidden edit' });
    }
    checkpoint('both regional review/return/resubmit/complete and RFI cycles');

    for (const region of ['ap', 'eu']) {
        await renew();
        const other = region === 'ap' ? 'eu' : 'ap';
        for (const recipient of ['blue', 'red']) {
            const otherRecipient = recipient === 'blue' ? 'red' : 'blue';
            const root = thread[region][recipient];
            one(await read(recipient, 'communications', `id=eq.${root.id}`), 'addressed recipient sees root');
            hidden(await read(otherRecipient, 'communications', `id=eq.${root.id}`), 'other recipient cannot see root');
            const args = { requested_parent_message_id: root.id, requested_content: 'GC03 synthetic reply only',
                requested_message_type: 'recipient_response', requested_facilitator_decision: 'negotiate',
                requested_client_message_id: `gc03-${m.run}-${region}-${recipient}` };
            const response = ok(await rpc(recipient, 'append_proposal_thread_message', args), 'recipient reply review');
            const replay = ok(await rpc(recipient, 'append_proposal_thread_message', args), 'reply retry');
            check(replay.id === response.id && response.type === 'PROPOSAL_RESPONSE_REVIEW', 'one pending review on retry');
            for (const who of [otherRecipient, `${other}F`, `${region}F`, 'outsider']) {
                hidden(await read(who, 'communications', `id=eq.${response.id}`), 'pending reply stays private');
            }
            denied(await rpc(otherRecipient, 'append_proposal_thread_message', args), 'recipient retry scope');
            denied(await rpc(`${other}F`, 'append_proposal_thread_message', args), 'regional retry scope');
            denied(await rpc('outsider', 'append_proposal_thread_message', args), 'cross-session retry scope');
            denied(await rpc(recipient, 'operator_forward_proposal_response', { requested_review_communication_id: response.id }), 'participant cannot forward');
            const forwarded = ok(await rpc('wc', 'operator_forward_proposal_response', { requested_review_communication_id: response.id }), 'White Cell forwards');
            const forwardReplay = ok(await rpc('wc', 'operator_forward_proposal_response', { requested_review_communication_id: response.id }), 'forward retry');
            check(forwardReplay.idempotent_replay === true && forwardReplay.communication.id === forwarded.communication.id, 'one forwarded round');
            for (const table of ['communications', 'timeline']) await assertPrivate(`${region}F`,
                [`${other}S`, `${other}F`, otherRecipient, 'outsider'], table,
                table === 'communications' ? forwarded.communication.id : forwarded.timeline_event.id, { content: 'GC03 forbidden edit' });
            conflict(await rpc(recipient, 'append_proposal_thread_message', { ...args, requested_client_message_id: randomUUID() }), 'stale parent fails');
        }
    }
    checkpoint('Blue/Red recipient isolation, pending review and idempotent retries');

    await renew();
    for (const region of ['ap', 'eu']) {
        const who = `${region}S`, other = region === 'ap' ? 'eu' : 'ap';
        const link = { session_id: sid, source_action_id: completed[region].id, target_action_id: m.actions[region], relationship_type: 'influenced_by' };
        const linked = one(await request(who, '/rest/v1/action_relationships', 'POST', link), 'own action link');
        await assertPrivate(who, [`${other}S`, `${other}F`, 'outsider'], 'action_relationships', linked.id, { relationship_type: 'refines' });
        denied(await request(who, '/rest/v1/action_relationships', 'POST', { ...link, target_action_id: completed[other].id }), 'mixed-region action link', '23514', 'GC02_LINK_SCOPE_MISMATCH');
        const rfiLink = { session_id: sid, action_id: completed[region].id, request_id: rfis[region].id };
        const linkedRfi = one(await request(who, '/rest/v1/rfi_action_links', 'POST', rfiLink), 'own RFI link');
        await assertPrivate(who, [`${other}S`, `${other}F`, 'outsider'], 'rfi_action_links', linkedRfi.id, { link_type: 'GC03 forbidden edit' });
        denied(await request(who, '/rest/v1/rfi_action_links', 'POST', { ...rfiLink, request_id: rfis[other].id }), 'mixed-region RFI link', '23514', 'GC02_LINK_SCOPE_MISMATCH');
        const logs = rows(await read(who, 'action_logs', `action_id=eq.${completed[region].id}`), 'own derived action logs');
        check(logs.length > 0, 'nonempty derived positive control');
        await assertPrivate(who, [`${other}S`, `${other}F`, 'outsider'], 'action_logs', logs[0].id, { changed_by_role: 'GC03 forbidden edit' });
    }
    // Explicit owner-created transport fixtures for operator-only research copies.
    // They are labelled synthetic; no participant decision or historical row is changed.
    const noteId = randomUUID(), reportId = randomUUID();
    await sql('derived-fixtures', transaction(fixtureGuard(m) + `
INSERT INTO public.research_note(note_id,session_id,author_pseudonym,author_role,author_team,scope,visibility,content_text,content_length_chars,created_utc,last_edited_utc)
VALUES(${sqlId(noteId)},${sqlId(sid)},'GC03 synthetic','green_asian_pacific_notetaker','green','seat_scoped','private','GC03 synthetic',14,now(),now());
INSERT INTO public.research_note_revision(note_id,version,author_pseudonym,content_text,content_length_chars,edited_utc)
VALUES(${sqlId(noteId)},1,'GC03 synthetic','GC03 synthetic',14,now());
INSERT INTO public.reports(id,session_id,move,phase,report_type,data) VALUES(${sqlId(reportId)},${sqlId(sid)},1,1,'GC03 synthetic','{"gc03Synthetic":true}');`));
    const researchControl = await sql('derived-positive-control', `SELECT
(SELECT count(*) FROM public.research_note_revision WHERE note_id=${sqlId(noteId)}) AS revisions,
(SELECT count(*) FROM public.reports WHERE id=${sqlId(reportId)}) AS reports;`);
    check(Number(researchControl[0]?.revisions) === 1 && Number(researchControl[0]?.reports) === 1, 'nonempty research/derived fixtures');
    for (const who of ['apS', 'apF', 'apN', 'euS', 'euF', 'euN', 'outsider']) {
        hidden(await read(who, 'research_note_revision', `note_id=eq.${noteId}`), 'raw note revisions isolated');
        unchanged(await request(who, `/rest/v1/research_note_revision?note_id=eq.${noteId}`, 'PATCH', { content_text: 'GC03 forbidden' }), 'raw note revision immutable');
        unchanged(await request(who, `/rest/v1/research_note_revision?note_id=eq.${noteId}`, 'DELETE'), 'raw note revision retained');
        hidden(await read(who, 'reports', `id=eq.${reportId}`), 'unscoped report private');
        unchanged(await mutation(who, 'reports', reportId, 'PATCH', { data: { forbidden: true } }), 'unscoped report write denied');
        unchanged(await mutation(who, 'reports', reportId, 'DELETE'), 'unscoped report delete denied');
    }
    const retained = await sql('derived-retained', `SELECT
(SELECT content_text FROM public.research_note_revision WHERE note_id=${sqlId(noteId)} AND version=1) AS content,
(SELECT data FROM public.reports WHERE id=${sqlId(reportId)}) AS report;`);
    check(retained[0]?.content === 'GC03 synthetic' && retained[0]?.report?.gc03Synthetic === true, 'derived evidence retained');
    // Inventory plus helper probes cover operator-only families with no fabricated
    // PLI/scoring records. These are policy assertions, not claims of nonempty REST tests.
    const readable = new Set(['session_participants', 'game_state', 'actions', 'requests', 'communications', 'timeline',
        'artifact_workflow_reviews', 'action_logs', 'action_relationships', 'rfi_action_links']);
    for (const table of BOUNDARY_TABLES.filter(t => !readable.has(t))) {
        for (const who of ['apF', 'euF']) check(ok(await rpc(who, 'green_can_read_record', {
            table_name: table, record: { session_id: sid, team: 'green', delegation_id: who === 'apF' ? 'asian_pacific' : 'europe' }
        }), `derived policy ${table}`) === false, `${table} remains operator-only`);
    }
    checkpoint('timeline, links, research copies and full restrictive-policy inventory');

    await renew();
    const notesBefore = one(await read('apN', 'scoped_notetaker_data', `session_participant_id=eq.${seat.apN.id}`), 'notes before removal');
    ok(await rpc('wc', 'operator_remove_session_participant', { requested_session_id: sid, requested_session_participant_id: seat.apN.id }), 'operator removal');
    denied(await heartbeat('apN'), 'removed seat heartbeat denied', '42501', 'GC03_SEAT_REJOIN_REQUIRED');
    denied(await claim('apN'), 'removed seat cannot reclaim', '42501', 'GC03_SEAT_REVOKED');
    denied(await claim('apN', sid, roles.euN), 'removed identity cannot switch region', '42501', 'GC03_SEAT_REVOKED');
    hidden(await read('apN', 'scoped_notetaker_data', `id=eq.${notesBefore.id}`), 'removed browser cannot recover notes');
    denied(await rpc('apN', 'save_scoped_notetaker_data', { requested_session_id: sid, requested_move: 1, requested_phase: 1,
        requested_dynamics: {}, requested_external: {}, requested_observations: [], requested_expected_revision: 2 }), 'removed browser cannot save');
    check(one(await read('wc', 'scoped_notetaker_data', `id=eq.${notesBefore.id}`), 'operator sees retained notes').revision === 2, 'note history retained');
    delete seat.apN;

    const original = ok(await claim('apS', life), 'lifecycle seat');
    const lifeDraft = one(await request('apS', '/rest/v1/actions', 'POST', {
        session_id: life, team: 'green', delegation_id: 'asian_pacific', move: 1, phase: 1,
        mechanism: 'Proposal', sector: '', artifact_type: 'proposal', proposal_recipient_team: 'blue',
        goal: 'GC03 synthetic lifecycle private draft'
    }), 'lifecycle positive control');
    ok(await rpc('apS', 'disconnect_session_role_seat', { requested_session_id: life, requested_session_participant_id: original.id }), 'disconnect');
    denied(await heartbeat('apS', life, original.id), 'disconnected heartbeat requires rejoin', '42501', 'GC03_SEAT_REJOIN_REQUIRED');
    const rejoined = ok(await claim('apS', life), 'explicit rejoin');
    check(rejoined.id === original.id && rejoined.display_name_snapshot === original.display_name_snapshot, 'rejoin preserves identity and name');
    await sql('expire-exact-test-seat', expireSeatSql(m, original.id, users.apS.id));
    denied(await heartbeat('apS', life, original.id), 'expired browser cannot heartbeat', '42501', 'GC03_SEAT_REJOIN_REQUIRED');
    check(ok(await rpc('apS', 'green_has_capability', { requested_session_id: life, requested_capability: 'draft' }), 'expired capability') === false, 'expired authority closed');
    hidden(await read('apS', 'actions', `id=eq.${lifeDraft.id}`), 'expired browser cannot read its former private draft');
    unchanged(await mutation('apS', 'actions', lifeDraft.id, 'PATCH', { goal: 'GC03 forbidden stale edit' }), 'expired browser cannot write');
    const replacement = ok(await claim('outsider', life), 'replacement claims stale seat');
    check(replacement.id !== original.id, 'new seat for replacement');
    check(one(await read('outsider', 'actions', `id=eq.${lifeDraft.id}`), 'replacement positive control').goal === lifeDraft.goal, 'stale write left evidence intact');
    hidden(await read('apS', 'actions', `id=eq.${lifeDraft.id}`), 'replaced browser cannot read');
    unchanged(await mutation('apS', 'actions', lifeDraft.id, 'DELETE'), 'replaced browser cannot delete');
    denied(await claim('apS', life), 'replaced browser cannot reclaim', '42501', 'GC03_SEAT_REVOKED');
    ok(await rpc('outsider', 'disconnect_session_role_seat', { requested_session_id: life, requested_session_participant_id: replacement.id }), 'replacement disconnect');
    denied(await claim('apS', life), 'replaced identity stays revoked after replacement leaves', '42501', 'GC03_SEAT_REVOKED');
    await renew();
    // A scoped White Cell grant in api must not authorize another fixture session.
    denied(await rpc('wc', 'operator_remove_session_participant', { requested_session_id: life, requested_session_participant_id: replacement.id }), 'operator grant cross-session');
    await sql('withdraw-exact-test-grant', transaction(fixtureGuard(m) + `
DELETE FROM public.operator_grants WHERE auth_user_id=${sqlId(users.wcLife.id)} AND surface='whitecell' AND session_id=${sqlId(life)};`));
    denied(await rpc('wcLife', 'operator_remove_session_participant', { requested_session_id: life, requested_session_participant_id: replacement.id }), 'withdrawn operator grant');
    delete seat.wcLife;
    checkpoint('removed, expired, replaced and rejoined seats; withdrawn/cross-session operator grants');

    // Legacy compatibility including the historical role inversion. These claims
    // change participants.role while the existing regional session seat stays authoritative.
    ok(await claim('apS', m.legacy, 'Green_Facilitator'), 'normalized legacy Scribe');
    ok(await claim('apF', m.legacy, 'Green_Scribe'), 'normalized legacy Facilitator');
    check(ok(await rpc('apS', 'green_semantic_role', { requested_session_id: m.legacy }), 'legacy semantic role') === 'scribe', 'legacy inversion');
    check(ok(await rpc('apS', 'green_semantic_role', { requested_session_id: sid }), 'regional session role') === 'scribe', 'global role does not override seat');
    const legacy = one(await request('apS', '/rest/v1/actions', 'POST', { session_id: m.legacy, team: 'green',
        move: 1, phase: 1, mechanism: 'Proposal', sector: '', artifact_type: 'proposal', proposal_recipient_team: 'blue',
        goal: 'GC03 synthetic unified legacy fixture' }), 'legacy draft');
    one(await mutation('apS', 'actions', legacy.id, 'PATCH', { ally_contingencies: 'Proposal Details\nScribe Handoff: forwarded' }), 'legacy handoff');
    check(one(await mutation('apF', 'actions', legacy.id, 'PATCH', { status: 'submitted' }), 'legacy submission').status === 'submitted', 'legacy submission preserved');
    checkpoint('legacy normalization and permissions');
    return { seat, seatSession, renew, rpc, claim, heartbeat };
}
