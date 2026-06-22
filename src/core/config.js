import {
    TEAM_OPTIONS,
    WHITE_CELL_OPERATOR_ROLES,
    buildTeamRole,
    buildWhiteCellOperatorRole,
    normalizeWhiteCellOperatorRole,
    ROLE_SURFACES
} from './teamContext.js';

export const LIVE_DEMO_SEAT_LIMITS = Object.freeze({
    facilitator: 1,
    scribe: 1,
    notetaker: 2,
    observer: 0,
    whiteCellLead: 1,
    whiteCellSupport: 1,
    gameMaster: 1
});

const TEAM_ROLE_LIMITS = Object.fromEntries(
    TEAM_OPTIONS.flatMap((team) => ([
        [buildTeamRole(team.id, ROLE_SURFACES.FACILITATOR), LIVE_DEMO_SEAT_LIMITS.facilitator],
        [buildTeamRole(team.id, ROLE_SURFACES.SCRIBE), LIVE_DEMO_SEAT_LIMITS.scribe],
        [buildTeamRole(team.id, ROLE_SURFACES.NOTETAKER), LIVE_DEMO_SEAT_LIMITS.notetaker]
    ]))
);

const WHITE_CELL_ROLE_LIMITS = Object.freeze({
    [buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.LEAD)]: LIVE_DEMO_SEAT_LIMITS.whiteCellLead,
    [buildWhiteCellOperatorRole(WHITE_CELL_OPERATOR_ROLES.SUPPORT)]: LIVE_DEMO_SEAT_LIMITS.whiteCellSupport
});

/**
 * Application Configuration
 * Central configuration for the ESG Simulation Platform
 */

export const CONFIG = {
    // Supabase connection (loaded from environment)
    SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',
    SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    RUNTIME_MODE: 'backend-required',

    // Role limits per session
    ROLE_LIMITS: {
        white: LIVE_DEMO_SEAT_LIMITS.gameMaster,
        ...TEAM_ROLE_LIMITS,
        ...WHITE_CELL_ROLE_LIMITS,
        viewer: LIVE_DEMO_SEAT_LIMITS.observer
    },

    // Heartbeat settings
    HEARTBEAT_INTERVAL_MS: 30000,       // 30 seconds
    HEARTBEAT_TIMEOUT_SECONDS: 90,      // 90 seconds - matches live-demo seat release on the backend
    HEARTBEAT_TIMEOUT_MS: 90000,
    PRESENCE_CLEANUP_INTERVAL_MS: 30000,

    // Timer defaults
    DEFAULT_TIMER_SECONDS: 5400,         // 90 minutes

    // Auto-save interval
    AUTOSAVE_INTERVAL_MS: 30000,         // 30 seconds

    // Storage key prefix
    STORAGE_PREFIX: 'esg',

    // Debounce delays
    DEBOUNCE_INPUT_MS: 300,
    DEBOUNCE_SAVE_MS: 1000,

    // Real-time reconnection
    REALTIME_RECONNECT_DELAY_MS: 1000,
    REALTIME_MAX_RECONNECT_ATTEMPTS: 5,

    // Toast notification durations
    TOAST_DURATION_MS: 3000,
    TOAST_ERROR_DURATION_MS: 5000,

    // Debug mode
    DEBUG: import.meta.env.VITE_DEBUG === 'true',

    // Version
    VERSION: '2.0.0'
};

export function isPlaceholderValue(value) {
    if (!value || typeof value !== 'string') return true;

    const normalized = value.trim().toLowerCase();
    return [
        'your-project',
        'project-ref',
        'your-anon-key',
        'placeholder',
        'changeme',
        '<required>',
        '<your-supabase-anon-key>'
    ].some((token) => normalized.includes(token));
}

export function isValidSupabaseUrl(url) {
    return Boolean(
        url &&
        typeof url === 'string' &&
        url.startsWith('https://') &&
        url.includes('.supabase.co') &&
        !isPlaceholderValue(url)
    );
}

export function getRoleLimit(role, config = CONFIG) {
    const normalizedRole = normalizeWhiteCellOperatorRole(role);
    return config.ROLE_LIMITS?.[normalizedRole] ?? config.ROLE_LIMITS?.[role] ?? Number.POSITIVE_INFINITY;
}

export function getHeartbeatTimeoutMs(config = CONFIG) {
    return config.HEARTBEAT_TIMEOUT_MS
        ?? ((config.HEARTBEAT_TIMEOUT_SECONDS ?? CONFIG.HEARTBEAT_TIMEOUT_SECONDS) * 1000);
}

export function getHeartbeatCutoffIso(referenceMs = Date.now(), config = CONFIG) {
    return new Date(referenceMs - getHeartbeatTimeoutMs(config)).toISOString();
}

export function isHeartbeatFresh(heartbeatAt, referenceMs = Date.now(), config = CONFIG) {
    if (!heartbeatAt) {
        return false;
    }

    const heartbeatMs = new Date(heartbeatAt).getTime();
    if (Number.isNaN(heartbeatMs)) {
        return false;
    }

    return heartbeatMs >= (referenceMs - getHeartbeatTimeoutMs(config));
}

/**
 * Validate that required configuration is present
 * @param {Object} [config] - Config override for tests
 * @returns {{ valid: boolean, issues: string[], runtimeMode: string }}
 */
export function validateConfig(config = CONFIG) {
    const supabaseUrl = config.SUPABASE_URL ?? config.VITE_SUPABASE_URL ?? '';
    const supabaseAnonKey = config.SUPABASE_ANON_KEY ?? config.VITE_SUPABASE_ANON_KEY ?? '';
    const issues = [];

    if (!supabaseUrl) {
        issues.push('VITE_SUPABASE_URL is not configured.');
    } else if (!isValidSupabaseUrl(supabaseUrl)) {
        issues.push('VITE_SUPABASE_URL must be a valid Supabase project URL.');
    }

    if (!supabaseAnonKey) {
        issues.push('VITE_SUPABASE_ANON_KEY is not configured.');
    } else if (isPlaceholderValue(supabaseAnonKey)) {
        issues.push('VITE_SUPABASE_ANON_KEY must be replaced with a real Supabase anon key.');
    }

    return {
        valid: issues.length === 0,
        issues,
        runtimeMode: config.RUNTIME_MODE || CONFIG.RUNTIME_MODE
    };
}

export function buildMissingConfigMessage(validation = validateConfig()) {
    const baseMessage = 'Backend configuration is required. Copy .env.example to an untracked .env.local or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your shell, then restart the app.';
    if (!validation?.issues?.length) {
        return baseMessage;
    }

    return `${baseMessage} ${validation.issues.join(' ')}`;
}

export default CONFIG;
