import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    TEAM_OPTIONS,
    ROLE_SURFACES,
    WHITE_CELL_OPERATOR_ROLES,
    buildTeamRole,
    buildWhiteCellOperatorRole
} from '../core/teamContext.js';

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

async function loadModules() {
    vi.resetModules();
    globalThis.__ESG_E2E_TEST_CONFIG__ = {
        operatorAccessCode: 'admin2025'
    };

    const [{ sessionStore }, { database }] = await Promise.all([
        import('../stores/session.js'),
        import('./database.js')
    ]);

    return {
        sessionStore,
        database
    };
}

function setClientIdentity(sessionStore, clientId, { resetAuth = true } = {}) {
    sessionStore.clearAll();
    if (resetAuth) {
        vi.setSystemTime(new Date(Date.now() + 1));
        localStorage.removeItem('esg_e2e_auth_session');
    }
    localStorage.setItem('esg_client_id', clientId);
    sessionStore.init();
}

function restoreClientIdentity(sessionStore, clientId, authSession) {
    sessionStore.clearAll();
    localStorage.setItem('esg_e2e_auth_session', authSession);
    localStorage.setItem('esg_client_id', clientId);
    sessionStore.init();
}

const ALL_TEAM_ROLE_CASES = [
    ...TEAM_OPTIONS.flatMap((team) => ([
        {
            label: `${team.id} facilitator`,
            role: buildTeamRole(team.id, ROLE_SURFACES.FACILITATOR),
            teamId: team.id,
            requiresWhiteCellGrant: false
        },
        {
            label: `${team.id} scribe`,
            role: buildTeamRole(team.id, ROLE_SURFACES.SCRIBE),
            teamId: team.id,
            requiresWhiteCellGrant: false
        },
        {
            label: `${team.id} notetaker`,
            role: buildTeamRole(team.id, ROLE_SURFACES.NOTETAKER),
            teamId: team.id,
            requiresWhiteCellGrant: false
        }
    ])),
    {
        label: 'whitecell lead',
        role: buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.LEAD),
        teamId: null,
        requiresWhiteCellGrant: true,
        retainsProtectedSessionAccess: true
    },
    {
        label: 'whitecell support',
        role: buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.SUPPORT),
        teamId: null,
        requiresWhiteCellGrant: true,
        retainsProtectedSessionAccess: true
    },
];

