/**
 * Supabase Client Service
 * Initializes and exports the Supabase client
 */

import { createClient } from '@supabase/supabase-js';
import {
    CONFIG,
    buildMissingConfigMessage,
    isValidSupabaseUrl,
    validateConfig
} from '../core/config.js';
import { AuthError, ConfigurationError } from '../core/errors.js';
import { createLogger } from '../utils/logger.js';
import { createE2EMockSupabaseClient, isE2EMockEnabled } from './supabaseMock.js';

const logger = createLogger('Supabase');
const RUNTIME_NOTICE_ID = 'runtimeConfigNotice';
const SUPABASE_AUTH_STORAGE_KEY = 'esg-simulation-auth';
const UNREACHABLE_BACKEND_PATTERNS = [
    /ERR_NAME_NOT_RESOLVED/i,
    /ERR_INTERNET_DISCONNECTED/i,
    /ERR_CONNECTION_(?:REFUSED|RESET|TIMED_OUT|CLOSED)/i,
    /ERR_ADDRESS_UNREACHABLE/i,
    /ENOTFOUND/i,
    /ECONNREFUSED/i,
    /Failed to fetch/i,
    /NetworkError/i
];
const ANONYMOUS_AUTH_DISABLED_PATTERNS = [
    /anonymous sign-?ins? (?:are )?disabled/i,
    /anonymous provider disabled/i,
    /signup(?:s)? (?:are )?disabled/i,
    /signups? not allowed/i,
    /provider disabled/i,
    /Unsupported provider:\s*anonymous/i,
    /Unsupported provider:\s*anon/i
];
const ANONYMOUS_AUTH_DISABLED_CODES = new Set([
    'anonymous_provider_disabled',
    'signup_disabled',
    'provider_disabled'
]);

let validation = validateConfig();
let initializationError = null;
let runtimeAvailabilityFailure = null;
const e2eMockEnabled = isE2EMockEnabled();

export function getRuntimeNoticeCopy(failureCode = 'BACKEND_CONFIG_REQUIRED') {
    if (failureCode === 'BROWSER_OFFLINE') {
        return {
            userEyebrow: 'Connection issue',
            userTitle: 'You\'re offline',
            userMessage: 'Reconnect to the internet, then try again.',
            userNote: 'This page cannot receive session updates while the device is offline.'
        };
    }

    if (failureCode === 'BACKEND_UNREACHABLE') {
        return {
            userEyebrow: 'Connection issue',
            userTitle: 'We can\'t reach the session service',
            userMessage: 'Check your internet connection and try again. If the issue continues, tell your exercise facilitator.',
            userNote: 'No changes can be sent until the connection is restored.'
        };
    }

    return {
        userEyebrow: 'Session unavailable',
        userTitle: 'This exercise isn\'t ready yet',
        userMessage: 'Ask your exercise facilitator to check the session setup, then try again.',
        userNote: 'No changes have been made on this page.'
    };
}

function readStorageHandle(candidate) {
    try {
        const storage = candidate?.();
        return storage && typeof storage.getItem === 'function'
            ? storage
            : null;
    } catch (_error) {
        return null;
    }
}

function resolveSupabaseAuthStorage() {
    return (
        readStorageHandle(() => window.sessionStorage)
        || readStorageHandle(() => globalThis.sessionStorage)
        || readStorageHandle(() => globalThis.localStorage)
        || readStorageHandle(() => window.localStorage)
        || null
    );
}

export function getSupabaseAuthStorageBackend() {
    const storage = resolveSupabaseAuthStorage();
    const sessionStorageRef = readStorageHandle(() => window.sessionStorage)
        || readStorageHandle(() => globalThis.sessionStorage);
    const localStorageRef = readStorageHandle(() => globalThis.localStorage)
        || readStorageHandle(() => window.localStorage);

    if (storage && sessionStorageRef && storage === sessionStorageRef) {
        return 'sessionStorage';
    }

    if (storage && localStorageRef && storage === localStorageRef) {
        return 'localStorage';
    }

    return 'memory';
}

