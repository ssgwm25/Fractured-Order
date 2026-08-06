import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockSupabase,
    mockEnsureBrowserIdentity,
    mockSessionStore
} = vi.hoisted(() => ({
    mockSupabase: {
        rpc: vi.fn(),
        from: vi.fn()
    },
    mockEnsureBrowserIdentity: vi.fn(),
    mockSessionStore: {
        getClientId: vi.fn(() => 'client-privileged-test')
    }
}));

vi.mock('./supabase.js', () => ({
    supabase: mockSupabase,
    ensureBrowserIdentity: mockEnsureBrowserIdentity,
    getRuntimeConfigStatus: () => ({ ready: true })
}));

vi.mock('../stores/session.js', () => ({
    sessionStore: mockSessionStore
}));

describe('database privileged write contracts', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockEnsureBrowserIdentity.mockResolvedValue({
            access_token: 'anon-token'
        });
    });

    it('creates sessions through the protected Game Master RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                id: 'session-1',
                name: 'Alpha Session',
                session_code: 'ALPHA2026'
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.createSession({
            name: 'Alpha Session',
            session_code: 'ALPHA2026',
            description: 'Protected session'
        });

        expect(mockSupabase.rpc).toHaveBeenCalledWith('create_live_demo_session', {
            requested_name: 'Alpha Session',
            requested_session_code: 'ALPHA2026',
            requested_description: 'Protected session'
        });
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('routes Game State changes through the protected White Cell RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                session_id: 'session-1',
                move: 2,
                phase: 1,
                timer_seconds: 5400,
                timer_running: false
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.updateGameState('session-1', {
            current_move: 2,
            timer_running: false
        });

        expect(mockSupabase.rpc).toHaveBeenCalledWith('operator_update_game_state', {
            requested_session_id: 'session-1',
            requested_move: 2,
            requested_phase: null,
            requested_timer_seconds: null,
            requested_timer_running: false,
            requested_timer_last_update: null
        });
    });

    it('routes timer allocation changes through the protected White Cell RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                session_id: 'session-1',
                move: 1,
                phase: 1,
                timer_seconds: 5400,
                timer_allocations: {
                    strategic_orientation: 1800,
                    move_1: 2700,
                    move_2: 3600,
                    move_3: 4500
                },
                timer_running: false
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.updateGameState('session-1', {
            timer_allocations: {
                strategic_orientation: 1800,
                move_1: 2700,
                move_2: 3600,
                move_3: 4500,
                ignored: 1200
            }
        });

        expect(mockSupabase.rpc).toHaveBeenCalledWith('operator_update_game_state', {
            requested_session_id: 'session-1',
            requested_move: null,
            requested_phase: null,
            requested_timer_seconds: null,
            requested_timer_running: null,
            requested_timer_last_update: null,
            requested_timer_allocations: {
                strategic_orientation: 1800,
                move_1: 2700,
                move_2: 3600,
                move_3: 4500
            }
        });
    });

    it('routes plugin state changes through the protected White Cell RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                session_id: 'session-1',
                move: 1,
                phase: 1,
                timer_seconds: 5400,
                plugin_state: {
                    intercom: { enabled: true },
                    'session-recorder': { enabled: false }
                },
                timer_running: false
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.updateGameState('session-1', {
            plugin_state: {
                intercom: { enabled: true },
                'session-recorder': { enabled: false },
                unexpected: { enabled: true }
            }
        });

        expect(mockSupabase.rpc).toHaveBeenCalledWith('operator_update_game_state', {
            requested_session_id: 'session-1',
            requested_move: null,
            requested_phase: null,
            requested_timer_seconds: null,
            requested_timer_running: null,
            requested_timer_last_update: null,
            requested_plugin_state: {
                intercom: { enabled: true },
                'session-recorder': { enabled: false }
            }
        });
    });

    it('routes answered request updates through the protected White Cell RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                id: 'request-1',
                status: 'answered',
                response: 'Response text'
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.updateRequest('request-1', {
            response: 'Response text',
            status: 'answered',
            responded_at: '2026-04-08T12:00:00.000Z'
        });

        expect(mockSupabase.rpc).toHaveBeenCalledWith('operator_answer_request', {
            requested_request_id: 'request-1',
            requested_response: 'Response text',
            requested_responded_at: '2026-04-08T12:00:00.000Z'
        });
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('routes White Cell communications through the protected RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                id: 'comm-1',
                session_id: 'session-1'
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.createCommunication({
            session_id: 'session-1',
            from_role: 'white_cell',
            to_role: 'blue',
            type: 'INJECT',
            content: 'Inject text'
        });

        expect(mockSupabase.rpc).toHaveBeenCalledWith('operator_send_communication', {
            requested_session_id: 'session-1',
            requested_to_role: 'blue',
            requested_type: 'INJECT',
            requested_content: 'Inject text',
            requested_title: null,
            requested_linked_request_id: null,
            requested_metadata: {}
        });
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('routes proposal recipient status updates through the protected RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                id: 'comm-1',
                metadata: {
                    proposal_recipient_state: {
                        status: 'acknowledged'
                    }
                }
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.updateProposalRecipientStatus('comm-1', 'acknowledged', {
            response_communication_id: 'response-1'
        });

        expect(mockSupabase.rpc).toHaveBeenCalledWith('update_proposal_recipient_status', {
            requested_communication_id: 'comm-1',
            requested_status: 'acknowledged',
            requested_metadata: {
                response_communication_id: 'response-1'
            }
        });
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('routes team-neutral artifact reviews through one revision-aware RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                artifact: {
                    id: 'action-red-1',
                    team: 'red',
                    status: 'draft',
                    workflow_state: 'returned_to_team',
                    revision_number: 3
                },
                review: {
                    decision: 'return_to_team',
                    revision_number: 2,
                    next_revision_number: 3
                }
            },
            error: null
        });

        const { database } = await import('./database.js');
        const result = await database.returnArtifactToTeam('action', 'action-red-1', {
            team: 'red',
            expectedRevision: 2,
            notes: 'Clarify the implementation sequence.'
        });

        expect(mockSupabase.rpc).toHaveBeenCalledWith('operator_review_artifact', {
            requested_artifact_kind: 'action',
            requested_artifact_id: 'action-red-1',
            requested_review_decision: 'return_to_team',
            requested_team: 'red',
            requested_expected_revision: 2,
            requested_reviewer_notes: 'Clarify the implementation sequence.'
        });
        expect(mockSupabase.from).not.toHaveBeenCalled();
        expect(result.artifact).toMatchObject({
            workflow_state: 'returned_to_team',
            canonical_workflow_state: 'returned_to_team',
            revision_number: 3
        });
    });

    it('routes outcome-free completion and RFI clarification through the same RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                artifact: {
                    id: 'orientation-1',
                    status: 'adjudicated',
                    workflow_state: 'completed',
                    outcome: null,
                    revision_number: 1
                },
                review: { decision: 'complete', revision_number: 1 }
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.completeArtifact('strategic_orientation', 'orientation-1', {
            team: 'blue',
            expectedRevision: 1,
            notes: 'Review complete.'
        });
        await database.returnArtifactToTeam('rfi', 'rfi-1', {
            team: 'industry',
            expectedRevision: 4,
            notes: 'Specify the requested time horizon.'
        });

        expect(mockSupabase.rpc).toHaveBeenNthCalledWith(1, 'operator_review_artifact', {
            requested_artifact_kind: 'strategic_orientation',
            requested_artifact_id: 'orientation-1',
            requested_review_decision: 'complete',
            requested_team: 'blue',
            requested_expected_revision: 1,
            requested_reviewer_notes: 'Review complete.'
        });
        expect(mockSupabase.rpc).toHaveBeenNthCalledWith(2, 'operator_review_artifact', {
            requested_artifact_kind: 'rfi',
            requested_artifact_id: 'rfi-1',
            requested_review_decision: 'return_for_clarification',
            requested_team: 'industry',
            requested_expected_revision: 4,
            requested_reviewer_notes: 'Specify the requested time horizon.'
        });
    });

    it('routes proposal review and forwarding through one transactional RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                action: { id: 'action-1', status: 'adjudicated' },
                communication: { id: 'comm-1', type: 'PROPOSAL_FORWARDED' },
                timeline_events: [{ id: 'timeline-1' }],
                idempotent_replay: false
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.reviewProposal('action-1', {
            decision: 'forward_to_recipient',
            recipient_team: 'blue',
            adjudication_notes: 'Forward after review.',
            expected_revision: 2
        });

        expect(mockSupabase.rpc).toHaveBeenCalledWith('operator_review_proposal', {
            requested_action_id: 'action-1',
            requested_review_decision: 'forward_to_recipient',
            requested_recipient_team: 'blue',
            requested_adjudication_notes: 'Forward after review.',
            requested_expected_revision: 2
        });
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('appends proposal thread messages through the protected RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                id: 'round-2',
                type: 'PROPOSAL_RESPONSE',
                metadata: { round_number: 2 }
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.appendProposalThreadMessage('round-1', {
            content: 'The proposing team accepts the checkpoint.',
            messageType: 'negotiation_message',
            clientMessageId: 'thread-blue-round-2'
        });

        expect(mockSupabase.rpc).toHaveBeenCalledWith('append_proposal_thread_message', {
            requested_parent_message_id: 'round-1',
            requested_content: 'The proposing team accepts the checkpoint.',
            requested_message_type: 'negotiation_message',
            requested_facilitator_decision: null,
            requested_client_message_id: 'thread-blue-round-2'
        });
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('routes participant removals through the protected Game Master RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                id: 'seat-1',
                session_id: 'session-1',
                participant_id: 'participant-1',
                role: 'blue_facilitator',
                is_active: false
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.removeSessionParticipant('session-1', 'seat-1');

        expect(mockSupabase.rpc).toHaveBeenCalledWith('operator_remove_session_participant', {
            requested_session_id: 'session-1',
            requested_session_participant_id: 'seat-1'
        });
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('surfaces operator-grant denial when a protected write is rejected', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: null,
            error: {
                message: 'White Cell operator authorization is required.'
            }
        });

        const { database } = await import('./database.js');

        await expect(database.updateRequest('request-1', {
            response: 'Denied',
            status: 'answered'
        })).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'White Cell operator authorization is required.'
        });
    });

    it('authorizes operator access through the server-side RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                id: 'grant-1',
                surface: 'gamemaster',
                role: 'white',
                operator_name: 'GM Operator',
                granted_at: '2026-04-08T12:00:00.000Z'
            },
            error: null
        });

        const { database } = await import('./database.js');
        const grant = await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Operator'
        });

        expect(mockSupabase.rpc).toHaveBeenCalledWith('authorize_demo_operator', {
            requested_surface: 'gamemaster',
            requested_operator_code: 'admin2025',
            requested_session_id: null,
            requested_team_id: null,
            requested_role: null,
            requested_operator_name: 'GM Operator'
        });
        expect(grant).toMatchObject({
            grantId: 'grant-1',
            surface: 'gamemaster',
            role: 'white',
            operatorName: 'GM Operator'
        });
    });
});
