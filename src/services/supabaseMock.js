import { parseProposalDetails } from '../features/actions/proposalDetails.js';
import { parseTeamRole } from '../core/teamContext.js';
import { getIndustryMoveCoverage } from '../features/actions/industryTurnSheet.js';
import { getStrategicOrientationCompletion, parseStrategicOrientationDetails } from '../features/actions/strategicOrientationDetails.js';
import {
    REQUIRED_MIGRATION_COUNT,
    REQUIRED_MIGRATION_LEDGER_SHA256,
    REQUIRED_MIGRATION_STATE
} from '../core/releaseEvidence.js';

const E2E_MOCK_ENABLEMENT_KEY = '__esg_e2e_mock_enabled';
const E2E_MOCK_CONFIG_KEY = '__esg_e2e_mock_config';
const E2E_MOCK_STATE_KEY = 'esg_e2e_backend_state';
const E2E_MOCK_AUTH_KEY = 'esg_e2e_auth_session';
const E2E_MOCK_BROADCAST_KEY = 'esg_e2e_realtime_broadcast';
const E2E_MOCK_REALTIME_CHANGES_KEY = 'esg_e2e_realtime_changes';
const E2E_MOCK_TEST_CONFIG_GLOBAL = '__ESG_E2E_TEST_CONFIG__';
const E2E_MOCK_STATE_WRITE_LOCK = 'esg-e2e-backend-state-write';
const E2E_MOCK_ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const DECOMMISSIONED_SESSION_IDS = new Set(['00000000-0000-4000-8000-000000002026']);
let mockAnonymousAuthSequence = 0;
let mockRealtimeStateCacheKey = null;
let mockRealtimeStateCache = null;
const DEFAULT_TIMER_ALLOCATIONS = Object.freeze({
    strategic_orientation: 5400,
    move_1: 5400,
    move_2: 5400,
    move_3: 5400
});
const DEFAULT_PLUGIN_STATE = Object.freeze({});

const MOCK_TABLES = [
    'green_roster_approvals',
    'gc08_session_creations',
    'gc08_unified_seat_removals',
    'sessions',
    'game_state',
    'live_demo_runtime_config',
    'operator_grants',
    'participants',
    'session_participants',
    'actions',
    'requests',
    'artifact_workflow_reviews',
    'communications',
    'timeline',
    'notetaker_data',
    'scoped_notetaker_data',
    'action_logs',
    'action_relationships',
    'rfi_action_links',
    'pli_adjudications',
    'sme_handoffs',
    'sme_pli_packets',
    'research_audit_event_log',
    'research_participant',
    'research_note',
    'research_note_revision',
    'research_draft_revision',
    'research_state_transition',
    'research_action_content',
    'research_proposal_content',
    'research_adjudication_content',
    'research_move_response_content',
    'research_rfi_content',
    'research_interaction_edge',
    'research_data_quality_event',
    'research_derived_participant_metrics',
    'research_derived_session_metrics',
    'research_export_codebook'
];

const SME_OPERATOR_ROLES = new Set([
    'sme_econ',
    'sme_ni_escalation',
    'sme_diplomacy_information',
    'sme_tsj',
    'sme_verba'
]);

function cloneValue(value) {
    return value === undefined
        ? undefined
        : JSON.parse(JSON.stringify(value));
}

function getStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch (_error) {
        return null;
    }
}

function getSessionStorage() {
    try {
        return globalThis.sessionStorage ?? null;
    } catch (_error) {
        return null;
    }
}

function normalizeMockBootstrapConfig(config) {
    const operatorAccessCode = typeof config === 'string'
        ? config
        : config?.operatorAccessCode;

    if (typeof operatorAccessCode !== 'string') {
        return null;
    }

    const normalizedOperatorAccessCode = operatorAccessCode.trim();
    if (!normalizedOperatorAccessCode) {
        return null;
    }

    return {
        operatorAccessCode: normalizedOperatorAccessCode
    };
}

function isLocalAutomationRuntime({
    navigatorRef = globalThis.navigator ?? null,
    locationRef = globalThis.location ?? null
} = {}) {
    if (navigatorRef?.webdriver !== true) {
        return false;
    }

    const normalizedHostname = String(locationRef?.hostname || '').trim().toLowerCase();
    return E2E_MOCK_ALLOWED_HOSTS.has(normalizedHostname);
}

function readMockBootstrapConfig({
    globalRef = globalThis,
    sessionStorageRef = getSessionStorage(),
    navigatorRef = globalThis.navigator ?? null,
    locationRef = globalThis.location ?? null
} = {}) {
    const nonBrowserTestConfig = normalizeMockBootstrapConfig(globalRef?.[E2E_MOCK_TEST_CONFIG_GLOBAL]);
    if (typeof window === 'undefined' && nonBrowserTestConfig) {
        return nonBrowserTestConfig;
    }

    if (!isLocalAutomationRuntime({ navigatorRef, locationRef })) {
        return null;
    }

    if (sessionStorageRef?.getItem(E2E_MOCK_ENABLEMENT_KEY) !== 'enabled') {
        return null;
    }

    const rawConfig = sessionStorageRef?.getItem(E2E_MOCK_CONFIG_KEY);
    if (!rawConfig) {
        return null;
    }

    try {
        return normalizeMockBootstrapConfig(JSON.parse(rawConfig));
    } catch (_error) {
        return null;
    }
}

function buildInitialMockState() {
    const baseState = {
        counters: Object.fromEntries(MOCK_TABLES.map((tableName) => [tableName, 0])),
        tables: Object.fromEntries(MOCK_TABLES.map((tableName) => [tableName, []]))
    };

    baseState.tables.live_demo_runtime_config = [
        {
            config_key: 'research_capture_mode',
            config_value: 'research',
            updated_at: getTimestamp()
        },
        {
            config_key: 'software_build_hash',
            config_value: 'mock-build-hash',
            updated_at: getTimestamp()
        },
        {
            config_key: 'migration_state',
            config_value: REQUIRED_MIGRATION_STATE,
            updated_at: getTimestamp()
        },
        {
            config_key: 'migration_count',
            config_value: String(REQUIRED_MIGRATION_COUNT),
            updated_at: getTimestamp()
        },
        {
            config_key: 'migration_ledger_sha256',
            config_value: REQUIRED_MIGRATION_LEDGER_SHA256,
            updated_at: getTimestamp()
        }
    ];

    return baseState;
}

function readMockState() {
    const storage = getStorage();
    if (!storage) {
        return buildInitialMockState();
    }

    const rawState = storage.getItem(E2E_MOCK_STATE_KEY);
    if (!rawState) {
        return buildInitialMockState();
    }

    try {
        const parsedState = JSON.parse(rawState);
        return normalizeMockState(parsedState);
    } catch (_error) {
        return buildInitialMockState();
    }
}

function readMockStateForRealtimeEvent(eventValue) {
    if (mockRealtimeStateCacheKey !== eventValue || !mockRealtimeStateCache) {
        mockRealtimeStateCacheKey = eventValue;
        mockRealtimeStateCache = readMockState();
        queueMicrotask(() => {
            if (mockRealtimeStateCacheKey === eventValue) {
                mockRealtimeStateCacheKey = null;
                mockRealtimeStateCache = null;
            }
        });
    }

    return mockRealtimeStateCache;
}

function writeMockState(state) {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    const previousState = parseMockStateSnapshot(storage.getItem(E2E_MOCK_STATE_KEY));
    const serializedState = JSON.stringify(state);
    const changes = MOCK_TABLES.flatMap((tableName) => (
        diffMockTableRows(
            previousState.tables?.[tableName] || [],
            state.tables?.[tableName] || []
        ).map((change) => ({ table: tableName, ...change }))
    ));

    storage.setItem(E2E_MOCK_STATE_KEY, serializedState);
    if (changes.length > 0) {
        let previousSequence = 0;
        try {
            previousSequence = Number(JSON.parse(
                storage.getItem(E2E_MOCK_REALTIME_CHANGES_KEY) || 'null'
            )?.sequence) || 0;
        } catch (_error) {
            previousSequence = 0;
        }
        storage.setItem(E2E_MOCK_REALTIME_CHANGES_KEY, JSON.stringify({
            version: 1,
            sequence: previousSequence + 1,
            changes
        }));
    }
}

let fallbackStateWriteQueue = Promise.resolve();

function withMockStateWriteLock(callback) {
    const lockManager = globalThis.navigator?.locks;
    if (typeof lockManager?.request === 'function') {
        return lockManager.request(E2E_MOCK_STATE_WRITE_LOCK, callback);
    }

    const pendingWrite = fallbackStateWriteQueue.then(callback, callback);
    fallbackStateWriteQueue = pendingWrite.then(
        () => undefined,
        () => undefined
    );
    return pendingWrite;
}

let mockRequestAuthUserId;

function mutateMockState(callback) {
    const requestAuthUserId = getCurrentAuthUserId();
    return withMockStateWriteLock(() => {
        mockRequestAuthUserId = requestAuthUserId;
        try {
            const state = readMockState();
            const result = callback(state);
            if (!result?.error) writeMockState(state);
            return result;
        } finally {
            mockRequestAuthUserId = undefined;
        }
    });
}

function normalizeMockState(parsedState = null) {
    const normalized = {
        counters: {
            ...buildInitialMockState().counters,
            ...(parsedState?.counters || {})
        },
        tables: {
            ...buildInitialMockState().tables,
            ...(parsedState?.tables || {})
        }
    };

    normalized.tables.sessions = normalized.tables.sessions
        .filter((session) => !DECOMMISSIONED_SESSION_IDS.has(session.id))
        .map((session) => ({
            ...session,
            // Persisted mock snapshots created before session classification
            // represented ordinary active exercises by omitting these fields.
            session_classification: session.session_classification || 'live_exercise',
            is_protected: session.is_protected === true
        }));
    normalized.tables.session_participants = normalized.tables.session_participants.map((seat) => ({
        ...seat,
        // An explicit unknown snapshot is historical evidence too. Only old
        // mock fixtures lacking the field use the compatibility initializer.
        display_name_snapshot: seat.display_name_snapshot !== undefined
            ? seat.display_name_snapshot
            : normalized.tables.participants.find((participant) => participant.id === seat.participant_id)?.name ?? null
    }));
    delete normalized.tables.training_attempts;
    delete normalized.tables.training_progress_events;
    delete normalized.counters.training_attempts;
    delete normalized.counters.training_progress_events;

    return normalized;
}

function parseMockStateSnapshot(rawState) {
    if (!rawState) {
        return buildInitialMockState();
    }

    try {
        return normalizeMockState(JSON.parse(rawState));
    } catch (_error) {
        return buildInitialMockState();
    }
}

function diffMockTableRows(previousRows = [], nextRows = []) {
    const previousMap = new Map(previousRows.map((row) => [row?.id, row]));
    const nextMap = new Map(nextRows.map((row) => [row?.id, row]));
    const changes = [];

    nextMap.forEach((nextRow, rowId) => {
        if (!previousMap.has(rowId)) {
            changes.push({
                eventType: 'INSERT',
                old: null,
                new: cloneValue(nextRow)
            });
            return;
        }

        const previousRow = previousMap.get(rowId);
        if (JSON.stringify(previousRow) !== JSON.stringify(nextRow)) {
            changes.push({
                eventType: 'UPDATE',
                old: cloneValue(previousRow),
                new: cloneValue(nextRow)
            });
        }
    });

    previousMap.forEach((previousRow, rowId) => {
        if (!nextMap.has(rowId)) {
            changes.push({
                eventType: 'DELETE',
                old: cloneValue(previousRow),
                new: null
            });
        }
    });

    return changes;
}

function parseRealtimeFilterExpression(filterExpression = '') {
    const match = String(filterExpression || '').match(/^([a-z0-9_]+)=eq\.(.+)$/i);
    if (!match) {
        return null;
    }

    return {
        field: match[1],
        value: match[2]
    };
}

function matchesRealtimeFilter(change, config = {}) {
    const parsedFilter = parseRealtimeFilterExpression(config.filter);
    if (!parsedFilter) {
        return true;
    }

    const candidateRow = change.new || change.old || null;
    return String(candidateRow?.[parsedFilter.field] ?? '') === parsedFilter.value;
}

function createMockRealtimeChannel(channelName = '') {
    const subscriptions = [];
    const statusCallbacks = new Set();
    let storageListener = null;

    const channel = {
        on(eventName, config, callback) {
            subscriptions.push({ eventName, config, callback });
            return channel;
        },
        subscribe(callback) {
            if (typeof callback === 'function') {
                statusCallbacks.add(callback);
                queueMicrotask(() => callback('SUBSCRIBED'));
            }

            if (!storageListener && typeof window !== 'undefined') {
                storageListener = (event) => {
                    if (event.key === E2E_MOCK_BROADCAST_KEY) {
                        let envelope = null;
                        try {
                            envelope = event.newValue ? JSON.parse(event.newValue) : null;
                        } catch (_error) {
                            envelope = null;
                        }

                        if (!envelope || envelope.channel !== channelName) {
                            return;
                        }

                        subscriptions.forEach((subscription) => {
                            if (
                                subscription.eventName === 'broadcast'
                                && subscription.config?.event === envelope.event
                            ) {
                                subscription.callback({ payload: cloneValue(envelope.payload) });
                            }
                        });
                        return;
                    }

                    if (event.key !== E2E_MOCK_REALTIME_CHANGES_KEY) {
                        return;
                    }

                    let envelope = null;
                    try {
                        envelope = event.newValue ? JSON.parse(event.newValue) : null;
                    } catch (_error) {
                        envelope = null;
                    }
                    if (envelope?.version !== 1 || !Array.isArray(envelope.changes)) {
                        return;
                    }

                    const subscribedTableSet = new Set(
                        subscriptions.map((entry) => entry.config?.table).filter(Boolean)
                    );
                    const relevantChanges = envelope.changes.filter((change) => (
                        subscribedTableSet.has(change?.table)
                    ));
                    if (relevantChanges.length === 0) {
                        return;
                    }

                    const currentState = readMockStateForRealtimeEvent(event.newValue);
                    relevantChanges.forEach((change) => {
                        const row = change.new || change.old;
                        if (isRegionalSession(currentState, row?.session_id)
                            && !canReadTableRow(currentState, change.table, row, getCurrentAuthUserId())) return;
                        subscriptions.forEach((subscription) => {
                            if (subscription.eventName !== 'postgres_changes') {
                                return;
                            }

                            if (subscription.config?.schema && subscription.config.schema !== 'public') {
                                return;
                            }

                            if (subscription.config?.table !== change.table) {
                                return;
                            }

                            if (
                                subscription.config?.event
                                && subscription.config.event !== '*'
                                && subscription.config.event !== change.eventType
                            ) {
                                return;
                            }

                            if (!matchesRealtimeFilter(change, subscription.config)) {
                                return;
                            }

                            subscription.callback({
                                eventType: change.eventType,
                                old: cloneValue(change.old),
                                new: cloneValue(change.new)
                            });
                        });
                    });
                };

                window.addEventListener('storage', storageListener);
            }

            return channel;
        },
        async send(message = {}) {
            if (message.type !== 'broadcast' || !message.event) {
                return 'error';
            }

            const storage = getStorage();
            if (!storage) {
                return 'error';
            }

            storage.removeItem(E2E_MOCK_BROADCAST_KEY);
            storage.setItem(E2E_MOCK_BROADCAST_KEY, JSON.stringify({
                channel: channelName,
                event: message.event,
                payload: cloneValue(message.payload)
            }));
            return 'ok';
        },
        unsubscribe() {
            if (storageListener && typeof window !== 'undefined') {
                window.removeEventListener('storage', storageListener);
                storageListener = null;
            }

            statusCallbacks.forEach((callback) => callback('CLOSED'));
            statusCallbacks.clear();
        }
    };

    return channel;
}

function readMockAuthSession() {
    const storage = getStorage();
    if (!storage) {
        return null;
    }

    const rawSession = storage.getItem(E2E_MOCK_AUTH_KEY);
    if (!rawSession) {
        return null;
    }

    try {
        return JSON.parse(rawSession);
    } catch (_error) {
        return null;
    }
}

function writeMockAuthSession(session) {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    if (!session) {
        storage.removeItem(E2E_MOCK_AUTH_KEY);
        return;
    }

    storage.setItem(E2E_MOCK_AUTH_KEY, JSON.stringify(session));
}

function getCurrentAuthUserId() {
    return mockRequestAuthUserId !== undefined ? mockRequestAuthUserId : readMockAuthSession()?.user?.id || null;
}

function nextId(state, tableName) {
    state.counters[tableName] = (state.counters[tableName] || 0) + 1;
    const normalizedName = tableName.replace(/[^a-z0-9]+/gi, '_');
    return `${normalizedName}_${state.counters[tableName]}`;
}

function getTimestamp() {
    return new Date().toISOString();
}

function prepareRegionalTimelineInsert(state, row) {
    // PostgreSQL's capture_green_timeline_scope BEFORE trigger runs before
    // RLS WITH CHECK. Resolve persisted evidence before checking the seat.
    const denied = (message) => ({ data: null, error: { code: '23514', message } });
    const metadata = row.metadata || {};
    const related = metadata.related_id || null;
    const source = related && (state.tables.actions.find((entry) => entry.id === related)
        || state.tables.requests.find((entry) => entry.id === related));
    if (related && (!source || source.session_id !== row.session_id)) {
        return denied('GC02_TIMELINE_SOURCE_MISMATCH');
    }
    const message = Object.hasOwn(metadata, 'communication_id')
        && state.tables.communications.find((entry) => entry.id === metadata.communication_id);
    if (Object.hasOwn(metadata, 'communication_id') && (!message || message.session_id !== row.session_id
        || related && message.metadata?.source_proposal_id !== related)) {
        return denied('GC02_TIMELINE_COMMUNICATION_MISMATCH');
    }
    if (Object.hasOwn(metadata, 'thread_id') && !state.tables.communications.some((entry) =>
        entry.type === 'PROPOSAL_FORWARDED' && entry.session_id === row.session_id
        && entry.metadata?.thread_id === metadata.thread_id && entry.metadata?.source_proposal_id === related
        && entry.metadata?.recipient_team === metadata.recipient_team
        && (entry.delegation_id ?? null) === (source?.delegation_id ?? null))) {
        return denied('GC02_TIMELINE_THREAD_MISMATCH');
    }
    if (Object.hasOwn(metadata, 'review_request_id') && !state.tables.communications.some((entry) =>
        entry.id === metadata.review_request_id && entry.session_id === row.session_id
        && entry.type === 'PROPOSAL_RESPONSE_REVIEW' && entry.metadata?.source_proposal_id === related
        && entry.metadata?.thread_id === metadata.thread_id)) {
        return denied('GC02_TIMELINE_REVIEW_MISMATCH');
    }
    const owner = source ? source.team : message ? message.owner_team : row.team;
    const delegation = (source ? source.delegation_id : message ? message.delegation_id : row.delegation_id) ?? null;
    if (row.owner_team != null && row.owner_team !== owner
        || row.delegation_id != null && row.delegation_id !== delegation) {
        return denied('GC02_TIMELINE_SCOPE_MISMATCH');
    }
    if (owner === 'green' && !['asian_pacific', 'europe'].includes(delegation)) {
        return denied('GC02_GREEN_DELEGATION_REQUIRED');
    }
    if (owner !== 'green' && delegation !== null) return denied('GC02_UNEXPECTED_DELEGATION');
    return { data: { ...row, owner_team: owner, delegation_id: delegation }, error: null };
}

function normalizeInsertRow(tableName, payload, state) {
    const row = normalizeLegacyInsertRow(tableName, payload, state);
    if (!isRegionalSession(state, row.session_id)) return row;
    if (tableName === 'communications') {
        const source = row.metadata?.source_proposal_id || row.metadata?.source_action_id
            ? state.tables.actions.find((entry) => entry.id === (row.metadata.source_proposal_id || row.metadata.source_action_id) && entry.session_id === row.session_id)
            : state.tables.requests.find((entry) => entry.id === row.linked_request_id && entry.session_id === row.session_id);
        row.owner_team = source?.team || (/^(blue|red|green|industry)_/.exec(row.from_role)?.[1]) || 'white_cell';
        row.sender_delegation_id = row.from_role === 'green_shared_facilitator'
            ? source?.delegation_id || row.delegation_id : regionalDelegation(row.from_role);
        row.delegation_id = source ? source.delegation_id ?? null : row.sender_delegation_id;
        row.recipient_delegation_id = regionalDelegation(row.to_role)
            || (row.to_role === 'green' ? source?.delegation_id || row.recipient_delegation_id : null) || null;
        row.recipient_scope ||= row.to_role === 'all' ? 'session'
            : row.to_role === 'green' && row.recipient_delegation_id ? 'delegation'
                : ['blue', 'red', 'industry', 'white_cell'].includes(row.to_role) ? 'team' : 'role';
        row.metadata = { ...row.metadata, recipient_scope: row.recipient_scope,
            recipient_delegation_id: row.recipient_delegation_id, sender_delegation_id: row.sender_delegation_id };
    } else if (tableName === 'timeline') {
        const source = state.tables.actions.find((entry) => entry.id === row.metadata?.related_id && entry.session_id === row.session_id)
            || state.tables.requests.find((entry) => entry.id === row.metadata?.related_id && entry.session_id === row.session_id);
        const message = state.tables.communications.find((entry) => entry.id === row.metadata?.communication_id && entry.session_id === row.session_id);
        row.owner_team = source?.team || message?.owner_team || row.team;
        row.delegation_id = source?.delegation_id ?? message?.delegation_id ?? row.delegation_id ?? null;
    } else if (tableName === 'artifact_workflow_reviews') {
        const source = (row.artifact_kind === 'rfi' ? state.tables.requests : state.tables.actions).find((entry) => entry.id === row.artifact_id);
        row.delegation_id = source?.delegation_id ?? null;
    } else if (tableName === 'actions') {
        row.created_by_auth_user_id = getCurrentAuthUserId();
        row.created_by_role = getLiveDemoParticipantRole(state, getCurrentAuthUserId(), row.session_id);
        if (row.status !== 'submitted' && String(row.ally_contingencies || '').toLowerCase().includes('scribe handoff: forwarded')) {
            row.workflow_state = 'forwarded_to_facilitator';
        }
    }
    return row;
}