function buildRuntimeStatus() {
    if (e2eMockEnabled) {
        return {
            ready: true,
            runtimeMode: 'e2e-mock',
            issues: [],
            message: 'E2E mock backend enabled.',
            title: 'E2E mock backend enabled.',
            eyebrow: 'Test Mode',
            note: 'The mock backend is active for automated browser tests.',
            code: null
        };
    }

    const issues = [...(validation.issues || [])];
    if (initializationError) {
        issues.push('Supabase client initialization failed.');
    }
    if (runtimeAvailabilityFailure?.issue) {
        issues.push(runtimeAvailabilityFailure.issue);
    }

    const failureCode = runtimeAvailabilityFailure?.code || 'BACKEND_CONFIG_REQUIRED';
    const userCopy = getRuntimeNoticeCopy(failureCode);

    return {
        ready: !issues.length,
        runtimeMode: CONFIG.RUNTIME_MODE,
        issues,
        message: runtimeAvailabilityFailure?.message || buildMissingConfigMessage({
            ...validation,
            issues
        }),
        title: runtimeAvailabilityFailure?.title || 'Supabase backend configuration is missing',
        eyebrow: runtimeAvailabilityFailure?.eyebrow || 'Configuration Required',
        note: runtimeAvailabilityFailure?.note
            || 'Create or update an untracked .env.local from .env.example, restart the dev server, and reload this page.',
        code: failureCode,
        ...userCopy
    };
}

function createConfigurationError() {
    const status = buildRuntimeStatus();
    return new ConfigurationError(status.message, status.issues, status.code);
}

function collectErrorText(error) {
    if (!error) {
        return '';
    }

    const segments = [];
    const queue = [error];
    const visited = new Set();

    while (queue.length) {
        const candidate = queue.shift();
        if (!candidate || visited.has(candidate)) {
            continue;
        }

        visited.add(candidate);

        if (typeof candidate === 'string') {
            segments.push(candidate);
            continue;
        }

        if (typeof candidate.message === 'string') {
            segments.push(candidate.message);
        }

        if (typeof candidate.code === 'string') {
            segments.push(candidate.code);
        }

        if (typeof candidate.error_code === 'string') {
            segments.push(candidate.error_code);
        }

        if (typeof candidate.name === 'string') {
            segments.push(candidate.name);
        }

        if (typeof candidate.status === 'number') {
            segments.push(String(candidate.status));
        }

        if (typeof candidate.details === 'string') {
            segments.push(candidate.details);
        }

        if (typeof candidate.hint === 'string') {
            segments.push(candidate.hint);
        }

        if (candidate.cause) {
            queue.push(candidate.cause);
        }
    }

    return segments.join(' ');
}

export function classifySupabaseAuthFailure(
    error,
    { online = typeof navigator === 'undefined' ? true : navigator.onLine } = {}
) {
    if (online === false) {
        return {
            code: 'BROWSER_OFFLINE',
            issue: 'The browser is offline. Reconnect before joining or authorizing a session.',
            message: 'The browser is offline. Reconnect to the internet and reload this page.',
            title: 'Browser Offline',
            eyebrow: 'Connection Required',
            note: 'Reconnect the device to the network, then reload this page before retrying.'
        };
    }

    const errorText = collectErrorText(error);

    if (UNREACHABLE_BACKEND_PATTERNS.some((pattern) => pattern.test(errorText))) {
        return {
            code: 'BACKEND_UNREACHABLE',
            issue: 'The configured Supabase auth endpoint could not be reached.',
            message: 'The configured Supabase backend could not be reached. Verify the project URL, DNS, and network access, then reload this page.',
            title: 'Supabase Backend Unavailable',
            eyebrow: 'Backend Unavailable',
            note: 'If the project ref changed or the Supabase project was deleted, update VITE_SUPABASE_URL, rebuild, and reload.'
        };
    }

    if (ANONYMOUS_AUTH_DISABLED_CODES.has(error?.code) || ANONYMOUS_AUTH_DISABLED_CODES.has(error?.error_code)) {
        return {
            code: 'ANONYMOUS_AUTH_DISABLED',
            issue: 'Supabase anonymous sign-ins or new-user signups are disabled for this project.',
            message: 'Supabase anonymous sign-ins or new-user signups are disabled for this project. Enable them before participants or operators join from the landing page.',
            title: 'Supabase Auth Configuration Required',
            eyebrow: 'Configuration Required',
            note: 'Enable anonymous sign-ins and confirm new-user signups are allowed in the Supabase Auth settings, then reload this page.'
        };
    }

    if (ANONYMOUS_AUTH_DISABLED_PATTERNS.some((pattern) => pattern.test(errorText))) {
        return {
            code: 'ANONYMOUS_AUTH_DISABLED',
            issue: 'Supabase anonymous sign-ins or new-user signups are disabled for this project.',
            message: 'Supabase anonymous sign-ins or new-user signups are disabled for this project. Enable them before participants or operators join from the landing page.',
            title: 'Supabase Auth Configuration Required',
            eyebrow: 'Configuration Required',
            note: 'Enable anonymous sign-ins and confirm new-user signups are allowed in the Supabase Auth settings, then reload this page.'
        };
    }

    return null;
}

