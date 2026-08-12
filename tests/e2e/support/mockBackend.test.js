import { describe, expect, it, vi } from 'vitest';

import { initializeE2EMockBackendStorage } from './mockBackend.js';

const config = {
    sessionKeys: ['esg_session_id', 'esg_role'],
    enablementKey: '__esg_e2e_mock_enabled',
    configKey: '__esg_e2e_mock_config',
    mockConfig: { operatorAccessCode: 'test-code' },
    mockStateKey: 'esg_e2e_backend_state',
    mockAuthKey: 'esg_e2e_auth_session'
};

function createStorage() {
    const values = new Map();

    return {
        getItem: vi.fn((key) => values.get(key) ?? null),
        removeItem: vi.fn((key) => values.delete(key)),
        setItem: vi.fn((key, value) => values.set(key, String(value)))
    };
}

describe('deterministic E2E mock initialization', () => {
    it('defers storage access for the opaque initial about:blank document', () => {
        const target = {
            location: { origin: 'null' },
            get localStorage() {
                throw new DOMException('Access is denied for this document.', 'SecurityError');
            },
            get sessionStorage() {
                throw new DOMException('Access is denied for this document.', 'SecurityError');
            }
        };

        expect(initializeE2EMockBackendStorage(config, target)).toBe(false);
    });

    it('initializes and resets deterministic state after navigation to the app origin', () => {
        const localStorage = createStorage();
        const sessionStorage = createStorage();

        expect(initializeE2EMockBackendStorage(config, {
            location: { origin: 'http://127.0.0.1:4174' },
            localStorage,
            sessionStorage
        })).toBe(true);

        expect(sessionStorage.setItem).toHaveBeenCalledWith(
            '__esg_e2e_mock_enabled',
            'enabled'
        );
        expect(sessionStorage.setItem).toHaveBeenCalledWith(
            '__esg_e2e_mock_config',
            JSON.stringify(config.mockConfig)
        );
        expect(sessionStorage.setItem).toHaveBeenCalledWith(
            '__esg_e2e_bootstrapped__',
            'true'
        );
        expect(localStorage.removeItem.mock.calls.map(([key]) => key)).toEqual([
            'esg_e2e_mock',
            'esg_e2e_backend_state',
            'esg_e2e_auth_session',
            'esg_session_id',
            'esg_role'
        ]);
    });
});