describe('database live-demo seat contract', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));
        global.localStorage = new MemoryStorage();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetModules();
        delete global.localStorage;
        delete globalThis.__ESG_E2E_TEST_CONFIG__;
        delete globalThis.__ESG_E2E_BACKEND__;
    });

    it('claims a seat successfully through the server-side RPC flow', async () => {
        const { sessionStore, database } = await loadModules();
        setClientIdentity(sessionStore, 'client-seat-a');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Test'
        });

        const session = await database.createSession({
            name: 'Seat Claim Session',
            session_code: 'SEAT2026'
        });

        const seat = await database.claimParticipantSeat(session.id, 'blue_facilitator', 'Morgan');

        expect(seat).toMatchObject({
            session_id: session.id,
            role: 'blue_facilitator',
            display_name: 'Morgan',
            client_id: 'client-seat-a',
            claim_status: 'claimed',
            seat_limit: 1,
            active_count: 1,
            is_active: true
        });

        const activeParticipants = await database.getActiveParticipants(session.id);
        expect(activeParticipants).toHaveLength(1);
        expect(activeParticipants[0]).toMatchObject({
            id: seat.id,
            role: 'blue_facilitator',
            display_name: 'Morgan'
        });
    });

    it('allows an initial public seat claim without prior session access while keeping protected participant RPCs locked down', async () => {
        const { sessionStore, database } = await loadModules();
        setClientIdentity(sessionStore, 'client-operator');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Test'
        });

        const session = await database.createSession({
            name: 'Guarded Participant Session',
            session_code: 'GUARD2026'
        });

        setClientIdentity(sessionStore, 'client-public-a');

        await expect(
            database.releaseStaleParticipantSeats(session.id)
        ).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'Session access is required.'
        });

        await expect(
            database.getActiveParticipants(session.id)
        ).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'Session access is required.'
        });

        const claimedSeat = await database.claimParticipantSeat(session.id, 'blue_facilitator', 'Morgan');
        expect(claimedSeat).toMatchObject({
            session_id: session.id,
            role: 'blue_facilitator',
            display_name: 'Morgan',
            client_id: 'client-public-a',
            claim_status: 'claimed',
            is_active: true
        });

        await expect(database.getActiveParticipants(session.id)).resolves.toEqual([
            expect.objectContaining({
                id: claimedSeat.id,
                role: 'blue_facilitator',
                display_name: 'Morgan'
            })
        ]);

        setClientIdentity(sessionStore, 'client-public-b');

        await expect(
            database.getActiveParticipants(session.id)
        ).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'Session access is required.'
        });
    });

    it('rejects duplicate claims when the seat is already full', async () => {
        const { sessionStore, database } = await loadModules();
        setClientIdentity(sessionStore, 'client-seat-a');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Test'
        });

        const session = await database.createSession({
            name: 'Duplicate Claim Session',
            session_code: 'DUPL2026'
        });

        await database.claimParticipantSeat(session.id, 'blue_facilitator', 'Morgan');

        setClientIdentity(sessionStore, 'client-seat-b');

        await expect(
            database.claimParticipantSeat(session.id, 'blue_facilitator', 'Taylor')
        ).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'The requested role is full. Please choose another seat.'
        });
    });

    it('releases stale seats automatically before a new claim is evaluated', async () => {
        const { sessionStore, database } = await loadModules();
        setClientIdentity(sessionStore, 'client-stale-a');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Test'
        });

        const session = await database.createSession({
            name: 'Stale Seat Session',
            session_code: 'STALE2026'
        });

        const staleSeat = await database.claimParticipantSeat(session.id, 'blue_facilitator', 'Morgan');
        expect(staleSeat.is_active).toBe(true);

        vi.setSystemTime(new Date('2026-04-08T10:02:00.000Z'));
        setClientIdentity(sessionStore, 'client-stale-b');

        const replacementSeat = await database.claimParticipantSeat(session.id, 'blue_facilitator', 'Taylor');
        expect(replacementSeat).toMatchObject({
            role: 'blue_facilitator',
            display_name: 'Taylor',
            client_id: 'client-stale-b',
            active_count: 1
        });

        const activeParticipants = await database.getActiveParticipants(session.id);
        expect(activeParticipants).toHaveLength(1);
        expect(activeParticipants[0]).toMatchObject({
            id: replacementSeat.id,
            display_name: 'Taylor'
        });
    });

    it('disconnects a claimed seat and lets the same client rejoin it', async () => {
        const { sessionStore, database } = await loadModules();
        setClientIdentity(sessionStore, 'client-rejoin-a');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Test'
        });

        const session = await database.createSession({
            name: 'Disconnect Session',
            session_code: 'DISC2026'
        });

        const claimedSeat = await database.claimParticipantSeat(session.id, 'blue_notetaker', 'Jordan');
        const disconnectedSeat = await database.disconnectParticipant(session.id, claimedSeat.id);

        expect(disconnectedSeat).toMatchObject({
            id: claimedSeat.id,
            is_active: false
        });
        expect(await database.getActiveParticipants(session.id)).toEqual([]);

        const rejoinedSeat = await database.claimParticipantSeat(session.id, 'blue_notetaker', 'Jordan');
        expect(rejoinedSeat).toMatchObject({
            id: claimedSeat.id,
            role: 'blue_notetaker',
            display_name: 'Jordan',
            claim_status: 'rejoined',
            is_active: true
        });
    });

    it('lets Game Master remove a participant seat so heartbeat recovery cannot reclaim it', async () => {
        const { sessionStore, database } = await loadModules();
        setClientIdentity(sessionStore, 'client-remove-gm');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Removal Test'
        });

        const session = await database.createSession({
            name: 'Participant Removal Session',
            session_code: 'RMOV2026'
        });

        setClientIdentity(sessionStore, 'client-remove-participant');
        const claimedSeat = await database.claimParticipantSeat(session.id, 'blue_facilitator', 'Morgan');
        const participantAuthSession = localStorage.getItem('esg_e2e_auth_session');

        setClientIdentity(sessionStore, 'client-remove-gm');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Removal Test'
        });

        const removedSeat = await database.removeSessionParticipant(session.id, claimedSeat.id);

        expect(removedSeat).toMatchObject({
            id: claimedSeat.id,
            session_id: session.id,
            role: 'blue_facilitator',
            is_active: false
        });
        await expect(database.getSessionParticipants(session.id)).resolves.toEqual([]);

        restoreClientIdentity(sessionStore, 'client-remove-participant', participantAuthSession);
        await expect(
            database.updateHeartbeat(session.id, claimedSeat.id)
        ).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'Participant seat not found. Please rejoin the session.'
        });

        const rejoinedSeat = await database.claimParticipantSeat(session.id, 'blue_facilitator', 'Morgan');
        expect(rejoinedSeat).toMatchObject({
            session_id: session.id,
            role: 'blue_facilitator',
            display_name: 'Morgan',
            claim_status: 'claimed',
            is_active: true
        });
        expect(rejoinedSeat.id).not.toBe(claimedSeat.id);
    });

    it('revokes White Cell operator access when Game Master removes a White Cell seat', async () => {
        const { sessionStore, database } = await loadModules();
        setClientIdentity(sessionStore, 'client-whitecell-gm');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM White Cell Removal'
        });

        const session = await database.createSession({
            name: 'White Cell Removal Session',
            session_code: 'WCRM2026'
        });

        setClientIdentity(sessionStore, 'client-whitecell-operator');
        await database.authorizeOperatorAccess({
            surface: 'whitecell',
            accessCode: 'admin2025',
            sessionId: session.id,
            role: 'whitecell_lead',
            operatorName: 'White Cell Lead'
        });
        const whiteCellSeat = await database.claimParticipantSeat(session.id, 'whitecell_lead', 'White Cell Lead');
        const whiteCellAuthSession = localStorage.getItem('esg_e2e_auth_session');

        setClientIdentity(sessionStore, 'client-whitecell-gm');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM White Cell Removal'
        });
        await database.removeSessionParticipant(session.id, whiteCellSeat.id);

        restoreClientIdentity(sessionStore, 'client-whitecell-operator', whiteCellAuthSession);
        await expect(
            database.updateGameState(session.id, {
                current_move: 2
            })
        ).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'White Cell operator authorization is required.'
        });
    });

    it('allows a stale seat holder to recover their seat with heartbeat even after public session access has dropped', async () => {
        const { sessionStore, database } = await loadModules();
        setClientIdentity(sessionStore, 'client-heartbeat-a');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Test'
        });

        const session = await database.createSession({
            name: 'Heartbeat Recovery Session',
            session_code: 'HBRT2026'
        });

        setClientIdentity(sessionStore, 'client-heartbeat-b');
        const claimedSeat = await database.claimParticipantSeat(session.id, 'blue_facilitator', 'Morgan');
        const participantAuthSession = localStorage.getItem('esg_e2e_auth_session');

        vi.setSystemTime(new Date('2026-04-08T10:02:00.000Z'));

        setClientIdentity(sessionStore, 'client-heartbeat-c');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Cleanup'
        });
        await expect(database.releaseStaleParticipantSeats(session.id)).resolves.toBe(1);

        sessionStore.clearAll();
        localStorage.setItem('esg_e2e_auth_session', participantAuthSession);
        localStorage.setItem('esg_client_id', 'client-heartbeat-b');
        sessionStore.init();

        await expect(
            database.releaseStaleParticipantSeats(session.id)
        ).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'Session access is required.'
        });

        const refreshedSeat = await database.updateHeartbeat(session.id, claimedSeat.id);
        expect(refreshedSeat).toMatchObject({
            id: claimedSeat.id,
            role: 'blue_facilitator',
            display_name: 'Morgan',
            is_active: true
        });

        await expect(database.getActiveParticipants(session.id)).resolves.toEqual([
            expect.objectContaining({
                id: claimedSeat.id,
                role: 'blue_facilitator',
                display_name: 'Morgan'
            })
        ]);
    });

    it('lets a White Cell operator review and respond across all teams in the session', async () => {
        const { sessionStore, database } = await loadModules();

        setClientIdentity(sessionStore, 'client-gm-cross-team');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Cross-Team'
        });

        const session = await database.createSession({
            name: 'Cross-Team White Cell Session',
            session_code: 'WHTE2026'
        });

        setClientIdentity(sessionStore, 'client-red-fac');
        await database.claimParticipantSeat(session.id, 'red_facilitator', 'Red Facilitator');
        const createdAction = await database.createAction({
            session_id: session.id,
            client_id: sessionStore.getClientId(),
            move: 1,
            phase: 1,
            team: 'red',
            mechanism: 'export',
            sector: 'semiconductors',
            exposure_type: 'Technology',
            targets: ['PRC'],
            goal: 'Red team action',
            expected_outcomes: 'Pressure the opposing bloc.',
            ally_contingencies: 'Coordinate with partners first.',
            priority: 'HIGH'
        });
        const submittedAction = await database.submitAction(createdAction.id);
        const createdRequest = await database.createRequest({
            session_id: session.id,
            team: 'red',
            client_id: sessionStore.getClientId(),
            move: 1,
            phase: 1,
            priority: 'HIGH',
            categories: ['Economic Impact'],
            query: 'What is the latest assessment from White Cell?'
        });

        setClientIdentity(sessionStore, 'client-blue-whitecell');
        await database.authorizeOperatorAccess({
            surface: 'whitecell',
            accessCode: 'admin2025',
            sessionId: session.id,
            role: 'whitecell_lead',
            operatorName: 'White Cell Lead'
        });
        await database.claimParticipantSeat(session.id, 'whitecell_lead', 'White Cell Lead');

        const adjudicatedAction = await database.adjudicateAction(submittedAction.id, {
            outcome: 'SUCCESS',
            adjudication_notes: 'Reviewed from the central White Cell desk.'
        });
        const answeredRequest = await database.updateRequest(createdRequest.id, {
            response: 'White Cell response for all teams.',
            status: 'answered'
        });
        const communication = await database.createCommunication({
            session_id: session.id,
            from_role: 'white_cell',
            to_role: 'green',
            type: 'INJECT',
            content: 'Cross-team inject from White Cell.'
        });

        expect(adjudicatedAction).toMatchObject({
            id: submittedAction.id,
            team: 'red',
            status: 'adjudicated',
            outcome: 'SUCCESS'
        });
        expect(answeredRequest).toMatchObject({
            id: createdRequest.id,
            team: 'red',
            status: 'answered',
            response: 'White Cell response for all teams.'
        });
        expect(communication).toMatchObject({
            session_id: session.id,
            from_role: 'white_cell',
            to_role: 'green',
            type: 'INJECT'
        });
    });

    it('lets White Cell manage sessions and participant seats through the same protected RPCs as Game Master', async () => {
        const { sessionStore, database } = await loadModules();
        setClientIdentity(sessionStore, 'client-admin-gm');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Admin'
        });

        const primarySession = await database.createSession({
            name: 'White Cell Admin Primary',
            session_code: 'WCAD1001'
        });

        setClientIdentity(sessionStore, 'client-admin-facilitator');
        const facilitatorSeat = await database.claimParticipantSeat(primarySession.id, 'blue_facilitator', 'Morgan');

        setClientIdentity(sessionStore, 'client-admin-whitecell');
        await database.authorizeOperatorAccess({
            surface: 'whitecell',
            accessCode: 'admin2025',
            sessionId: primarySession.id,
            role: 'whitecell_lead',
            operatorName: 'White Cell Lead'
        });
        await database.claimParticipantSeat(primarySession.id, 'whitecell_lead', 'White Cell Lead');

        const secondarySession = await database.createSession({
            name: 'White Cell Admin Secondary',
            session_code: 'WCAD1002'
        });
        const removedSeat = await database.removeSessionParticipant(primarySession.id, facilitatorSeat.id);
        await database.deleteSession(secondarySession.id);

        expect(secondarySession).toMatchObject({
            name: 'White Cell Admin Secondary',
            session_code: 'WCAD1002'
        });
        expect(removedSeat).toMatchObject({
            id: facilitatorSeat.id,
            role: 'blue_facilitator',
            is_active: false
        });
        await expect(database.getSessionParticipants(primarySession.id)).resolves.toEqual([
            expect.objectContaining({
                role: 'whitecell_lead'
            })
        ]);

        const activeSessions = await database.getActiveSessions();
        expect(activeSessions).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: primarySession.id })
        ]));
        expect(activeSessions.map((session) => session.id)).not.toContain(secondarySession.id);
    });

    it('persists proposal recipient statuses in communication metadata as shared backend state', async () => {
        const { sessionStore, database } = await loadModules();
        setClientIdentity(sessionStore, 'client-status-gm');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Proposal Status'
        });

        const session = await database.createSession({
            name: 'Proposal Status Session',
            session_code: 'STAT2026'
        });

        setClientIdentity(sessionStore, 'client-status-whitecell');
        await database.authorizeOperatorAccess({
            surface: 'whitecell',
            accessCode: 'admin2025',
            sessionId: session.id,
            role: 'whitecell_lead',
            operatorName: 'White Cell Lead'
        });
        await database.claimParticipantSeat(session.id, 'whitecell_lead', 'White Cell Lead');

        const forwardedProposal = await database.createCommunication({
            session_id: session.id,
            from_role: 'white_cell',
            to_role: 'green',
            type: 'PROPOSAL_FORWARDED',
            content: 'Forwarded proposal content',
            metadata: {
                source_proposal_id: 'proposal-1',
                recipient_team: 'green',
                proposal: {
                    title: 'Joint Port Proposal'
                }
            }
        });

        setClientIdentity(sessionStore, 'client-status-green');
        await database.claimParticipantSeat(session.id, 'green_facilitator', 'Green Facilitator');

        const updatedCommunication = await database.updateProposalRecipientStatus(
            forwardedProposal.id,
            'acknowledged',
            {
                acknowledgement_note: 'Seen by Green lead'
            }
        );

        expect(updatedCommunication).toMatchObject({
            id: forwardedProposal.id,
            metadata: expect.objectContaining({
                proposal_recipient_state: expect.objectContaining({
                    status: 'acknowledged',
                    participant_team: 'green',
                    participant_role: 'green_facilitator',
                    acknowledgement_note: 'Seen by Green lead'
                })
            })
        });
    });

    it('lets the addressed facilitator send a proposal response back to White Cell before marking the proposal responded', async () => {
        const { sessionStore, database } = await loadModules();
        setClientIdentity(sessionStore, 'client-response-gm');
        await database.authorizeOperatorAccess({
            surface: 'gamemaster',
            accessCode: 'admin2025',
            operatorName: 'GM Proposal Response'
        });

        const session = await database.createSession({
            name: 'Proposal Response Session',
            session_code: 'RESP2026'
        });

        setClientIdentity(sessionStore, 'client-response-whitecell');
        await database.authorizeOperatorAccess({
            surface: 'whitecell',
            accessCode: 'admin2025',
            sessionId: session.id,
            role: 'whitecell_lead',
            operatorName: 'White Cell Lead'
        });
        await database.claimParticipantSeat(session.id, 'whitecell_lead', 'White Cell Lead');

        const forwardedProposal = await database.createCommunication({
            session_id: session.id,
            from_role: 'white_cell',
            to_role: 'blue',
            type: 'PROPOSAL_FORWARDED',
            content: 'Forwarded proposal content',
            metadata: {
                source_proposal_id: 'proposal-2',
                recipient_team: 'blue',
                proposal: {
                    title: 'Counter Port Proposal'
                }
            }
        });

        setClientIdentity(sessionStore, 'client-response-blue');
        await database.claimParticipantSeat(session.id, 'blue_facilitator', 'Blue Facilitator');

        const responseCommunication = await database.createCommunication({
            session_id: session.id,
            from_role: 'blue_facilitator',
            to_role: 'white_cell',
            type: 'PROPOSAL_RESPONSE',
            content: 'Blue Team can support this proposal with customs coordination.',
            metadata: {
                source_proposal_id: 'proposal-2',
                source_communication_id: forwardedProposal.id,
                source_team: 'green',
                responder_team: 'blue'
            }
        });

        expect(responseCommunication).toMatchObject({
            session_id: session.id,
            from_role: 'blue_facilitator',
            to_role: 'white_cell',
            type: 'PROPOSAL_RESPONSE',
            content: 'Blue Team can support this proposal with customs coordination.',
            metadata: expect.objectContaining({
                source_communication_id: forwardedProposal.id,
                responder_team: 'blue'
            })
        });

        const updatedCommunication = await database.updateProposalRecipientStatus(
            forwardedProposal.id,
            'responded',
            {
                response_communication_id: responseCommunication.id,
                responded_at: '2026-04-09T10:20:00.000Z',
                response_sent_at: '2026-04-09T10:20:00.000Z',
                response_content: 'Blue Team can support this proposal with customs coordination.',
                response_from_role: 'blue_facilitator',
                response_from_team: 'blue'
            }
        );

        expect(updatedCommunication).toMatchObject({
            id: forwardedProposal.id,
            metadata: expect.objectContaining({
                proposal_recipient_state: expect.objectContaining({
                    status: 'responded',
                    participant_team: 'blue',
                    participant_role: 'blue_facilitator',
                    response_communication_id: responseCommunication.id
                })
            })
        });

        const refreshedForwardedProposal = await database.fetchCommunications(session.id);
        const storedForwardedProposal = refreshedForwardedProposal.find((entry) => entry.id === forwardedProposal.id);

        expect(storedForwardedProposal).toMatchObject({
            metadata: expect.objectContaining({
                proposal_recipient_state: expect.objectContaining({
                    response_communication_id: responseCommunication.id,
                    response_content: 'Blue Team can support this proposal with customs coordination.',
                    response_from_team: 'blue'
                })
            })
        });

        await expect(
            database.createCommunication({
                session_id: session.id,
                from_role: 'blue_facilitator',
                to_role: 'white_cell',
                type: 'PROPOSAL_RESPONSE',
                content: 'Blue Team wants to replace its earlier response.',
                metadata: {
                    source_proposal_id: 'proposal-2',
                    source_communication_id: forwardedProposal.id,
                    source_team: 'green',
                    responder_team: 'blue'
                }
            })
        ).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'new row violates row-level security policy for table "communications"'
        });
    });

    it('applies stale-seat heartbeat recovery to every shipped live-demo role across all teams', async () => {
        const { sessionStore, database } = await loadModules();

        for (const [index, roleCase] of ALL_TEAM_ROLE_CASES.entries()) {
            setClientIdentity(sessionStore, `client-gm-matrix-${index}`);
            await database.authorizeOperatorAccess({
                surface: 'gamemaster',
                accessCode: 'admin2025',
                operatorName: `GM Matrix ${index}`
            });

            const session = await database.createSession({
                name: `Role Matrix Session ${index + 1}`,
                session_code: `MAT${String(index + 1).padStart(2, '0')}A`
            });

            const participantClientId = `client-role-${index}`;
            setClientIdentity(sessionStore, participantClientId);

            if (roleCase.requiresWhiteCellGrant) {
                await database.authorizeOperatorAccess({
                    surface: 'whitecell',
                    accessCode: 'admin2025',
                    sessionId: session.id,
                    role: roleCase.role,
                    operatorName: `${roleCase.label} operator`
                });
            }

            const claimedSeat = await database.claimParticipantSeat(
                session.id,
                roleCase.role,
                `${roleCase.label} participant`
            );
            const participantAuthSession = localStorage.getItem('esg_e2e_auth_session');

            vi.setSystemTime(new Date(Date.now() + 120000));

            setClientIdentity(sessionStore, `client-gm-cleanup-${index}`);
            await database.authorizeOperatorAccess({
                surface: 'gamemaster',
                accessCode: 'admin2025',
                operatorName: `GM Cleanup ${index}`
            });
            await expect(database.releaseStaleParticipantSeats(session.id)).resolves.toBe(1);

            restoreClientIdentity(sessionStore, participantClientId, participantAuthSession);

            if (roleCase.retainsProtectedSessionAccess) {
                await expect(database.releaseStaleParticipantSeats(session.id)).resolves.toBe(0);
            } else {
                await expect(database.releaseStaleParticipantSeats(session.id)).rejects.toMatchObject({
                    name: 'DatabaseError',
                    message: 'Session access is required.'
                });
            }

            const refreshedSeat = await database.updateHeartbeat(session.id, claimedSeat.id);
            expect(refreshedSeat).toMatchObject({
                id: claimedSeat.id,
                role: roleCase.role,
                is_active: true
            });

            const disconnectedSeat = await database.disconnectParticipant(session.id, claimedSeat.id);
            expect(disconnectedSeat).toMatchObject({
                id: claimedSeat.id,
                role: roleCase.role,
                is_active: false
            });
        }
    });
});
