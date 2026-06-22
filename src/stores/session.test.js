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

function createWindow(url = 'http://localhost/') {
    const listeners = new Map();
    const location = new URL(url);

    return {
        location,
        history: {
            replaceState(_state, _title, nextUrl) {
                const resolved = new URL(nextUrl, location);
                location.href = resolved.href;
            }
        },
        addEventListener(type, callback) {
            if (!listeners.has(type)) {
                listeners.set(type, new Set());
            }
            listeners.get(type).add(callback);
        },
        removeEventListener(type, callback) {
            listeners.get(type)?.delete(callback);
        },
        dispatchStorageEvent(event) {
            listeners.get('storage')?.forEach((callback) => callback(event));
        }
    };
}

async function loadSessionStore() {
    vi.resetModules();
    return import('./session.js');
}

describe('sessionStore snapshot model', () => {
    beforeEach(() => {
        global.localStorage = new MemoryStorage();
        global.sessionStorage = new MemoryStorage();
        global.window = createWindow();
        global.window.localStorage = global.localStorage;
        global.window.sessionStorage = global.sessionStorage;
    });

    afterEach(() => {
        vi.resetModules();
        delete global.window;
        delete global.localStorage;
        delete global.sessionStorage;
    });

    it('publishes state snapshots to subscribers', async () => {
        const { sessionStore } = await loadSessionStore();
        const listener = vi.fn();

        const unsubscribe = sessionStore.subscribe(listener);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0]).toHaveLength(1);
        expect(listener.mock.calls[0][0]).toMatchObject({
            valid: false,
            isAuthenticated: false,
            sessionId: null,
            sessionData: null
        });

        sessionStore.setSessionId('session-123');
        sessionStore.setRole('blue_facilitator');
        sessionStore.setUserName('Alex');
        sessionStore.setSessionData({
            id: 'session-123',
            name: 'Session Alpha',
            role: 'blue_facilitator',
            displayName: 'Alex',
            gameState: {
                move: 2,
                phase: 3,
                timer_seconds: 120,
                timer_running: true
            }
        });

        const latestSnapshot = listener.mock.calls.at(-1)[0];
        expect(listener.mock.calls.at(-1)).toHaveLength(1);
        expect(latestSnapshot).toMatchObject({
            valid: true,
            isAuthenticated: true,
            sessionId: 'session-123',
            role: 'blue_facilitator',
            userName: 'Alex',
            sessionData: {
                id: 'session-123',
                name: 'Session Alpha',
                role: 'blue_facilitator',
                displayName: 'Alex',
                gameState: {
                    move: 2,
                    phase: 3,
                    timer_seconds: 120,
                    timer_running: true
                }
            }
        });

        unsubscribe();
    });

    it('merges game-state updates into the cached session snapshot', async () => {
        const { sessionStore } = await loadSessionStore();
        const listener = vi.fn();

        sessionStore.setSessionId('session-456');
        sessionStore.setRole('blue_whitecell');
        sessionStore.setSessionData({
            id: 'session-456',
            name: 'Session Beta',
            role: 'blue_whitecell',
            gameState: {
                move: 1,
                phase: 1,
                timer_seconds: 5400,
                timer_running: false
            }
        });

        sessionStore.subscribe(listener);
        sessionStore.setGameState({
            phase: 2,
            timer_running: true
        });

        const cachedData = sessionStore.getSessionData();
        expect(cachedData.gameState).toMatchObject({
            move: 1,
            phase: 2,
            timer_seconds: 5400,
            timer_running: true
        });

        const latestSnapshot = listener.mock.calls.at(-1)[0];
        expect(latestSnapshot.sessionData.gameState).toMatchObject({
            move: 1,
            phase: 2,
            timer_seconds: 5400,
            timer_running: true
        });
        expect(latestSnapshot.role).toBe('whitecell_lead');
        expect(latestSnapshot.sessionData.role).toBe('whitecell_lead');
    });

    it('rehydrates cached session data on a fresh module load', async () => {
        let module = await loadSessionStore();

        module.sessionStore.setSessionId('session-789');
        module.sessionStore.setRole('viewer');
        module.sessionStore.setUserName('Observer');
        module.sessionStore.setSessionData({
            id: 'session-789',
            name: 'Session Gamma',
            role: 'viewer',
            displayName: 'Observer',
            participantId: 'participant-1',
            gameState: {
                move: 3,
                phase: 4,
                timer_seconds: 300,
                timer_running: false
            }
        });

        module = await loadSessionStore();

        expect(module.sessionStore.getSnapshot()).toMatchObject({
            valid: true,
            sessionId: 'session-789',
            role: 'viewer',
            userName: 'Observer',
            sessionData: {
                id: 'session-789',
                name: 'Session Gamma',
                role: 'viewer',
                displayName: 'Observer',
                participantId: 'participant-1',
                participantSessionId: 'participant-1',
                gameState: {
                    move: 3,
                    phase: 4,
                    timer_seconds: 300,
                    timer_running: false
                }
            }
        });
    });

    it('prefers window-scoped sessionStorage over shared localStorage when both exist', async () => {
        localStorage.setItem('esg_session_id', 'shared-session');
        localStorage.setItem('esg_role', 'viewer');
        localStorage.setItem('esg_user_name', 'Shared Observer');
        localStorage.setItem('esg_client_id', 'shared-client-id');
        localStorage.setItem('esg_session_data', JSON.stringify({
            id: 'shared-session',
            role: 'viewer',
            displayName: 'Shared Observer'
        }));

        const { sessionStore } = await loadSessionStore();
        const snapshot = sessionStore.getSnapshot();

        expect(snapshot.sessionId).toBe(null);
        expect(snapshot.role).toBe(null);
        expect(snapshot.userName).toBe(null);
        expect(snapshot.clientId).not.toBe('shared-client-id');
        expect(sessionStorage.getItem('esg_client_id')).toBe(snapshot.clientId);
        expect(localStorage.getItem('esg_client_id')).toBe('shared-client-id');
    });

    it('persists scoped operator auth separately from public participant session data', async () => {
        let module = await loadSessionStore();

        module.sessionStore.setOperatorAuth({
            surface: 'whitecell',
            sessionId: 'session-operator',
            sessionCode: 'alpha-2026',
            teamId: 'blue',
            role: 'blue_whitecell',
            operatorName: 'White Cell Lead'
        });

        expect(module.sessionStore.hasOperatorAccess('whitecell', {
            sessionId: 'session-operator',
            teamId: 'blue',
            role: 'whitecell_lead'
        })).toBe(true);
        expect(module.sessionStore.hasOperatorAccess('whitecell', {
            sessionId: 'session-operator',
            teamId: 'red',
            role: 'whitecell_lead'
        })).toBe(true);
        expect(module.sessionStore.hasOperatorAccess('gamemaster', {
            role: 'white'
        })).toBe(false);

        module = await loadSessionStore();

        expect(module.sessionStore.getOperatorAuth()).toMatchObject({
            surfaces: ['whitecell'],
            sessionId: 'session-operator',
            sessionCode: 'ALPHA-2026',
            teamId: null,
            role: 'whitecell_lead',
            operatorName: 'White Cell Lead'
        });
    });
});
