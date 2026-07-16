import { afterEach, describe, expect, it } from 'vitest';

import { createE2EMockSupabaseClient, isE2EMockEnabled } from './supabaseMock.js';

const E2E_MOCK_ENABLEMENT_KEY = '__esg_e2e_mock_enabled';
const E2E_MOCK_CONFIG_KEY = '__esg_e2e_mock_config';

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

    if (enableMock) {
        sessionStorage.setItem(E2E_MOCK_ENABLEMENT_KEY, 'enabled');
    }

    if (operatorAccessCode) {
        sessionStorage.setItem(E2E_MOCK_CONFIG_KEY, JSON.stringify({
            operatorAccessCode
        }));
    }

    setGlobalProperty('window', { localStorage, sessionStorage });
    setGlobalProperty('localStorage', localStorage);
    setGlobalProperty('sessionStorage', sessionStorage);
    setGlobalProperty('location', { hostname });
    setGlobalProperty('navigator', { webdriver, locks });

    return {
        localStorage,
        sessionStorage
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
});
