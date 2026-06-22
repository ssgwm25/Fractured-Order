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