function normalizeLegacyInsertRow(tableName, payload, state) {
    const timestamp = getTimestamp();
    const baseRow = {
        id: payload.id || nextId(state, tableName),
        created_at: payload.created_at || timestamp
    };

    switch (tableName) {
        case 'sessions':
            return {
                ...baseRow,
                status: 'active',
                session_code: null,
                metadata: {},
                session_classification: 'live_exercise',
                is_protected: false,
                deleted_at: null,
                updated_at: timestamp,
                ...cloneValue(payload)
            };
        case 'game_state':
            return {
                ...baseRow,
                move: 1,
                phase: 1,
                timer_seconds: 0,
                timer_allocations: cloneValue(DEFAULT_TIMER_ALLOCATIONS),
                plugin_state: cloneValue(DEFAULT_PLUGIN_STATE),
                timer_running: false,
                timer_last_update: null,
                updated_at: timestamp,
                last_updated: timestamp,
                ...cloneValue(payload)
            };
        case 'operator_grants':
            return {
                ...baseRow,
                surface: null,
                session_id: null,
                team_id: null,
                role: null,
                operator_name: null,
                auth_user_id: null,
                granted_at: timestamp,
                updated_at: timestamp,
                ...cloneValue(payload)
            };
        case 'sme_handoffs':
            return {
                ...baseRow,
                session_id: null,
                action_id: null,
                seat: null,
                status: 'pending',
                acknowledged_by: null,
                acknowledged_at: null,
                created_at: timestamp,
                updated_at: timestamp,
                ...cloneValue(payload)
            };
        case 'sme_pli_packets':
            return {
                ...baseRow,
                session_id: null,
                adjudication_id: null,
                action_id: null,
                pli_seat: null,
                handoff_seat: null,
                status: 'pending',
                payload: {},
                copy_text: null,
                acknowledged_by: null,
                acknowledged_at: null,
                created_at: timestamp,
                updated_at: timestamp,
                ...cloneValue(payload)
            };
        case 'participants':
            return {
                ...baseRow,
                name: null,
                role: null,
                auth_user_id: null,
                updated_at: timestamp,
                ...cloneValue(payload)
            };
        case 'session_participants':
            return {
                ...baseRow,
                role: null,
                display_name_snapshot: null,
                is_active: true,
                heartbeat_at: timestamp,
                joined_at: timestamp,
                last_seen: timestamp,
                disconnected_at: null,
                left_at: null,
                updated_at: timestamp,
                ...cloneValue(payload)
            };
        case 'actions':
            return {
                ...baseRow,
                targets: [],
                is_deleted: false,
                revision_number: 1,
                prior_workflow_state: null,
                reviewed_at: null,
                reviewed_by_auth_user_id: null,
                reviewed_by_role: null,
                review_notes: null,
                completed_at: null,
                ...cloneValue(payload),
                created_at: timestamp,
                row_version: 1,
                submitted_at: payload.status === 'submitted' ? timestamp : null,
                workflow_state: payload.status === 'submitted'
                    ? 'submitted_to_white_cell'
                    : 'draft',
                updated_at: timestamp
            };
        case 'requests':
            return {
                ...baseRow,
                categories: [],
                priority: 'NORMAL',
                status: 'pending',
                workflow_state: 'submitted_to_white_cell',
                revision_number: 1,
                prior_workflow_state: null,
                reviewed_at: null,
                reviewed_by_auth_user_id: null,
                reviewed_by_role: null,
                review_notes: null,
                completed_at: null,
                updated_at: timestamp,
                ...cloneValue(payload),
                priority: 'NORMAL'
            };
        case 'artifact_workflow_reviews':
            return {
                ...baseRow,
                reviewed_at: timestamp,
                ...cloneValue(payload)
            };
        case 'communications':
        case 'timeline':
        case 'notetaker_data':
            return {
                ...baseRow,
                updated_at: timestamp,
                ...cloneValue(payload)
            };
        default:
            return {
                ...baseRow,
                updated_at: timestamp,
                ...cloneValue(payload)
            };
    }
}

