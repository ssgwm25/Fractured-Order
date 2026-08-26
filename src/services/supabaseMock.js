const E2E_MOCK_ENABLEMENT_KEY = '__esg_e2e_mock_enabled';
const E2E_MOCK_CONFIG_KEY = '__esg_e2e_mock_config';
const E2E_MOCK_STATE_KEY = 'esg_e2e_backend_state';
const E2E_MOCK_AUTH_KEY = 'esg_e2e_auth_session';
const E2E_MOCK_BROADCAST_KEY = 'esg_e2e_realtime_broadcast';
const E2E_MOCK_TEST_CONFIG_GLOBAL = '__ESG_E2E_TEST_CONFIG__';
const E2E_MOCK_STATE_WRITE_LOCK = 'esg-e2e-backend-state-write';
const E2E_MOCK_ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const DECOMMISSIONED_SESSION_IDS = new Set(['00000000-0000-4000-8000-000000002026']);
let mockAnonymousAuthSequence = 0;
const DEFAULT_TIMER_ALLOCATIONS = Object.freeze({
    strategic_orientation: 5400,
    move_1: 5400,
    move_2: 5400,
    move_3: 5400
});
const DEFAULT_PLUGIN_STATE = Object.freeze({});

const MOCK_TABLES = [
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

function writeMockState(state) {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    storage.setItem(E2E_MOCK_STATE_KEY, JSON.stringify(state));
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

function mutateMockState(callback) {
    return withMockStateWriteLock(() => {
        const state = readMockState();
        const result = callback(state);
        writeMockState(state);
        return result;
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
        display_name_snapshot: seat.display_name_snapshot
            ?? normalized.tables.participants.find((participant) => participant.id === seat.participant_id)?.name
            ?? null
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
        if (!compareValues(previousRow, nextRow)) {
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

                    if (event.key !== E2E_MOCK_STATE_KEY) {
                        return;
                    }

                    const previousState = parseMockStateSnapshot(event.oldValue);
                    const nextState = parseMockStateSnapshot(event.newValue);
                    const subscribedTables = [...new Set(subscriptions.map((entry) => entry.config?.table).filter(Boolean))];

                    subscribedTables.forEach((tableName) => {
                        const changes = diffMockTableRows(
                            previousState.tables?.[tableName] || [],
                            nextState.tables?.[tableName] || []
                        );

                        changes.forEach((change) => {
                            subscriptions.forEach((subscription) => {
                                if (subscription.eventName !== 'postgres_changes') {
                                    return;
                                }

                                if (subscription.config?.schema && subscription.config.schema !== 'public') {
                                    return;
                                }

                                if (subscription.config?.table !== tableName) {
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
    return readMockAuthSession()?.user?.id || null;
}

function nextId(state, tableName) {
    state.counters[tableName] = (state.counters[tableName] || 0) + 1;
    const normalizedName = tableName.replace(/[^a-z0-9]+/gi, '_');
    return `${normalizedName}_${state.counters[tableName]}`;
}

function getTimestamp() {
    return new Date().toISOString();
}

function normalizeInsertRow(tableName, payload, state) {
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

function getSessionRoleSeatLimit(role = '') {
    const normalizedRole = normalizeSeatRole(role);

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

    return matchingSeats[0] || null;
}

function getLiveDemoParticipantRole(state, authUserId, sessionId) {
    const seat = getParticipantSeatForSession(state, authUserId, sessionId, { activeOnly: true });
    return normalizeSeatRole(seat?.role || null);
}

function getLiveDemoParticipantSurface(state, authUserId, sessionId) {
    const role = getLiveDemoParticipantRole(state, authUserId, sessionId);

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
        || liveDemoHasOperatorGrant(state, authUserId, 'whitecell')
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

    if (!seat) {
        seat = normalizeInsertRow('session_participants', {
            session_id: requested_session_id,
            participant_id: participant.id,
            role: normalizedRole,
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
            claim_status: claimStatus
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
    const removedSeat = {
        ...seat,
        is_active: false,
        last_seen: seat.last_seen || seat.heartbeat_at || seat.joined_at || removedAt,
        disconnected_at: removedAt,
        left_at: removedAt,
        updated_at: removedAt
    };

    state.tables.session_participants = state.tables.session_participants.filter((entry) => entry.id !== seat.id);

    if (participant?.auth_user_id) {
        state.tables.operator_grants = state.tables.operator_grants.filter((entry) => !(
            entry.auth_user_id === participant.auth_user_id
            && entry.surface === 'whitecell'
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
                error: { message: `Stale artifact revision. Expected ${expectedRevision}, current ${revisionNumber}.` }
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
            error: { message: `Stale artifact revision. Expected ${expectedRevision}, current ${revisionNumber}.` }
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

    const reviewResult = operatorReviewArtifact(state, {
        requested_artifact_kind: 'action',
        requested_artifact_id: action.id,
        requested_review_decision: 'complete',
        requested_team: params?.requested_team,
        requested_expected_revision: params?.requested_expected_revision,
        requested_reviewer_notes: params?.requested_reviewer_notes
    });
    if (reviewResult.error) return reviewResult;

    const communications = approvedTeams.map((recipientTeam) => {
        const communicationResult = operatorSendCommunication(state, {
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
        return communicationResult.data;
    });

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
            error: { message: `Stale proposal revision. Expected ${expectedRevision}, current ${revisionNumber}.` }
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
        ...safePayloadProposal
    } = cloneValue(payloadProposal);
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
        expectedOutcomes: action.expected_outcomes || safePayloadProposal.expectedOutcomes || null
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
    const clientMessageId = String(params?.requested_client_message_id || '').trim() || null;

    if (!parent || !parent.metadata?.thread_id) {
        return { data: null, error: { message: 'Proposal thread parent message not found.' } };
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
        return { data: null, error: { message: 'A newer proposal thread round already exists.' } };
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
        return { data: null, error: { message: 'This proposal response is awaiting White Cell review.' } };
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
        return { data: null, error: { message: 'A newer proposal thread round already exists.' } };
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

function operatorAnswerRequest(state, params) {
    const authUserId = getCurrentAuthUserId();
    const grant = getOperatorGrant(state, authUserId, 'whitecell');
    const request = state.tables.requests.find((entry) => entry.id === params?.requested_request_id);

    if (!request) {
        return { data: null, error: { message: 'Request not found.' } };
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

    state.tables.requests = state.tables.requests.map((entry) => (
        entry.id === updated.id ? updated : entry
    ));

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
        metadata: {
            ...(params?.requested_metadata && typeof params.requested_metadata === 'object'
                ? cloneValue(params.requested_metadata)
                : {}),
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
            const deniedInsert = this.payload.some((entry) => !canInsertTableRow(
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
                this.payload,
                tableRows
            );
            if (constraintError) {
                return {
                    data: null,
                    error: constraintError
                };
            }

            const insertedRows = this.payload.map((entry) => normalizeInsertRow(this.tableName, entry, state));
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
                        status: session.status
                    },
                    error: null
                };
            }

            if (functionName === 'authorize_demo_operator') {
                return mutateMockState((state) => authorizeDemoOperator(state, params));
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

            if (functionName === 'update_proposal_recipient_status') {
                return mutateMockState((state) => updateProposalRecipientStatus(state, params));
            }

            return { data: null, error: null };
        },
        functions: {
            async invoke(functionName, options = {}) {
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
