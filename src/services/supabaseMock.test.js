import { afterEach, describe, expect, it } from 'vitest';

import { createE2EMockSupabaseClient, isE2EMockEnabled } from './supabaseMock.js';

const E2E_MOCK_ENABLEMENT_KEY = '__esg_e2e_mock_enabled';
const E2E_MOCK_CONFIG_KEY = '__esg_e2e_mock_config';
const E2E_MOCK_STATE_KEY = 'esg_e2e_backend_state';

class MemoryStorage {
    constructor() {
        this.store = new Map();
    }

    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }

    setItem(key, value) {
        this.store.set(key, String(value));
    }

    removeItem(key) {
        this.store.delete(key);
    }

    clear() {
        this.store.clear();
    }
}

function setGlobalProperty(name, value) {
    Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value
    });
}

function installBrowserRuntime({
    hostname = '127.0.0.1',
    webdriver = false,
    enableMock = false,
    operatorAccessCode = null,
    locks = undefined
} = {}) {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    if (enableMock) {
        sessionStorage.setItem(E2E_MOCK_ENABLEMENT_KEY, 'enabled');
    }

    if (operatorAccessCode) {
        sessionStorage.setItem(E2E_MOCK_CONFIG_KEY, JSON.stringify({
            operatorAccessCode
        }));
    }

    setGlobalProperty('window', { localStorage, sessionStorage });
    setGlobalProperty('localStorage', localStorage);
    setGlobalProperty('sessionStorage', sessionStorage);
    setGlobalProperty('location', { hostname });
    setGlobalProperty('navigator', { webdriver, locks });

    return {
        localStorage,
        sessionStorage
    };
}

afterEach(() => {
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
    delete globalThis.location;
    delete globalThis.navigator;
    delete globalThis.__ESG_E2E_MOCK__;
    delete globalThis.__ESG_E2E_TEST_CONFIG__;
    delete globalThis.__ESG_E2E_BACKEND__;
});