function hideRuntimeNotice() {
    if (typeof document === 'undefined') {
        return;
    }

    const container = document.getElementById(RUNTIME_NOTICE_ID);
    if (container) {
        container.hidden = true;
        container.className = '';
        container.innerHTML = '';
        container.onkeydown = null;
    }

    const body = document.body;
    if (body?.dataset) {
        delete body.dataset.runtimeConfigBlocked;
    }
}

function recordRuntimeAvailabilityFailure(failure) {
    runtimeAvailabilityFailure = failure;
    renderMissingBackendNotice();
}

function clearRuntimeAvailabilityFailure() {
    if (!runtimeAvailabilityFailure) {
        return;
    }

    runtimeAvailabilityFailure = null;
    hideRuntimeNotice();
}

export function createUnavailableSupabaseClient() {
    const throwConfigError = () => {
        throw createConfigurationError();
    };

    const authProxy = new Proxy({}, {
        get() {
            return throwConfigError;
        }
    });

    return new Proxy({
        from: throwConfigError,
        channel: throwConfigError,
        rpc: throwConfigError,
        auth: authProxy
    }, {
        get(target, prop) {
            if (prop in target) {
                return target[prop];
            }

            return throwConfigError;
        }
    });
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}

function trapRuntimeNoticeFocus(container) {
    container.onkeydown = (event) => {
        if (event.key !== 'Tab') return;

        const focusable = Array.from(container.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ));

        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeElement = document.activeElement;

        if (!focusable.includes(activeElement)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
            return;
        }

        if (event.shiftKey && activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };
}

function getRuntimeNoticeContainer() {
    if (typeof document === 'undefined') {
        return null;
    }

    return document.getElementById(RUNTIME_NOTICE_ID) || (() => {
        const container = document.createElement('div');
        container.id = RUNTIME_NOTICE_ID;
        document.body.prepend(container);
        return container;
    })();
}

export function getRuntimeConfigStatus() {
    return buildRuntimeStatus();
}

export function isSupabaseConfigured() {
    return buildRuntimeStatus().ready;
}

export function renderMissingBackendNotice() {
    const status = buildRuntimeStatus();
    if (typeof document === 'undefined') {
        return;
    }

    if (status.ready) {
        hideRuntimeNotice();
        return;
    }

    const container = getRuntimeNoticeContainer();
    if (!container) return;

    container.hidden = false;
    container.className = 'runtime-config-notice';
    container.innerHTML = `
        <div class="runtime-config-panel" role="alertdialog" aria-modal="true" aria-labelledby="runtime-config-title" aria-describedby="runtime-config-copy runtime-config-note" tabindex="-1">
            <p class="runtime-config-eyebrow">${escapeHtml(status.userEyebrow)}</p>
            <h1 class="runtime-config-title" id="runtime-config-title">${escapeHtml(status.userTitle)}</h1>
            <p class="runtime-config-copy" id="runtime-config-copy">${escapeHtml(status.userMessage)}</p>
            <p class="runtime-config-note" id="runtime-config-note">${escapeHtml(status.userNote)}</p>
            <div class="runtime-config-actions">
                <button type="button" class="btn btn-primary runtime-config-reload" id="runtimeConfigReload">Try again</button>
            </div>
        </div>
    `;
    document.body.dataset.runtimeConfigBlocked = 'true';
    trapRuntimeNoticeFocus(container);

    const reloadButton = container.querySelector('#runtimeConfigReload');
    reloadButton?.addEventListener('click', () => {
        window.location.reload();
    });

    const scheduleFocus = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback) => setTimeout(callback, 0);
    scheduleFocus(() => {
        container.querySelector('.runtime-config-panel')?.focus?.();
    });
}

let rawSupabaseClient = null;

