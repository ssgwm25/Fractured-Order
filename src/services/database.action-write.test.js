import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockSupabase,
    mockEnsureBrowserIdentity,
    mockSessionStore
} = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn()
    },
    mockEnsureBrowserIdentity: vi.fn(),
    mockSessionStore: {
        getClientId: vi.fn(() => 'client-action-write-test')
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

function mockInsertChain(result = { id: 'action-created' }) {
    const single = vi.fn().mockResolvedValue({
        data: result,
        error: null
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));

    mockSupabase.from.mockReturnValue({
        insert
    });

    return { insert };
}

function mockUpdateChain(result = { id: 'action-updated' }) {
    const single = vi.fn().mockResolvedValue({
        data: result,
        error: null
    });
    const select = vi.fn(() => ({ single }));
    const updateBuilder = { select };
    const eq = vi.fn(() => updateBuilder);
    updateBuilder.eq = eq;
    const update = vi.fn(() => ({ eq }));

    mockSupabase.from.mockReturnValue({
        update
    });

    return { update, eq };
}

describe('database action write contracts', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockEnsureBrowserIdentity.mockResolvedValue({
            access_token: 'anon-token'
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('stores multi-recipient proposal approval state at the action write boundary', async () => {
        const { database } = await import('./database.js');
        const { serializeProposalDetails } = await import('../features/actions/proposalDetails.js');
        const { insert } = mockInsertChain();

        await database.createAction({
            session_id: 'session-1',
            client_id: 'client-action-write-test',
            move: 1,
            phase: 1,
            team: 'green',
            mechanism: null,
            sector: 'Biotechnology',
            exposure_type: null,
            targets: [],
            goal: 'Green proposal',
            expected_outcomes: 'Secure allied alignment.',
            ally_contingencies: serializeProposalDetails({
                originators: ['EU'],
                objective: 'Coordinate a joint line.',
                intendedPartners: 'Blue Team, Red Team',
                timingAndConditions: 'Next move',
                recipientTeams: ['blue', 'red'],
                focusSectors: ['Biotechnology', 'Agriculture'],
                supplyChainFocusDecision: 'No'
            }),
            priority: 'NORMAL',
            idempotency_key: 'proposal-command-1',
            status: 'submitted'
        });

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            mechanism: 'Proposal',
            idempotency_key: 'proposal-command-1',
            artifact_type: 'proposal',
            proposal_recipient_team: 'blue',
            artifact_payload: {
                proposal: expect.objectContaining({
                    objective: 'Coordinate a joint line.',
                    recipientTeam: 'blue',
                    recipientTeams: ['blue', 'red'],
                    recipientApprovalStates: {
                        blue: 'pending_white_cell_approval',
                        red: 'pending_white_cell_approval'
                    },
                    focusSectors: ['Biotechnology', 'Agriculture']
                })
            }
        }));
    });

    it('derives the Strategic Orientation mechanism before inserting a pre-Move 1 artifact', async () => {
        const { database } = await import('./database.js');
        const { serializeStrategicOrientationDetails } = await import('../features/actions/strategicOrientationDetails.js');
        const { insert } = mockInsertChain();

        await database.createAction({
            session_id: 'session-1',
            client_id: 'client-action-write-test',
            move: 1,
            phase: 1,
            team: 'blue',
            mechanism: null,
            sector: null,
            exposure_type: 'pre_move_1',
            targets: [],
            goal: 'Strategic Orientation: Pressure',
            expected_outcomes: 'Focus on affecting PRC GDP growth',
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType: 'selection',
                team: 'blue',
                orientation: 'pressure',
                primaryLevers: ['Expanded financial sanctions'],
                acceptedCosts: ['Sustained economic friction'],
                posture: 'Calibrated \u2014 escalate deliberately',
                scribeHandoff: 'Forwarded'
            }),
            priority: 'HIGH',
            status: 'draft'
        });

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            mechanism: 'Strategic Orientation',
            sector: '',
            artifact_type: 'strategic_orientation_selection',
            artifact_payload: {
                strategic_orientation: expect.objectContaining({
                    artifactType: 'selection',
                    team: 'blue'
                })
            }
        }));
    });

    it('stamps submitted_at when creating an item directly in submitted state', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-09T10:20:00.000Z'));

        const { database } = await import('./database.js');
        const { serializeMoveResponseDetails } = await import('../features/actions/moveResponseDetails.js');
        const { insert } = mockInsertChain();

        await database.createAction({
            session_id: 'session-1',
            client_id: 'client-action-write-test',
            move: 2,
            phase: 1,
            team: 'red',
            mechanism: null,
            sector: null,
            exposure_type: null,
            targets: [],
            goal: 'Counter logistics corridor squeeze',
            expected_outcomes: 'Preserve throughput and deny escalation payoff.',
            ally_contingencies: serializeMoveResponseDetails({
                strategicAssessment: 'Blue is tightening maritime leverage.',
                responseStrategy: 'Exploit alternate port relationships.',
                keyActions: 'Shift freight priorities.',
                targetsAndPressurePoints: 'Ports and logistics timing.',
                deliveryChannel: 'Private shipping briefings.'
            }),
            priority: 'NORMAL',
            status: 'submitted'
        });

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            sector: '',
            artifact_type: 'move_response',
            status: 'submitted',
            submitted_at: '2026-04-09T10:20:00.000Z'
        }));
    });

    it('derives the move-response mechanism before updating a Red draft row', async () => {
        const { database } = await import('./database.js');
        const { serializeMoveResponseDetails } = await import('../features/actions/moveResponseDetails.js');
        const { update } = mockUpdateChain();

        await database.updateAction('action-2', {
            mechanism: null,
            ally_contingencies: serializeMoveResponseDetails({
                strategicAssessment: 'Blue is testing shipping capacity.',
                responseStrategy: 'Absorb pressure through alternate routing.',
                keyActions: 'Shift freight priorities.',
                targetsAndPressurePoints: 'Ports and logistics timing.',
                deliveryChannel: 'Private shipping briefings.'
            })
        });

        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            mechanism: 'Move Response',
            artifact_type: 'move_response',
            artifact_payload: {
                move_response: expect.objectContaining({
                    responseStrategy: 'Absorb pressure through alternate routing.'
                })
            }
        }));
    });

    it('allows incomplete draft rows to persist with an empty mechanism', async () => {
        const { database } = await import('./database.js');
        const { insert } = mockInsertChain();

        await database.createAction({
            session_id: 'session-1',
            client_id: 'client-action-write-test',
            move: 1,
            phase: 1,
            team: 'blue',
            mechanism: '',
            sector: '',
            exposure_type: '',
            targets: [],
            goal: 'Secure corridor access',
            expected_outcomes: '',
            ally_contingencies: 'Blue Team Action Details\nObjective: Stabilize trade flows.',
            priority: 'NORMAL',
            status: 'draft'
        });

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            mechanism: '',
            status: 'draft'
        }));
    });

    it('allows draft-only updates to clear the mechanism while the wizard is still in progress', async () => {
        const { database } = await import('./database.js');
        const { update, eq } = mockUpdateChain();
        vi.spyOn(database, 'getAction').mockResolvedValue({
            id: 'action-draft-1',
            status: 'draft',
            row_version: 7
        });

        await database.updateDraftAction('action-draft-1', {
            mechanism: '',
            goal: 'Secure corridor access'
        });

        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            mechanism: '',
            goal: 'Secure corridor access'
        }));
        expect(eq).toHaveBeenNthCalledWith(1, 'id', 'action-draft-1');
        expect(eq).toHaveBeenNthCalledWith(2, 'row_version', 7);
    });

    it('fails fast when a submitted non-special action write omits a mechanism', async () => {
        const { database } = await import('./database.js');
        mockInsertChain();

        await expect(database.createAction({
            session_id: 'session-1',
            client_id: 'client-action-write-test',
            move: 1,
            phase: 1,
            team: 'blue',
            mechanism: null,
            sector: 'energy',
            exposure_type: 'tariff',
            targets: ['Target State'],
            goal: 'Generic action without a mechanism',
            expected_outcomes: 'Should not persist.',
            ally_contingencies: 'Coordinate quietly.',
            priority: 'NORMAL',
            status: 'submitted'
        })).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'Action mechanism is required.'
        });
    });
});
