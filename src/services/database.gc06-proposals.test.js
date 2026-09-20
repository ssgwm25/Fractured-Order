import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createE2EMockSupabaseClient } from './supabaseMock.js';
import { serializeProposalDetails } from '../features/actions/proposalDetails.js';

const key = 'esg_e2e_backend_state';
const identity = (id) => localStorage.setItem('esg_e2e_auth_session', JSON.stringify({ user: { id } }));
const seed = (change) => { const state = JSON.parse(localStorage.getItem(key)); change(state.tables); localStorage.setItem(key, JSON.stringify(state)); };
const roster = { asian_pacific: ['ROK','Japan','ASEAN'], europe: ['UK','France','EU'], aliases: { 'South Korea': 'ROK' } };
const payload = (region, handoff = 'Draft', extra = {}) => ({ goal: 'Synthetic ' + region, sector: 'Agriculture', expected_outcomes: 'Synthetic outcome',
    ally_contingencies: serializeProposalDetails({ originators: region === 'europe' ? ['UK'] : ['ROK'], objective: 'Synthetic objective',
        intendedPartners: 'Blue and Red', recipientTeams: ['blue','red'], focusSectors: ['Agriculture'], supplyChainFocusDecision: 'No',
        timingAndConditions: 'Synthetic timing and conditions', scribeHandoff: handoff, ...extra }) });
let api;
async function claim(user, role, session = 'shared') {
    identity(user);
    const result = await api.rpc('claim_session_role_seat', { requested_session_id: session, requested_role: role,
        requested_name: 'GC06 synthetic', requested_client_id: user });
    expect(result.error).toBeNull();
}
const actor = (model, region, facilitator = false) => facilitator && model === 'shared' ? 'shared-fac' : model + '-' + region + (facilitator ? '-fac' : '');
async function write(region, operation, action = null, model = 'shared', override = {}) {
    identity(actor(model, region, ['edit','submit'].includes(operation)));
    return api.rpc('write_regional_proposal', { requested_session_id: model, requested_delegation_id: region,
        requested_action_id: action?.id ?? null, requested_expected_revision: action?.revision_number ?? null,
        requested_expected_row_version: action?.row_version ?? null, requested_operation: operation,
        requested_payload: operation === 'submit' ? {} : payload(region, operation === 'save' ? 'Draft' : 'Forwarded'),
        requested_client_key: 'same-client-key', ...override });
}
async function approve(action, recipient) {
    identity(action.session_id + '-wc');
    return api.rpc('operator_review_proposal', { requested_action_id: action.id, requested_review_decision: 'forward_to_recipient',
        requested_recipient_team: recipient, requested_expected_revision: action.revision_number });
}
async function returned(action) {
    identity(action.session_id + '-wc');
    return api.rpc('operator_review_artifact', { requested_artifact_kind: 'action', requested_artifact_id: action.id,
        requested_team: 'green', requested_expected_revision: action.revision_number, requested_review_decision: 'return_to_team',
        requested_reviewer_notes: 'Synthetic correction required' });
}
const append = (parent, key = 'round') => api.rpc('append_proposal_thread_message', { requested_parent_message_id: parent.id,
    requested_content: 'Synthetic negotiation', requested_message_type: 'negotiation_message', requested_client_message_id: key });