function compareValues(left, right) {
    if (Array.isArray(left) || Array.isArray(right)) {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    return left === right;
}

function applyFilters(rows, filters) {
    return rows.filter((row) => filters.every((filter) => filter(row)));
}

function sortRows(rows, orderBy) {
    if (!orderBy) {
        return rows;
    }

    const factor = orderBy.ascending ? 1 : -1;
    return [...rows].sort((left, right) => {
        const leftValue = left?.[orderBy.field];
        const rightValue = right?.[orderBy.field];

        if (leftValue === rightValue) {
            return 0;
        }

        if (leftValue === undefined || leftValue === null) {
            return 1 * factor;
        }

        if (rightValue === undefined || rightValue === null) {
            return -1 * factor;
        }

        return leftValue > rightValue ? factor : -factor;
    });
}

function shapeSelectedRows(tableName, rows, selectClause, state) {
    const shapedRows = cloneValue(rows);

    if (tableName !== 'session_participants' || typeof selectClause !== 'string') {
        return shapedRows;
    }

    if (!selectClause.includes('participants(')) {
        return shapedRows;
    }

    return shapedRows.map((row) => {
        const participant = state.tables.participants.find((entry) => entry.id === row.participant_id);

        return {
            ...row,
            participants: participant
                ? {
                    name: participant.name ?? null,
                    client_id: participant.client_id ?? null
                }
                : null
        };
    });
}

function normalizeSeatRole(role = '') {
    const rawRole = role === null || role === undefined ? '' : String(role);
    const compatibilityNormalizedRole = typeof rawRole.normalize === 'function'
        ? rawRole.normalize('NFKC')
        : rawRole;
    const normalizedRole = compatibilityNormalizedRole
        .replace(/[^a-z_]+/gi, '')
        .toLowerCase();

    if (normalizedRole === 'white') {
        return 'whitecell_lead';
    }

    const match = normalizedRole.match(/^(?:(blue|red|green|industry)_)?whitecell(?:_(lead|support))?$/);

    if (!match) {
        return normalizedRole;
    }

    return `whitecell_${match[2] || 'lead'}`;
}

function regionalDelegation(role) {
    return /^(green)_(asian_pacific|europe)_(facilitator|scribe|notetaker)$/.exec(role || '')?.[2] ?? null;
}

function isRegionalSession(state, sessionId) {
    return state.tables.sessions.some((session) => session.id === sessionId && session.session_topology_version === 2);
}

function greenSeatModel(session) {
    return session?.green_seat_model ?? (session?.session_topology_version === 2 ? 'regional_pairs_v1' : 'unified_v1');
}

function seatModelAllowsRole(session, role) {
    const shared = greenSeatModel(session) === 'shared_facilitator_v1';
    if (role === 'green_shared_facilitator') return shared && session.session_topology_version === 2;
    return !(shared && ['green_asian_pacific_facilitator', 'green_europe_facilitator'].includes(role));
}

function regionalOperator(state, authUserId, sessionId) {
    return liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
        || liveDemoHasOperatorGrant(state, authUserId, 'whitecell', sessionId);
}

function authorizeMockDerivedOperation(state, authUserId, sessionId, operation) {
    const session = state.tables.sessions.find((row) => row.id === sessionId);
    return Boolean(authUserId && session && !isRegionalSession(state, sessionId)
        && session.session_classification === 'live_exercise' && !session.is_protected
        && (operation === 'adjudicate' && session.status === 'active'
            || operation === 'narrative' && ['active', 'archived'].includes(session.status))
        && regionalOperator(state, authUserId, sessionId));
}

function regionalOwns(state, authUserId, row, teamField = 'team', delegationField = 'delegation_id') {
    const seat = getParticipantSeatForSession(state, authUserId, row.session_id);
    return Boolean(seat && seat.role !== 'green_shared_facilitator' && getLiveDemoParticipantTeam(state, authUserId, row.session_id) === row[teamField]
        && (seat.delegation_id ?? null) === (row[delegationField] ?? null));
}

function regionalCapability(state, authUserId, sessionId, capability) {
    if (getLiveDemoParticipantRole(state, authUserId, sessionId) === 'green_shared_facilitator') return false;
    const surface = getLiveDemoParticipantSurface(state, authUserId, sessionId);
    return Boolean(getParticipantSeatForSession(state, authUserId, sessionId)) && ({
        draft: 'facilitator', submit: 'scribe', rfi: 'scribe', direct: 'scribe', thread: 'scribe', notes: 'notetaker'
    })[capability] === surface;
}

function regionalCanRead(state, tableName, row, authUserId) {
    if (regionalOperator(state, authUserId, row.session_id)) return true;
    const seat = getParticipantSeatForSession(state, authUserId, row.session_id);
    if (!seat) return false;
    const surface = getLiveDemoParticipantSurface(state, authUserId, row.session_id);
    const team = getLiveDemoParticipantTeam(state, authUserId, row.session_id);
    const author = ['facilitator', 'scribe'].includes(surface);
    if (seat.role === 'green_shared_facilitator') {
        if (tableName === 'requests') return row.team === 'green' && ['asian_pacific', 'europe'].includes(row.delegation_id);
        if (tableName === 'artifact_workflow_reviews' && row.artifact_kind === 'rfi') {
            const request = state.tables.requests.find((r) => r.id === row.artifact_id && r.session_id === row.session_id);
            return Boolean(request && request.team === row.team && request.delegation_id === row.delegation_id
                && regionalCanRead(state, 'requests', request, authUserId));
        }
        if (tableName === 'timeline') {
            const source = row.metadata?.communication_id
                ? state.tables.communications.find((c) => c.id === row.metadata.communication_id && c.session_id === row.session_id)
                : state.tables.requests.find((r) => r.id === row.metadata?.related_id && r.session_id === row.session_id);
            return Boolean(source && regionalCanRead(state, row.metadata?.communication_id ? 'communications' : 'requests', source, authUserId));
        }
        if (tableName === 'communications' && ['PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE', 'PROPOSAL_RESPONSE_REVIEW'].includes(row.type)) {
            return row.owner_team === 'green' && regionalThreadSource(state, row)
                && (row.type !== 'PROPOSAL_RESPONSE_REVIEW' || row.from_role === seat.role);
        }
        if (tableName === 'artifact_workflow_reviews' || tableName === 'action_logs') {
            const action = state.tables.actions.find((a) => a.id === (row.artifact_id || row.action_id)
                && a.session_id === row.session_id);
            return Boolean(action && (isRegionalOrientation(action) || isRegionalProposal(action))
                && (tableName !== 'artifact_workflow_reviews' || (row.artifact_kind === (isRegionalProposal(action) ? 'action' : 'strategic_orientation')
                    && row.team === action.team && row.delegation_id === action.delegation_id
                    && row.artifact_type === action.artifact_type && row.next_revision_number <= action.revision_number))
                && regionalCanRead(state, 'actions', action, authUserId));
        }
        if (['session_participants', 'game_state'].includes(tableName)) return true;
        if (tableName === 'actions') return row.team === 'green'
            && ['asian_pacific', 'europe'].includes(row.delegation_id)
            && (['forwarded_to_facilitator', 'submitted_to_white_cell', 'completed'].includes(row.workflow_state)
                || (isRegionalOrientation(row) || isRegionalProposal(row)) && ['returned_to_team', 'resubmitted'].includes(row.workflow_state));
        if (tableName === 'communications') return row.from_role === seat.role || row.from_role === 'white_cell'
            && (row.to_role === seat.role || ['session', 'both_green_delegations'].includes(row.recipient_scope)
                || row.recipient_scope === 'delegation' && ['asian_pacific', 'europe'].includes(row.recipient_delegation_id));
        return false;
    }
    switch (tableName) {
        case 'session_participants': case 'game_state': return true;
        case 'actions': return regionalOwns(state, authUserId, row)
            && (author || surface === 'notetaker' && row.workflow_state === 'completed');
        case 'requests': return regionalOwns(state, authUserId, row);
        case 'scoped_notetaker_data': return surface === 'notetaker' && row.session_participant_id === seat.id;
        case 'artifact_workflow_reviews': return author && regionalOwns(state, authUserId, row);
        case 'communications': {
            if (['PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE', 'PROPOSAL_RESPONSE_REVIEW'].includes(row.type)) {
                if (!author) return false;
                if (row.type === 'PROPOSAL_RESPONSE_REVIEW') return row.from_role === seat.role;
                return regionalOwns(state, authUserId, row, 'owner_team')
                    || ['blue', 'red'].includes(team) && team === row.metadata?.recipient_team;
            }
            return row.from_role === seat.role || ['white_cell', 'whitecell', 'whitecell_lead', 'whitecell_support'].includes(row.from_role) && (
                row.recipient_scope === 'session'
                || row.recipient_scope === 'both_green_delegations' && team === 'green'
                || row.recipient_scope === 'role' && row.to_role === seat.role
                || row.recipient_scope === 'delegation' && team === 'green' && row.recipient_delegation_id === seat.delegation_id
                || row.recipient_scope === 'team' && team !== 'green' && row.to_role === team);
        }
        case 'timeline': {
            if (row.metadata?.communication_id) {
                const message = state.tables.communications.find((entry) => entry.id === row.metadata.communication_id && entry.session_id === row.session_id);
                return Boolean(message && regionalCanRead(state, 'communications', message, authUserId));
            }
            return author && regionalOwns(state, authUserId, row, 'owner_team');
        }
        case 'action_logs': case 'action_relationships': case 'rfi_action_links': {
            const action = state.tables.actions.find((entry) => entry.id === (row.action_id || row.source_action_id) && entry.session_id === row.session_id);
            if (!action || !regionalCanRead(state, 'actions', action, authUserId)) return false;
            if (tableName === 'action_relationships' && row.target_action_id) {
                const target = state.tables.actions.find((entry) => entry.id === row.target_action_id && entry.session_id === row.session_id);
                return Boolean(target && regionalCanRead(state, 'actions', target, authUserId));
            }
            if (tableName === 'rfi_action_links') {
                const request = state.tables.requests.find((entry) => entry.id === row.request_id && entry.session_id === row.session_id);
                return Boolean(request && regionalCanRead(state, 'requests', request, authUserId));
            }
            return true;
        }
        default: return false;
    }
}

function regionalCanWrite(state, tableName, row, old, authUserId) {
    if (getLiveDemoParticipantRole(state, authUserId, row.session_id) === 'green_shared_facilitator') return false;
    const session = state.tables.sessions.find((entry) => entry.id === row.session_id);
    if (session?.status !== 'active' || session.is_protected || !session.green_roster_version || !session.green_roster_snapshot) return false;
    if (old && ['session_id', 'team', 'delegation_id'].some((key) => (old[key] ?? null) !== (row[key] ?? null))) return false;
    const capability = (name) => regionalCapability(state, authUserId, row.session_id, name);
    if (['actions', 'requests'].includes(tableName) && !regionalOwns(state, authUserId, row)) return false;
    switch (tableName) {
        case 'actions': {
            // Match the orientation-only restrictive RLS policy: direct table
            // writes cannot bypass revision-bound handoff/submission RPCs.
            if (isRegionalOrientation(row) || isRegionalOrientation(old) || row.artifact_type === 'proposal' && row.team === 'green' || isRegionalProposal(old)) return false;
            const status = row.status || 'draft';
            if (['reviewed_at', 'reviewed_by_auth_user_id', 'reviewed_by_role', 'review_notes', 'outcome', 'adjudication', 'adjudication_notes'].some((key) => !compareValues(row[key] ?? null, old?.[key] ?? null))
                || (row.revision_number ?? 1) !== (old?.revision_number ?? 1)) return false;
            if (!old) return capability('draft') && status === 'draft';
            return old.status === 'draft' && (
                capability('draft') && ['draft', 'returned_to_team'].includes(old.workflow_state) && status === 'draft'
                || capability('submit') && ['forwarded_to_facilitator', 'returned_to_team'].includes(old.workflow_state) && ['draft', 'submitted'].includes(status));
        }
        case 'requests': return row.team !== 'green' && capability('rfi');
        case 'communications': return !old && !row.from_role?.startsWith('green_') && capability('direct') && row.from_role === getLiveDemoParticipantRole(state, authUserId, row.session_id)
            && row.type === 'direct' && row.to_role === 'white_cell'
            && !row.linked_request_id && !row.metadata?.source_proposal_id && !row.metadata?.source_action_id
            && (row.owner_team == null || row.owner_team === getLiveDemoParticipantTeam(state, authUserId, row.session_id))
            && (row.recipient_scope == null || row.recipient_scope === 'team') && row.recipient_delegation_id == null
            && (row.sender_delegation_id == null || row.sender_delegation_id === regionalDelegation(row.from_role))
            && (row.delegation_id == null || row.delegation_id === regionalDelegation(row.from_role));
        case 'timeline': return !old && ['facilitator', 'scribe'].includes(getLiveDemoParticipantSurface(state, authUserId, row.session_id))
            && regionalCanRead(state, tableName, row, authUserId);
        default: return false;
    }
}

function getSessionRoleSeatLimit(role = '') {
    const normalizedRole = normalizeSeatRole(role);

    if (regionalDelegation(normalizedRole) || normalizedRole === 'green_shared_facilitator') return 1;

    if (/^(blue|red|green|industry)_facilitator$/.test(normalizedRole)) {
        return 1;
    }
    if (/^(blue|red|green|industry)_scribe$/.test(normalizedRole)) {
        return 1;
    }
    if (/^(blue|red|green|industry)_notetaker$/.test(normalizedRole)) {
        return 2;
    }
    if (/^whitecell(_lead)?$/.test(normalizedRole)) {
        return 1;
    }
    if (/^whitecell_support$/.test(normalizedRole)) {
        return 1;
    }
    if (SME_OPERATOR_ROLES.has(normalizedRole)) {
        return 1;
    }

    return null;
}

function getOperatorAccessCode() {
    return readMockBootstrapConfig()?.operatorAccessCode || null;
}

function getOperatorGrant(state, authUserId, surface) {
    return state.tables.operator_grants.find((entry) => (
        entry.auth_user_id === authUserId && entry.surface === surface
    )) || null;
}

function normalizeTeamId(teamId) {
    const normalizedTeam = String(teamId || '').trim().toLowerCase();
    return normalizedTeam || null;
}

function getParticipantSeatForSession(state, authUserId, sessionId, { activeOnly = true } = {}) {
    if (!authUserId || !sessionId) {
        return null;
    }

    const participantIds = new Set(
        state.tables.participants
            .filter((entry) => entry.auth_user_id === authUserId)
            .map((entry) => entry.id)
    );

    const matchingSeats = state.tables.session_participants
        .filter((entry) => (
            entry.session_id === sessionId
            && participantIds.has(entry.participant_id)
            && (!activeOnly || entry.is_active === true)
        ))
        .sort((left, right) => {
            const leftTimestamp = new Date(left.updated_at || left.joined_at || 0).getTime();
            const rightTimestamp = new Date(right.updated_at || right.joined_at || 0).getTime();
            return rightTimestamp - leftTimestamp;
        });

    if (activeOnly && isRegionalSession(state, sessionId)) {
        const session = state.tables.sessions.find((entry) => entry.id === sessionId);
        const current = matchingSeats.filter((seat) => seatModelAllowsRole(session, seat.role)
            && !seat.revoked_at && !seat.left_at && !seat.disconnected_at
            && new Date(seat.heartbeat_at || seat.last_seen || seat.joined_at).getTime() >= Date.now() - 90000
            && (seat.delegation_id ?? null) === regionalDelegation(normalizeSeatRole(seat.role)));
        return session?.status === 'active' && session.session_classification === 'live_exercise'
            && !session.is_protected && current.length === 1 ? current[0] : null;
    }
    return matchingSeats[0] || null;
}

function getLiveDemoParticipantRole(state, authUserId, sessionId) {
    const seat = getParticipantSeatForSession(state, authUserId, sessionId, { activeOnly: true });
    return normalizeSeatRole(seat?.role || null);
}

function getLiveDemoParticipantSurface(state, authUserId, sessionId) {
    const role = getLiveDemoParticipantRole(state, authUserId, sessionId);
    if (role === 'green_shared_facilitator') return 'scribe';

    if (regionalDelegation(role)) {
        return role.endsWith('_facilitator') ? 'scribe' : role.endsWith('_scribe') ? 'facilitator' : 'notetaker';
    }

    if (role === 'viewer') {
        return 'viewer';
    }

    if (/^(blue|red|green|industry)_facilitator$/.test(role || '')) {
        return 'facilitator';
    }

    if (/^(blue|red|green|industry)_scribe$/.test(role || '')) {
        return 'scribe';
    }

    if (/^(blue|red|green|industry)_notetaker$/.test(role || '')) {
        return 'notetaker';
    }

    if (/^whitecell(_lead|_support)?$/.test(role || '')) {
        return 'whitecell';
    }

    if (SME_OPERATOR_ROLES.has(role || '')) {
        return 'sme';
    }

    return null;
}

function getLiveDemoParticipantTeam(state, authUserId, sessionId) {
    const role = getLiveDemoParticipantRole(state, authUserId, sessionId);
    return role?.match(/^(blue|red|green|industry)_/)?.[1] || null;
}

function liveDemoHasOperatorGrant(state, authUserId, surface, sessionId = null, teamId = null, role = null) {
    const grant = getOperatorGrant(state, authUserId, String(surface || '').trim().toLowerCase());

    if (!grant) {
        return false;
    }

    if (sessionId && grant.session_id !== sessionId) {
        return false;
    }

    if (teamId && grant.team_id !== normalizeTeamId(teamId)) {
        return false;
    }

    if (role && grant.role !== normalizeSeatRole(String(role || '').trim())) {
        return false;
    }

    return true;
}

function liveDemoCanReadSession(state, authUserId, sessionId) {
    if (!authUserId || !sessionId) {
        return false;
    }

    const session = state.tables.sessions.find((entry) => entry.id === sessionId);
    if (!session
        || session.session_classification !== 'live_exercise'
        || session.is_protected === true) {
        return false;
    }

    return Boolean(
        getParticipantSeatForSession(state, authUserId, sessionId, { activeOnly: true })
        || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
        || liveDemoHasOperatorGrant(state, authUserId, 'whitecell', isRegionalSession(state, sessionId) ? sessionId : null)
    );
}

function hasPrivilegedSessionAdminGrant(state, authUserId) {
    return Boolean(
        liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
        || liveDemoHasOperatorGrant(state, authUserId, 'whitecell')
    );
}

function canReleaseStaleSessionRoleSeats(state, authUserId, sessionId) {
    if (!authUserId || !sessionId) {
        return false;
    }

    return Boolean(
        liveDemoCanReadSession(state, authUserId, sessionId)
        || liveDemoHasOperatorGrant(state, authUserId, 'whitecell', sessionId)
    );
}

function liveDemoCanWriteSession(state, authUserId, sessionId) {
    if (isRegionalSession(state, sessionId)
        && state.tables.sessions.find((entry) => entry.id === sessionId)?.status !== 'active') return false;
    if (!liveDemoCanReadSession(state, authUserId, sessionId)) {
        return false;
    }

    return getLiveDemoParticipantSurface(state, authUserId, sessionId) !== 'viewer';
}

function liveDemoCanWriteSessionSurface(state, authUserId, sessionId, allowedSurfaces = []) {
    return (
        liveDemoCanWriteSession(state, authUserId, sessionId)
        && allowedSurfaces.includes(getLiveDemoParticipantSurface(state, authUserId, sessionId))
    );
}

function liveDemoCanWriteTeamSession(state, authUserId, sessionId, teamId, allowedSurfaces = []) {
    return (
        liveDemoCanWriteSessionSurface(state, authUserId, sessionId, allowedSurfaces)
        && getLiveDemoParticipantTeam(state, authUserId, sessionId) === normalizeTeamId(teamId)
    );
}

function canReadTableRow(state, tableName, row, authUserId) {
    if (['green_roster_approvals', 'gc08_session_creations', 'gc08_unified_seat_removals'].includes(tableName)) return false;
    if (tableName === 'research_note_revision') {
        const note = state.tables.research_note.find((entry) => entry.note_id === row.note_id);
        return Boolean(note && canReadTableRow(state, 'research_note', note, authUserId));
    }
    if (isRegionalSession(state, row.session_id) && !regionalCanRead(state, tableName, row, authUserId)) return false;
    if (tableName === 'operator_grants') {
        return Boolean(authUserId && row.auth_user_id === authUserId);
    }

    if (!authUserId) {
        return false;
    }

    if (tableName === 'participants') {
        if (row.auth_user_id === authUserId) {
            return true;
        }

        return state.tables.session_participants.some((seat) => (
            seat.participant_id === row.id
            && liveDemoCanReadSession(state, authUserId, seat.session_id)
        ));
    }

    if (tableName === 'sessions') {
        return liveDemoCanReadSession(state, authUserId, row.id);
    }

    if (tableName === 'pli_adjudications') {
        return (
            liveDemoCanWriteSessionSurface(
                state,
                authUserId,
                row.session_id,
                ['whitecell', 'gamemaster']
            )
            || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
            || (
                liveDemoCanReadSession(state, authUserId, row.session_id)
                && ['approved', 'overridden'].includes(row.status)
            )
        );
    }

    if (tableName === 'requests') {
        return (
            liveDemoHasOperatorGrant(state, authUserId, 'whitecell', row.session_id)
            || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
            || (
                liveDemoCanReadSession(state, authUserId, row.session_id)
                && getLiveDemoParticipantTeam(state, authUserId, row.session_id) === normalizeTeamId(row.team)
            )
        );
    }

    if (tableName === 'communications') {
        const participantRole = String(getLiveDemoParticipantRole(state, authUserId, row.session_id) || '')
            .trim()
            .toLowerCase();
        const participantTeam = getLiveDemoParticipantTeam(state, authUserId, row.session_id);
        const fromRole = normalizeSeatRole(String(row.from_role || '').trim()).toLowerCase();
        const toRole = normalizeSeatRole(String(row.to_role || '').trim()).toLowerCase();
        const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        const isWhiteCellSender = ['white_cell', 'whitecell', 'whitecell_lead', 'whitecell_support']
            .includes(fromRole);
        const isProposalThread = ['PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE']
            .includes(String(row.type || '').trim().toUpperCase())
            && Boolean(String(metadata.thread_id || '').trim());

        return (
            liveDemoHasOperatorGrant(state, authUserId, 'whitecell', row.session_id)
            || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
            || (
                liveDemoCanReadSession(state, authUserId, row.session_id)
                && (
                    fromRole === participantRole
                    || (
                        isProposalThread
                        && [normalizeTeamId(metadata.source_team), normalizeTeamId(metadata.recipient_team)]
                            .includes(participantTeam)
                    )
                    || (
                        String(row.type || '').trim().toUpperCase() === 'PROPOSAL_FORWARDED'
                        && normalizeTeamId(metadata.source_team) === participantTeam
                    )
                    || (
                        isWhiteCellSender
                        && (
                            toRole === 'all'
                            || toRole === participantTeam
                            || toRole === participantRole
                            || normalizeTeamId(metadata.recipient_team) === participantTeam
                            || normalizeSeatRole(String(metadata.recipient_role || '')).toLowerCase() === participantRole
                        )
                    )
                )
            )
        );
    }

    if (tableName === 'session_participants' || tableName === 'game_state' || tableName === 'actions'
        || tableName === 'timeline'
        || tableName === 'notetaker_data' || tableName === 'sme_handoffs'
        || tableName === 'sme_pli_packets'
        || tableName === 'artifact_workflow_reviews') {
        return liveDemoCanReadSession(state, authUserId, row.session_id)
            || liveDemoHasOperatorGrant(state, authUserId, 'sme', row.session_id)
            || liveDemoHasOperatorGrant(state, authUserId, 'whitecell', row.session_id)
            || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster');
    }

    if (tableName.startsWith('research_') && tableName !== 'research_export_codebook') {
        if (!row?.session_id) {
            return true;
        }

        return liveDemoCanReadSession(state, authUserId, row.session_id);
    }

    return true;
}

function canInsertTableRow(state, tableName, row, authUserId) {
    if (['green_roster_approvals', 'gc08_session_creations', 'gc08_unified_seat_removals'].includes(tableName)) return false;
    if (isRegionalSession(state, row.session_id) && !regionalCanWrite(state, tableName, row, null, authUserId)) return false;
    switch (tableName) {
        case 'actions':
            return liveDemoCanWriteTeamSession(
                state,
                authUserId,
                row.session_id,
                row.team,
                ['facilitator', 'scribe']
            );
        case 'requests':
            return (
                liveDemoCanWriteTeamSession(
                state,
                authUserId,
                row.session_id,
                row.team,
                ['scribe']
                )
                && String(row.status || 'pending').toLowerCase() === 'pending'
                && String(row.workflow_state || 'submitted_to_white_cell').toLowerCase() === 'submitted_to_white_cell'
                && (row.response === null || row.response === undefined)
                && (row.responded_by === null || row.responded_by === undefined)
                && (row.responded_at === null || row.responded_at === undefined)
                && (row.review_notes === null || row.review_notes === undefined)
                && Boolean(String(row.query || '').trim())
            );
        case 'communications':
            return canInsertFacilitatorDirectCommunication(state, row, authUserId)
                || canInsertProposalResponseCommunication(state, row, authUserId);
        case 'timeline':
            return liveDemoCanWriteSession(state, authUserId, row.session_id);
        case 'notetaker_data':
            return liveDemoCanWriteSessionSurface(
                state,
                authUserId,
                row.session_id,
                ['notetaker']
            );
        case 'sme_handoffs':
            return (
                liveDemoCanWriteSessionSurface(
                    state,
                    authUserId,
                    row.session_id,
                    ['whitecell', 'gamemaster']
                )
                || liveDemoHasOperatorGrant(state, authUserId, 'whitecell', row.session_id)
                || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
            );
        case 'sme_pli_packets':
            return (
                liveDemoCanWriteSessionSurface(
                    state,
                    authUserId,
                    row.session_id,
                    ['whitecell', 'gamemaster', 'sme']
                )
                || liveDemoHasOperatorGrant(state, authUserId, 'sme', row.session_id)
                || liveDemoHasOperatorGrant(state, authUserId, 'whitecell', row.session_id)
                || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
            );
        default:
            return false;
    }
}

function canUpdateTableRow(state, tableName, currentRow, nextRow, authUserId) {
    if (['green_roster_approvals', 'gc08_session_creations', 'gc08_unified_seat_removals'].includes(tableName)) return false;
    if ((isRegionalSession(state, currentRow.session_id) || isRegionalSession(state, nextRow.session_id))
        && !regionalCanWrite(state, tableName, nextRow, currentRow, authUserId)) return false;
    switch (tableName) {
        case 'actions':
            return (
                liveDemoCanWriteTeamSession(state, authUserId, currentRow.session_id, currentRow.team, ['facilitator', 'scribe'])
                && liveDemoCanWriteTeamSession(state, authUserId, nextRow.session_id, nextRow.team, ['facilitator', 'scribe'])
                && nextRow.status !== 'adjudicated'
            );
        case 'requests':
            return (
                liveDemoCanWriteTeamSession(state, authUserId, currentRow.session_id, currentRow.team, ['scribe'])
                && liveDemoCanWriteTeamSession(state, authUserId, nextRow.session_id, nextRow.team, ['scribe'])
                && currentRow.status === 'pending'
                && currentRow.workflow_state === 'returned_to_team'
                && nextRow.status === 'pending'
                && nextRow.workflow_state === 'resubmitted'
                && nextRow.revision_number === currentRow.revision_number
                && compareValues(nextRow.priority, currentRow.priority)
                && compareValues(nextRow.review_notes, currentRow.review_notes)
                && compareValues(nextRow.response, currentRow.response)
                && compareValues(nextRow.responded_at, currentRow.responded_at)
                && compareValues(nextRow.reviewed_at, currentRow.reviewed_at)
                && Boolean(String(nextRow.query || '').trim())
            );
        case 'notetaker_data':
            return (
                liveDemoCanWriteSessionSurface(state, authUserId, currentRow.session_id, ['notetaker'])
                && liveDemoCanWriteSessionSurface(state, authUserId, nextRow.session_id, ['notetaker'])
            );
        case 'sme_handoffs':
            return (
                liveDemoCanWriteSessionSurface(
                    state,
                    authUserId,
                    currentRow.session_id,
                    ['sme', 'gamemaster']
                )
                || liveDemoHasOperatorGrant(state, authUserId, 'sme', currentRow.session_id)
                || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
            ) && (
                liveDemoCanWriteSessionSurface(
                    state,
                    authUserId,
                    nextRow.session_id,
                    ['sme', 'gamemaster']
                )
                || liveDemoHasOperatorGrant(state, authUserId, 'sme', nextRow.session_id)
                || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
            );
        case 'sme_pli_packets':
            return (
                ['pending', 'done'].includes(nextRow.status)
                && (
                    liveDemoCanWriteSessionSurface(
                        state,
                        authUserId,
                        currentRow.session_id,
                        ['sme', 'whitecell', 'gamemaster']
                    )
                    || liveDemoHasOperatorGrant(state, authUserId, 'sme', currentRow.session_id)
                    || liveDemoHasOperatorGrant(state, authUserId, 'whitecell', currentRow.session_id)
                    || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
                ) && (
                    liveDemoCanWriteSessionSurface(
                        state,
                        authUserId,
                        nextRow.session_id,
                        ['sme', 'whitecell', 'gamemaster']
                    )
                    || liveDemoHasOperatorGrant(state, authUserId, 'sme', nextRow.session_id)
                    || liveDemoHasOperatorGrant(state, authUserId, 'whitecell', nextRow.session_id)
                    || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
                )
            );
        case 'pli_adjudications':
            return (
                ['pending', 'approved', 'overridden', 'needs_human'].includes(nextRow.status)
                && (
                    liveDemoCanWriteSessionSurface(
                        state,
                        authUserId,
                        currentRow.session_id,
                        ['whitecell', 'gamemaster']
                    )
                    || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
                )
                && (
                    liveDemoCanWriteSessionSurface(
                        state,
                        authUserId,
                        nextRow.session_id,
                        ['whitecell', 'gamemaster']
                    )
                    || liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
                )
            );
        default:
            return false;
    }
}

function buildRlsError(tableName) {
    return {
        code: '42501',
        message: `new row violates row-level security policy for table "${tableName}"`
    };
}

function normalizeProposalRecipientStatus(status) {
    return String(status || '').trim().toLowerCase();
}

function canInsertProposalResponseCommunication(state, row, authUserId) {
    // Thread rounds are written only through append_proposal_thread_message.
    // Retain the function boundary so old direct-insert callers fail closed.
    if (row?.metadata?.thread_id || row?.type === 'PROPOSAL_RESPONSE') {
        return false;
    }
    const normalizedType = String(row?.type || '').trim().toUpperCase();
    const normalizedToRole = String(row?.to_role || '').trim().toLowerCase();
    const normalizedFromRole = normalizeSeatRole(String(row?.from_role || '').trim()).toLowerCase();
    const participantSurface = getLiveDemoParticipantSurface(state, authUserId, row?.session_id);
    const participantRole = String(getLiveDemoParticipantRole(state, authUserId, row?.session_id) || '')
        .trim()
        .toLowerCase();
    const participantTeam = getLiveDemoParticipantTeam(state, authUserId, row?.session_id);
    const metadata = row?.metadata && typeof row.metadata === 'object'
        ? row.metadata
        : {};
    const sourceCommunicationId = String(metadata.source_communication_id || '').trim();
    const content = String(row?.content || '').trim();

    if (
        normalizedType !== 'PROPOSAL_RESPONSE'
        || normalizedToRole !== 'white_cell'
        || !authUserId
        || !['facilitator', 'scribe'].includes(participantSurface)
        || !participantRole
        || participantRole !== normalizedFromRole
        || !content
        || !sourceCommunicationId
    ) {
        return false;
    }

    const forwardedProposal = state.tables.communications.find((entry) => (
        entry.id === sourceCommunicationId
        && entry.session_id === row?.session_id
        && entry.type === 'PROPOSAL_FORWARDED'
    ));

    if (!forwardedProposal || resolveProposalRecipientTeam(forwardedProposal) !== participantTeam) {
        return false;
    }

    const currentRecipientStatus = normalizeProposalRecipientStatus(
        forwardedProposal?.metadata?.proposal_recipient_state?.status
    );
    if (['responded', 'declined', 'ignored'].includes(currentRecipientStatus)) {
        return false;
    }

    return true;
}

function authorizeDemoOperator(state, {
    requested_surface,
    requested_operator_code,
    requested_session_id,
    requested_team_id,
    requested_role,
    requested_operator_name
}) {
    const authUserId = getCurrentAuthUserId();
    const normalizedSurface = String(requested_surface || '').trim().toLowerCase();
    const normalizedRole = normalizeSeatRole(String(requested_role || '').trim()) || null;
    let normalizedTeam = String(requested_team_id || '').trim().toLowerCase() || null;

    if (!authUserId) {
        return { data: null, error: { message: 'Browser identity is required before operator authorization.' } };
    }

    if (String(requested_operator_code || '').trim() !== getOperatorAccessCode()) {
        return { data: null, error: { message: 'Invalid operator access code.' } };
    }

    if (!['gamemaster', 'whitecell', 'sme'].includes(normalizedSurface)) {
        return { data: null, error: { message: 'Unsupported operator surface.' } };
    }

    let resolvedSession = null;
    if (normalizedSurface === 'whitecell' || normalizedSurface === 'sme') {
        if (normalizedSurface === 'whitecell'
            && !['whitecell_lead', 'whitecell_support'].includes(normalizedRole)) {
            return { data: null, error: { message: 'White Cell authorization requires a supported operator role.' } };
        }

        if (normalizedSurface === 'sme' && !SME_OPERATOR_ROLES.has(normalizedRole)) {
            return { data: null, error: { message: 'SME authorization requires a supported SME role.' } };
        }

        if (requested_session_id) {
            resolvedSession = state.tables.sessions.find((entry) => (
                entry.id === requested_session_id
                && entry.status === 'active'
                && entry.session_classification === 'live_exercise'
                && entry.is_protected !== true
            ));
            if (!resolvedSession) {
                return { data: null, error: { message: 'This session is not currently joinable.' } };
            }
        } else {
            const active = state.tables.sessions
                .filter((entry) => (
                    entry.status === 'active'
                    && entry.session_classification === 'live_exercise'
                    && entry.is_protected !== true
                ))
                .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
            resolvedSession = active[0] || null;
            if (!resolvedSession) {
                return {
                    data: null,
                    error: { message: 'No active session is available. Ask Game Master to open a session first.' }
                };
            }
        }

        normalizedTeam = null;
    }

    state.tables.operator_grants = state.tables.operator_grants.filter((entry) => !(
        entry.auth_user_id === authUserId && entry.surface === normalizedSurface
    ));

    const grant = normalizeInsertRow('operator_grants', {
        auth_user_id: authUserId,
        surface: normalizedSurface,
        session_id: (normalizedSurface === 'whitecell' || normalizedSurface === 'sme')
            ? resolvedSession.id
            : null,
        team_id: (normalizedSurface === 'whitecell' || normalizedSurface === 'sme')
            ? normalizedTeam
            : null,
        role: normalizedSurface === 'whitecell' || normalizedSurface === 'sme'
            ? normalizedRole
            : 'white',
        operator_name: String(requested_operator_name || '').trim() || null
    }, state);

    state.tables.operator_grants.push(grant);

    return {
        data: cloneValue({
            ...grant,
            session_code: resolvedSession?.session_code || resolvedSession?.metadata?.session_code || null,
            session_name: resolvedSession?.name || null
        }),
        error: null
    };
}

function usableGreenRoster(row) {
    const s = row?.snapshot;
    return Boolean(row?.version && row?.approved_by?.trim() && row?.approved_at
        && ['asian_pacific', 'europe', 'source_references'].every((key) => Array.isArray(s?.[key]) && s[key].length)
        && s?.aliases && typeof s.aliases === 'object' && !Array.isArray(s.aliases));
}

function configureGreenSession(state, sid, rosterVersion, model, topology = 2) {
    const fail = (message, code = '23514') => ({ data: null, error: { code, message } });
    if (!liveDemoHasOperatorGrant(state, getCurrentAuthUserId(), 'gamemaster')) return fail('GC08_GM_REQUIRED', '42501');
    const session = state.tables.sessions.find((row) => row.id === sid);
    if (!session || session.status !== 'active' || session.is_protected || session.session_classification !== 'live_exercise') return fail('GC02_SESSION_NOT_CONFIGURABLE');
    if (session.topology_frozen_at || Object.entries(state.tables).some(([table, rows]) =>
        !['operator_grants', 'game_state'].includes(table) && rows.some((row) => row.session_id === sid))) return fail('GC04A_SEAT_MODEL_FROZEN');
    const roster = state.tables.green_roster_approvals.find((row) => row.version === rosterVersion);
    if (model && !roster || rosterVersion && !roster) return fail('GC02_APPROVED_ROSTER_REQUIRED');
    if (![1, 2].includes(topology) || topology === 1 && rosterVersion) return fail('GC02_UNKNOWN_TOPOLOGY');
    Object.assign(session, { session_topology_version: topology,
        green_roster_version: rosterVersion || null,
        green_roster_snapshot: roster ? cloneValue({ ...roster.snapshot, approved_by: roster.approved_by, approved_at: roster.approved_at }) : null,
        green_seat_model: model || null });
    return { data: cloneValue(session), error: null };
}

function createConfiguredLiveSession(state, params) {
    const fail = (message, code = '23514') => ({ data: null, error: { code, message } });
    const uid = getCurrentAuthUserId();
    if (!liveDemoHasOperatorGrant(state, uid, 'gamemaster')) return fail('GC08_GM_REQUIRED', '42501');
    const request = { name: String(params.requested_name || '').trim(), code: String(params.requested_session_code || '').trim().toUpperCase(),
        description: String(params.requested_description || '').trim() || null, model: params.requested_green_configuration, roster: params.requested_roster_version ?? null };
    if (!params.requested_request_key || !request.name || !/^[A-Z0-9]{3,50}$/.test(request.code)
        || !['unified_v1', 'shared_facilitator_v1'].includes(request.model)) return fail('GC08_INVALID_SETUP', '22023');
    const receipt = state.tables.gc08_session_creations.find((r) => r.operator_id === uid && r.request_key === params.requested_request_key);
    if (receipt) return JSON.stringify(receipt.request) !== JSON.stringify(request)
        ? fail('GC08_RETRY_CONFLICT', 'PT409') : { data: cloneValue(state.tables.sessions.find((s) => s.id === receipt.session_id)), error: null };
    const regional = request.model === 'shared_facilitator_v1';
    if (regional && !state.tables.green_roster_approvals.some((r) => r.version === request.roster && usableGreenRoster(r))) return fail('GC08_APPROVED_ROSTER_REQUIRED');
    if (!regional && request.roster !== null) return fail('GC08_UNIFIED_ROSTER_CONFLICT', '22023');
    if (state.tables.sessions.some((s) => s.session_code === request.code)) return fail('Session code already exists', '23505');
    const created = createLiveDemoSession(state, params);
    if (created.error) return created;
    let result = created;
    if (regional) result = configureGreenSession(state, created.data.id, request.roster, request.model);
    if (result.error) return result;
    state.tables.gc08_session_creations.push({ operator_id: uid, request_key: params.requested_request_key, request, session_id: result.data.id });
    return result;
}

function createLiveDemoSession(state, {
    requested_name,
    requested_session_code,
    requested_description
}) {
    const authUserId = getCurrentAuthUserId();
    if (!hasPrivilegedSessionAdminGrant(state, authUserId)) {
        return { data: null, error: { message: 'Game Master or White Cell authorization is required.' } };
    }

    const session = normalizeInsertRow('sessions', {
        name: String(requested_name || '').trim(),
        status: 'active',
        session_classification: 'live_exercise',
        is_protected: false,
        session_topology_version: 1,
        session_code: String(requested_session_code || '').trim().toUpperCase(),
        metadata: {
            session_code: String(requested_session_code || '').trim().toUpperCase(),
            description: String(requested_description || '').trim() || null
        }
    }, state);

    state.tables.sessions.push(session);
    state.tables.game_state.push(normalizeInsertRow('game_state', {
        session_id: session.id,
        move: 1,
        phase: 1,
        timer_seconds: 5400,
        timer_allocations: cloneValue(DEFAULT_TIMER_ALLOCATIONS),
        plugin_state: cloneValue(DEFAULT_PLUGIN_STATE),
        timer_running: false,
        timer_last_update: null
    }, state));

    return {
        data: cloneValue(session),
        error: null
    };
}

function archiveLiveDemoSession(state, {
    requested_session_id
}) {
    const authUserId = getCurrentAuthUserId();
    if (!hasPrivilegedSessionAdminGrant(state, authUserId)) {
        return { data: null, error: { message: 'Game Master or White Cell authorization is required.' } };
    }

    const session = state.tables.sessions.find((entry) => entry.id === requested_session_id);
    if (!session) {
        return { data: null, error: { message: 'Session not found. Please refresh and try again.' } };
    }

    if (session.is_protected === true || session.session_classification !== 'live_exercise') {
        return { data: null, error: { message: 'Protected sessions cannot be changed.' } };
    }

    if (session.status === 'deleted') {
        return { data: null, error: { message: 'Deleted sessions are immutable.' } };
    }

    if (session.status === 'archived') {
        return {
            data: {
                archived_session_id: requested_session_id,
                status: 'archived',
                already_archived: true,
                closed_seat_count: 0
            },
            error: null
        };
    }

    const archivedAt = getTimestamp();
    const previousSession = cloneValue(session);
    session.status = 'archived';
    session.updated_at = archivedAt;

    let closedSeatCount = 0;
    state.tables.session_participants = state.tables.session_participants.map((seat) => {
        if (seat.session_id !== requested_session_id || seat.is_active !== true) {
            return seat;
        }

        closedSeatCount += 1;
        return {
            ...seat,
            is_active: false,
            disconnected_at: seat.disconnected_at || archivedAt,
            left_at: seat.left_at || archivedAt,
            last_seen: seat.last_seen || seat.heartbeat_at || seat.joined_at || archivedAt
        };
    });

    const operatorGrant = state.tables.operator_grants.find((grant) => (
        grant.auth_user_id === authUserId && ['gamemaster', 'whitecell'].includes(grant.surface)
    ));
    const priorEvents = state.tables.research_audit_event_log.filter((event) => (
        event.session_id === requested_session_id
    ));
    const eventId = state.tables.research_audit_event_log.reduce((largest, event) => (
        Math.max(largest, Number(event.event_id) || 0)
    ), 0) + 1;
    const previousEvent = priorEvents[priorEvents.length - 1] || null;

    state.tables.research_audit_event_log.push({
        event_id: eventId,
        event_uuid: nextId(state, 'research_audit_event_log_event'),
        session_id: requested_session_id,
        event_ts_utc: archivedAt,
        server_received_utc: archivedAt,
        client_ts_utc: null,
        actor_pseudonym: `${operatorGrant?.surface || 'operator'}-${String(operatorGrant?.id || authUserId).slice(0, 8)}`,
        actor_role: operatorGrant?.role || operatorGrant?.surface || 'operator',
        actor_team: operatorGrant?.team_id || null,
        actor_seat_index: null,
        event_type: 'SESSION_CLOSED',
        entity_type: 'session',
        entity_id: requested_session_id,
        move_number: null,
        action_sequence: null,
        correlation_id: null,
        causal_event_id: null,
        before_state: {
            id: previousSession.id,
            status: previousSession.status,
            updated_at: previousSession.updated_at
        },
        after_state: {
            id: session.id,
            status: session.status,
            updated_at: session.updated_at
        },
        payload: {
            archive_method: 'operator_rpc',
            closed_seat_count: closedSeatCount
        },
        phase: null,
        prev_event_hash: previousEvent?.event_hash || null,
        event_hash: `mock-session-closed-${eventId}`
    });

    return {
        data: {
            archived_session_id: requested_session_id,
            status: 'archived',
            already_archived: false,
            closed_seat_count: closedSeatCount
        },
        error: null
    };
}

function releaseStaleSessionRoleSeats(state, sessionId, timeoutSeconds = 90) {
    if (isRegionalSession(state, sessionId)) timeoutSeconds = 90;
    const cutoff = Date.now() - (Math.max(timeoutSeconds, 1) * 1000);
    let releasedCount = 0;

    state.tables.session_participants = state.tables.session_participants.map((seat) => {
        if (seat.session_id !== sessionId || seat.is_active !== true) {
            return seat;
        }

        const lastSeen = new Date(seat.heartbeat_at || seat.last_seen || seat.joined_at || 0).getTime();
        if (Number.isNaN(lastSeen) || lastSeen >= cutoff) {
            return seat;
        }

        releasedCount += 1;
        return {
            ...seat,
            is_active: false,
            disconnected_at: seat.disconnected_at || getTimestamp(),
            left_at: seat.left_at || getTimestamp(),
            last_seen: seat.last_seen || seat.heartbeat_at || seat.joined_at || getTimestamp()
        };
    });

    return releasedCount;
}

function buildParticipantSeatPayload(state, seat) {
    if (!seat) {
        return null;
    }

    const participant = state.tables.participants.find((entry) => entry.id === seat.participant_id);

    return {
        ...cloneValue(seat),
        display_name: seat.display_name_snapshot ?? participant?.name ?? 'Unknown',
        client_id: participant?.client_id ?? null
    };
}

function claimSessionRoleSeat(state, {
    requested_session_id,
    requested_role,
    requested_name,
    requested_client_id,
    requested_timeout_seconds = 90
}) {
    const authUserId = getCurrentAuthUserId();
    const normalizedRole = normalizeSeatRole(String(requested_role || '').trim());
    const normalizedName = String(requested_name || '').trim() || null;
    const normalizedClientId = String(requested_client_id || '').trim();
    const roleLimit = getSessionRoleSeatLimit(normalizedRole);

    if (!authUserId) {
        return { data: null, error: { message: 'Browser identity is required.' } };
    }
    if (!requested_session_id) {
        return { data: null, error: { message: 'Session ID is required.' } };
    }
    if (!normalizedRole) {
        return { data: null, error: { message: 'Role is required.' } };
    }
    if (!normalizedClientId) {
        return { data: null, error: { message: 'Client identity is required.' } };
    }
    if (!roleLimit) {
        return { data: null, error: { message: 'This role cannot be claimed in the live demo.' } };
    }
    if (/^whitecell(_lead|_support)?$/.test(normalizedRole)) {
        const grant = getOperatorGrant(state, authUserId, 'whitecell');
        if (!grant
            || grant.session_id !== requested_session_id
            || grant.role !== normalizedRole) {
            return { data: null, error: { message: 'White Cell seats require operator authorization.' } };
        }
    }

    if (SME_OPERATOR_ROLES.has(normalizedRole)) {
        const grant = getOperatorGrant(state, authUserId, 'sme');
        if (!grant
            || grant.session_id !== requested_session_id
            || grant.role !== normalizedRole) {
            return { data: null, error: { message: 'SME seats require operator authorization.' } };
        }
    }

    const session = state.tables.sessions.find((entry) => entry.id === requested_session_id);
    if (!session
        || session.status !== 'active'
        || session.session_classification !== 'live_exercise'
        || session.is_protected === true) {
        return { data: null, error: { message: 'This session is not currently joinable.' } };
    }

    const regional = isRegionalSession(state, requested_session_id);
    const delegation = regionalDelegation(normalizedRole);
    if (!seatModelAllowsRole(session, normalizedRole)) {
        return { data: null, error: { code: '42501', message: 'GC04A_SEAT_MODEL_ROLE_MISMATCH' } };
    }
    if ((!regional && delegation) || (regional && normalizedRole.startsWith('green') && !delegation && normalizedRole !== 'green_shared_facilitator')) {
        return { data: null, error: { code: '42501', message: 'GC03_TOPOLOGY_ROLE_MISMATCH' } };
    }
    if (regional && (!session.green_roster_version || !session.green_roster_snapshot)) {
        return { data: null, error: { code: '23514', message: 'GC02_APPROVED_ROSTER_REQUIRED' } };
    }
    if (state.tables.participants.some((entry) => entry.client_id === normalizedClientId && entry.auth_user_id !== authUserId)) {
        return { data: null, error: { code: '42501', message: 'GC03_CLIENT_IDENTITY_CONFLICT' } };
    }
    releaseStaleSessionRoleSeats(state, requested_session_id, requested_timeout_seconds);

    let participant = state.tables.participants.find((entry) => entry.auth_user_id === authUserId);
    if (!participant) {
        participant = normalizeInsertRow('participants', {
            auth_user_id: authUserId,
            client_id: normalizedClientId,
            name: normalizedName,
            role: normalizedRole
        }, state);
        state.tables.participants.push(participant);
    } else {
        participant = {
            ...participant,
            client_id: normalizedClientId || participant.client_id,
            name: normalizedName ?? participant.name ?? null,
            role: normalizedRole,
            auth_user_id: authUserId,
            updated_at: getTimestamp()
        };
        state.tables.participants = state.tables.participants.map((entry) => (
            entry.id === participant.id ? participant : entry
        ));
    }

    const existingSeat = state.tables.session_participants.find((entry) => (
        entry.session_id === requested_session_id && entry.participant_id === participant.id
    )) || null;

    if (regional && (existingSeat?.revoked_at || existingSeat && existingSeat.role !== normalizedRole)) {
        return { data: null, error: { code: '42501', message: existingSeat.revoked_at ? 'GC03_SEAT_REVOKED' : 'GC03_SEAT_ROLE_IMMUTABLE' } };
    }

    const activeClaimCount = state.tables.session_participants.filter((entry) => (
        entry.session_id === requested_session_id &&
        entry.role === normalizedRole &&
        entry.is_active === true &&
        (!existingSeat || entry.id !== existingSeat.id)
    )).length;

    if (activeClaimCount >= roleLimit) {
        return {
            data: null,
            error: { message: 'The requested role is full. Please choose another seat.' }
        };
    }

    let seat = existingSeat;
    let claimStatus = 'claimed';
    const now = getTimestamp();

    if (regional) {
        state.tables.session_participants.forEach((entry) => {
            if (entry.session_id === requested_session_id && entry.role === normalizedRole && !entry.is_active && entry.id !== seat?.id) {
                entry.revoked_at ||= now;
            }
        });
    }

    if (!seat) {
        seat = normalizeInsertRow('session_participants', {
            session_id: requested_session_id,
            participant_id: participant.id,
            role: normalizedRole,
            delegation_id: delegation,
            display_name_snapshot: normalizedName ?? participant.name ?? 'Unknown',
            is_active: true,
            heartbeat_at: now,
            joined_at: now,
            last_seen: now,
            disconnected_at: null,
            left_at: null
        }, state);
        state.tables.session_participants.push(seat);
    } else {
        const roleChanged = seat.role !== normalizedRole;
        claimStatus = seat.is_active && seat.role === normalizedRole
            ? 'refreshed'
            : (seat.role === normalizedRole ? 'rejoined' : 'reassigned');
        seat = {
            ...seat,
            role: normalizedRole,
            display_name_snapshot: roleChanged
                ? (normalizedName ?? participant.name ?? 'Unknown')
                : seat.display_name_snapshot,
            is_active: true,
            heartbeat_at: now,
            last_seen: now,
            disconnected_at: null,
            left_at: null,
            updated_at: now
        };
        state.tables.session_participants = state.tables.session_participants.map((entry) => (
            entry.id === seat.id ? seat : entry
        ));
    }

    return {
        data: {
            ...buildParticipantSeatPayload(state, seat),
            seat_limit: roleLimit,
            active_count: activeClaimCount + 1,
            claim_status: claimStatus,
            green_seat_model: greenSeatModel(session)
        },
        error: null
    };
}

function heartbeatSessionRoleSeat(state, {
    requested_session_id,
    requested_session_participant_id,
    requested_client_id,
    requested_timeout_seconds = 90
}) {
    const authUserId = getCurrentAuthUserId();
    if (!requested_session_id || !requested_session_participant_id) {
        return {
            data: null,
            error: { message: 'A claimed seat is required to send heartbeats.' }
        };
    }

    const session = state.tables.sessions.find((entry) => entry.id === requested_session_id);
    if (session?.status !== 'active' || session.is_protected || session.session_classification !== 'live_exercise') {
        return { data: null, error: { code: '42501', message: 'This session is not currently joinable.' } };
    }
    if (isRegionalSession(state, requested_session_id)
        && getParticipantSeatForSession(state, authUserId, requested_session_id)?.id !== requested_session_participant_id) {
        return { data: null, error: { code: '42501', message: 'GC03_SEAT_REJOIN_REQUIRED' } };
    }

    releaseStaleSessionRoleSeats(state, requested_session_id, requested_timeout_seconds);

    const seat = state.tables.session_participants.find((entry) => (
        entry.id === requested_session_participant_id && entry.session_id === requested_session_id
    ));
    const participant = seat
        ? state.tables.participants.find((entry) => entry.id === seat.participant_id)
        : null;

    if (!authUserId || !seat || !participant || participant.auth_user_id !== authUserId) {
        return {
            data: null,
            error: { message: 'Participant seat not found. Please rejoin the session.' }
        };
    }

    // A revocation marker is terminal for every topology. Legacy unified seats
    // may otherwise enter the stale-seat recovery branch and be reactivated.
    if (seat.revoked_at) {
        return { data: null, error: { code: '42501', message: 'GC03_SEAT_REJOIN_REQUIRED' } };
    }

    if (seat.is_active !== true) {
        const roleLimit = getSessionRoleSeatLimit(seat.role) || 1;
        const activeClaimCount = state.tables.session_participants.filter((entry) => (
            entry.session_id === requested_session_id &&
            entry.role === seat.role &&
            entry.is_active === true &&
            entry.id !== seat.id
        )).length;

        if (activeClaimCount >= roleLimit) {
            return {
                data: null,
                error: { message: 'This seat is no longer available. Please rejoin the session.' }
            };
        }
    }

    const now = getTimestamp();
    const updatedSeat = {
        ...seat,
        is_active: true,
        heartbeat_at: now,
        last_seen: now,
        disconnected_at: null,
        left_at: null,
        updated_at: now
    };

    state.tables.session_participants = state.tables.session_participants.map((entry) => (
        entry.id === updatedSeat.id ? updatedSeat : entry
    ));

    return {
        data: buildParticipantSeatPayload(state, updatedSeat),
        error: null
    };
}

function disconnectSessionRoleSeat(state, {
    requested_session_id,
    requested_session_participant_id,
    requested_client_id,
    requested_timeout_seconds = 90
}) {
    const authUserId = getCurrentAuthUserId();
    const session = state.tables.sessions.find((entry) => entry.id === requested_session_id);
    if (session?.status !== 'active' || session.is_protected || session.session_classification !== 'live_exercise') {
        return { data: null, error: { code: '42501', message: 'This session is not currently joinable.' } };
    }
    if (!requested_session_id || !requested_session_participant_id) {
        return { data: null, error: null };
    }

    releaseStaleSessionRoleSeats(state, requested_session_id, requested_timeout_seconds);

    const seat = state.tables.session_participants.find((entry) => (
        entry.id === requested_session_participant_id && entry.session_id === requested_session_id
    ));
    const participant = seat
        ? state.tables.participants.find((entry) => entry.id === seat.participant_id)
        : null;

    if (!authUserId || !seat || !participant || participant.auth_user_id !== authUserId) {
        return { data: null, error: null };
    }

    const now = getTimestamp();
    const updatedSeat = {
        ...seat,
        is_active: false,
        disconnected_at: now,
        left_at: seat.left_at || now,
        last_seen: seat.last_seen || now,
        updated_at: now
    };

    state.tables.session_participants = state.tables.session_participants.map((entry) => (
        entry.id === updatedSeat.id ? updatedSeat : entry
    ));

    return {
        data: buildParticipantSeatPayload(state, updatedSeat),
        error: null
    };
}

function operatorRemoveSessionParticipant(state, {
    requested_session_id,
    requested_session_participant_id
}) {
    const authUserId = getCurrentAuthUserId();
    const regional = isRegionalSession(state, requested_session_id);
    const session = state.tables.sessions.find((entry) => entry.id === requested_session_id);
    if (session?.status !== 'active' || session.is_protected || session.session_classification !== 'live_exercise') {
        return { data: null, error: { code: '42501', message: 'This session is not currently joinable.' } };
    }
    if (regional && !regionalOperator(state, authUserId, requested_session_id)) {
        return { data: null, error: { code: '42501', message: 'Session operator authorization is required.' } };
    }
    if (!hasPrivilegedSessionAdminGrant(state, authUserId)) {
        return { data: null, error: { message: 'Game Master or White Cell authorization is required.' } };
    }

    if (!requested_session_id || !requested_session_participant_id) {
        return {
            data: null,
            error: { message: 'Session and participant seat identifiers are required.' }
        };
    }

    const seat = state.tables.session_participants.find((entry) => (
        entry.id === requested_session_participant_id && entry.session_id === requested_session_id
    ));

    if (!seat) {
        return {
            data: null,
            error: { message: 'Participant seat not found for this session.' }
        };
    }

    const participant = state.tables.participants.find((entry) => entry.id === seat.participant_id);
    const removedAt = getTimestamp();
    if (!regional) {
        if (state.tables.gc08_unified_seat_removals.some((entry) => entry.seat_id === seat.id)) {
            return { data: null, error: { code: '23505', message: 'Duplicate immutable removal receipt.' } };
        }
        state.tables.gc08_unified_seat_removals.push({
            seat_id: seat.id, session_id: seat.session_id, participant_id: seat.participant_id,
            role: seat.role, delegation_id: seat.delegation_id ?? null,
            session_topology_version: session.session_topology_version ?? null,
            display_name_snapshot: seat.display_name_snapshot ?? null,
            joined_at: seat.joined_at ?? null, removed_at: removedAt, removed_by_auth_user_id: authUserId
        });
    }
    const removedSeat = {
        ...seat,
        is_active: false,
        last_seen: seat.last_seen || seat.heartbeat_at || seat.joined_at || removedAt,
        disconnected_at: removedAt,
        left_at: removedAt,
        updated_at: removedAt
    };

    state.tables.session_participants = regional
        ? state.tables.session_participants.map((entry) => entry.id === seat.id ? { ...removedSeat, revoked_at: seat.revoked_at || removedAt } : entry)
        : state.tables.session_participants.filter((entry) => entry.id !== seat.id);

    if (participant?.auth_user_id) {
        state.tables.operator_grants = state.tables.operator_grants.filter((entry) => !(
            entry.auth_user_id === participant.auth_user_id
            && (entry.surface === 'whitecell' || regional && entry.surface === 'sme')
            && entry.session_id === requested_session_id
        ));
    }

    return {
        data: {
            ...buildParticipantSeatPayload(state, removedSeat),
            removed_at: removedAt
        },
        error: null
    };
}

function listActiveSessionParticipants(state, {
    requested_session_id,
    requested_timeout_seconds = 90
}) {
    const authUserId = getCurrentAuthUserId();
    if (!requested_session_id) {
        return { data: [], error: null };
    }

    if (!liveDemoCanReadSession(state, authUserId, requested_session_id)) {
        return {
            data: null,
            error: { message: 'Session access is required.' }
        };
    }

    releaseStaleSessionRoleSeats(state, requested_session_id, requested_timeout_seconds);

    return {
        data: state.tables.session_participants
            .filter((entry) => entry.session_id === requested_session_id && entry.is_active === true)
            .map((entry) => buildParticipantSeatPayload(state, entry)),
        error: null
    };
}


function isRegionalProposal(action) {
    return action?.team === 'green' && ['asian_pacific', 'europe'].includes(action.delegation_id)
        && action.artifact_type === 'proposal' && Boolean(parseProposalDetails(action.ally_contingencies));
}

function regionalProposalRoster(state, params) {
    const sid = params.requested_session_id, delegation = params.requested_delegation_id;
    const seat = getParticipantSeatForSession(state, getCurrentAuthUserId(), sid);
    const session = state.tables.sessions.find((row) => row.id === sid);
    if (!seat || !isRegionalSession(state, sid) || !['asian_pacific', 'europe'].includes(delegation)
        || !['green_shared_facilitator', 'green_' + delegation + '_scribe', 'green_' + delegation + '_facilitator'].includes(seat.role)) {
        return { data: null, error: { code: '42501', message: 'GC06_ROSTER_SCOPE_DENIED' } };
    }
    const members = session.green_roster_snapshot?.[delegation];
    if (!session.green_roster_version || !Array.isArray(members) || !members.length) {
        return { data: null, error: { code: '23514', message: 'GC06_APPROVED_SESSION_ROSTER_REQUIRED' } };
    }
    return { data: { members, aliases: session.green_roster_snapshot.aliases || {} }, error: null };
}

function regionalProposalOperation(state, params) {
    const roster = regionalProposalRoster(state, params);
    if (roster.error) return roster;
    const sid = params.requested_session_id, delegation = params.requested_delegation_id;
    const auth = getCurrentAuthUserId(), seat = getParticipantSeatForSession(state, auth, sid);
    const operation = params.requested_operation, payload = params.requested_payload || {};
    const denied = (code = '42501', message = 'GC06_PROPOSAL_SCOPE_DENIED') => ({ data: null, error: { code, message } });
    const scribe = seat.role === 'green_' + delegation + '_scribe';
    const facilitator = ['green_shared_facilitator', 'green_' + delegation + '_facilitator'].includes(seat.role);
    if (!(scribe && ['save', 'forward'].includes(operation) || facilitator && ['edit', 'submit'].includes(operation))) return denied();
    let action = state.tables.actions.find((a) => a.id === params.requested_action_id);
    if (params.requested_action_id != null) {
        if (!action || action.session_id !== sid || action.delegation_id !== delegation || action.is_deleted || !isRegionalProposal(action)) return denied();
        if (action.revision_number !== params.requested_expected_revision || action.row_version !== params.requested_expected_row_version) return denied('PT409', 'GC06_STALE_PROPOSAL_REVISION');
        if (action.status !== 'draft' || !(scribe && ['draft', 'returned_to_team'].includes(action.workflow_state)
            || facilitator && ['forwarded_to_facilitator', 'returned_to_team'].includes(action.workflow_state))) return denied('23514', 'GC06_PROPOSAL_STATE_DENIED');
    } else if (!scribe || params.requested_expected_revision != null || params.requested_expected_row_version != null) return denied();
    const old = action;
    if (operation === 'submit') {
        if (Object.keys(payload).length) return denied();
        const legacyPair = state.tables.sessions.some((s) => s.id === sid && greenSeatModel(s) === 'regional_pairs_v1')
            && action.proposal_handoff_revision == null && action.revision_number === 1 && action.workflow_state === 'forwarded_to_facilitator';
        if (action.proposal_handoff_revision !== action.revision_number && !legacyPair) return denied('23514', 'GC06_SCRIBE_HANDOFF_REQUIRED');
        action = { ...action, status: 'submitted', submitted_at: getTimestamp(), submitted_by_auth_user_id: auth, submitted_by_role: seat.role,
            workflow_state: action.workflow_state === 'returned_to_team' ? 'resubmitted' : 'submitted_to_white_cell' };
    } else {
        if (Object.keys(payload).some((key) => !['goal', 'sector', 'expected_outcomes', 'ally_contingencies'].includes(key))) return denied();
        for (const label of ['Originators','Recipient Teams','Focus Sectors','Supply Chain Areas']) {
            const raw = readLegacyActionDetail(payload.ally_contingencies, label);
            let values;
            try { values = raw?.startsWith('[') ? JSON.parse(raw) : readLegacyActionList(payload.ally_contingencies,label); }
            catch (_error) { return denied('23514','GC06_PROPOSAL_DETAILS_REQUIRED'); }
            if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value.trim())
                || label === 'Recipient Teams' && values.some((value) => !['blue','red'].includes(value))) return denied('23514','GC06_PROPOSAL_DETAILS_REQUIRED');
        }
        const proposal = parseProposalDetails(payload.ally_contingencies);
        if (!proposal || proposal.scribeHandoff !== (operation === 'save' ? 'Draft' : 'Forwarded')) return denied('23514', 'GC06_PROPOSAL_DETAILS_REQUIRED');
        if (!proposal.originators.length || proposal.originators.some((origin) => !roster.data.members.includes(roster.data.aliases[origin] || origin))) return denied('23514', 'GC06_INVALID_ORIGINATOR');
        if (!payload.goal?.trim() || !payload.expected_outcomes?.trim() || !proposal.objective || !proposal.intendedPartners
            || !proposal.timingAndConditions || !proposal.recipientTeams.length || !proposal.focusSectors.length
            || !['Yes','No'].includes(proposal.supplyChainFocusDecision) || proposal.supplyChainFocusDecision === 'Yes' && !proposal.supplyChainAreas.length) return denied('23514', 'GC06_PROPOSAL_DETAILS_REQUIRED');
        if (!action) {
            if (!params.requested_client_key?.trim()) return denied('22023', 'GC06_CLIENT_KEY_REQUIRED');
            const key = 'gc06:' + delegation + ':' + seat.id + ':' + params.requested_client_key;
            const retry = state.tables.actions.find((a) => a.session_id === sid && a.idempotency_key === key);
            if (retry) return retry.goal === payload.goal && retry.ally_contingencies === payload.ally_contingencies && retry.expected_outcomes === payload.expected_outcomes
                ? { data: cloneValue(retry), error: null } : denied('PT409', 'GC06_IDEMPOTENCY_CONFLICT');
            const game = state.tables.game_state.find((g) => g.session_id === sid);
            if (!game) return denied('23514', 'Game state required');
            action = normalizeInsertRow('actions', { session_id: sid, delegation_id: delegation, team: 'green',
                artifact_type: 'proposal', status: 'draft', mechanism: 'Proposal', move: game.move, phase: game.phase,
                idempotency_key: key }, state);
        }
        action = { ...action, ...payload, sector: proposal.focusSectors[0], proposal_recipient_team: proposal.recipientTeams[0],
            artifact_payload: { ...action.artifact_payload, proposal },
            proposal_handoff_revision: scribe ? (operation === 'forward' ? action.revision_number : null) : action.proposal_handoff_revision,
            workflow_state: action.workflow_state === 'returned_to_team' ? 'returned_to_team' : operation === 'save' ? 'draft' : 'forwarded_to_facilitator' };
    }
    action = { ...action, updated_at: getTimestamp(), row_version: old ? old.row_version + 1 : 1,
        last_modified_by_auth_user_id: auth, last_modified_by_role: seat.role };
    const index = state.tables.actions.findIndex((a) => a.id === action.id);
    if (index < 0) state.tables.actions.push(action); else state.tables.actions[index] = action;
    return { data: cloneValue(action), error: null };
}

