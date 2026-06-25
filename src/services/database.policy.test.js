import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

async function createProtectedSession(database, name, sessionCode) {
    await database.authorizeOperatorAccess({
        surface: 'gamemaster',
        accessCode: 'admin2025',
        operatorName: 'GM Policy Test'
    });

    return database.createSession({
        name,
        session_code: sessionCode
    });
}

function buildActionPayload(sessionId, clientId, team = 'blue') {
    return {
        session_id: sessionId,
        client_id: clientId,
        move: 1,
        phase: 1,
        team,
        mechanism: 'Economic pressure',
        sector: 'energy',
        exposure_type: 'tariff',
        targets: ['Target State'],
        goal: 'Change negotiating position',
        expected_outcomes: 'Concession on trade access',
        ally_contingencies: 'Coordinate with allied ministries',
        priority: 'high'
    };
}

function getPolicyTestTeamLabel(team = '') {
    return String(team || '')
        .split(/[^a-z0-9]+/i)
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
        .join(' ') || 'Team';
}

function buildStrategicOrientationForecastPayload(sessionId, clientId, team = 'green') {
    const teamLabel = getPolicyTestTeamLabel(team);

    return {
        session_id: sessionId,
        client_id: clientId,
        move: 1,
        phase: 1,
        team,
        mechanism: 'Strategic Orientation',
        sector: '',
        exposure_type: 'pre_move_1',
        targets: [],
        goal: `${teamLabel} Forecast: Blue Pressure Campaign`,
        expected_outcomes: 'Forecast: Blue will choose Pressure Campaign.',
        ally_contingencies: [
            'Strategic Orientation Details',
            'Artifact Type: forecast',
            `Team: ${team}`,
            'Orientation: pressure',
            'Scribe Handoff: forwarded'
        ].join('\n'),
        priority: 'HIGH',
        status: 'draft'
    };
}

function buildRequestPayload(sessionId, clientId, team = 'blue') {
    return {
        session_id: sessionId,
        team,
        client_id: clientId,
        move: 1,
        phase: 1,
        priority: 'high',
        categories: ['intel'],
        query: 'What is the latest red-team posture?'
    };
}

function mutateMockBackendState(mutator) {
    const rawState = localStorage.getItem(E2E_MOCK_STATE_KEY);
    const state = rawState ? JSON.parse(rawState) : { counters: {}, tables: {} };
    mutator(state);
    localStorage.setItem(E2E_MOCK_STATE_KEY, JSON.stringify(state));
}

describe('database live-demo policy enforcement', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-08T11:00:00.000Z'));
        global.localStorage = new MemoryStorage();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetModules();
        delete global.localStorage;
        delete globalThis.__ESG_E2E_TEST_CONFIG__;
        delete globalThis.__ESG_E2E_BACKEND__;
    });

    it('rejects removed observer seats from being claimed on the live demo contract', async () => {
        const { sessionStore, database } = await loadModules();

        setClientIdentity(sessionStore, 'client-gm');
        const session = await createProtectedSession(database, 'Observer Policy Session', 'OBSV2026');

        setClientIdentity(sessionStore, 'client-viewer');
        await expect(
            database.claimParticipantSeat(session.id, 'viewer', 'Observer One')
        ).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'This role cannot be claimed in the live demo.'
        });
    });

    it('restricts participant reads and writes to the session they joined', async () => {
        const { sessionStore, database } = await loadModules();

        setClientIdentity(sessionStore, 'client-gm');
        const sessionA = await createProtectedSession(database, 'Policy Session A', 'POLA2026');
        const sessionB = await database.createSession({
            name: 'Policy Session B',
            session_code: 'POLB2026'
        });

        setClientIdentity(sessionStore, 'client-blue-fac');
        await database.claimParticipantSeat(sessionA.id, 'blue_facilitator', 'Alex');

        expect(await database.getSession(sessionA.id)).toMatchObject({
            id: sessionA.id
        });

        await expect(database.getSession(sessionB.id)).rejects.toMatchObject({
            name: 'NotFoundError'
        });

        await expect(database.createAction(
            buildActionPayload(sessionB.id, sessionStore.getClientId(), 'blue')
        )).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'new row violates row-level security policy for table "actions"'
        });
    });

    it('denies facilitator writes outside the participant team scope', async () => {
        const { sessionStore, database } = await loadModules();

        setClientIdentity(sessionStore, 'client-gm');
        const session = await createProtectedSession(database, 'Team Scope Session', 'TEAM2026');

        setClientIdentity(sessionStore, 'client-blue-fac');
        await database.claimParticipantSeat(session.id, 'blue_facilitator', 'Alex');

        await expect(database.createRequest(
            buildRequestPayload(session.id, sessionStore.getClientId(), 'red')
        )).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'new row violates row-level security policy for table "requests"'
        });
    });

    it.each([
        ['green', 'red'],
        ['red', 'green'],
        ['industry', 'red']
    ])('normalizes a dirty %s facilitator seat before allowing same-team Strategic Orientation forecast inserts', async (team, deniedTeam) => {
        const { sessionStore, database } = await loadModules();
        const teamLabel = getPolicyTestTeamLabel(team);

        setClientIdentity(sessionStore, 'client-gm');
        const session = await createProtectedSession(
            database,
            `${teamLabel} Forecast Policy Session`,
            `${team.toUpperCase().slice(0, 4)}2026`
        );

        setClientIdentity(sessionStore, `client-${team}-fac`);
        await database.claimParticipantSeat(session.id, `${team}_facilitator`, `${teamLabel} Facilitator`);

        mutateMockBackendState((state) => {
            const seat = state.tables.session_participants.find((entry) => (
                entry.session_id === session.id
                && entry.role === `${team}_facilitator`
            ));
            seat.role = `${teamLabel.replace(/\s+/g, '_')}_Facilitator\u200B`;
        });

        await expect(database.createAction(
            buildStrategicOrientationForecastPayload(session.id, sessionStore.getClientId(), deniedTeam)
        )).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'new row violates row-level security policy for table "actions"'
        });

        await expect(database.createAction(
            buildStrategicOrientationForecastPayload(session.id, sessionStore.getClientId(), team)
        )).resolves.toMatchObject({
            team,
            mechanism: 'Strategic Orientation',
            status: 'draft'
        });
    });
});
