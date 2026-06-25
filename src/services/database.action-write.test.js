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
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));

    mockSupabase.from.mockReturnValue({
        update
    });

    return { update };
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

    it('derives the proposal mechanism before inserting a Green proposal row', async () => {
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
                category: 'Alignment',
                intendedPartners: 'Blue Team',
                delivery: 'Joint Statement',
                timingAndConditions: 'Next move',
                recipientTeam: 'blue'
            }),
            priority: 'NORMAL',
            status: 'submitted'
        });

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            mechanism: 'Proposal'
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
            mechanism: 'Strategic Orientation'
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
            mechanism: 'Move Response'
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
        const { update } = mockUpdateChain();
        vi.spyOn(database, 'getAction').mockResolvedValue({
            id: 'action-draft-1',
            status: 'draft'
        });

        await database.updateDraftAction('action-draft-1', {
            mechanism: '',
            goal: 'Secure corridor access'
        });

        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            mechanism: '',
            goal: 'Secure corridor access'
        }));
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