function regionalThreadSource(state, row, current = false) {
    const m = row.metadata || {};
    const source = state.tables.actions.find((a) => a.id === m.source_proposal_id && a.session_id === row.session_id
        && a.artifact_type === 'proposal' && !a.is_deleted && a.team === m.source_team && a.team === row.owner_team
        && (a.delegation_id ?? null) === (row.delegation_id ?? null));
    const root = state.tables.communications.find((r) => r.session_id === row.session_id && r.type === 'PROPOSAL_FORWARDED'
        && r.metadata?.source_proposal_id === source?.id && r.metadata?.thread_id === m.thread_id
        && r.metadata?.recipient_team === m.recipient_team && r.metadata?.source_revision === m.source_revision
        && (r.delegation_id ?? null) === (source?.delegation_id ?? null));
    return Boolean(source && root && (!current || ['submitted', 'adjudicated'].includes(source.status)
        && source.revision_number === Number(m.source_revision)
        && source.artifact_payload?.proposal_recipient_reviews?.[m.recipient_team]?.thread_id === m.thread_id));
}

function isRegionalOrientation(action) {
    return action?.team === 'green' && ['asian_pacific', 'europe'].includes(action.delegation_id)
        && ['strategic_orientation_selection', 'strategic_orientation_forecast'].includes(action.artifact_type)
        && Boolean(parseStrategicOrientationDetails(action.ally_contingencies));
}