describe('GC06 proposal authority (mock; real RPC/RLS evidence remains separate)', () => {
    beforeEach(async () => {
        const storage = new Map();
        globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)), removeItem: (k) => storage.delete(k) };
        api = createE2EMockSupabaseClient();
        localStorage.setItem(key, JSON.stringify({ counters: {}, tables: {
            sessions: ['shared','pairs','unified'].map((id) => ({ id, status: 'active', session_classification: 'live_exercise', is_protected: false,
                session_topology_version: id === 'unified' ? 1 : 2, green_seat_model: id === 'shared' ? 'shared_facilitator_v1' : null,
                green_roster_version: 'synthetic', green_roster_snapshot: roster })),
            game_state: ['shared','pairs','unified'].map((session_id) => ({ id: session_id + '-game', session_id, move: 1, phase: 1 }))
        } }));
        for (const model of ['shared','pairs']) {
            for (const region of ['asian_pacific','europe']) {
                await claim(actor(model, region), 'green_' + region + '_scribe', model);
                if (model === 'pairs') await claim(actor(model,region,true), 'green_' + region + '_facilitator',model);
            }
            seed((tables) => tables.operator_grants.push({ auth_user_id: model + '-wc', session_id: model, surface: 'whitecell', role: 'whitecell_lead' }));
            await claim(model + '-wc','whitecell_lead', model);
        }
        await claim('shared-fac','green_shared_facilitator');
        await claim('blue','blue_scribe'); await claim('red','red_scribe');
    });
    afterEach(() => { delete globalThis.localStorage; });

    it.each(['shared','pairs'])('keeps concurrent regional drafts, handoffs, edits and submissions distinct in %s', async (model) => {
        const [ap, eu] = await Promise.all([write('asian_pacific','save',null,model),write('europe','save',null,model)]);
        expect(ap.error).toBeNull(); expect(eu.error).toBeNull(); expect(ap.data.id).not.toBe(eu.data.id);
        expect((await write('europe','save',null,model)).data.id).toBe(eu.data.id);
        expect((await write('europe','edit',eu.data,model)).error.code).toBe('23514');
        const handed = await write('europe','forward',eu.data,model); expect(handed.error).toBeNull();
        const edited = await write('europe','edit',handed.data,model); expect(edited.error).toBeNull();
        expect((await write('europe','submit',handed.data,model)).error.code).toBe('PT409');
        const submitted = await write('europe','submit',edited.data,model); expect(submitted.error).toBeNull();
        expect((await write('europe','submit',submitted.data,model)).error.code).toBe('23514');
        expect((await write('asian_pacific','forward',ap.data,model)).error).toBeNull();
    });

    it('filters the frozen roster and rejects aliases outside its owning region', async () => {
        identity('shared-europe');
        expect((await api.rpc('get_regional_proposal_roster',{ requested_session_id:'shared', requested_delegation_id:'europe' })).data.members).toEqual(roster.europe);
        for (const origin of ['ROK','Japan','Germany','South Korea']) {
            expect((await write('europe','save',null,'shared',{ requested_payload: payload('europe','Draft',{ originators:[origin] }) })).error.code).toBe('23514');
        }
        expect((await write('asian_pacific','save',null,'shared',{ requested_payload:payload('asian_pacific','Draft',{ originators:['South Korea'] }) })).error).toBeNull();
    });

    it('rejects unsupported recipients even when a valid recipient is also supplied', async () => {
        const invalid = payload('europe');
        invalid.ally_contingencies = invalid.ally_contingencies.replace('Recipient Teams: ["blue","red"]','Recipient Teams: ["blue","industry"]');
        expect((await write('europe','save',null,'shared',{requested_payload:invalid})).error.code).toBe('23514');
    });

    it('denies forged source type, ownership, approval fields and wrong paired handoff', async () => {
        const eu = (await write('europe','forward',null,'pairs')).data;
        expect((await write('asian_pacific','submit',eu,'pairs')).error.code).toBe('42501');
        expect((await write('europe','edit',eu,'pairs',{ requested_payload:{ ...payload('europe','Forwarded'), delegation_id:'asian_pacific' } })).error.code).toBe('42501');
        seed((t) => { t.actions.find((a) => a.id === eu.id).artifact_type='strategic_orientation_forecast'; });
        expect((await write('europe','submit',eu,'pairs')).error.code).toBe('42501');
    });

    it('preserves ownership and historical partial approvals across return, correction and new approvals', async () => {
        let eu = (await write('europe','forward')).data;
        eu = (await write('europe','submit',eu)).data;
        const oldRoot = (await approve(eu,'blue')).data.communication;
        const review = await returned(eu); expect(review.error).toBeNull();
        const correction = review.data.artifact;
        expect(correction).toMatchObject({ delegation_id:'europe', revision_number:2, proposal_handoff_revision:null });
        identity('shared-asian_pacific'); expect((await api.from('actions').select('*')).data).toEqual([]);
        identity('shared-fac'); expect((await api.from('artifact_workflow_reviews').select('*')).data).toHaveLength(1);
        expect((await write('europe','submit',correction)).error.code).toBe('23514');
        eu = (await write('europe','forward',correction)).data;
        eu = (await write('europe','submit',eu)).data;
        const freshRoot = (await approve(eu,'blue')).data.communication;
        expect(freshRoot.id).not.toBe(oldRoot.id);
        identity('blue'); expect((await append(oldRoot)).error.code).toBe('42501');
        expect((await append(freshRoot)).error).toBeNull();
        const redApproval = await approve(eu,'red'); expect(redApproval.error).toBeNull();
        expect(redApproval.data.action.workflow_state).toBe('completed');
        expect(JSON.parse(localStorage.getItem(key)).tables.communications.filter((r)=>r.type==='PROPOSAL_FORWARDED')).toHaveLength(3);
    });

    it('routes reviewed replies to the shared Facilitator and only the originating Scribe', async () => {
        const eu = (await write('europe','submit',(await write('europe','forward')).data)).data;
        const blueRoot = (await approve(eu,'blue')).data.communication;
        const redRoot = (await approve(eu,'red')).data.communication;
        identity('blue'); const bluePending = await append(blueRoot); expect(bluePending.error).toBeNull();
        expect((await append(blueRoot)).data.id).toBe(bluePending.data.id);
        expect((await append(redRoot)).error.code).toBe('42501');
        identity('shared-fac'); expect((await api.from('communications').select('*')).data.some((m)=>m.id===bluePending.data.id)).toBe(false);
        identity('shared-wc'); const released = await api.rpc('operator_forward_proposal_response',{ requested_review_communication_id:bluePending.data.id });
        expect(released.error).toBeNull(); expect(released.data.communication.delegation_id).toBe('europe');
        identity('shared-fac'); const followup = await append(released.data.communication); expect(followup.error).toBeNull();
        expect(followup.data.sender_delegation_id).toBe('europe');
        identity('shared-europe'); expect((await api.from('communications').select('*')).data.some((m)=>m.id===released.data.communication.id)).toBe(true);
        identity('shared-asian_pacific'); expect((await api.from('communications').select('*')).data).toEqual([]);
        identity('red'); expect((await api.from('communications').select('*')).data.map((m)=>m.id)).toEqual([redRoot.id]);
        const redPending = await append(redRoot); expect(redPending.error).toBeNull();
        expect(redPending.data.metadata.thread_id).not.toBe(bluePending.data.metadata.thread_id);
        identity('shared-wc'); const redReleased = await api.rpc('operator_forward_proposal_response',{requested_review_communication_id:redPending.data.id});
        expect(redReleased.error).toBeNull();
        identity('shared-fac'); expect((await append(redReleased.data.communication)).error).toBeNull();
        identity('blue'); expect((await api.from('communications').select('*')).data.some((row)=>row.id===redReleased.data.communication.id)).toBe(false);
    });

    it.each(['shared','pairs','unified'])('continues released rounds while blocking pending and stale attempts in %s', async (model) => {
        let action;
        if (model === 'unified') {
            await claim('unified-fac','green_scribe',model);
            seed((t) => {
                t.operator_grants.push({auth_user_id:'unified-wc',session_id:model,surface:'whitecell',role:'whitecell_lead'});
                t.actions.push({ ...payload('europe','Forwarded'),id:'legacy-proposal',session_id:model,team:'green',delegation_id:null,
                    artifact_type:'proposal',proposal_recipient_team:'blue',status:'submitted',workflow_state:'submitted_to_white_cell',
                    revision_number:1,row_version:1,is_deleted:false });
            });
            await claim('unified-wc','whitecell_lead',model);
            action = {id:'legacy-proposal',session_id:model,revision_number:1};
        } else {
            action = (await write('europe','submit',(await write('europe','forward',null,model)).data,model)).data;
        }
        const blue = model === 'shared' ? 'blue' : model + '-blue';
        if (model !== 'shared') await claim(blue,'blue_scribe',model);
        const root = (await approve(action,'blue')).data.communication;
        identity(blue);
        const pending = await append(root,'first'); expect(pending.error).toBeNull();
        expect((await append(root,'different-key')).error.code).toBe('PT409');
        expect((await append(root,'first')).data.id).toBe(pending.data.id);
        identity(model+'-wc');
        const released = await api.rpc('operator_forward_proposal_response',{requested_review_communication_id:pending.data.id});
        expect(released.error).toBeNull();
        // A retained review must never outrank its released round, regardless of timestamp ordering.
        seed((t) => { t.communications.find((row)=>row.id===pending.data.id).created_at='2099-01-01T00:00:00.000Z'; });
        identity(model === 'unified' ? 'unified-fac' : actor(model,'europe',true));
        const reply = await append(released.data.communication,'followup'); expect(reply.error).toBeNull();
        expect(reply.data.metadata.round_number).toBe(2);
        expect((await append(released.data.communication,'followup')).data.id).toBe(reply.data.id);
        expect((await append(released.data.communication,'duplicate-followup')).error.code).toBe('PT409');
        identity(blue); expect((await append(root,'stale-root')).error.code).toBe('PT409');
        const rows = JSON.parse(localStorage.getItem(key)).tables.communications.filter((row)=>row.metadata?.thread_id===root.metadata.thread_id);
        expect(rows.filter((row)=>row.type==='PROPOSAL_RESPONSE_REVIEW')).toHaveLength(2);
        expect(rows.filter((row)=>row.type==='PROPOSAL_RESPONSE')).toHaveLength(1);
    });

    it.each(['source_proposal_id','source_team','recipient_team','thread_id','source_revision'])('rejects a forged %s on a persisted thread parent', async (field) => {
        const eu = (await write('europe','submit',(await write('europe','forward')).data)).data;
        const root = (await approve(eu,'blue')).data.communication;
        seed((t) => t.communications.push({ ...root,id:'forged',type:'PROPOSAL_RESPONSE',metadata:{ ...root.metadata,[field]:'forged' } }));
        identity('shared-fac'); expect((await append({ id:'forged' })).error.code).toBe('42501');
    });

    it('keeps direct proposal writes, unforwarded drafts, RFIs, direct messages and notes closed', async () => {
        const draft = (await write('europe','save')).data;
        identity('shared-fac'); expect((await api.from('actions').select('*')).data).toEqual([]);
        for (const [table,row] of [['actions',{ ...draft,id:'forge' }],['requests',{ session_id:'shared',team:'green',delegation_id:'europe',query:'Denied' }],
            ['communications',{ session_id:'shared',from_role:'green_shared_facilitator',to_role:'white_cell',type:'direct',content:'Denied' }],
            ['communications',{ session_id:'shared',from_role:'green_shared_facilitator',to_role:'white_cell',type:'PROPOSAL_RESPONSE_REVIEW',metadata:{ source_proposal_id:draft.id } }]]) {
            expect((await api.from(table).insert(row)).error.code).toBe('42501');
        }
        expect((await api.from('scoped_notetaker_data').select('*')).data).toEqual([]);
        identity('shared-europe'); expect((await api.from('actions').update({ status:'submitted' }).eq('id',draft.id)).error.code).toBe('42501');
    });

    it('requires an active White Cell session seat to approve or return proposals', async () => {
        const eu = (await write('europe','submit',(await write('europe','forward')).data)).data;
        seed((t) => { t.session_participants.find((seat)=>seat.session_id==='shared' && seat.role==='whitecell_lead').is_active=false; });
        expect((await approve(eu,'blue')).error.code).toBe('42501');
        expect((await returned(eu)).error.code).toBe('42501');
    });

    it('requires the active lease on every proposal operation', async () => {
        const eu = (await write('europe','forward')).data;
        seed((t) => { t.session_participants.find((s)=>s.role==='green_shared_facilitator').heartbeat_at=new Date(Date.now()-91000).toISOString(); });
        expect((await write('europe','submit',eu)).error.code).toBe('42501');
    });
});
