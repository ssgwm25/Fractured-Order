const SESSION_KEYS = [
    'esg_session_id',
    'esg_role',
    'esg_user_name',
    'esg_session_data',
];
const E2E_MOCK_ENABLEMENT_KEY = '__esg_e2e_mock_enabled';
const E2E_MOCK_CONFIG_KEY = '__esg_e2e_mock_config';
const E2E_MOCK_STATE_KEY = 'esg_e2e_backend_state';
const E2E_MOCK_AUTH_KEY = 'esg_e2e_auth_session';
const E2E_MOCK_REALTIME_CHANGES_KEY = 'esg_e2e_realtime_changes';

export const E2E_MOCK_OPERATOR_ACCESS_CODE = 'admin2025';

export function initializeE2EMockBackendStorage({
    sessionKeys,
    enablementKey,
    configKey,
    mockConfig,
    mockStateKey,
    mockAuthKey,
    mockRealtimeChangesKey
}, target = globalThis) {
    // Context init scripts also run in the initial opaque about:blank document.
    // Storage is unavailable there; the script runs again after app navigation.
    if (target.location?.origin === 'null') {
        return false;
    }

    const storage = target.localStorage;
    const sessionStorageRef = target.sessionStorage;

    sessionStorageRef.setItem(enablementKey, 'enabled');
    sessionStorageRef.setItem(configKey, JSON.stringify(mockConfig));
    storage.removeItem('esg_e2e_mock');

    if (!sessionStorageRef.getItem('__esg_e2e_bootstrapped__')) {
        storage.removeItem(mockStateKey);
        storage.removeItem(mockAuthKey);
        storage.removeItem(mockRealtimeChangesKey);
        sessionKeys.forEach((key) => {
            storage.removeItem(key);
            sessionStorageRef.removeItem(key);
        });
        sessionStorageRef.setItem('__esg_e2e_bootstrapped__', 'true');
    }

    return true;
}

export async function enableE2EMockBackend(context) {
    await context.addInitScript(initializeE2EMockBackendStorage, {
        sessionKeys: SESSION_KEYS,
        enablementKey: E2E_MOCK_ENABLEMENT_KEY,
        configKey: E2E_MOCK_CONFIG_KEY,
        mockConfig: {
            operatorAccessCode: E2E_MOCK_OPERATOR_ACCESS_CODE
        },
        mockStateKey: E2E_MOCK_STATE_KEY,
        mockAuthKey: E2E_MOCK_AUTH_KEY,
        mockRealtimeChangesKey: E2E_MOCK_REALTIME_CHANGES_KEY
    });
}

export async function dumpE2EMockBackend(page) {
    return page.evaluate(() => globalThis.__ESG_E2E_BACKEND__?.dump?.() ?? null);
}