describe('supabase mock bootstrap guardrails', () => {
    it('ignores legacy browser localStorage and global flags without explicit test bootstrap', () => {
        const { localStorage } = installBrowserRuntime({
            hostname: '127.0.0.1',
            webdriver: true
        });

        localStorage.setItem('esg_e2e_mock', 'enabled');
        globalThis.__ESG_E2E_MOCK__ = true;

        expect(isE2EMockEnabled()).toBe(false);
    });

    it('ignores explicit mock bootstrap on hosted runtimes', () => {
        installBrowserRuntime({
            hostname: 'owner.github.io',
            webdriver: true,
            enableMock: true,
            operatorAccessCode: 'hosted-mock-code'
        });

        expect(isE2EMockEnabled()).toBe(false);
    });

    it('supports explicit non-browser test bootstrap for unit imports', () => {
        globalThis.__ESG_E2E_TEST_CONFIG__ = {
            operatorAccessCode: 'unit-test-code'
        };

        expect(isE2EMockEnabled()).toBe(true);
    });

    it('hydrates the empty PLI adjudications table into persisted mock state', async () => {
        const { localStorage } = installBrowserRuntime();
        localStorage.setItem(E2E_MOCK_STATE_KEY, JSON.stringify({
            counters: {
                sessions: 1
            },
            tables: {
                sessions: []
            }
        }));

        const mockClient = createE2EMockSupabaseClient();
        const result = await mockClient
            .from('pli_adjudications')
            .select('*')
            .eq('session_id', 'session-1')
            .order('created_at', { ascending: false });

        expect(result).toEqual({
            data: [],
            error: null
        });
    });

    it('keeps pending mock PLI adjudications restricted to operators', async () => {
        const { localStorage } = installBrowserRuntime({
            hostname: '127.0.0.1',
            webdriver: true,
            enableMock: true,
            operatorAccessCode: 'playwright-test-code'
        });
        localStorage.setItem(E2E_MOCK_STATE_KEY, JSON.stringify({
            tables: {
                pli_adjudications: [{
                    id: 'pli-1',
                    action_id: 'action-1',
                    session_id: 'session-1',
                    status: 'pending',
                    record: {},
                    codebook_version: 'test-v1',
                    seat_reviews: {},
                    created_at: '2026-07-30T12:00:00.000Z'
                }]
            }
        }));

        const mockClient = createE2EMockSupabaseClient();
        await mockClient.auth.signInAnonymously();

        const participantlessResult = await mockClient
            .from('pli_adjudications')
            .select('*')
            .eq('session_id', 'session-1');
        expect(participantlessResult).toEqual({
            data: [],
            error: null
        });

        const authorization = await mockClient.rpc('authorize_demo_operator', {
            requested_surface: 'gamemaster',
            requested_operator_code: 'playwright-test-code',
            requested_operator_name: 'Mock GM'
        });
        expect(authorization.error).toBeNull();

        const operatorResult = await mockClient
            .from('pli_adjudications')
            .select('*')
            .eq('session_id', 'session-1');
        expect(operatorResult.error).toBeNull();
        expect(operatorResult.data).toHaveLength(1);
        expect(operatorResult.data[0].id).toBe('pli-1');
    });

    it('requires an explicit operator code for the local Playwright mock path', async () => {
        installBrowserRuntime({
            hostname: '127.0.0.1',
            webdriver: true,
            enableMock: true,
            operatorAccessCode: 'playwright-test-code'
        });

        expect(isE2EMockEnabled()).toBe(true);

        const mockClient = createE2EMockSupabaseClient();
        await mockClient.auth.signInAnonymously();

        const invalidAuthorization = await mockClient.rpc('authorize_demo_operator', {
            requested_surface: 'gamemaster',
            requested_operator_code: 'admin2025',
            requested_operator_name: 'Mock GM'
        });

        expect(invalidAuthorization).toMatchObject({
            data: null,
            error: {
                message: 'Invalid operator access code.'
            }
        });

        const validAuthorization = await mockClient.rpc('authorize_demo_operator', {
            requested_surface: 'gamemaster',
            requested_operator_code: 'playwright-test-code',
            requested_operator_name: 'Mock GM'
        });

        expect(validAuthorization.error).toBeNull();
        expect(validAuthorization.data.surface).toBe('gamemaster');

        const sessionCreate = await mockClient.rpc('create_live_demo_session', {
            requested_name: 'SME Session',
            requested_session_code: 'SME2026',
            requested_description: null
        });
        expect(sessionCreate.error).toBeNull();
        expect(sessionCreate.data?.id).toBeTruthy();

        const smeAuthorization = await mockClient.rpc('authorize_demo_operator', {
            requested_surface: 'sme',
            requested_operator_code: 'playwright-test-code',
            requested_session_id: sessionCreate.data.id,
            requested_role: 'sme_econ',
            requested_operator_name: 'Econ SME'
        });

        expect(smeAuthorization.error).toBeNull();
        expect(smeAuthorization.data.surface).toBe('sme');
        expect(smeAuthorization.data.role).toBe('sme_econ');
    });

    it('mirrors team-neutral action, orientation, and RFI review transitions', async () => {
        const { localStorage } = installBrowserRuntime({
            hostname: '127.0.0.1',
            webdriver: true,
            enableMock: true,
            operatorAccessCode: 'playwright-test-code'
        });
        localStorage.setItem(E2E_MOCK_STATE_KEY, JSON.stringify({
            tables: {
                sessions: [{ id: 'session-1', status: 'active', name: 'Review contract' }],
                actions: [
                    {
                        id: 'action-blue',
                        session_id: 'session-1',
                        team: 'blue',
                        artifact_type: 'action',
                        status: 'submitted',
                        workflow_state: 'submitted_to_white_cell',
                        revision_number: 1,
                        row_version: 4,
                        submitted_at: '2026-08-05T12:00:00.000Z',
                        outcome: null,
                        is_deleted: false
                    },
                    {
                        id: 'action-red',
                        session_id: 'session-1',
                        team: 'red',
                        artifact_type: 'move_response',
                        status: 'submitted',
                        workflow_state: 'resubmitted',
                        revision_number: 2,
                        row_version: 7,
                        submitted_at: '2026-08-05T12:05:00.000Z',
                        outcome: null,
                        is_deleted: false
                    },
                    {
                        id: 'orientation-green',
                        session_id: 'session-1',
                        team: 'green',
                        artifact_type: 'strategic_orientation_forecast',
                        status: 'submitted',
                        workflow_state: 'submitted_to_white_cell',
                        revision_number: 1,
                        row_version: 2,
                        submitted_at: '2026-08-05T12:10:00.000Z',
                        outcome: null,
                        is_deleted: false
                    }
                ],
                requests: [{
                    id: 'rfi-industry',
                    session_id: 'session-1',
                    team: 'industry',
                    status: 'pending',
                    workflow_state: 'submitted_to_white_cell',
                    revision_number: 3,
                    query: 'What time horizon applies?'
                }],
                pli_adjudications: [{
                    id: 'pli-blue',
                    action_id: 'action-blue',
                    session_id: 'session-1',
                    status: 'pending'
                }]
            }
        }));

        const mockClient = createE2EMockSupabaseClient();
        await mockClient.auth.signInAnonymously();
        const authorization = await mockClient.rpc('authorize_demo_operator', {
            requested_surface: 'whitecell',
            requested_operator_code: 'playwright-test-code',
            requested_session_id: 'session-1',
            requested_role: 'whitecell_lead',
            requested_operator_name: 'White Cell Lead'
        });
        expect(authorization.error).toBeNull();

        const blueReturn = await mockClient.rpc('operator_review_artifact', {
            requested_artifact_kind: 'action',
            requested_artifact_id: 'action-blue',
            requested_review_decision: 'return_to_team',
            requested_team: 'blue',
            requested_expected_revision: 1,
            requested_reviewer_notes: 'Add implementation detail.'
        });
        const redReturn = await mockClient.rpc('operator_review_artifact', {
            requested_artifact_kind: 'action',
            requested_artifact_id: 'action-red',
            requested_review_decision: 'return_to_team',
            requested_team: 'red',
            requested_expected_revision: 2,
            requested_reviewer_notes: 'Clarify the response sequence.'
        });
        const orientationCompletion = await mockClient.rpc('operator_review_artifact', {
            requested_artifact_kind: 'strategic_orientation',
            requested_artifact_id: 'orientation-green',
            requested_review_decision: 'complete',
            requested_team: 'green',
            requested_expected_revision: 1,
            requested_reviewer_notes: null
        });
        const rfiReturn = await mockClient.rpc('operator_review_artifact', {
            requested_artifact_kind: 'rfi',
            requested_artifact_id: 'rfi-industry',
            requested_review_decision: 'return_for_clarification',
            requested_team: 'industry',
            requested_expected_revision: 3,
            requested_reviewer_notes: 'State the requested time horizon.'
        });

        expect(blueReturn.error).toBeNull();
        expect(blueReturn.data.artifact).toMatchObject({
            team: 'blue',
            status: 'draft',
            workflow_state: 'returned_to_team',
            revision_number: 2,
            outcome: null
        });
        expect(redReturn.error).toBeNull();
        expect(redReturn.data.artifact).toMatchObject({
            team: 'red',
            status: 'draft',
            workflow_state: 'returned_to_team',
            revision_number: 3,
            outcome: null
        });
        expect(orientationCompletion.error).toBeNull();
        expect(orientationCompletion.data.artifact).toMatchObject({
            status: 'adjudicated',
            workflow_state: 'completed',
            outcome: null,
            revision_number: 1
        });
        expect(rfiReturn.error).toBeNull();
        expect(rfiReturn.data.artifact).toMatchObject({
            status: 'pending',
            workflow_state: 'returned_to_team',
            revision_number: 4,
            review_notes: 'State the requested time horizon.'
        });

        const snapshot = globalThis.__ESG_E2E_BACKEND__.dump();
        expect(snapshot.tables.artifact_workflow_reviews).toHaveLength(4);
        expect(snapshot.tables.artifact_workflow_reviews[0]).toMatchObject({
            artifact_id: 'action-blue',
            revision_number: 1,
            next_revision_number: 2,
            prior_workflow_state: 'submitted_to_white_cell',
            workflow_state_to: 'returned_to_team',
            reviewer_role: 'whitecell_lead'
        });
        expect(snapshot.tables.pli_adjudications).toEqual([]);
    });

    it('fails closed for unauthorized, cross-team, stale, and completed mock reviews', async () => {
        const { localStorage } = installBrowserRuntime({
            hostname: '127.0.0.1',
            webdriver: true,
            enableMock: true,
            operatorAccessCode: 'playwright-test-code'
        });
        localStorage.setItem(E2E_MOCK_STATE_KEY, JSON.stringify({
            tables: {
                sessions: [{ id: 'session-1', status: 'active' }],
                actions: [{
                    id: 'action-red',
                    session_id: 'session-1',
                    team: 'red',
                    artifact_type: 'action',
                    status: 'submitted',
                    workflow_state: 'submitted_to_white_cell',
                    revision_number: 5,
                    is_deleted: false
                }]
            }
        }));

        const mockClient = createE2EMockSupabaseClient();
        await mockClient.auth.signInAnonymously();
        const reviewParams = {
            requested_artifact_kind: 'action',
            requested_artifact_id: 'action-red',
            requested_review_decision: 'return_to_team',
            requested_team: 'red',
            requested_expected_revision: 5,
            requested_reviewer_notes: 'Revise.'
        };

        const unauthorized = await mockClient.rpc('operator_review_artifact', reviewParams);
        expect(unauthorized.error?.message).toBe('White Cell operator authorization is required.');

        await mockClient.rpc('authorize_demo_operator', {
            requested_surface: 'whitecell',
            requested_operator_code: 'playwright-test-code',
            requested_session_id: 'session-1',
            requested_role: 'whitecell_support'
        });
        const crossTeam = await mockClient.rpc('operator_review_artifact', {
            ...reviewParams,
            requested_team: 'blue'
        });
        const stale = await mockClient.rpc('operator_review_artifact', {
            ...reviewParams,
            requested_expected_revision: 4
        });
        const completed = await mockClient.rpc('operator_review_artifact', {
            ...reviewParams,
            requested_review_decision: 'complete',
            requested_reviewer_notes: null
        });
        const completedRetry = await mockClient.rpc('operator_review_artifact', {
            ...reviewParams,
            requested_review_decision: 'complete',
            requested_reviewer_notes: null
        });

        expect(crossTeam.error?.message).toBe(
            'Requested team does not match the artifact submitting team.'
        );
        expect(stale.error?.message).toContain('Stale artifact revision.');
        expect(completed.error).toBeNull();
        expect(completed.data.artifact.outcome).toBeNull();
        expect(completedRetry.error?.message).toBe('Completed artifacts are immutable.');
        expect(globalThis.__ESG_E2E_BACKEND__.dump().tables.artifact_workflow_reviews).toHaveLength(1);
    });

    it('mirrors independent recipient approvals and append-only isolated proposal rounds', async () => {
        const { localStorage } = installBrowserRuntime({
            hostname: '127.0.0.1',
            webdriver: true,
            enableMock: true,
            operatorAccessCode: 'playwright-test-code'
        });
        localStorage.setItem(E2E_MOCK_STATE_KEY, JSON.stringify({
            tables: {
                sessions: [
                    { id: 'session-1', status: 'active' },
                    { id: 'session-2', status: 'active' }
                ],
                actions: [{
                    id: 'proposal-1',
                    session_id: 'session-1',
                    team: 'green',
                    artifact_type: 'proposal',
                    artifact_payload: { proposal: { recipientTeams: ['blue', 'red'] } },
                    status: 'submitted',
                    workflow_state: 'submitted_to_white_cell',
                    revision_number: 1,
                    outcome: null,
                    goal: 'Dual recipient proposal',
                    is_deleted: false
                }]
            }
        }));

        const mockClient = createE2EMockSupabaseClient();
        await mockClient.auth.signInAnonymously();
        await mockClient.rpc('authorize_demo_operator', {
            requested_surface: 'whitecell',
            requested_operator_code: 'playwright-test-code',
            requested_session_id: 'session-1',
            requested_role: 'whitecell_lead'
        });
        const approveBlue = await mockClient.rpc('operator_review_proposal', {
            requested_action_id: 'proposal-1',
            requested_review_decision: 'forward_to_recipient',
            requested_recipient_team: 'blue',
            requested_expected_revision: 1
        });
        expect(approveBlue.error).toBeNull();
        expect(approveBlue.data.action.status).toBe('submitted');
        expect(approveBlue.data.action.artifact_payload.proposal_recipient_reviews).toEqual({
            blue: expect.objectContaining({ status: 'approved_forwarded' })
        });
        expect(globalThis.__ESG_E2E_BACKEND__.dump().tables.communications).toHaveLength(1);

        const approveRed = await mockClient.rpc('operator_review_proposal', {
            requested_action_id: 'proposal-1',
            requested_review_decision: 'forward_to_recipient',
            requested_recipient_team: 'red',
            requested_expected_revision: 1
        });
        expect(approveRed.error).toBeNull();
        expect(approveRed.data.action).toMatchObject({
            status: 'adjudicated',
            workflow_state: 'completed',
            outcome: null
        });

        await mockClient.auth.signOut();
        await mockClient.auth.signInAnonymously();
        await mockClient.rpc('claim_session_role_seat', {
            requested_session_id: 'session-1',
            requested_role: 'blue_scribe',
            requested_name: 'Blue Facilitator',
            requested_client_id: 'blue-client'
        });
        const blueRoot = globalThis.__ESG_E2E_BACKEND__.dump().tables.communications.find((row) => (
            row.metadata?.recipient_team === 'blue' && row.metadata?.round_number === 0
        ));
        const blueResponse = await mockClient.rpc('append_proposal_thread_message', {
            requested_parent_message_id: blueRoot.id,
            requested_content: 'Add an implementation checkpoint.',
            requested_message_type: 'negotiation_message',
            requested_facilitator_decision: 'negotiate',
            requested_client_message_id: '00000000-0000-4000-8000-000000000001'
        });
        expect(blueResponse.error).toBeNull();
        expect(blueResponse.data.metadata).toMatchObject({
            thread_id: blueRoot.metadata.thread_id,
            recipient_team: 'blue',
            round_number: 1,
            parent_message_id: blueRoot.id,
            source_proposal_id: 'proposal-1',
            source_revision: 1,
            sender_team: 'blue',
            sender_role: 'blue_scribe',
            message_type: 'negotiation_message'
        });
        const idempotentRetry = await mockClient.rpc('append_proposal_thread_message', {
            requested_parent_message_id: blueRoot.id,
            requested_content: 'Add an implementation checkpoint.',
            requested_message_type: 'negotiation_message',
            requested_facilitator_decision: 'negotiate',
            requested_client_message_id: '00000000-0000-4000-8000-000000000001'
        });
        expect(idempotentRetry.data.id).toBe(blueResponse.data.id);
        const overwriteAttempt = await mockClient
            .from('communications')
            .update({ content: 'Overwrite the prior response.' })
            .eq('id', blueResponse.data.id)
            .select('*');
        expect(overwriteAttempt.error?.code).toBe('42501');

        await mockClient.auth.signOut();
        await mockClient.auth.signInAnonymously();
        await mockClient.rpc('claim_session_role_seat', {
            requested_session_id: 'session-1',
            requested_role: 'green_scribe',
            requested_name: 'Green Facilitator',
            requested_client_id: 'green-client'
        });
        const greenFollowUp = await mockClient.rpc('append_proposal_thread_message', {
            requested_parent_message_id: blueResponse.data.id,
            requested_content: 'Green accepts the checkpoint and proposes a joint review.',
            requested_message_type: 'negotiation_message',
            requested_client_message_id: '00000000-0000-4000-8000-000000000004'
        });
        expect(greenFollowUp.error).toBeNull();
        expect(greenFollowUp.data.metadata).toMatchObject({
            thread_id: blueRoot.metadata.thread_id,
            recipient_team: 'blue',
            round_number: 2,
            parent_message_id: blueResponse.data.id,
            sender_team: 'green'
        });
        expect(globalThis.__ESG_E2E_BACKEND__.dump().tables.communications
            .filter((row) => row.metadata?.thread_id === blueRoot.metadata.thread_id)
            .map((row) => row.metadata.round_number)
            .sort()).toEqual([0, 1, 2]);

        await mockClient.auth.signOut();
        await mockClient.auth.signInAnonymously();
        await mockClient.rpc('claim_session_role_seat', {
            requested_session_id: 'session-1',
            requested_role: 'red_scribe',
            requested_name: 'Red Facilitator',
            requested_client_id: 'red-client'
        });
        const crossTeam = await mockClient.rpc('append_proposal_thread_message', {
            requested_parent_message_id: greenFollowUp.data.id,
            requested_content: 'Red must not enter the Blue thread.',
            requested_message_type: 'negotiation_message',
            requested_client_message_id: '00000000-0000-4000-8000-000000000002'
        });
        expect(crossTeam.error?.message).toBe('Proposal thread access is restricted to its two teams.');
        const redVisible = await mockClient.from('communications').select('*').eq('session_id', 'session-1');
        expect(redVisible.data.every((row) => row.metadata?.recipient_team === 'red')).toBe(true);

        await mockClient.auth.signOut();
        await mockClient.auth.signInAnonymously();
        await mockClient.rpc('claim_session_role_seat', {
            requested_session_id: 'session-2',
            requested_role: 'blue_scribe',
            requested_name: 'Other-session Blue',
            requested_client_id: 'blue-session-2'
        });
        const crossSession = await mockClient.rpc('append_proposal_thread_message', {
            requested_parent_message_id: blueResponse.data.id,
            requested_content: 'Cross-session write',
            requested_message_type: 'negotiation_message',
            requested_client_message_id: '00000000-0000-4000-8000-000000000003'
        });
        expect(crossSession.error?.message).toBe('Proposal thread access is restricted to its two teams.');
    });

    it('mirrors Facilitator-owned RFI writes and team-isolated request reads', async () => {
        const { localStorage } = installBrowserRuntime({
            hostname: '127.0.0.1',
            webdriver: true,
            enableMock: true
        });
        localStorage.setItem(E2E_MOCK_STATE_KEY, JSON.stringify({
            tables: {
                sessions: [{ id: 'session-1', status: 'active' }],
                requests: [{
                    id: 'blue-rfi',
                    session_id: 'session-1',
                    team: 'blue',
                    status: 'pending',
                    workflow_state: 'submitted_to_white_cell',
                    query: 'Blue-only question'
                }]
            }
        }));

        const mockClient = createE2EMockSupabaseClient();
        await mockClient.auth.signInAnonymously();
        const facilitatorSeat = await mockClient.rpc('claim_session_role_seat', {
            requested_session_id: 'session-1',
            requested_role: 'industry_scribe',
            requested_name: 'Industry Facilitator',
            requested_client_id: 'industry-facilitator-client'
        });
        expect(facilitatorSeat.error).toBeNull();

        const createdRfi = await mockClient.from('requests').insert({
            session_id: 'session-1',
            team: 'industry',
            status: 'pending',
            workflow_state: 'submitted_to_white_cell',
            query: 'Which implementation window applies?',
            categories: ['Other']
        }).select().single();
        const directMessage = await mockClient.from('communications').insert({
            session_id: 'session-1',
            type: 'direct',
            from_role: 'industry_scribe',
            to_role: 'white_cell',
            content: 'Please clarify the implementation window.',
            metadata: { source_team: 'industry' }
        }).select().single();
        const visibleRfis = await mockClient.from('requests').select('*').eq('session_id', 'session-1');

        expect(createdRfi.error).toBeNull();
        expect(createdRfi.data.priority).toBe('NORMAL');
        expect(directMessage.error).toBeNull();
        expect(visibleRfis.data.map((request) => request.team)).toEqual(['industry']);

        const scribeSeat = await mockClient.rpc('claim_session_role_seat', {
            requested_session_id: 'session-1',
            requested_role: 'industry_facilitator',
            requested_name: 'Industry Scribe',
            requested_client_id: 'industry-scribe-client'
        });
        expect(scribeSeat.error).toBeNull();
        const deniedScribeRfi = await mockClient.from('requests').insert({
            session_id: 'session-1',
            team: 'industry',
            status: 'pending',
            workflow_state: 'submitted_to_white_cell',
            query: 'The Scribe must not submit this RFI.',
            categories: ['Other']
        }).select().single();

        expect(deniedScribeRfi.error).toMatchObject({ code: '42501' });
    });

    it('routes shared-state RPC and table writes through a browser-wide lock', async () => {
        const requestedLocks = [];
        installBrowserRuntime({
            hostname: '127.0.0.1',
            webdriver: true,
            enableMock: true,
            operatorAccessCode: 'playwright-test-code',
            locks: {
                async request(name, callback) {
                    requestedLocks.push(name);
                    return callback();
                }
            }
        });

        const mockClient = createE2EMockSupabaseClient();
        await mockClient.auth.signInAnonymously();
        await mockClient.rpc('authorize_demo_operator', {
            requested_surface: 'gamemaster',
            requested_operator_code: 'playwright-test-code',
            requested_operator_name: 'Mock GM'
        });
        const createdSession = await mockClient.rpc('create_live_demo_session', {
            requested_name: 'Locked mock session',
            requested_session_code: 'LOCK19',
            requested_description: 'Mock write-lock contract'
        });
        const timelineInsert = await mockClient
            .from('timeline')
            .insert({
                session_id: createdSession.data.id,
                type: 'TEST_EVENT',
                content: 'Write protected by the shared mock lock.'
            })
            .select()
            .single();

        expect(timelineInsert.error).toBeNull();
        expect(requestedLocks).toEqual([
            'esg-e2e-backend-state-write',
            'esg-e2e-backend-state-write',
            'esg-e2e-backend-state-write'
        ]);

        await mockClient.from('timeline').select('*');
        expect(requestedLocks).toHaveLength(3);
    });
});