if (e2eMockEnabled) {
    rawSupabaseClient = createE2EMockSupabaseClient();
    logger.info('Supabase E2E mock backend enabled');
} else if (validation.valid && isValidSupabaseUrl(CONFIG.SUPABASE_URL)) {
    try {
        const authStorage = resolveSupabaseAuthStorage();
        rawSupabaseClient = createClient(
            CONFIG.SUPABASE_URL,
            CONFIG.SUPABASE_ANON_KEY,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false,
                    storageKey: SUPABASE_AUTH_STORAGE_KEY,
                    ...(authStorage ? { storage: authStorage } : {})
                },
                realtime: {
                    params: {
                        eventsPerSecond: 10
                    }
                },
                global: {
                    headers: {
                        'x-client-info': `plenum/${CONFIG.VERSION}`
                    }
                }
            }
        );
        logger.info('Supabase client initialized');
    } catch (error) {
        initializationError = error;
        logger.error('Failed to create Supabase client:', error);
    }
} else {
    logger.error('Backend configuration validation failed:', validation.issues);
}

export const supabase = rawSupabaseClient || createUnavailableSupabaseClient();

/**
 * Read the current authenticated browser session without mutating it.
 */
export async function getBrowserSession() {
    if (!rawSupabaseClient) {
        throw createConfigurationError();
    }

    const { data: sessionData, error: sessionError } = await rawSupabaseClient.auth.getSession();
    if (sessionError) {
        const runtimeFailure = classifySupabaseAuthFailure(sessionError);
        logger.error('Failed to read browser auth session:', sessionError);
        if (runtimeFailure) {
            recordRuntimeAvailabilityFailure(runtimeFailure);
            throw createConfigurationError();
        }

        throw new AuthError(
            'Unable to verify browser identity. Please reload and try again.',
            'BROWSER_IDENTITY_UNAVAILABLE'
        );
    }

    clearRuntimeAvailabilityFailure();
    return sessionData?.session ?? null;
}

/**
 * Establish a real Supabase identity before any public join or browser write path.
 * Anonymous auth is only the browser identity bootstrap; all role and operator
 * authorization must still be enforced server-side through RLS or RPCs.
 */
export async function ensureBrowserIdentity({ clientId = null } = {}) {
    const existingSession = await getBrowserSession();
    if (existingSession?.access_token && existingSession.user?.id) {
        return existingSession;
    }

    const metadata = clientId ? { client_id: clientId } : {};
    const { data, error } = await rawSupabaseClient.auth.signInAnonymously({
        options: {
            data: metadata
        }
    });

    if (error || !data?.session?.access_token) {
        const runtimeFailure = classifySupabaseAuthFailure(error);
        logger.error('Failed to establish anonymous browser identity:', error);
        if (runtimeFailure) {
            recordRuntimeAvailabilityFailure(runtimeFailure);
            throw createConfigurationError();
        }

        throw new AuthError(
            'Unable to establish browser identity. Enable Supabase anonymous sign-ins and try again.',
            'BROWSER_IDENTITY_REQUIRED'
        );
    }

    clearRuntimeAvailabilityFailure();
    logger.info('Established anonymous browser identity', {
        userId: data.user?.id ? `${data.user.id.substring(0, 8)}...` : null
    });

    return data.session;
}

export function checkConnection() {
    if (!rawSupabaseClient) {
        return Promise.resolve(false);
    }

    return rawSupabaseClient
        .from('sessions')
        .select('id')
        .limit(1)
        .then(({ error }) => {
            if (error) {
                logger.error('Connection check failed:', error.message);
                return false;
            }

            return true;
        })
        .catch((error) => {
            logger.error('Connection check error:', error);
            return false;
        });
}

export async function getConnectionInfo() {
    if (!rawSupabaseClient) {
        return {
            connected: false,
            latency: null,
            error: createConfigurationError().message
        };
    }

    const startTime = performance.now();

    try {
        const { error } = await rawSupabaseClient
            .from('sessions')
            .select('count')
            .limit(1);

        const latency = Math.round(performance.now() - startTime);

        if (error) {
            return {
                connected: false,
                latency: null,
                error: error.message
            };
        }

        return {
            connected: true,
            latency,
            error: null
        };
    } catch (error) {
        return {
            connected: false,
            latency: null,
            error: error.message
        };
    }
}

export function isOnline() {
    return navigator.onLine;
}

export function setupConnectionListeners(onOnline, onOffline) {
    const handleOnline = () => {
        logger.info('Connection restored');
        onOnline?.();
    };

    const handleOffline = () => {
        logger.warn('Connection lost');
        onOffline?.();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
}

logger.info('Supabase runtime status', {
    mode: buildRuntimeStatus().runtimeMode,
    configured: isSupabaseConfigured(),
    url: CONFIG.SUPABASE_URL ? CONFIG.SUPABASE_URL.substring(0, 30) + '...' : 'NOT SET'
});

export default supabase;
