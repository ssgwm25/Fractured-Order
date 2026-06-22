import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

    const [{ sessionStore }, { database }, { buildNotetakerViewState }] = await Promise.all([
        import('../stores/session.js'),
        import('./database.js'),
        import('../roles/notetaker.js')
    ]);

    return {
        sessionStore,
        database,
        buildNotetakerViewState
    };
}

function setClientIdentity(sessionStore, clientId, role, { resetAuth = true } = {}) {
    sessionStore.clearAll();
    if (resetAuth) {
        vi.setSystemTime(new Date(Date.now() + 1));
        localStorage.removeItem('esg_e2e_auth_session');
    }
    localStorage.setItem('esg_client_id', clientId);
    if (role) {
        localStorage.setItem('esg_role', role);
    }
    sessionStore.init();
}

async function createProtectedSession(database, name, sessionCode) {
    await database.authorizeOperatorAccess({
        surface: 'gamemaster',
        accessCode: 'admin2025',
        operatorName: 'GM Notetaker Contract Test'
    });

    return database.createSession({
        name,
        session_code: sessionCode
    });
}

describe('database notetaker concurrency contract', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-08T13:00:00.000Z'));
        global.localStorage = new MemoryStorage();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetModules();
        delete global.localStorage;
        delete globalThis.__ESG_E2E_TEST_CONFIG__;
        delete globalThis.__ESG_E2E_BACKEND__;
    });

    it('loads each notetaker seat without overwriting the other Blue seat on the same move', async () => {
        const { sessionStore, database, buildNotetakerViewState } = await loadModules();

        setClientIdentity(sessionStore, 'client-gm', 'gamemaster');
        const session = await createProtectedSession(database, 'Notetaker Concurrency Session', 'NOTE2026');

        const blueSeatIds = [];

        for (let index = 1; index <= 2; index += 1) {
            setClientIdentity(sessionStore, `client-blue-${index}`, 'blue_notetaker');
            const seat = await database.claimParticipantSeat(session.id, 'blue_notetaker', `Blue Note ${index}`);
            blueSeatIds.push(seat.id);

            await database.saveNotetakerData({
                session_id: session.id,
                move: 1,
                phase: 2,
                team: 'blue',
                client_id: sessionStore.getClientId(),
                participant_key: seat.id,
                participant_id: seat.id,
                participant_label: seat.display_name,
                dynamics_analysis: {
                    emergingLeaders: `Lead ${index}`,
                    dynamicsSummary: `Summary ${index}`
                },
                external_factors: {
                    allianceNotes: `Alliance ${index}`,
                    externalPressures: `Pressure ${index}`
                },
                observation_timeline_append: [
                    {
                        id: `obs-blue-${index}`,
                        type: 'NOTE',
                        content: `Blue observation ${index}`,
                        phase: 2
                    }
                ]
            });
        }

        setClientIdentity(sessionStore, 'client-red-1', 'red_notetaker');
        const redSeat = await database.claimParticipantSeat(session.id, 'red_notetaker', 'Red Note 1');
        await database.saveNotetakerData({
            session_id: session.id,
            move: 1,
            phase: 2,
            team: 'red',
            client_id: sessionStore.getClientId(),
            participant_key: redSeat.id,
            participant_id: redSeat.id,
            participant_label: redSeat.display_name,
            dynamics_analysis: {
                dynamicsSummary: 'Red Summary'
            },
            observation_timeline_append: [
                {
                    id: 'obs-red-1',
                    type: 'NOTE',
                    content: 'Red observation 1',
                    phase: 2
                }
            ]
        });

        const record = await database.getNotetakerData(session.id, 1);

        const secondSeatView = buildNotetakerViewState(record, {
            teamId: 'blue',
            participantKey: blueSeatIds[1]
        });
        const firstSeatView = buildNotetakerViewState(record, {
            teamId: 'blue',
            participantKey: blueSeatIds[0]
        });

        expect(Object.keys(record.dynamics_analysis.team_entries.blue.participant_entries)).toHaveLength(2);
        expect(secondSeatView.dynamicsData).toMatchObject({
            emergingLeaders: 'Lead 2',
            dynamicsSummary: 'Summary 2'
        });
        expect(secondSeatView.allianceData).toMatchObject({
            allianceNotes: 'Alliance 2',
            externalPressures: 'Pressure 2'
        });
        expect(firstSeatView.dynamicsData).toMatchObject({
            emergingLeaders: 'Lead 1',
            dynamicsSummary: 'Summary 1'
        });
        expect(secondSeatView.observationTimeline.map((entry) => entry.content)).toEqual([
            'Blue observation 1',
            'Blue observation 2'
        ]);
        expect(secondSeatView.observationTimeline.map((entry) => entry.content)).not.toContain('Red observation 1');
    });
});
