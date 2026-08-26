import { afterEach, describe, expect, it } from 'vitest';

import { createE2EMockSupabaseClient, isE2EMockEnabled } from './supabaseMock.js';

const E2E_MOCK_ENABLEMENT_KEY = '__esg_e2e_mock_enabled';
const E2E_MOCK_CONFIG_KEY = '__esg_e2e_mock_config';
const E2E_MOCK_STATE_KEY = 'esg_e2e_backend_state';
const E2E_MOCK_BROADCAST_KEY = 'esg_e2e_realtime_broadcast';

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
    const windowListeners = new Map();

    if (enableMock) {
        sessionStorage.setItem(E2E_MOCK_ENABLEMENT_KEY, 'enabled');
    }

    if (operatorAccessCode) {
        sessionStorage.setItem(E2E_MOCK_CONFIG_KEY, JSON.stringify({
            operatorAccessCode
        }));
    }

    const windowRef = {
        localStorage,
        sessionStorage,
        addEventListener(eventName, callback) {
            if (!windowListeners.has(eventName)) {
                windowListeners.set(eventName, new Set());
            }
            windowListeners.get(eventName).add(callback);
        },
        removeEventListener(eventName, callback) {
            windowListeners.get(eventName)?.delete(callback);
        }
    };
    setGlobalProperty('window', windowRef);
    setGlobalProperty('localStorage', localStorage);
    setGlobalProperty('sessionStorage', sessionStorage);
    setGlobalProperty('location', { hostname });
    setGlobalProperty('navigator', { webdriver, locks });

    return {
        localStorage,
        sessionStorage,
        dispatchStorage(event) {
            windowListeners.get('storage')?.forEach((callback) => callback(event));
        }
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
    it('delivers session-scoped broadcast payloads through the local realtime contract', async () => {
        const runtime = installBrowserRuntime();
        const mockClient = createE2EMockSupabaseClient();
        const received = [];
        const ignored = [];

        mockClient
            .channel('intercom:session-1')
            .on('broadcast', { event: 'intercom_announcement' }, (event) => received.push(event))
            .subscribe();
        mockClient
            .channel('intercom:session-2')
            .on('broadcast', { event: 'intercom_announcement' }, (event) => ignored.push(event))
            .subscribe();

        const sender = mockClient.channel('intercom:session-1');
        await expect(sender.send({
            type: 'broadcast',
            event: 'intercom_announcement',
            payload: { announcement_id: 'announcement-1', session_id: 'session-1' }
        })).resolves.toBe('ok');

        runtime.dispatchStorage({
            key: E2E_MOCK_BROADCAST_KEY,
            newValue: runtime.localStorage.getItem(E2E_MOCK_BROADCAST_KEY)
        });

        expect(received).toEqual([{
            payload: { announcement_id: 'announcement-1', session_id: 'session-1' }
        }]);
        expect(ignored).toEqual([]);
    });

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

    it('removes decommissioned training state from persisted mock snapshots', () => {
        const { localStorage } = installBrowserRuntime();
        localStorage.setItem(E2E_MOCK_STATE_KEY, JSON.stringify({
            tables: {
                sessions: [{
                    id: '00000000-0000-4000-8000-000000002026',
                    session_code: 'TRAINING2026',
                    session_classification: 'training_template'
                }, {
                    id: 'ordinary-session',
                    session_code: 'LIVE2026',
                    status: 'active'
                }],
                training_attempts: [{ id: 'legacy-attempt' }],
                training_progress_events: [{ id: 'legacy-event' }]
            }
        }));

        createE2EMockSupabaseClient();
        const state = globalThis.__ESG_E2E_BACKEND__.dump();

        expect(state.tables.sessions).toEqual([expect.objectContaining({
            id: 'ordinary-session',
            session_classification: 'live_exercise',
            is_protected: false
        })]);
        expect(state.tables).not.toHaveProperty('training_attempts');
        expect(state.tables).not.toHaveProperty('training_progress_events');
    });

    it('keeps the submitted name on each session-role seat when the browser identity name changes', async () => {
        const { localStorage } = installBrowserRuntime();
        localStorage.setItem(E2E_MOCK_STATE_KEY, JSON.stringify({
            tables: {
                sessions: [
                    { id: 'session-one', name: 'One', status: 'active', session_classification: 'live_exercise', is_protected: false },
                    { id: 'session-two', name: 'Two', status: 'active', session_classification: 'live_exercise', is_protected: false }
                ]
            }
        }));
        const mockClient = createE2EMockSupabaseClient();
        await mockClient.auth.signInAnonymously();

        const firstClaim = await mockClient.rpc('claim_session_role_seat', {
            requested_session_id: 'session-one',
            requested_role: 'blue_facilitator',
            requested_name: 'Morgan',
            requested_client_id: 'same-browser'
        });
        const secondClaim = await mockClient.rpc('claim_session_role_seat', {
            requested_session_id: 'session-two',
            requested_role: 'red_facilitator',
            requested_name: 'Taylor',
            requested_client_id: 'same-browser'
        });
        const firstRoster = await mockClient.rpc('list_active_session_participants', {
            requested_session_id: 'session-one'
        });
        const secondRoster = await mockClient.rpc('list_active_session_participants', {
            requested_session_id: 'session-two'
        });

        expect(firstClaim.error).toBeNull();
        expect(secondClaim.error).toBeNull();
        expect(firstRoster.data).toEqual([
            expect.objectContaining({ role: 'blue_facilitator', display_name: 'Morgan' })
        ]);
        expect(secondRoster.data).toEqual([
            expect.objectContaining({ role: 'red_facilitator', display_name: 'Taylor' })
        ]);
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

    it('mirrors atomic action completion and requested-team notification delivery', async () => {
        const { localStorage } = installBrowserRuntime({
            hostname: '127.0.0.1',
            webdriver: true,
            enableMock: true,
            operatorAccessCode: 'playwright-test-code'
        });
        localStorage.setItem(E2E_MOCK_STATE_KEY, JSON.stringify({
            tables: {
                sessions: [{ id: 'session-1', status: 'active' }],
                game_state: [{ session_id: 'session-1', move: 2 }],
                actions: [{
                    id: 'action-blue-notifications',
                    session_id: 'session-1',
                    team: 'blue',
                    artifact_type: 'action',
                    artifact_payload: {
                        action: {
                            title: 'Coordinate licensing controls',
                            notificationTeams: ['Green', 'Industry'],
                            notificationNote: 'Share the completed action with both teams.'
                        }
                    },
                    status: 'submitted',
                    workflow_state: 'submitted_to_white_cell',
                    revision_number: 2,
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

        const unrequested = await mockClient.rpc('operator_complete_action_with_notifications', {
            requested_action_id: 'action-blue-notifications',
            requested_team: 'blue',
            requested_expected_revision: 2,
            requested_reviewer_notes: null,
            requested_notification_teams: ['red'],
            requested_notification_content: 'Invalid delivery.'
        });
        expect(unrequested.error?.message).toBe('Action notifications are limited to Green and Industry.');

        const completed = await mockClient.rpc('operator_complete_action_with_notifications', {
            requested_action_id: 'action-blue-notifications',
            requested_team: 'blue',
            requested_expected_revision: 2,
            requested_reviewer_notes: 'Approved.',
            requested_notification_teams: ['green', 'industry'],
            requested_notification_content: 'Completed Blue action detail.'
        });

        expect(completed.error).toBeNull();
        expect(completed.data.artifact).toMatchObject({
            status: 'adjudicated',
            workflow_state: 'completed',
            outcome: null
        });
        expect(completed.data.notification_teams).toEqual(['green', 'industry']);
        expect(completed.data.communications).toHaveLength(2);
        expect(completed.data.communications.map((communication) => communication.to_role).sort())
            .toEqual(['green', 'industry']);
        expect(completed.data.communications[0].metadata).toMatchObject({
            shared_action_id: 'action-blue-notifications',
            source_team: 'blue',
            notification_delivery: 'approved'
        });
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
                    artifact_payload: { proposal: { recipientTeams: ['blue'] } },
                    status: 'submitted',
                    workflow_state: 'submitted_to_white_cell',
                    revision_number: 1,
                    outcome: null,
                    goal: 'Dual recipient proposal',
                    expected_outcomes: 'Preserve joint access.',
                    ally_contingencies: [
                        'Proposal Details',
                        'Originators: ["EU", "Japan"]',
                        'Objective: Coordinate the shared logistics corridor.',
                        'Instruments: ["Economic"]',
                        'Intended Partners: Blue Team, Red Team',
                        'Timing And Conditions: Before Move 3.',
                        'Recipient Teams: ["blue", "red"]',
                        'Focus Sectors: ["Logistics", "Critical minerals"]'
                    ].join('\n'),
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
        expect(approveBlue.data.communication.metadata.proposal).toMatchObject({
            originators: ['EU', 'Japan'],
            objective: 'Coordinate the shared logistics corridor.',
            focusSectors: ['Logistics', 'Critical minerals'],
            timingAndConditions: 'Before Move 3.',
            expectedOutcomes: 'Preserve joint access.'
        });
        expect(approveBlue.data.communication.metadata.proposal).not.toHaveProperty('recipientTeams');
        expect(approveBlue.data.communication.metadata.proposal).not.toHaveProperty('intendedPartners');
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
            parent_message_id: blueRoot.id,
            source_proposal_id: 'proposal-1',
            source_revision: 1,
            sender_team: 'blue',
            sender_role: 'blue_scribe',
            proposed_round_number: 1,
            proposed_message_type: 'negotiation_message'
        });
        expect(blueResponse.data).toMatchObject({ type: 'PROPOSAL_RESPONSE_REVIEW', to_role: 'white_cell' });
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
        await mockClient.rpc('authorize_demo_operator', {
            requested_surface: 'whitecell',
            requested_operator_code: 'playwright-test-code',
            requested_session_id: 'session-1',
            requested_role: 'whitecell_lead'
        });
        const blueForward = await mockClient.rpc('operator_forward_proposal_response', {
            requested_review_communication_id: blueResponse.data.id
        });
        expect(blueForward.error).toBeNull();
        expect(blueForward.data.communication.metadata).toMatchObject({
            round_number: 1,
            message_type: 'negotiation_message',
            review_request_id: blueResponse.data.id
        });

        await mockClient.auth.signOut();
        await mockClient.auth.signInAnonymously();
        await mockClient.rpc('claim_session_role_seat', {
            requested_session_id: 'session-1',
            requested_role: 'green_scribe',
            requested_name: 'Green Facilitator',
            requested_client_id: 'green-client'
        });
        const greenFollowUp = await mockClient.rpc('append_proposal_thread_message', {
            requested_parent_message_id: blueForward.data.communication.id,
            requested_content: 'Green accepts the checkpoint and proposes a joint review.',
            requested_message_type: 'negotiation_message',
            requested_client_message_id: '00000000-0000-4000-8000-000000000004'
        });
        expect(greenFollowUp.error).toBeNull();
        expect(greenFollowUp.data.metadata).toMatchObject({
            thread_id: blueRoot.metadata.thread_id,
            recipient_team: 'blue',
            proposed_round_number: 2,
            parent_message_id: blueForward.data.communication.id,
            sender_team: 'green',
            proposed_message_type: 'negotiation_message'
        });

        await mockClient.auth.signOut();
        await mockClient.auth.signInAnonymously();
        await mockClient.rpc('authorize_demo_operator', {
            requested_surface: 'whitecell',
            requested_operator_code: 'playwright-test-code',
            requested_session_id: 'session-1',
            requested_role: 'whitecell_lead'
        });
        const greenForward = await mockClient.rpc('operator_forward_proposal_response', {
            requested_review_communication_id: greenFollowUp.data.id
        });
        expect(greenForward.error).toBeNull();
        expect(globalThis.__ESG_E2E_BACKEND__.dump().tables.communications
            .filter((row) => ['PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE'].includes(row.type)
                && row.metadata?.thread_id === blueRoot.metadata.thread_id)
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
            requested_parent_message_id: greenForward.data.communication.id,
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

    it('enforces the notetaker session-and-move unique constraint used by concurrent-save retries', async () => {
        installBrowserRuntime({
            hostname: '127.0.0.1',
            webdriver: true,
            enableMock: true,
            operatorAccessCode: 'playwright-test-code'
        });

        const mockClient = createE2EMockSupabaseClient();
        await mockClient.auth.signInAnonymously();
        await mockClient.rpc('authorize_demo_operator', {
            requested_surface: 'gamemaster',
            requested_operator_code: 'playwright-test-code',
            requested_operator_name: 'Mock GM'
        });
        const createdSession = await mockClient.rpc('create_live_demo_session', {
            requested_name: 'Notetaker constraint session',
            requested_session_code: 'NOTE19',
            requested_description: 'Pins deterministic mock uniqueness.'
        });

        await mockClient.auth.signOut();
        await mockClient.auth.signInAnonymously();
        const claimedSeat = await mockClient.rpc('claim_session_role_seat', {
            requested_session_id: createdSession.data.id,
            requested_role: 'blue_notetaker',
            requested_name: 'Mock Notetaker',
            requested_client_id: 'mock-notetaker-client'
        });
        expect(claimedSeat.error).toBeNull();

        const firstInsert = await mockClient.from('notetaker_data').insert({
            session_id: createdSession.data.id,
            move: 1,
            phase: 1,
            team: 'blue'
        }).select().single();
        const duplicateInsert = await mockClient.from('notetaker_data').insert({
            session_id: createdSession.data.id,
            move: 1,
            phase: 2,
            team: 'blue'
        }).select().single();
        const storedRows = await mockClient.from('notetaker_data')
            .select('*')
            .eq('session_id', createdSession.data.id)
            .eq('move', 1);

        expect(firstInsert.error).toBeNull();
        expect(duplicateInsert.error).toMatchObject({
            code: '23505',
            message: expect.stringContaining('notetaker_data_session_id_move_key')
        });
        expect(storedRows.data).toHaveLength(1);
    });
});
