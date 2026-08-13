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

const STRATEGIC_ORIENTATION_TEAM_WRITE_CASES = [
    {
        team: 'blue',
        expectedArtifactType: 'strategic_orientation_selection',
        forecastTargets: [{ key: 'red', orientation: 'reframe' }]
    },
    {
        team: 'red',
        expectedArtifactType: 'strategic_orientation_forecast',
        forecastTargets: [
            { key: 'blue', orientation: 'pressure' },
            { key: 'green_asian_pacific', orientation: 'reframe' },
            { key: 'green_europe', orientation: 'stabilization' }
        ]
    },
    {
        team: 'green',
        expectedArtifactType: 'strategic_orientation_forecast',
        forecastTargets: [{ key: 'blue', orientation: 'pressure' }]
    },
    {
        team: 'industry',
        expectedArtifactType: 'strategic_orientation_forecast',
        forecastTargets: [{ key: 'blue', orientation: 'pressure' }]
    }
];

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

    it.each(STRATEGIC_ORIENTATION_TEAM_WRITE_CASES)(
        'stores the combined $team Strategic Orientation envelope under its allowed compatibility type',
        async ({ team, expectedArtifactType, forecastTargets }) => {
            const { database } = await import('./database.js');
            const {
                STRATEGIC_ORIENTATION_ARTIFACT_TYPES,
                serializeStrategicOrientationDetails
            } = await import('../features/actions/strategicOrientationDetails.js');
            const { insert } = mockInsertChain();

            await database.createAction({
                session_id: 'session-1',
                client_id: 'client-action-write-test',
                move: 1,
                phase: 1,
                team,
                mechanism: 'Strategic Orientation',
                sector: '',
                exposure_type: 'pre_move_1',
                targets: [],
                goal: `${team} Strategic Orientation: Pressure`,
                expected_outcomes: 'Focus on affecting PRC GDP growth',
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: STRATEGIC_ORIENTATION_ARTIFACT_TYPES.ORIENTATION_AND_FORECAST,
                    team,
                    ownOrientation: 'pressure',
                    forecastTargets,
                    orientationRationale: team === 'red' ? 'Red explains its selected orientation.' : '',
                    forecastActionDescription: 'Red is expected to reframe its external position.',
                    strategyDescription: ['green', 'industry'].includes(team)
                        ? `${team} describes its strategy given the Blue forecast.`
                        : '',
                    scribeHandoff: 'Forwarded'
                }),
                priority: 'HIGH',
                status: 'draft'
            });

            expect(insert).toHaveBeenCalledWith(expect.objectContaining({
                team,
                artifact_type: expectedArtifactType,
                artifact_payload: {
                    strategic_orientation: expect.objectContaining({
                        artifactType: 'orientation_and_forecast',
                        team,
                        ownOrientation: expect.objectContaining({ id: 'pressure' }),
                        forecastTargets: expect.arrayContaining(forecastTargets.map((target) => (
                            expect.objectContaining(target)
                        )))
                    })
                },
                forecast_targets: expect.arrayContaining(forecastTargets.map((target) => (
                    expect.objectContaining(target)
                )))
            }));
        }
    );

    it('rejects a Strategic Orientation envelope that names a different team', async () => {
        const { database } = await import('./database.js');
        const {
            STRATEGIC_ORIENTATION_ARTIFACT_TYPES,
            serializeStrategicOrientationDetails
        } = await import('../features/actions/strategicOrientationDetails.js');
        const { insert } = mockInsertChain();

        await expect(database.createAction({
            session_id: 'session-1',
            client_id: 'client-action-write-test',
            move: 1,
            phase: 1,
            team: 'blue',
            mechanism: 'Strategic Orientation',
            sector: '',
            exposure_type: 'pre_move_1',
            targets: [],
            goal: 'Mismatched Strategic Orientation',
            expected_outcomes: '',
            ally_contingencies: serializeStrategicOrientationDetails({
                artifactType: STRATEGIC_ORIENTATION_ARTIFACT_TYPES.ORIENTATION_AND_FORECAST,
                team: 'red',
                ownOrientation: 'reframe',
                forecastTargets: [{ key: 'blue', orientation: 'pressure' }],
                orientationRationale: 'This envelope belongs to Red.',
                scribeHandoff: 'Forwarded'
            }),
            priority: 'HIGH',
            status: 'draft'
        })).rejects.toThrow('Strategic Orientation team does not match the action team.');
        expect(insert).not.toHaveBeenCalled();
    });

    it.each(STRATEGIC_ORIENTATION_TEAM_WRITE_CASES)(
        'keeps the $team compatibility type when editing a combined Strategic Orientation draft',
        async ({ team, expectedArtifactType, forecastTargets }) => {
            const { database } = await import('./database.js');
            const {
                STRATEGIC_ORIENTATION_ARTIFACT_TYPES,
                serializeStrategicOrientationDetails
            } = await import('../features/actions/strategicOrientationDetails.js');
            const { update } = mockUpdateChain({
                id: `${team}-orientation-draft`,
                team,
                status: 'draft',
                row_version: 4
            });
            vi.spyOn(database, 'getAction').mockResolvedValue({
                id: `${team}-orientation-draft`,
                team,
                status: 'draft',
                row_version: 3
            });

            await database.updateDraftAction(`${team}-orientation-draft`, {
                ally_contingencies: serializeStrategicOrientationDetails({
                    artifactType: STRATEGIC_ORIENTATION_ARTIFACT_TYPES.ORIENTATION_AND_FORECAST,
                    team,
                    ownOrientation: 'reframe',
                    forecastTargets,
                    orientationRationale: team === 'red' ? 'Red explains its revised orientation.' : '',
                    forecastActionDescription: 'Red is expected to apply pressure.',
                    strategyDescription: ['green', 'industry'].includes(team)
                        ? `${team} revises its strategy given the Blue forecast.`
                        : '',
                    scribeHandoff: 'Forwarded'
                })
            });

            expect(update).toHaveBeenCalledWith(expect.objectContaining({
                artifact_type: expectedArtifactType,
                artifact_payload: {
                    strategic_orientation: expect.objectContaining({
                        artifactType: 'orientation_and_forecast',
                        team
                    })
                },
                forecast_targets: expect.arrayContaining(forecastTargets.map((target) => (
                    expect.objectContaining(target)
                )))
            }));
        }
    );

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

    it('stores Blue notification requests in the structured action payload', async () => {
        const { database } = await import('./database.js');
        const { serializeBlueActionDetails } = await import('../features/actions/blueActionDetails.js');
        const { insert } = mockInsertChain();

        await database.createAction({
            session_id: 'session-1',
            client_id: 'client-action-write-test',
            move: 2,
            phase: 3,
            team: 'blue',
            mechanism: 'Economic',
            sector: 'Biotechnology',
            exposure_type: 'Advanced Manufacturing',
            targets: ['PRC'],
            goal: 'Coordinate allied semiconductor controls',
            expected_outcomes: 'Reduce upstream dependency.',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Coordinate the allied response.',
                notificationTeams: ['Green', 'Industry'],
                notificationNote: 'Notify both teams after White Cell accepts the action.',
                scribeHandoff: 'Forwarded'
            }),
            priority: 'NORMAL',
            status: 'draft'
        });

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            artifact_type: 'action',
            artifact_payload: {
                action: expect.objectContaining({
                    notificationTeams: ['Green', 'Industry'],
                    notificationNote: 'Notify both teams after White Cell accepts the action.',
                    scribeHandoff: 'Forwarded'
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