function orientationCompletion(state, sessionId) {
    const session = state.tables.sessions.find((s) => s.id === sessionId);
    return getStrategicOrientationCompletion(state.tables.actions, session || { id: sessionId });
}

function orientationGateError(state, next, old = null) {
    if (old && next.session_id === old.session_id && next.move === old.move && next.phase === old.phase || next.move === 1 && next.phase === 1) return null;
    const result = orientationCompletion(state, next.session_id);
    return result.complete ? null : { code: '23514', message: `Strategic Orientation submissions missing: ${result.missingTeams.join(', ')}` };
}

function industryProposalMoveGateError(state, next, old = null) {
    if (!old || next.session_id !== old.session_id || Number(next.move) <= Number(old.move)) return null;

    const coverage = getIndustryMoveCoverage(
        state.tables.actions.filter((action) => action.session_id === old.session_id),
        old.move
    );
    if (coverage.complete) return null;

    return {
        code: '23514',
        message: `INDUSTRY_PROPOSALS_INCOMPLETE: ${coverage.missing.map(({ value }) => value).join(', ')}`
    };
}

function regionalOrientationOperation(state, params, operation) {
    const auth = getCurrentAuthUserId();
    const sid = params.requested_session_id;
    const delegation = params.requested_delegation_id;
    const seat = getParticipantSeatForSession(state, auth, sid);
    const session = state.tables.sessions.find((s) => s.id === sid);
    const denied = (code = '42501', message = 'GC05_ORIENTATION_SCOPE_DENIED') => ({ data: null, error: { code, message } });
    if (!seat || !session?.green_roster_version || !session.green_roster_snapshot
        || !isRegionalSession(state, sid) || !['asian_pacific', 'europe'].includes(delegation)) return denied();
    const allowed = operation === 'handoff'
        ? seat.role === `green_${delegation}_scribe` && seat.delegation_id === delegation
        : seat.role === `green_${delegation}_facilitator` && seat.delegation_id === delegation
            || seat.role === 'green_shared_facilitator'
                && state.tables.sessions.some((s) => s.id === sid && s.green_seat_model === 'shared_facilitator_v1');
    if (!allowed) return denied();
    let action = state.tables.actions.find((a) => a.id === params.requested_action_id);
    if (params.requested_action_id != null) {
        if (!action || action.session_id !== sid || action.delegation_id !== delegation || action.is_deleted
            || !isRegionalOrientation(action)) return denied();
        if (action.revision_number !== params.requested_expected_revision || action.row_version !== params.requested_expected_row_version) {
            return denied('PT409', 'GC05_STALE_ORIENTATION_REVISION');
        }
    } else if (operation !== 'handoff') return denied();
    const timestamp = getTimestamp();
    if (operation === 'handoff') {
        const details = parseStrategicOrientationDetails(params.requested_details);
        if (!details || details.team !== 'green' || details.contractVersion !== 2
            || details.artifactType !== 'orientation_and_forecast' || details.period !== 'pre_move_1'
            || !details.ownOrientation || details.forecastTargets.length !== 1
            || details.forecastTargets[0].key !== 'blue' || !details.strategyDescription || details.scribeHandoff !== 'Forwarded') {
            return denied('23514', 'GC05_ORIENTATION_DETAILS_REQUIRED');
        }
        if (!action) {
            if (params.requested_expected_revision != null || params.requested_expected_row_version != null) return denied('PT409', 'GC05_NEW_ORIENTATION_VERSION');
            if (state.tables.actions.some((a) => a.session_id === sid && a.delegation_id === delegation
                && !a.is_deleted && isRegionalOrientation(a))) return denied('23505', 'GC05_DUPLICATE_ORIENTATION');
            const game = state.tables.game_state.find((g) => g.session_id === sid);
            if (!game || game.move !== 1 || game.phase !== 1) return denied('23514', 'Orientation requires initial game state.');
            action = normalizeInsertRow('actions', { session_id: sid, team: 'green', delegation_id: delegation,
                move: 1, phase: 1, status: 'draft', artifact_type: 'strategic_orientation_forecast',
                mechanism: 'Strategic Orientation', sector: '', exposure_type: 'pre_move_1',
                created_by_auth_user_id: auth, created_by_role: seat.role }, state);
        } else {
            if (action.status !== 'draft' || !['draft', 'returned_to_team'].includes(action.workflow_state)) return denied('23514', 'GC05_ORIENTATION_HANDOFF_STATE');
            action = { ...action, row_version: action.row_version + 1 };
        }
        action = { ...action, goal: params.requested_goal, ally_contingencies: params.requested_details,
            expected_outcomes: details.ownOrientation.tag, orientation_handoff_revision: action.revision_number,
            workflow_state: action.workflow_state === 'returned_to_team' ? 'returned_to_team' : 'forwarded_to_facilitator' };
    } else {
        const pairedLegacyHandoff = state.tables.sessions.some((s) => s.id === sid && greenSeatModel(s) === 'regional_pairs_v1')
            && action.orientation_handoff_revision == null && action.revision_number === 1 && action.workflow_state === 'forwarded_to_facilitator';
        if (action.status !== 'draft' || !['forwarded_to_facilitator', 'returned_to_team'].includes(action.workflow_state)
            || action.orientation_handoff_revision !== action.revision_number && !pairedLegacyHandoff) return denied('23514', 'GC05_ORIENTATION_HANDOFF_REQUIRED');
        action = { ...action, status: 'submitted', row_version: action.row_version + 1,
            workflow_state: action.workflow_state === 'returned_to_team' ? 'resubmitted' : 'submitted_to_white_cell',
            submitted_at: timestamp, submitted_by_auth_user_id: auth, submitted_by_role: seat.role };
    }
    action = { ...action, updated_at: timestamp, last_modified_by_auth_user_id: auth, last_modified_by_role: seat.role };
    const index = state.tables.actions.findIndex((a) => a.id === action.id);
    if (index < 0) state.tables.actions.push(action); else state.tables.actions[index] = action;
    return { data: cloneValue(action), error: null };
}

function operatorUpdateGameState(state, params) {
    const authUserId = getCurrentAuthUserId();
    const grant = getOperatorGrant(state, authUserId, 'whitecell');
    const sessionId = params?.requested_session_id;

    if (!grant || grant.session_id !== sessionId) {
        return { data: null, error: { message: 'White Cell operator authorization is required.' } };
    }

    const gameState = state.tables.game_state.find((entry) => entry.session_id === sessionId);
    if (!gameState) {
        return { data: null, error: { message: 'Game state not found for this session.' } };
    }

    const updated = {
        ...gameState,
        move: params?.requested_move ?? gameState.move,
        phase: params?.requested_phase ?? gameState.phase,
        timer_seconds: params?.requested_timer_seconds ?? gameState.timer_seconds,
        timer_allocations: params?.requested_timer_allocations ?? gameState.timer_allocations ?? cloneValue(DEFAULT_TIMER_ALLOCATIONS),
        plugin_state: params?.requested_plugin_state ?? gameState.plugin_state ?? cloneValue(DEFAULT_PLUGIN_STATE),
        timer_running: params?.requested_timer_running ?? gameState.timer_running,
        timer_last_update: params?.requested_timer_last_update ?? gameState.timer_last_update,
        last_updated: getTimestamp(),
        updated_at: getTimestamp()
    };

    const gateError = orientationGateError(state, updated, gameState);
    if (gateError) return { data: null, error: gateError };
    const industryGateError = industryProposalMoveGateError(state, updated, gameState);
    if (industryGateError) return { data: null, error: industryGateError };

    state.tables.game_state = state.tables.game_state.map((entry) => (
        entry.id === updated.id ? updated : entry
    ));

    return {
        data: cloneValue(updated),
        error: null
    };
}

function operatorAdjudicateAction(state, params) {
    const authUserId = getCurrentAuthUserId();
    const grant = getOperatorGrant(state, authUserId, 'whitecell');
    const action = state.tables.actions.find((entry) => (
        entry.id === params?.requested_action_id && entry.is_deleted !== true
    ));

    if (!action) {
        return { data: null, error: { message: 'Action not found.' } };
    }

    if (!grant || grant.session_id !== action.session_id) {
        return { data: null, error: { message: 'White Cell operator authorization is required.' } };
    }
    if (action.status !== 'submitted') {
        return { data: null, error: { message: 'Only submitted actions can be adjudicated.' } };
    }

    const updated = {
        ...action,
        status: 'adjudicated',
        outcome: params?.requested_outcome ?? null,
        adjudication_notes: params?.requested_adjudication_notes ?? null,
        adjudicated_at: params?.requested_adjudicated_at ?? getTimestamp(),
        updated_at: getTimestamp()
    };

    state.tables.actions = state.tables.actions.map((entry) => (
        entry.id === updated.id ? updated : entry
    ));

    return {
        data: cloneValue(updated),
        error: null
    };
}

function operatorReviewArtifact(state, params) {
    const authUserId = getCurrentAuthUserId();
    const grant = getOperatorGrant(state, authUserId, 'whitecell');
    const kind = String(params?.requested_artifact_kind || '').trim().toLowerCase();
    const decision = String(params?.requested_review_decision || '').trim().toLowerCase();
    const team = String(params?.requested_team || '').trim().toLowerCase();
    const notes = String(params?.requested_reviewer_notes || '').trim();
    const expectedRevision = Number(params?.requested_expected_revision);

    if (!['action', 'strategic_orientation', 'rfi'].includes(kind)) {
        return { data: null, error: { message: 'Unsupported artifact kind.' } };
    }
    if (!['complete', 'return_to_team', 'return_for_clarification'].includes(decision)) {
        return { data: null, error: { message: 'Unsupported artifact review decision.' } };
    }
    if (!['blue', 'red', 'green', 'industry'].includes(team)) {
        return { data: null, error: { message: 'A valid submitting team is required.' } };
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        return { data: null, error: { message: 'Expected revision number is required.' } };
    }
    if (['return_to_team', 'return_for_clarification'].includes(decision) && !notes) {
        return { data: null, error: { message: 'Reviewer notes are required for every return.' } };
    }

    if (kind === 'rfi') {
        const request = state.tables.requests.find((entry) => (
            entry.id === params?.requested_artifact_id
        ));

        if (!request) {
            return { data: null, error: { message: 'RFI not found.' } };
        }
        if (request.team === 'green' && isRegionalSession(state, request.session_id)) {
            const seat = getParticipantSeatForSession(state, authUserId, request.session_id);
            if (!seat || !['whitecell_lead', 'whitecell_support'].includes(seat.role)) return gc07Error();
        }
        if (!grant || grant.session_id !== request.session_id) {
            return { data: null, error: { message: 'White Cell operator authorization is required.' } };
        }
        if (String(request.team || '').trim().toLowerCase() !== team) {
            return { data: null, error: { message: 'Requested team does not match the RFI submitting team.' } };
        }
        if (decision !== 'return_for_clarification') {
            return { data: null, error: { message: 'RFIs use return_for_clarification.' } };
        }

        const priorWorkflowState = request.workflow_state
            || (request.status === 'pending' ? 'submitted_to_white_cell' : 'completed');
        if (['answered', 'withdrawn'].includes(request.status) || priorWorkflowState === 'completed') {
            return { data: null, error: { message: 'Completed artifacts are immutable.' } };
        }
        if (!['submitted_to_white_cell', 'resubmitted'].includes(priorWorkflowState)) {
            return { data: null, error: { message: 'Only submitted RFIs can be returned for clarification.' } };
        }

        const revisionNumber = Number.isInteger(request.revision_number)
            ? request.revision_number
            : 1;
        if (revisionNumber !== expectedRevision) {
            return {
                data: null,
                error: { code: 'PT409', message: `Stale artifact revision. Expected ${expectedRevision}, current ${revisionNumber}.` }
            };
        }

        const timestamp = getTimestamp();
        const updatedRequest = {
            ...request,
            status: 'pending',
            workflow_state: 'returned_to_team',
            revision_number: revisionNumber + 1,
            prior_workflow_state: priorWorkflowState,
            reviewed_at: timestamp,
            reviewed_by_auth_user_id: authUserId,
            reviewed_by_role: grant.role,
            review_notes: notes,
            completed_at: null,
            response: null,
            responded_at: null,
            answered_at: null,
            response_time_seconds: null,
            updated_at: timestamp
        };
        const review = normalizeInsertRow('artifact_workflow_reviews', {
            session_id: request.session_id,
            artifact_kind: 'rfi',
            artifact_id: request.id,
            artifact_type: 'rfi',
            team,
            decision,
            revision_number: revisionNumber,
            next_revision_number: revisionNumber + 1,
            prior_status: request.status,
            status_to: updatedRequest.status,
            prior_workflow_state: priorWorkflowState,
            workflow_state_to: updatedRequest.workflow_state,
            reviewer_auth_user_id: authUserId,
            reviewer_role: grant.role,
            reviewer_notes: notes,
            reviewed_at: timestamp,
            prior_state: cloneValue(request),
            new_state: cloneValue(updatedRequest)
        }, state);

        state.tables.requests = state.tables.requests.map((entry) => (
            entry.id === updatedRequest.id ? updatedRequest : entry
        ));
        state.tables.artifact_workflow_reviews.push(review);

        return {
            data: { artifact: cloneValue(updatedRequest), review: cloneValue(review) },
            error: null
        };
    }

    const action = state.tables.actions.find((entry) => (
        entry.id === params?.requested_artifact_id && entry.is_deleted !== true
    ));
    if (!action) {
        return { data: null, error: { message: 'Artifact not found.' } };
    }
    if (!grant || grant.session_id !== action.session_id) {
        return { data: null, error: { message: 'White Cell operator authorization is required.' } };
    }
    if ((kind === 'strategic_orientation' || isRegionalProposal(action)) && isRegionalSession(state, action.session_id)
        && (getLiveDemoParticipantSurface(state, authUserId, action.session_id) !== 'whitecell'
            || isRegionalProposal(action) && params.requested_expected_revision == null)) {
        return { data: null, error: { code: '42501', message: 'An active White Cell session seat is required.' } };
    }
    if (String(action.team || '').trim().toLowerCase() !== team) {
        return { data: null, error: { message: 'Requested team does not match the artifact submitting team.' } };
    }

    const artifactType = action.artifact_type || 'action';
    if (
        kind === 'action'
        && !(
            (['action', 'move_response'].includes(artifactType) && ['blue', 'red'].includes(team))
            || (artifactType === 'proposal' && ['green', 'industry'].includes(team))
        )
    ) {
        return { data: null, error: { message: 'Artifact type and submitting team do not match the action review path.' } };
    }
    if (
        kind === 'strategic_orientation'
        && !['strategic_orientation_selection', 'strategic_orientation_forecast'].includes(artifactType)
    ) {
        return { data: null, error: { message: 'Artifact kind does not match the stored Strategic Orientation type.' } };
    }
    if (decision === 'return_for_clarification') {
        return { data: null, error: { message: 'Action artifacts use return_to_team.' } };
    }
    if (action.workflow_state === 'completed') {
        return { data: null, error: { message: 'Completed artifacts are immutable.' } };
    }

    const revisionNumber = Number.isInteger(action.revision_number)
        ? action.revision_number
        : 1;
    if (revisionNumber !== expectedRevision) {
        return {
            data: null,
            error: { code: 'PT409', message: `Stale artifact revision. Expected ${expectedRevision}, current ${revisionNumber}.` }
        };
    }
    if (
        decision === 'complete'
        && (action.status !== 'submitted'
            || !['submitted_to_white_cell', 'resubmitted'].includes(action.workflow_state))
    ) {
        return { data: null, error: { message: 'Only submitted artifacts can be completed.' } };
    }
    if (decision === 'return_to_team' && !['submitted', 'adjudicated'].includes(action.status)) {
        return { data: null, error: { message: 'Only submitted artifacts can be returned to their team.' } };
    }

    const timestamp = getTimestamp();
    const isReturn = decision === 'return_to_team';
    const nextRevision = isReturn ? revisionNumber + 1 : revisionNumber;
    const adjudication = { ...(action.adjudication || {}) };
    delete adjudication.outcome;
    Object.assign(adjudication, {
        artifact_review_decision: decision,
        artifact_reviewed_at: timestamp,
        artifact_reviewed_by_role: grant.role,
        artifact_reviewed_by_auth_user_id: authUserId,
        artifact_review_revision: revisionNumber,
        prior_status: action.status,
        prior_workflow_state: action.workflow_state
    });
    if (notes) adjudication.artifact_review_notes = notes;

    const updatedAction = {
        ...action,
        status: isReturn ? 'draft' : 'adjudicated',
        orientation_handoff_revision: isReturn ? null : action.orientation_handoff_revision,
        ...(isRegionalProposal(action) ? {
            proposal_handoff_revision: isReturn ? null : action.proposal_handoff_revision,
            artifact_payload: isReturn ? { ...action.artifact_payload,
                proposal_recipient_review_history: { ...action.artifact_payload?.proposal_recipient_review_history,
                    [action.revision_number]: action.artifact_payload?.proposal_recipient_reviews || {} },
                proposal_recipient_reviews: {} } : action.artifact_payload
        } : {}),
        workflow_state: isReturn ? 'returned_to_team' : 'completed',
        revision_number: nextRevision,
        prior_workflow_state: action.workflow_state,
        reviewed_at: timestamp,
        reviewed_by_auth_user_id: authUserId,
        reviewed_by_role: grant.role,
        review_notes: notes || null,
        completed_at: isReturn ? null : timestamp,
        outcome: null,
        submitted_at: isReturn ? null : action.submitted_at,
        adjudicated_at: isReturn ? null : timestamp,
        adjudication_notes: notes || null,
        adjudication,
        row_version: (Number.isInteger(action.row_version) ? action.row_version : 1) + 1,
        updated_at: timestamp
    };
    const review = normalizeInsertRow('artifact_workflow_reviews', {
        session_id: action.session_id,
        delegation_id: action.delegation_id ?? null,
        artifact_kind: kind,
        artifact_id: action.id,
        artifact_type: artifactType,
        team,
        decision,
        revision_number: revisionNumber,
        next_revision_number: nextRevision,
        prior_status: action.status,
        status_to: updatedAction.status,
        prior_workflow_state: action.workflow_state,
        workflow_state_to: updatedAction.workflow_state,
        reviewer_auth_user_id: authUserId,
        reviewer_role: grant.role,
        reviewer_notes: notes || null,
        reviewed_at: timestamp,
        prior_state: cloneValue(action),
        new_state: cloneValue(updatedAction)
    }, state);

    state.tables.actions = state.tables.actions.map((entry) => (
        entry.id === updatedAction.id ? updatedAction : entry
    ));
    if (isReturn) {
        state.tables.pli_adjudications = state.tables.pli_adjudications.filter((row) => (
            row.action_id !== updatedAction.id
        ));
    }
    state.tables.artifact_workflow_reviews.push(review);

    return {
        data: { artifact: cloneValue(updatedAction), review: cloneValue(review) },
        error: null
    };
}

function operatorCompleteActionWithNotifications(state, params) {
    const action = state.tables.actions.find((entry) => (
        entry.id === params?.requested_action_id && entry.is_deleted !== true
    ));
    if (!action) {
        return { data: null, error: { message: 'Action not found.' } };
    }

    const approvedTeams = [...new Set((Array.isArray(params?.requested_notification_teams)
        ? params.requested_notification_teams
        : [])
        .map((team) => String(team || '').trim().toLowerCase())
        .filter(Boolean))].sort();
    if (approvedTeams.some((team) => !['green', 'industry'].includes(team))) {
        return { data: null, error: { message: 'Action notifications are limited to Green and Industry.' } };
    }

    const authoredTeams = new Set((Array.isArray(action?.artifact_payload?.action?.notificationTeams)
        ? action.artifact_payload.action.notificationTeams
        : [])
        .map((team) => String(team || '').trim().toLowerCase())
        .filter((team) => ['green', 'industry'].includes(team)));
    if (approvedTeams.some((team) => !authoredTeams.has(team))) {
        return {
            data: null,
            error: { message: 'White Cell may only inform teams requested in the submitted action.' }
        };
    }

    const notificationContent = String(params?.requested_notification_content || '').trim();
    if (approvedTeams.length && !notificationContent) {
        return {
            data: null,
            error: { message: 'Notification content is required when informing a requested team.' }
        };
    }

    // Mirror the SQL transaction: a failed delivery must not complete the action.
    const transaction = cloneValue(state);
    const reviewResult = operatorReviewArtifact(transaction, {
        requested_artifact_kind: 'action',
        requested_artifact_id: action.id,
        requested_review_decision: 'complete',
        requested_team: params?.requested_team,
        requested_expected_revision: params?.requested_expected_revision,
        requested_reviewer_notes: params?.requested_reviewer_notes
    });
    if (reviewResult.error) return reviewResult;

    const communications = [];
    for (const recipientTeam of approvedTeams) {
        const communicationResult = operatorSendCommunication(transaction, {
            requested_session_id: action.session_id,
            requested_to_role: recipientTeam,
            requested_type: 'ACTION_NOTIFICATION',
            requested_content: notificationContent,
            requested_title: `${String(action.team || '').replace(/^./, (letter) => letter.toUpperCase())} Team Action Notification`,
            requested_linked_request_id: null,
            requested_metadata: {
                recipient: recipientTeam,
                recipient_scope: 'team',
                recipient_team: recipientTeam,
                recipient_role: null,
                shared_action_id: action.id,
                source_team: String(action.team || '').trim().toLowerCase(),
                action_revision: Number(params?.requested_expected_revision),
                notification_delivery: 'approved',
                notification_request_note: action?.artifact_payload?.action?.notificationNote || null,
                action_snapshot: cloneValue({
                    ...(action?.artifact_payload?.action || {}),
                    title: String(action?.goal || '').trim() || 'Untitled action'
                })
            }
        });
        if (communicationResult.error) return communicationResult;
        communications.push(communicationResult.data);
    }
    Object.assign(state, transaction);

    return {
        data: {
            ...reviewResult.data,
            communications,
            notification_teams: approvedTeams
        },
        error: null
    };
}

function getInsertConstraintError(tableName, payloads, existingRows) {
    if (tableName === 'sme_pli_packets') {
        const occupied = new Set(existingRows.map((row) => (
            `${String(row?.adjudication_id ?? '')}::${String(row?.pli_seat ?? '')}::${String(row?.handoff_seat ?? '')}`
        )));
        for (const payload of payloads) {
            const key = `${String(payload?.adjudication_id ?? '')}::${String(payload?.pli_seat ?? '')}::${String(payload?.handoff_seat ?? '')}`;
            if (occupied.has(key)) {
                return {
                    code: '23505',
                    message: 'duplicate key value violates unique constraint "sme_pli_packets_adjudication_seat_unique"',
                    details: `Key (adjudication_id, pli_seat, handoff_seat)=(${payload?.adjudication_id}, ${payload?.pli_seat}, ${payload?.handoff_seat}) already exists.`
                };
            }
            occupied.add(key);
        }
        return null;
    }

    if (tableName !== 'notetaker_data') {
        return null;
    }

    const occupiedSessionMoves = new Set(existingRows.map((row) => (
        `${String(row?.session_id ?? '')}::${String(row?.move ?? '')}`
    )));

    for (const payload of payloads) {
        const key = `${String(payload?.session_id ?? '')}::${String(payload?.move ?? '')}`;
        if (occupiedSessionMoves.has(key)) {
            return {
                code: '23505',
                message: 'duplicate key value violates unique constraint "notetaker_data_session_id_move_key"',
                details: `Key (session_id, move)=(${payload?.session_id}, ${payload?.move}) already exists.`
            };
        }
        occupiedSessionMoves.add(key);
    }

    return null;
}

function canInsertFacilitatorDirectCommunication(state, row, authUserId) {
    const participantRole = String(getLiveDemoParticipantRole(state, authUserId, row?.session_id) || '')
        .trim()
        .toLowerCase();
    const participantTeam = getLiveDemoParticipantTeam(state, authUserId, row?.session_id);
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};

    return (
        liveDemoCanWriteSessionSurface(state, authUserId, row?.session_id, ['scribe'])
        && String(row?.type || '').trim().toLowerCase() === 'direct'
        && String(row?.to_role || '').trim().toLowerCase() === 'white_cell'
        && normalizeSeatRole(String(row?.from_role || '').trim()).toLowerCase() === participantRole
        && normalizeTeamId(metadata.source_team) === participantTeam
        && Boolean(String(row?.content || '').trim())
    );
}

function operatorReturnActionToBlue(state, params) {
    const action = state.tables.actions.find((entry) => (
        entry.id === params?.requested_action_id && entry.is_deleted !== true
    ));
    if (!action) {
        return { data: null, error: { message: 'Action not found.' } };
    }
    if (String(action.team || '').trim().toLowerCase() !== 'blue') {
        return { data: null, error: { message: 'Only Blue Team actions can use the legacy return wrapper.' } };
    }

    const result = operatorReviewArtifact(state, {
        requested_artifact_kind: 'action',
        requested_artifact_id: action.id,
        requested_review_decision: 'return_to_team',
        requested_team: 'blue',
        requested_expected_revision: Number.isInteger(action.revision_number)
            ? action.revision_number
            : 1,
        requested_reviewer_notes: params?.requested_return_notes
    });

    return result.error
        ? result
        : { data: result.data.artifact, error: null };
}

function readLegacyActionDetail(details = '', label = '') {
    if (typeof details !== 'string' || !details || !label) return null;
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = details.match(new RegExp(`^${escapedLabel}:\\s*(.*)$`, 'im'));
    return match?.[1]?.trim() || null;
}

function readLegacyActionList(details = '', label = '') {
    const value = readLegacyActionDetail(details, label);
    if (!value || value === 'None selected') return [];

    try {
        const parsedValue = JSON.parse(value);
        if (Array.isArray(parsedValue)) {
            return parsedValue.map((entry) => String(entry).trim()).filter(Boolean);
        }
    } catch (_error) {
        // Fall through for legacy comma-separated values.
    }

    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function operatorReviewProposalThreaded(state, params) {
    const authUserId = getCurrentAuthUserId();
    const action = state.tables.actions.find((entry) => (
        entry.id === params?.requested_action_id && entry.is_deleted !== true
    ));
    const decision = String(params?.requested_review_decision || '').trim().toLowerCase();
    const recipientTeam = normalizeTeamId(params?.requested_recipient_team);
    const expectedRevision = params?.requested_expected_revision == null
        ? null
        : Number(params.requested_expected_revision);
    const grant = action ? getOperatorGrant(state, authUserId, 'whitecell', action.session_id) : null;

    if (!action) return { data: null, error: { message: 'Proposal action not found.' } };
    if (action.artifact_type !== 'proposal') {
        return { data: null, error: { message: 'Only proposal artifacts can use operator_review_proposal.' } };
    }
    if (isRegionalSession(state, action.session_id) && (getLiveDemoParticipantSurface(state, authUserId, action.session_id) !== 'whitecell' || expectedRevision == null)) return { data: null, error: { code: '42501', message: 'Active reviewer and revision required.' } };
    if (!grant) return { data: null, error: { message: 'White Cell operator authorization is required.' } };
    if (decision !== 'forward_to_recipient') {
        return { data: null, error: { message: 'Recipient approvals only support forward_to_recipient.' } };
    }
    if (!['blue', 'red'].includes(recipientTeam)) {
        return { data: null, error: { message: 'A Blue or Red recipient is required.' } };
    }

    const revisionNumber = Number.isInteger(action.revision_number) ? action.revision_number : 1;
    if (expectedRevision !== null && expectedRevision !== revisionNumber) {
        return {
            data: null,
            error: { code: 'PT409', message: `Stale proposal revision. Expected ${expectedRevision}, current ${revisionNumber}.` }
        };
    }

    const payloadProposal = action?.artifact_payload?.proposal || {};
    const intendedRecipients = [...new Set([
        ...(Array.isArray(payloadProposal.recipientTeams) ? payloadProposal.recipientTeams : []),
        ...readLegacyActionList(action.ally_contingencies, 'Recipient Teams'),
        action.proposal_recipient_team
    ].map(normalizeTeamId).filter((team) => ['blue', 'red'].includes(team)))];
    if (!intendedRecipients.length && action.proposal_recipient_team) {
        intendedRecipients.push(normalizeTeamId(action.proposal_recipient_team));
    }
    if (!intendedRecipients.includes(recipientTeam)) {
        return { data: null, error: { message: 'Requested recipient is not an intended proposal partner.' } };
    }

    const existingCommunication = state.tables.communications.find((entry) => (
        entry.type === 'PROPOSAL_FORWARDED'
        && entry.metadata?.source_proposal_id === action.id
        && (!action.delegation_id || Number(entry.metadata?.source_revision) === action.revision_number)
        && normalizeTeamId(entry.metadata?.recipient_team) === recipientTeam
    ));
    if (existingCommunication) {
        return {
            data: {
                action: cloneValue(action),
                communication: cloneValue(existingCommunication),
                timeline_events: [],
                recipient_team: recipientTeam,
                idempotent_replay: true
            },
            error: null
        };
    }
    if (
        action.status !== 'submitted'
        || !['submitted_to_white_cell', 'resubmitted'].includes(action.workflow_state)
    ) {
        return { data: null, error: { message: 'Only a submitted proposal with pending recipients can be approved.' } };
    }

    const timestamp = getTimestamp();
    const threadId = nextId(state, 'proposal_threads');
    const {
        recipientTeams: _recipientTeams,
        recipientTeam: _recipientTeam,
        intendedPartners: _intendedPartners,
        recipientApprovalStates: _recipientApprovalStates,
        proposedActivity: _proposedActivity,
        ...safePayloadProposal
    } = cloneValue(payloadProposal);
    const structuredProposedActivity = typeof payloadProposal.proposedActivity === 'string'
        ? payloadProposal.proposedActivity.trim()
        : '';
    const industryProposedActivity = normalizeTeamId(action.team) === 'industry'
        ? structuredProposedActivity
            || readLegacyActionDetail(action.ally_contingencies, 'Proposed Activity')
        : null;
    const proposalSnapshot = {
        ...safePayloadProposal,
        title: action.goal || null,
        originators: safePayloadProposal.originators?.length
            ? safePayloadProposal.originators
            : readLegacyActionList(action.ally_contingencies, 'Originators'),
        objective: safePayloadProposal.objective
            || readLegacyActionDetail(action.ally_contingencies, 'Objective'),
        instruments: safePayloadProposal.instruments?.length
            ? safePayloadProposal.instruments
            : readLegacyActionList(action.ally_contingencies, 'Instruments'),
        focusSectors: safePayloadProposal.focusSectors?.length
            ? safePayloadProposal.focusSectors
            : readLegacyActionList(action.ally_contingencies, 'Focus Sectors'),
        timingAndConditions: safePayloadProposal.timingAndConditions
            || readLegacyActionDetail(action.ally_contingencies, 'Timing And Conditions'),
        expectedOutcomes: action.expected_outcomes || safePayloadProposal.expectedOutcomes || null,
        ...(industryProposedActivity ? { proposedActivity: industryProposedActivity } : {})
    };
    const communication = normalizeInsertRow('communications', {
        session_id: action.session_id,
        move: action.move,
        from_role: 'white_cell',
        to_role: recipientTeam,
        type: 'PROPOSAL_FORWARDED',
        title: action.goal || null,
        content: `White Cell approved and forwarded the ${action.team} Team proposal: ${action.goal || 'Untitled proposal'}`,
        client_id: authUserId,
        metadata: {
            thread_id: threadId,
            recipient_team: recipientTeam,
            round_number: 0,
            parent_message_id: null,
            source_proposal_id: action.id,
            source_revision: revisionNumber,
            source_team: normalizeTeamId(action.team),
            sender_team: 'white_cell',
            sender_role: grant.role,
            sent_at: timestamp,
            message_type: 'proposal_forwarded',
            proposal: proposalSnapshot,
            review_decision: 'forward_to_recipient',
            review_stage: 'approved_forwarded'
        }
    }, state);
    state.tables.communications.push(communication);

    const recipientReviews = {
        ...(action?.artifact_payload?.proposal_recipient_reviews || {}),
        [recipientTeam]: {
            status: 'approved_forwarded',
            thread_id: threadId,
            communication_id: communication.id,
            approved_at: timestamp,
            approved_by_role: grant.role
        }
    };
    let updatedAction = {
        ...action,
        artifact_payload: {
            ...(action.artifact_payload || {}),
            proposal_recipient_reviews: recipientReviews
        },
        updated_at: timestamp
    };
    state.tables.actions = state.tables.actions.map((entry) => (
        entry.id === updatedAction.id ? updatedAction : entry
    ));

    const timeline = normalizeInsertRow('timeline', {
        session_id: action.session_id,
        move: action.move,
        phase: action.phase,
        team: 'white_cell',
        type: 'PROPOSAL_FORWARDED',
        content: `${action.team} Team proposal independently approved for ${recipientTeam} Team.`,
        client_id: authUserId,
        metadata: {
            related_id: action.id,
            source_team: action.team,
            recipient_team: recipientTeam,
            thread_id: threadId,
            source_revision: revisionNumber,
            review_decision: 'forward_to_recipient',
            review_stage: 'approved_forwarded',
            proposal: true
        }
    }, state);
    state.tables.timeline.push(timeline);

    const approvedRecipients = new Set(state.tables.communications
        .filter((entry) => (
            entry.type === 'PROPOSAL_FORWARDED'
            && entry.metadata?.source_proposal_id === action.id
        && (!action.delegation_id || Number(entry.metadata?.source_revision) === action.revision_number)
        ))
        .map((entry) => normalizeTeamId(entry.metadata?.recipient_team)));
    if (intendedRecipients.every((team) => approvedRecipients.has(team))) {
        const completion = operatorReviewArtifact(state, {
            requested_artifact_kind: 'action',
            requested_artifact_id: action.id,
            requested_review_decision: 'complete',
            requested_team: normalizeTeamId(action.team),
            requested_expected_revision: revisionNumber,
            requested_reviewer_notes: params?.requested_adjudication_notes || null
        });
        if (completion.error) return completion;
        updatedAction = completion.data.artifact;
    }

    return {
        data: {
            action: cloneValue(updatedAction),
            communication: cloneValue(communication),
            timeline_events: [cloneValue(timeline)],
            recipient_team: recipientTeam,
            idempotent_replay: false
        },
        error: null
    };
}

function appendProposalThreadMessage(state, params) {
    const authUserId = getCurrentAuthUserId();
    const parent = state.tables.communications.find((entry) => (
        entry.id === params?.requested_parent_message_id
    ));
    const content = String(params?.requested_content || '').trim();
    const messageType = String(params?.requested_message_type || '').trim().toLowerCase();
    const facilitatorDecision = String(params?.requested_facilitator_decision || '').trim().toLowerCase() || null;
    let clientMessageId = String(params?.requested_client_message_id || '').trim() || null;

    if (!parent || !parent.metadata?.thread_id) {
        return { data: null, error: { message: 'Proposal thread parent message not found.' } };
    }
    if (isRegionalSession(state, parent.session_id) && (
        !(regionalCapability(state, authUserId, parent.session_id, 'thread') || getLiveDemoParticipantRole(state, authUserId, parent.session_id) === 'green_shared_facilitator' && parent.owner_team === 'green')
        || !regionalThreadSource(state, parent, true)
        || !regionalCanRead(state, 'communications', parent, authUserId))) {
        return { data: null, error: { code: '42501', message: 'GC03_THREAD_SCOPE_DENIED' } };
    }
    if (isRegionalSession(state, parent.session_id) && clientMessageId) {
        clientMessageId = 'gc06:' + parent.session_id + ':' + getParticipantSeatForSession(state, authUserId, parent.session_id).id + ':' + parent.metadata.thread_id + ':' + clientMessageId;
    }
    if (!content) return { data: null, error: { message: 'Parent message and content are required.' } };
    if (!['recipient_response', 'negotiation_message', 'thread_closed'].includes(messageType)) {
        return { data: null, error: { message: 'Unsupported proposal thread message type.' } };
    }
    if (facilitatorDecision && !['accept', 'not_interested', 'negotiate'].includes(facilitatorDecision)) {
        return { data: null, error: { message: 'Unsupported proposal response decision.' } };
    }

    const participantTeam = getLiveDemoParticipantTeam(state, authUserId, parent.session_id);
    const participantRole = getLiveDemoParticipantRole(state, authUserId, parent.session_id);
    const participantSurface = getLiveDemoParticipantSurface(state, authUserId, parent.session_id);
    const sourceTeam = normalizeTeamId(parent.metadata.source_team);
    const recipientTeam = normalizeTeamId(parent.metadata.recipient_team);
    const senderTeam = normalizeTeamId(parent.metadata.sender_team);
    if (
        !authUserId
        || !['facilitator', 'scribe'].includes(participantSurface)
        || ![sourceTeam, recipientTeam].includes(participantTeam)
    ) {
        return { data: null, error: { message: 'Proposal thread access is restricted to its two teams.' } };
    }
    if (clientMessageId) {
        const existing = state.tables.communications.find((entry) => (
            entry.metadata?.client_message_id === clientMessageId
        ));
        if (existing) {
            if (isRegionalSession(state, parent.session_id) && (existing.session_id !== parent.session_id
                || !regionalCanRead(state, 'communications', existing, authUserId) || existing.from_role !== participantRole)) {
                return { data: null, error: { code: '42501', message: 'GC03_THREAD_SCOPE_DENIED' } };
            }
            if (
                existing.metadata.thread_id !== parent.metadata.thread_id
                || normalizeTeamId(existing.metadata.sender_team) !== participantTeam
            ) {
                return { data: null, error: { message: 'Client message ID belongs to another proposal thread.' } };
            }
            return { data: cloneValue(existing), error: null };
        }
    }
    if (participantTeam === senderTeam) {
        return { data: null, error: { message: 'The other thread participant must answer the latest round.' } };
    }

    const messages = state.tables.communications
        .filter((entry) => (
            ['PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE'].includes(entry.type)
            && entry.metadata?.thread_id === parent.metadata.thread_id
            && normalizeTeamId(entry.metadata?.recipient_team) === recipientTeam
        ))
        .sort((left, right) => Number(right.metadata.round_number) - Number(left.metadata.round_number));
    const latest = messages[0];
    if (latest?.id !== parent.id) {
        return { data: null, error: { code: 'PT409', message: 'A newer proposal thread round already exists.' } };
    }
    if (latest.metadata.message_type === 'thread_closed') {
        return { data: null, error: { message: 'Closed proposal threads are immutable.' } };
    }
    if (Number(parent.metadata.round_number) === 0 && participantTeam !== recipientTeam) {
        return { data: null, error: { message: 'The addressed recipient must send the first response.' } };
    }
    if (participantTeam === sourceTeam && messageType === 'recipient_response') {
        return { data: null, error: { message: 'The proposing team must use a negotiation follow-up or close the thread.' } };
    }

    const pendingReview = state.tables.communications.find((entry) => (
        entry.type === 'PROPOSAL_RESPONSE_REVIEW'
        && entry.metadata?.parent_message_id === parent.id
        && normalizeTeamId(entry.metadata?.sender_team) === participantTeam
        && !state.tables.communications.some((candidate) => candidate.metadata?.review_request_id === entry.id)
    ));
    if (pendingReview) {
        return { data: null, error: { code: 'PT409', message: 'This proposal response is awaiting White Cell review.' } };
    }

    const timestamp = getTimestamp();
    const communication = normalizeInsertRow('communications', {
        session_id: parent.session_id,
        move: parent.move,
        from_role: participantRole,
        to_role: 'white_cell',
        type: 'PROPOSAL_RESPONSE_REVIEW',
        title: parent.title || null,
        content,
        client_id: authUserId,
        metadata: {
            thread_id: parent.metadata.thread_id,
            recipient_team: recipientTeam,
            round_number: Number(parent.metadata.round_number) + 1,
            parent_message_id: parent.id,
            source_proposal_id: parent.metadata.source_proposal_id,
            source_revision: Number(parent.metadata.source_revision),
            source_team: sourceTeam,
            sender_team: participantTeam,
            sender_role: participantRole,
            sent_at: timestamp,
            message_type: messageType,
            submitted_at: timestamp,
            proposed_round_number: Number(parent.metadata.round_number) + 1,
            proposed_message_type: messageType,
            facilitator_decision: facilitatorDecision,
            client_message_id: clientMessageId
        }
    }, state);
    state.tables.communications.push(communication);
    return { data: cloneValue(communication), error: null };
}

function operatorForwardProposalResponse(state, params) {
    const authUserId = getCurrentAuthUserId();
    const review = state.tables.communications.find((entry) => (
        entry.id === params?.requested_review_communication_id
    ));
    if (!review || review.type !== 'PROPOSAL_RESPONSE_REVIEW') {
        return { data: null, error: { message: 'Proposal response review not found.' } };
    }

    const grant = getOperatorGrant(state, authUserId, 'whitecell', review.session_id);
    if (!grant) return { data: null, error: { message: 'White Cell operator authorization is required.' } };

    if (isRegionalSession(state, review.session_id) && (getLiveDemoParticipantSurface(state, authUserId, review.session_id) !== 'whitecell'
        || !regionalThreadSource(state, review, true))) return { data: null, error: { code: '42501', message: 'GC06_RESPONSE_FORWARD_DENIED' } };
    const existing = state.tables.communications.find((entry) => (
        entry.metadata?.review_request_id === review.id
    ));
    if (existing) {
        return { data: { communication: cloneValue(existing), timeline_event: null, idempotent_replay: true }, error: null };
    }

    const metadata = review.metadata || {};
    const parent = state.tables.communications.find((entry) => entry.id === metadata.parent_message_id);
    const latest = state.tables.communications
        .filter((entry) => (
            ['PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE'].includes(entry.type)
            && entry.metadata?.thread_id === metadata.thread_id
            && normalizeTeamId(entry.metadata?.recipient_team) === normalizeTeamId(metadata.recipient_team)
        ))
        .sort((left, right) => Number(right.metadata.round_number) - Number(left.metadata.round_number))[0];
    if (!parent || latest?.id !== parent.id) {
        return { data: null, error: { code: 'PT409', message: 'A newer proposal thread round already exists.' } };
    }

    const timestamp = getTimestamp();
    const communication = normalizeInsertRow('communications', {
        session_id: review.session_id,
        move: review.move,
        from_role: metadata.sender_role,
        to_role: normalizeTeamId(metadata.sender_team) === normalizeTeamId(metadata.source_team)
            ? normalizeTeamId(metadata.recipient_team)
            : normalizeTeamId(metadata.source_team),
        type: 'PROPOSAL_RESPONSE',
        title: review.title || parent.title || null,
        content: review.content,
        client_id: review.client_id,
        metadata: {
            thread_id: metadata.thread_id,
            recipient_team: normalizeTeamId(metadata.recipient_team),
            round_number: Number(metadata.proposed_round_number),
            parent_message_id: parent.id,
            source_proposal_id: metadata.source_proposal_id,
            source_revision: Number(metadata.source_revision),
            source_team: normalizeTeamId(metadata.source_team),
            sender_team: normalizeTeamId(metadata.sender_team),
            sender_role: metadata.sender_role,
            sent_at: timestamp,
            message_type: metadata.proposed_message_type,
            facilitator_decision: metadata.facilitator_decision || null,
            client_message_id: metadata.client_message_id || null,
            review_request_id: review.id,
            forwarded_by_role: grant.role,
            forwarded_at: timestamp
        }
    }, state);
    state.tables.communications.push(communication);

    const timeline = normalizeInsertRow('timeline', {
        session_id: review.session_id,
        move: review.move,
        phase: state.tables.actions.find((entry) => entry.id === metadata.source_proposal_id)?.phase || 1,
        team: 'white_cell',
        type: 'PROPOSAL_RESPONSE',
        content: `White Cell forwarded a proposal response from ${metadata.sender_team} to ${communication.to_role}.`,
        client_id: authUserId,
        metadata: {
            related_id: metadata.source_proposal_id,
            communication_id: communication.id,
            review_request_id: review.id,
            recipient_team: metadata.recipient_team,
            thread_id: metadata.thread_id,
            round_number: Number(metadata.proposed_round_number)
        }
    }, state);
    state.tables.timeline.push(timeline);

    return {
        data: {
            communication: cloneValue(communication),
            timeline_event: cloneValue(timeline),
            idempotent_replay: false
        },
        error: null
    };
}

function deleteLiveDemoSession(state, {
    requested_session_id
}) {
    const authUserId = getCurrentAuthUserId();
    if (!liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')) {
        return { data: null, error: { message: 'Game Master authorization is required.' } };
    }

    const session = state.tables.sessions.find((entry) => entry.id === requested_session_id);
    if (!session) {
        return { data: null, error: { message: 'Session not found. Please refresh and try again.' } };
    }

    if (session.is_protected === true || session.session_classification !== 'live_exercise') {
        return { data: null, error: { message: 'Protected sessions cannot be changed.' } };
    }

    if (session.status === 'deleted') {
        return {
            data: {
                deleted_session_id: requested_session_id,
                status: 'deleted',
                already_deleted: true,
                deleted_at: session.deleted_at || null
            },
            error: null
        };
    }

    if (session.status !== 'archived') {
        return { data: null, error: { message: 'Archive the session before deleting it.' } };
    }

    const deletedAt = getTimestamp();
    const previousSession = cloneValue(session);
    session.status = 'deleted';
    session.deleted_at = deletedAt;
    session.updated_at = deletedAt;

    const operatorGrant = state.tables.operator_grants.find((grant) => (
        grant.auth_user_id === authUserId && grant.surface === 'gamemaster'
    ));
    const priorEvents = state.tables.research_audit_event_log.filter((event) => (
        event.session_id === requested_session_id
    ));
    const eventId = state.tables.research_audit_event_log.reduce((largest, event) => (
        Math.max(largest, Number(event.event_id) || 0)
    ), 0) + 1;
    const previousEvent = priorEvents[priorEvents.length - 1] || null;

    state.tables.research_audit_event_log.push({
        event_id: eventId,
        event_uuid: nextId(state, 'research_audit_event_log_event'),
        session_id: requested_session_id,
        event_ts_utc: deletedAt,
        server_received_utc: deletedAt,
        client_ts_utc: null,
        actor_pseudonym: `gamemaster-${String(operatorGrant?.id || authUserId).slice(0, 8)}`,
        actor_role: operatorGrant?.role || 'gamemaster',
        actor_team: operatorGrant?.team_id || null,
        actor_seat_index: null,
        event_type: 'SESSION_DELETED',
        entity_type: 'session',
        entity_id: requested_session_id,
        move_number: null,
        action_sequence: null,
        correlation_id: null,
        causal_event_id: null,
        before_state: {
            id: previousSession.id,
            status: previousSession.status,
            updated_at: previousSession.updated_at,
            deleted_at: previousSession.deleted_at || null
        },
        after_state: {
            id: session.id,
            status: session.status,
            updated_at: session.updated_at,
            deleted_at: session.deleted_at
        },
        payload: {
            delete_method: 'operator_soft_delete',
            evidence_retained: true
        },
        phase: null,
        prev_event_hash: previousEvent?.event_hash || null,
        event_hash: `mock-session-deleted-${eventId}`
    });

    return {
        data: {
            deleted_session_id: requested_session_id,
            status: 'deleted',
            already_deleted: false,
            deleted_at: deletedAt
        },
        error: null
    };
}

function gc07Error(code = '42501', message = 'GC07_SCOPE_DENIED') {
    return { data: null, error: { code, message } };
}

function regionalMessagingOperation(state, params, direct = false) {
    const sid = params.requested_session_id, region = params.requested_delegation_id;
    const seat = getParticipantSeatForSession(state, getCurrentAuthUserId(), sid);
    if (!isRegionalSession(state, sid) || !['asian_pacific', 'europe'].includes(region)
        || !seat || !['green_shared_facilitator', `green_${region}_facilitator`].includes(seat.role)) return gc07Error();
    const content = String(direct ? params.requested_content || '' : params.requested_query || '').trim();
    if (content.length < (direct ? 1 : 10) || content.length > 2000
        || !direct && (!params.requested_categories?.length || params.requested_categories.some((c) => !String(c || '').trim()))) {
        return gc07Error('22023', 'GC07_CONTENT_REQUIRED');
    }
    const table = direct ? 'communications' : 'requests';
    let row;
    if (!direct && params.requested_request_id != null) {
        row = state.tables.requests.find((r) => r.id === params.requested_request_id);
        if (!row || row.session_id !== sid || row.team !== 'green' || row.delegation_id !== region) return gc07Error();
        if (row.revision_number !== params.requested_expected_revision) return gc07Error('PT409', 'GC07_STALE_RFI_REVISION');
        if (row.status !== 'pending' || row.workflow_state !== 'returned_to_team'
            || row.query === content && compareValues(row.categories, params.requested_categories)) return gc07Error('23514', 'GC07_RFI_STATE_DENIED');
        row = { ...row, query: content, categories: cloneValue(params.requested_categories), workflow_state: 'resubmitted', updated_at: getTimestamp() };
        state.tables.requests = state.tables.requests.map((r) => r.id === row.id ? row : r);
    } else {
        if (!params.requested_client_key?.trim() || !direct && params.requested_expected_revision != null) return gc07Error('22023', 'GC07_CLIENT_KEY_REQUIRED');
        const key = `gc07:${region}:${seat.id}:${params.requested_client_key}`;
        row = state.tables[table].find((r) => r.session_id === sid && r.gc07_client_key === key);
        if (row) return (direct ? row.content !== content : row.query !== content || !compareValues(row.categories, params.requested_categories))
            ? gc07Error('PT409', 'GC07_RETRY_CONFLICT') : { data: cloneValue(row), error: null };
        const game = state.tables.game_state.find((g) => g.session_id === sid);
        if (!game) return gc07Error('23514', 'GC07_GAME_STATE_REQUIRED');
        row = normalizeInsertRow(table, { session_id: sid, team: 'green', delegation_id: region,
            move: game.move, phase: game.phase, gc07_client_key: key,
            ...(direct ? { from_role: seat.role, to_role: 'white_cell', type: 'direct', content, metadata: { source_team: 'green' } }
                : { query: content, categories: params.requested_categories, status: 'pending', workflow_state: 'submitted_to_white_cell', revision_number: 1 }) }, state);
        state.tables[table].push(row);
    }
    state.tables.timeline.push(normalizeInsertRow('timeline', { session_id: sid, team: 'green', move: row.move, phase: row.phase || 1,
        type: direct ? 'DIRECT_COMMUNICATION_SENT' : params.requested_request_id ? 'RFI_RESUBMITTED' : 'RFI_CREATED',
        content: 'Green regional communication', metadata: direct ? { communication_id: row.id } : { related_id: row.id } }, state));
    return { data: cloneValue(row), error: null };
}

function regionalOperatorAudience(state, params) {
    const sid = params.requested_session_id;
    const target = params.requested_to_role;
    const metadata = params.requested_metadata || {};
    const seat = getParticipantSeatForSession(state, getCurrentAuthUserId(), sid);
    if (!seat || !['whitecell_lead', 'whitecell_support'].includes(seat.role)) return gc07Error();
    let region = null, scope, toRole = target;
    if (params.requested_linked_request_id) {
        const request = state.tables.requests.find((r) => r.id === params.requested_linked_request_id && r.session_id === sid);
        if (!request || request.team !== target) return gc07Error('23514', 'GC07_RFI_AUDIENCE_CONFLICT');
        region = request.delegation_id; scope = region ? 'delegation' : 'team';
    } else if (['green_asian_pacific', 'green_europe'].includes(target)) {
        region = target.slice(6); scope = 'delegation'; toRole = 'green';
    } else if (target === 'green') scope = 'both_green_delegations';
    else if (target === 'all') scope = 'session';
    else if (['blue', 'red', 'industry'].includes(target)) scope = 'team';
    else {
        scope = 'role'; region = regionalDelegation(target);
        const session = state.tables.sessions.find((s) => s.id === sid);
        if (target?.startsWith('green') && (!seatModelAllowsRole(session, target) || !region && target !== 'green_shared_facilitator')) return gc07Error();
        if (!parseTeamRole(target).surface) return gc07Error();
    }
    if (metadata.recipient_scope && metadata.recipient_scope !== scope
        && !(metadata.recipient_scope === 'team' && (scope === 'both_green_delegations' || params.requested_linked_request_id))
        && !(metadata.recipient_scope === 'all' && scope === 'session')
        || metadata.recipient_role && (scope !== 'role' || metadata.recipient_role !== target)
        || metadata.recipient_delegation_id && metadata.recipient_delegation_id !== region
        || metadata.recipient && metadata.recipient !== target
        || metadata.recipient_team && metadata.recipient_team !== (target?.startsWith('green') ? 'green' : scope === 'team' ? target : scope === 'role' ? target.split('_')[0] : null)) return gc07Error('23514', 'GC07_AUDIENCE_METADATA_CONFLICT');
    return { data: { to_role: toRole, recipient_scope: scope, recipient_delegation_id: region,
        metadata: { ...metadata, recipient: target, recipient_scope: scope, recipient_delegation_id: region,
            recipient_role: scope === 'role' ? target : null, recipient_team: target?.startsWith('green') ? 'green' : scope === 'team' ? target : scope === 'role' ? target.split('_')[0] : null,
            resolved_delivery_audience: scope === 'both_green_delegations' ? ['asian_pacific', 'europe'] : [scope === 'role' ? target : region || target] } }, error: null };
}

function operatorAnswerRequest(state, params, regional = false) {
    const authUserId = getCurrentAuthUserId();
    const grant = getOperatorGrant(state, authUserId, 'whitecell');
    const request = state.tables.requests.find((entry) => entry.id === params?.requested_request_id);

    if (!request) {
        return { data: null, error: { message: 'Request not found.' } };
    }

    if (isRegionalSession(state, request.session_id) && request.team === 'green') {
        const seat = getParticipantSeatForSession(state, authUserId, request.session_id);
        if (!regional || !seat || !['whitecell_lead', 'whitecell_support'].includes(seat.role)
            || request.session_id !== params.requested_session_id || request.delegation_id !== params.requested_delegation_id) return gc07Error();
        if (request.revision_number !== params.requested_expected_revision) return gc07Error('PT409', 'GC07_STALE_RFI_REVISION');
        if (!['submitted_to_white_cell', 'resubmitted'].includes(request.workflow_state)) return gc07Error('23514', 'GC07_RFI_STATE_DENIED');
        if (!String(params.requested_response || '').trim()) return gc07Error('22023', 'A response is required.');
    }

    if (!grant || grant.session_id !== request.session_id) {
        return { data: null, error: { message: 'White Cell operator authorization is required.' } };
    }

    if (['answered', 'withdrawn'].includes(request.status) || request.workflow_state === 'completed') {
        return { data: null, error: { message: 'Completed artifacts are immutable.' } };
    }

    const respondedAt = params?.requested_responded_at ?? getTimestamp();
    const updated = {
        ...request,
        response: params?.requested_response ?? '',
        status: 'answered',
        workflow_state: 'completed',
        revision_number: Number.isInteger(request.revision_number) ? request.revision_number : 1,
        prior_workflow_state: request.workflow_state || 'submitted_to_white_cell',
        reviewed_at: respondedAt,
        reviewed_by_auth_user_id: authUserId,
        reviewed_by_role: grant.role,
        review_notes: null,
        completed_at: respondedAt,
        responded_at: respondedAt,
        answered_at: respondedAt,
        updated_at: getTimestamp()
    };

    const transaction = regional ? cloneValue(state) : state;
    transaction.tables.requests = transaction.tables.requests.map((entry) => (
        entry.id === updated.id ? updated : entry
    ));

    if (regional) {
        const delivery = operatorSendCommunication(transaction, { requested_session_id: request.session_id,
            requested_to_role: request.team, requested_type: 'RFI_RESPONSE', requested_content: updated.response,
            requested_linked_request_id: request.id });
        if (delivery.error) return delivery;
        Object.assign(state, transaction);
    }

    return {
        data: cloneValue(updated),
        error: null
    };
}

function operatorSendCommunication(state, params) {
    const authUserId = getCurrentAuthUserId();
    const grant = getOperatorGrant(state, authUserId, 'whitecell');

    if (!grant || grant.session_id !== params?.requested_session_id) {
        return { data: null, error: { message: 'White Cell operator authorization is required.' } };
    }

    const audience = isRegionalSession(state, params.requested_session_id) ? regionalOperatorAudience(state, params) : null;
    if (audience?.error) return audience;

    const sessionState = state.tables.game_state.find((entry) => entry.session_id === params?.requested_session_id);
    const communication = normalizeInsertRow('communications', {
        session_id: params?.requested_session_id,
        move: sessionState?.move ?? 1,
        from_role: 'white_cell',
        to_role: params?.requested_to_role || 'all',
        type: params?.requested_type,
        title: params?.requested_title || null,
        content: params?.requested_content || '',
        linked_request_id: params?.requested_linked_request_id || null,
        client_id: authUserId,
        ...(audience?.data || {}),
        metadata: {
            ...(audience?.data?.metadata || (params?.requested_metadata && typeof params.requested_metadata === 'object'
                ? cloneValue(params.requested_metadata)
                : {})),
            operator_role: grant.role,
            operator_auth_user_id: authUserId
        }
    }, state);

    state.tables.communications.push(communication);

    return {
        data: cloneValue(communication),
        error: null
    };
}

function resolveProposalRecipientTeam(communication = {}) {
    const metadata = communication?.metadata && typeof communication.metadata === 'object'
        ? communication.metadata
        : {};
    if (typeof metadata.recipient_team === 'string' && metadata.recipient_team.trim()) {
        return normalizeTeamId(metadata.recipient_team);
    }

    const toRole = String(communication?.to_role || '').trim().toLowerCase();
    if (['blue', 'red', 'green', 'industry'].includes(toRole)) {
        return toRole;
    }

    return toRole.match(/^(blue|red|green|industry)_/)?.[1] || null;
}

function updateProposalRecipientStatus(state, params) {
    const authUserId = getCurrentAuthUserId();
    const communication = state.tables.communications.find((entry) => entry.id === params?.requested_communication_id);
    if (!communication) {
        return { data: null, error: { message: 'Proposal communication not found.' } };
    }

    if (communication.type !== 'PROPOSAL_FORWARDED') {
        return { data: null, error: { message: 'Only forwarded proposals can update recipient state.' } };
    }
    if (communication.metadata?.thread_id) {
        return { data: null, error: { message: 'Proposal threads are append-only; append a new message instead.' } };
    }

    const participantSurface = getLiveDemoParticipantSurface(state, authUserId, communication.session_id);
    const participantTeam = getLiveDemoParticipantTeam(state, authUserId, communication.session_id);
    const participantRole = getLiveDemoParticipantRole(state, authUserId, communication.session_id);
    const recipientTeam = resolveProposalRecipientTeam(communication);
    const normalizedStatus = String(params?.requested_status || '').trim().toLowerCase();

    if (!['unread', 'acknowledged', 'responded', 'declined', 'ignored'].includes(normalizedStatus)) {
        return { data: null, error: { message: 'Unsupported proposal recipient status.' } };
    }

    if (!authUserId || !['facilitator', 'scribe'].includes(participantSurface)) {
        return { data: null, error: { message: 'Team-lead access is required to update proposal recipient state.' } };
    }

    if (!recipientTeam || participantTeam !== recipientTeam) {
        return { data: null, error: { message: 'Only the addressed team can update proposal recipient state.' } };
    }

    const metadata = communication?.metadata && typeof communication.metadata === 'object'
        ? cloneValue(communication.metadata)
        : {};
    const existingState = metadata.proposal_recipient_state && typeof metadata.proposal_recipient_state === 'object'
        ? metadata.proposal_recipient_state
        : {};
    const currentStatus = normalizeProposalRecipientStatus(existingState.status);

    if (['responded', 'declined', 'ignored'].includes(currentStatus)) {
        return { data: null, error: { message: 'This proposal recipient state is already final.' } };
    }

    const nextCommunication = {
        ...communication,
        metadata: {
            ...metadata,
            proposal_recipient_state: {
                ...existingState,
                ...(params?.requested_metadata && typeof params.requested_metadata === 'object'
                    ? cloneValue(params.requested_metadata)
                    : {}),
                status: normalizedStatus,
                actioned_at: getTimestamp(),
                participant_role: participantRole,
                participant_team: participantTeam,
                participant_auth_user_id: authUserId
            }
        },
        updated_at: getTimestamp()
    };

    state.tables.communications = state.tables.communications.map((entry) => (
        entry.id === nextCommunication.id ? nextCommunication : entry
    ));

    return {
        data: cloneValue(nextCommunication),
        error: null
    };
}

class MockQueryBuilder {
    constructor(tableName) {
        this.tableName = tableName;
        this.operation = 'select';
        this.selectClause = '*';
        this.filters = [];
        this.orderBy = null;
        this.limitCount = null;
        this.singleMode = null;
        this.payload = null;
        this.returning = false;
    }

    select(selectClause = '*') {
        this.selectClause = selectClause;
        this.returning = true;
        return this;
    }

    insert(payload) {
        this.operation = 'insert';
        this.payload = Array.isArray(payload) ? payload : [payload];
        return this;
    }

    update(payload) {
        this.operation = 'update';
        this.payload = cloneValue(payload);
        return this;
    }

    delete() {
        this.operation = 'delete';
        return this;
    }

    eq(field, value) {
        this.filters.push((row) => compareValues(row?.[field], value));
        return this;
    }

    gt(field, value) {
        this.filters.push((row) => {
            const fieldValue = row?.[field];
            if (fieldValue === undefined || fieldValue === null) {
                return false;
            }

            return fieldValue > value;
        });
        return this;
    }

    in(field, values) {
        const allowedValues = Array.isArray(values) ? values : [];
        this.filters.push((row) => allowedValues.includes(row?.[field]));
        return this;
    }

    order(field, { ascending = true } = {}) {
        this.orderBy = { field, ascending };
        return this;
    }

    limit(limitCount) {
        this.limitCount = limitCount;
        return this;
    }

    single() {
        this.singleMode = 'single';
        return this.execute();
    }

    maybeSingle() {
        this.singleMode = 'maybeSingle';
        return this.execute();
    }

    then(resolve, reject) {
        return this.execute().then(resolve, reject);
    }

    execute() {
        if (this.operation === 'insert' || this.operation === 'update') {
            return withMockStateWriteLock(() => this.executeWithCurrentState());
        }

        return this.executeWithCurrentState();
    }

    async executeWithCurrentState() {
        const state = readMockState();
        const tableRows = state.tables[this.tableName];
        const authUserId = getCurrentAuthUserId();

        if (!tableRows) {
            return {
                data: null,
                error: {
                    code: 'MOCK404',
                    message: `Mock table not found: ${this.tableName}`
                }
            };
        }

        let rows = tableRows;

        if (this.operation === 'insert') {
            const prepared = this.payload.map((entry) => this.tableName === 'timeline' && isRegionalSession(state, entry.session_id)
                ? prepareRegionalTimelineInsert(state, entry) : { data: entry, error: null });
            const invalid = prepared.find((entry) => entry.error);
            if (invalid) return invalid;
            const insertPayload = prepared.map((entry) => entry.data);
            const deniedInsert = insertPayload.some((entry) => !canInsertTableRow(
                state,
                this.tableName,
                entry,
                authUserId
            ));

            if (deniedInsert) {
                return {
                    data: null,
                    error: buildRlsError(this.tableName)
                };
            }

            const constraintError = getInsertConstraintError(
                this.tableName,
                insertPayload,
                tableRows
            );
            if (constraintError) {
                return {
                    data: null,
                    error: constraintError
                };
            }

            const insertedRows = insertPayload.map((entry) => normalizeInsertRow(this.tableName, entry, state));
            state.tables[this.tableName] = [...tableRows, ...insertedRows];
            writeMockState(state);
            rows = insertedRows;
        } else if (this.operation === 'update') {
            const timestamp = getTimestamp();
            const updatedRows = [];
            let updateDenied = false;

            state.tables[this.tableName] = tableRows.map((row) => {
                if (!applyFilters([row], this.filters).length) {
                    return row;
                }

                const nextRow = {
                    ...row,
                    ...cloneValue(this.payload),
                    updated_at: this.payload?.updated_at || timestamp
                };

                if ('last_updated' in row || this.tableName === 'game_state') {
                    nextRow.last_updated = this.payload?.last_updated || timestamp;
                }

                if (this.tableName === 'actions') {
                    nextRow.row_version = (Number.isInteger(row.row_version) ? row.row_version : 1) + 1;
                    if (row.status === 'draft' && nextRow.status === 'submitted') {
                        nextRow.submitted_at = timestamp;
                        nextRow.workflow_state = ['returned_to_team', 'returned_to_blue'].includes(row.workflow_state)
                            ? 'resubmitted'
                            : 'submitted_to_white_cell';
                    }
                }

                if (
                    this.tableName === 'requests'
                    && nextRow.status === 'pending'
                ) {
                    const requestContentChanged = [
                        'session_id',
                        'move',
                        'phase',
                        'team',
                        'categories',
                        'query'
                    ].some((field) => (
                        Object.prototype.hasOwnProperty.call(this.payload || {}, field)
                        && !compareValues(row[field], nextRow[field])
                    ));

                    if (requestContentChanged) {
                        nextRow.workflow_state = 'resubmitted';
                        nextRow.revision_number = row.workflow_state === 'returned_to_team'
                            ? (Number.isInteger(row.revision_number) ? row.revision_number : 1)
                            : (Number.isInteger(row.revision_number) ? row.revision_number : 1) + 1;
                    } else {
                        nextRow.workflow_state = row.workflow_state;
                        nextRow.revision_number = row.revision_number;
                    }
                }

                if (!canUpdateTableRow(state, this.tableName, row, nextRow, authUserId)) {
                    updateDenied = true;
                    return row;
                }

                updatedRows.push(nextRow);
                return nextRow;
            });

            if (updateDenied) {
                return {
                    data: null,
                    error: buildRlsError(this.tableName)
                };
            }

            writeMockState(state);
            rows = updatedRows;
        } else if (this.operation === 'delete') {
            return {
                data: null,
                error: buildRlsError(this.tableName)
            };
        } else {
            rows = applyFilters(tableRows, this.filters);
        }

        rows = rows.filter((row) => canReadTableRow(state, this.tableName, row, authUserId));

        rows = sortRows(rows, this.orderBy);
        if (typeof this.limitCount === 'number') {
            rows = rows.slice(0, this.limitCount);
        }

        rows = shapeSelectedRows(this.tableName, rows, this.selectClause, state);

        if (this.singleMode === 'single') {
            if (rows.length !== 1) {
                return {
                    data: null,
                    error: {
                        code: 'PGRST116',
                        message: rows.length === 0
                            ? 'No rows returned'
                            : 'Multiple rows returned'
                    }
                };
            }

            return {
                data: rows[0],
                error: null
            };
        }

        if (this.singleMode === 'maybeSingle') {
            if (rows.length === 0) {
                return { data: null, error: null };
            }

            if (rows.length > 1) {
                return {
                    data: null,
                    error: {
                        code: 'PGRST116',
                        message: 'Multiple rows returned'
                    }
                };
            }

            return {
                data: rows[0],
                error: null
            };
        }

        return {
            data: rows,
            error: null
        };
    }
}

export function isE2EMockEnabled() {
    return Boolean(readMockBootstrapConfig());
}

export function resetE2EMockState() {
    writeMockState(buildInitialMockState());
    writeMockAuthSession(null);
}

export function createE2EMockSupabaseClient() {
    if (typeof globalThis !== 'undefined') {
        globalThis.__ESG_E2E_BACKEND__ = {
            reset: resetE2EMockState,
            dump: () => cloneValue(readMockState())
        };
    }

    return {
        from(tableName) {
            return new MockQueryBuilder(tableName);
        },
        channel(channelName) {
            return createMockRealtimeChannel(channelName);
        },
        async removeChannel(channel) {
            channel?.unsubscribe?.();
            return 'ok';
        },
        rpc: async (functionName, params = {}) => {
            if (functionName.startsWith('gc03_') || functionName.startsWith('gc02_unified_')) {
                return { data: null, error: { code: '42501', message: 'Private compatibility function' } };
            }
            if (functionName === 'green_authorize_derived_operation') {
                return { data: authorizeMockDerivedOperation(readMockState(), getCurrentAuthUserId(), params.requested_session_id, params.requested_operation), error: null };
            }
            if (functionName === 'green_has_capability') {
                return { data: regionalCapability(readMockState(), getCurrentAuthUserId(), params.requested_session_id, params.requested_capability), error: null };
            }
            if (functionName === 'green_semantic_role') {
                const surface = getLiveDemoParticipantSurface(readMockState(), getCurrentAuthUserId(), params.requested_session_id);
                return { data: surface === 'scribe' ? 'facilitator' : surface === 'facilitator' ? 'scribe' : surface, error: null };
            }
            if (functionName.startsWith('operator_') || functionName === 'archive_live_demo_session') {
                const state = readMockState();
                const id = params.requested_action_id || params.requested_artifact_id || params.requested_request_id || params.requested_review_communication_id;
                const source = [...state.tables.actions, ...state.tables.requests, ...state.tables.communications].find((entry) => entry.id === id);
                const sid = params.requested_session_id || source?.session_id;
                if (isRegionalSession(state, sid) && !regionalOperator(state, getCurrentAuthUserId(), sid)) {
                    return { data: null, error: { code: '42501', message: 'Session operator authorization is required.' } };
                }
            }
            if (functionName === 'save_scoped_notetaker_data') {
                return mutateMockState((state) => {
                    const sid = params.requested_session_id;
                    const uid = getCurrentAuthUserId();
                    const seat = getParticipantSeatForSession(state, uid, sid);
                    if (!isRegionalSession(state, sid) || !regionalCapability(state, uid, sid, 'notes')) {
                        return { data: null, error: { code: '42501', message: 'GC02_ACTIVE_NOTETAKER_SEAT_REQUIRED' } };
                    }
                    const objects = [params.requested_dynamics, params.requested_external];
                    if (!Number.isInteger(params.requested_expected_revision) || params.requested_expected_revision < 0) {
                        return { data: null, error: { code: '22023', message: 'GC02_NOTE_REVISION_REQUIRED' } };
                    }
                    if (!Number.isInteger(params.requested_move) || params.requested_move < 1 || params.requested_move > 3
                        || !Number.isInteger(params.requested_phase) || params.requested_phase < 1 || params.requested_phase > 5
                        || objects.some((value) => !value || typeof value !== 'object' || Array.isArray(value)
                            || Object.hasOwn(value, 'team_entries') || Object.hasOwn(value, 'participant_entries'))
                        || !Array.isArray(params.requested_observations)
                        || params.requested_observations.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry)
                            || Object.hasOwn(entry, 'team_entries') || Object.hasOwn(entry, 'participant_entries')
                            || Object.hasOwn(entry, 'team') && entry.team !== getLiveDemoParticipantTeam(state, uid, sid)
                            || Object.hasOwn(entry, 'delegation_id') && entry.delegation_id !== (seat.delegation_id ?? null)
                            || Object.hasOwn(entry, 'session_participant_id') && entry.session_participant_id !== seat.id)) {
                        return { data: null, error: { code: '23514', message: 'GC02_NOTE_ENTRY_SCOPE_MISMATCH' } };
                    }
                    const existing = state.tables.scoped_notetaker_data.find((row) => row.session_participant_id === seat.id && row.move === params.requested_move);
                    if ((existing?.revision || 0) !== params.requested_expected_revision) {
                        return { data: null, error: { code: 'PT409', message: 'GC02_NOTE_REVISION_CONFLICT' } };
                    }
                    const row = { ...(existing || { id: nextId(state, 'scoped_notetaker_data') }), session_id: sid,
                        session_participant_id: seat.id, team: getLiveDemoParticipantTeam(state, uid, sid), delegation_id: seat.delegation_id ?? null,
                        move: params.requested_move, phase: params.requested_phase, dynamics_analysis: cloneValue(params.requested_dynamics),
                        external_factors: cloneValue(params.requested_external), observation_timeline: cloneValue(params.requested_observations), revision: (existing?.revision || 0) + 1 };
                    if (existing) Object.assign(existing, row); else state.tables.scoped_notetaker_data.push(row);
                    return { data: cloneValue(row), error: null };
                });
            }
            if (functionName === 'lookup_joinable_session_by_code') {
                const normalizedCode = String(params?.requested_code || '').trim().toUpperCase();
                const state = readMockState();
                const session = (state.tables.sessions || []).find((entry) => {
                    const resolvedCode = String(entry.session_code || entry.metadata?.session_code || '')
                        .trim()
                        .toUpperCase();
                    return resolvedCode === normalizedCode
                        && entry.session_classification === 'live_exercise'
                        && entry.is_protected !== true;
                });

                if (!session) {
                    return {
                        data: null,
                        error: {
                            message: 'Session not found. Please check the code and try again.'
                        }
                    };
                }

                if (session.status !== 'active') {
                    return {
                        data: null,
                        error: {
                            message: 'This session is not currently joinable.'
                        }
                    };
                }

                return {
                    data: {
                        id: session.id,
                        name: session.name,
                        session_code: session.session_code || session.metadata?.session_code || normalizedCode,
                        status: session.status,
                        session_topology_version: session.session_topology_version ?? 1,
                        green_seat_model: greenSeatModel(session)
                    },
                    error: null
                };
            }

            if (functionName === 'authorize_demo_operator') {
                return mutateMockState((state) => authorizeDemoOperator(state, params));
            }

            if (functionName === 'list_approved_green_rosters') {
                const state = readMockState();
                if (!liveDemoHasOperatorGrant(state, getCurrentAuthUserId(), 'gamemaster')) return { data: null, error: { code: '42501', message: 'GC08_GM_REQUIRED' } };
                return { data: cloneValue(state.tables.green_roster_approvals.filter(usableGreenRoster)
                    .sort((a, b) => b.approved_at.localeCompare(a.approved_at) || a.version.localeCompare(b.version))), error: null };
            }
            if (functionName === 'create_configured_live_session') {
                return mutateMockState((state) => createConfiguredLiveSession(state, params));
            }
            if (functionName === 'configure_session_green_shared_facilitator' || functionName === 'configure_session_green_topology') {
                return mutateMockState((state) => functionName === 'configure_session_green_shared_facilitator'
                    ? configureGreenSession(state, params.sid, params.roster_version, 'shared_facilitator_v1')
                    : configureGreenSession(state, params.requested_session_id, params.requested_roster_version, null, params.requested_topology_version));
            }
            if (functionName === 'create_live_demo_session') {
                return mutateMockState((state) => createLiveDemoSession(state, params));
            }

            if (functionName === 'archive_live_demo_session') {
                return mutateMockState((state) => archiveLiveDemoSession(state, params));
            }

            if (functionName === 'delete_live_demo_session') {
                return mutateMockState((state) => deleteLiveDemoSession(state, params));
            }

            if (functionName === 'claim_session_role_seat') {
                return mutateMockState((state) => claimSessionRoleSeat(state, params));
            }

            if (functionName === 'restore_session_seat_context') {
                return mutateMockState((state) => {
                    const p = state.tables.participants.find((entry) => entry.auth_user_id === getCurrentAuthUserId());
                    const seats = state.tables.session_participants.filter((entry) => entry.participant_id === p?.id
                        && entry.session_id === params.requested_session_id);
                    const seat = seats[0];
                    if (seats.length !== 1 || seat.id !== params.requested_session_participant_id || seat.revoked_at) {
                        return { data: null, error: { code: '42501', message: 'GC04_INVALID_SESSION_SEAT' } };
                    }
                    const result = claimSessionRoleSeat(state, { requested_session_id: seat.session_id,
                        requested_role: seat.role, requested_client_id: p.client_id });
                    if (result.error) return result;
                    const session = state.tables.sessions.find((entry) => entry.id === seat.session_id);
                    return { data: { seat: result.data, session: { id: session.id, name: session.name,
                        session_code: session.session_code, status: session.status,
                        session_topology_version: session.session_topology_version ?? 1,
                        green_seat_model: greenSeatModel(session) } }, error: null };
                });
            }

            if (functionName === 'heartbeat_session_role_seat') {
                return mutateMockState((state) => heartbeatSessionRoleSeat(state, params));
            }

            if (functionName === 'disconnect_session_role_seat') {
                return mutateMockState((state) => disconnectSessionRoleSeat(state, params));
            }

            if (functionName === 'operator_remove_session_participant') {
                return mutateMockState((state) => operatorRemoveSessionParticipant(state, params));
            }

            if (functionName === 'release_stale_session_role_seats') {
                return mutateMockState((state) => {
                    const authUserId = getCurrentAuthUserId();

                    if (!canReleaseStaleSessionRoleSeats(state, authUserId, params?.requested_session_id)) {
                        return {
                            data: null,
                            error: { message: 'Session access is required.' }
                        };
                    }

                    const released = releaseStaleSessionRoleSeats(
                        state,
                        params?.requested_session_id,
                        params?.requested_timeout_seconds ?? 90
                    );
                    return {
                        data: released,
                        error: null
                    };
                });
            }

            if (functionName === 'list_active_session_participants') {
                return mutateMockState((state) => listActiveSessionParticipants(state, params));
            }

            if (functionName === 'get_orientation_completion') {
                const state = readMockState();
                if (!liveDemoCanReadSession(state, getCurrentAuthUserId(), params.requested_session_id)) return { data: null, error: buildRlsError('actions') };
                return { data: orientationCompletion(state, params.requested_session_id), error: null };
            }
            if (functionName === 'handoff_regional_orientation' || functionName === 'submit_regional_orientation') {
                return mutateMockState((state) => regionalOrientationOperation(state, params,
                    functionName === 'handoff_regional_orientation' ? 'handoff' : 'submit'));
            }
            if (functionName === 'operator_update_game_state') {
                return mutateMockState((state) => operatorUpdateGameState(state, params));
            }

            if (functionName === 'operator_adjudicate_action') {
                return mutateMockState((state) => operatorAdjudicateAction(state, params));
            }

            if (functionName === 'operator_return_action_to_blue') {
                return mutateMockState((state) => operatorReturnActionToBlue(state, params));
            }

            if (functionName === 'operator_review_artifact') {
                return mutateMockState((state) => operatorReviewArtifact(state, params));
            }

            if (functionName === 'operator_complete_action_with_notifications') {
                return mutateMockState((state) => operatorCompleteActionWithNotifications(state, params));
            }

            if (functionName === 'get_regional_proposal_roster') return { ...regionalProposalRoster(readMockState(), params) };
            if (functionName === 'write_regional_proposal') return mutateMockState((state) => regionalProposalOperation(state, params));
            if (functionName === 'write_regional_rfi') return mutateMockState((state) => regionalMessagingOperation(state, params));
            if (functionName === 'send_regional_direct_message') return mutateMockState((state) => regionalMessagingOperation(state, params, true));
            if (functionName === 'operator_answer_regional_rfi') return mutateMockState((state) => operatorAnswerRequest(state, params, true));
            if (functionName === 'operator_review_proposal') {
                return mutateMockState((state) => operatorReviewProposalThreaded(state, params));
            }

            if (functionName === 'append_proposal_thread_message') {
                return mutateMockState((state) => appendProposalThreadMessage(state, params));
            }

            if (functionName === 'operator_forward_proposal_response') {
                return mutateMockState((state) => operatorForwardProposalResponse(state, params));
            }

            if (functionName === 'operator_answer_request') {
                return mutateMockState((state) => operatorAnswerRequest(state, params));
            }

            if (functionName === 'operator_send_communication') {
                return mutateMockState((state) => operatorSendCommunication(state, params));
            }

            if (functionName === 'export_gc11_research_context') {
                const state = readMockState();
                const authUserId = getCurrentAuthUserId();
                if (!liveDemoHasOperatorGrant(state, authUserId, 'gamemaster')
                    && !liveDemoHasOperatorGrant(state, authUserId, 'whitecell')) {
                    return { data: null, error: { code: '42501', message: 'GC11_OPERATOR_REQUIRED' } };
                }
                const session = state.tables.sessions.find((entry) => entry.id === params.requested_session_id);
                if (!session) {
                    return { data: null, error: { code: 'P0002', message: 'GC11_SESSION_NOT_FOUND' } };
                }
                const topology = session.session_topology_version ?? null;
                const persistedModel = session.green_seat_model ?? null;
                const effectiveModel = persistedModel === null && (topology === null || topology === 1)
                    ? 'unified_v1'
                    : persistedModel === null && topology === 2
                        ? 'regional_pairs_v1'
                        : persistedModel === 'shared_facilitator_v1' && topology === 2
                            ? 'shared_facilitator_v1'
                            : 'unknown';
                return {
                    data: {
                        session_id: session.id,
                        session_topology_version: topology,
                        green_roster_version: session.green_roster_version ?? null,
                        green_roster_snapshot: session.green_roster_snapshot ?? null,
                        persisted_green_seat_model: persistedModel,
                        effective_green_seat_model: effectiveModel,
                        effective_green_seat_model_is_derived: persistedModel === null,
                        model_status: effectiveModel === 'unknown' ? 'unknown_combination' : 'recognized',
                        unified_seat_removals: cloneValue(state.tables.gc08_unified_seat_removals || [])
                            .filter((entry) => entry.session_id === session.id)
                            .sort((left, right) => String(left.removed_at || '').localeCompare(String(right.removed_at || ''))),
                        pli_included: false
                    },
                    error: null
                };
            }

            if (functionName === 'live_demo_research_capture_mode') {
                const state = readMockState();
                const captureMode = state.tables.live_demo_runtime_config.find((entry) => (
                    entry.config_key === 'research_capture_mode'
                ))?.config_value;

                return {
                    data: String(captureMode || '').trim().toLowerCase() === 'standard'
                        ? 'standard'
                        : 'research',
                    error: null
                };
            }

            if (functionName === 'live_demo_software_build_hash') {
                const state = readMockState();
                const buildHash = state.tables.live_demo_runtime_config.find((entry) => (
                    entry.config_key === 'software_build_hash'
                ))?.config_value || null;

                return {
                    data: buildHash,
                    error: null
                };
            }

            if (functionName === 'live_demo_release_evidence') {
                const state = readMockState();
                const config = Object.fromEntries(state.tables.live_demo_runtime_config.map((entry) => [
                    entry.config_key,
                    entry.config_value
                ]));
                return {
                    data: {
                        migrationState: config.migration_state || null,
                        migrationCount: Number(config.migration_count || 0),
                        migrationLedgerSha256: config.migration_ledger_sha256 || null,
                        softwareBuildHash: config.software_build_hash || null
                    },
                    error: null
                };
            }

            if (functionName === 'update_proposal_recipient_status') {
                return mutateMockState((state) => updateProposalRecipientStatus(state, params));
            }

            return { data: null, error: null };
        },
        functions: {
            async invoke(functionName, options = {}) {
                if (['pli-report-narrative', 'trigger-pli-adjudication'].includes(functionName)
                    && !authorizeMockDerivedOperation(readMockState(), getCurrentAuthUserId(), options.body?.sessionId,
                        functionName === 'pli-report-narrative' ? 'narrative' : 'adjudicate')) {
                    return { data: null, error: { code: '42501', message: 'Session operation is not authorized' } };
                }
                if (functionName === 'pli-report-narrative') {
                    const body = options?.body || {};
                    const actionCount = Array.isArray(body?.factPack?.actions)
                        ? body.factPack.actions.length
                        : 0;
                    return {
                        data: {
                            narrative: [
                                `Mock after-action narrative for ${body.scope || 'simulation'} scope`,
                                `(${actionCount} finalized action${actionCount === 1 ? '' : 's'}).`,
                                'Macro, diplomacy, information, national interest, and escalation',
                                'outputs were summarized from the provided fact pack only.'
                            ].join(' ')
                        },
                        error: null
                    };
                }

                if (functionName === 'trigger-pli-adjudication') {
                    const body = options?.body || {};
                    return {
                        data: {
                            ok: true,
                            dispatched: true,
                            sessionId: body.sessionId || null,
                            dryRun: Boolean(body.dryRun),
                            workflow: 'pli-adjudicate.yml'
                        },
                        error: null
                    };
                }

                return {
                    data: null,
                    error: { message: `Unhandled mock edge function: ${functionName}` }
                };
            }
        },
        auth: {
            async getSession() {
                const session = readMockAuthSession();
                return {
                    data: { session },
                    error: null
                };
            },
            async signInAnonymously(credentials = {}) {
                const timestamp = Date.now();
                const authSequence = ++mockAnonymousAuthSequence;
                const session = {
                    access_token: `mock_access_${timestamp}_${authSequence}`,
                    refresh_token: `mock_refresh_${timestamp}_${authSequence}`,
                    expires_at: Math.floor(timestamp / 1000) + 3600,
                    token_type: 'bearer',
                    user: {
                        id: `anon_${timestamp}_${authSequence}`,
                        is_anonymous: true,
                        user_metadata: cloneValue(credentials?.options?.data || {})
                    }
                };

                writeMockAuthSession(session);

                return {
                    data: {
                        session,
                        user: session.user
                    },
                    error: null
                };
            },
            async signOut() {
                writeMockAuthSession(null);
                return { error: null };
            }
        }
    };
}
