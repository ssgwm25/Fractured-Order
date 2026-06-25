const E2E_MOCK_ENABLEMENT_KEY = '__esg_e2e_mock_enabled';
const E2E_MOCK_CONFIG_KEY = '__esg_e2e_mock_config';
const E2E_MOCK_STATE_KEY = 'esg_e2e_backend_state';
const E2E_MOCK_AUTH_KEY = 'esg_e2e_auth_session';
const E2E_MOCK_TEST_CONFIG_GLOBAL = '__ESG_E2E_TEST_CONFIG__';
const E2E_MOCK_ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

const MOCK_TABLES = [
    'sessions',
    'game_state',
    'live_demo_runtime_config',
    'operator_grants',
    'participants',
    'session_participants',
    'actions',
    'requests',
    'communications',
    'timeline',
    'notetaker_data',
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
        return {
            counters: {
                ...buildInitialMockState().counters,
                ...(parsedState.counters || {})
            },
            tables: {
                ...buildInitialMockState().tables,
                ...(parsedState.tables || {})
            }
        };
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

function normalizeMockState(parsedState = null) {
    return {
        counters: {
            ...buildInitialMockState().counters,
            ...(parsedState?.counters || {})
        },
        tables: {
            ...buildInitialMockState().tables,
            ...(parsedState?.tables || {})
        }
    };
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

function createMockRealtimeChannel() {
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
                updated_at: timestamp,
                ...cloneValue(payload)
            };
        case 'game_state':
            return {
                ...baseRow,
                move: 1,
                phase: 1,
                timer_seconds: 0,
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
                updated_at: timestamp,
                ...cloneValue(payload)
            };
        case 'requests':
            return {
                ...baseRow,
                categories: [],
                status: 'pending',
                updated_at: timestamp,
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

    if (tableName === 'session_participants' || tableName === 'game_state' || tableName === 'actions'
        || tableName === 'requests' || tableName === 'communications' || tableName === 'timeline'
        || tableName === 'notetaker_data') {
        return liveDemoCanReadSession(state, authUserId, row.session_id);
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
            return liveDemoCanWriteTeamSession(
                state,
                authUserId,
                row.session_id,
                row.team,
                ['facilitator', 'scribe']
            );
        case 'communications':
            return canInsertProposalResponseCommunication(state, row, authUserId);
        case 'timeline':
            return liveDemoCanWriteSession(state, authUserId, row.session_id);
        case 'notetaker_data':
            return liveDemoCanWriteSessionSurface(
                state,
                authUserId,
                row.session_id,
                ['notetaker']
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
                liveDemoCanWriteTeamSession(state, authUserId, currentRow.session_id, currentRow.team, ['facilitator', 'scribe'])
                && liveDemoCanWriteTeamSession(state, authUserId, nextRow.session_id, nextRow.team, ['facilitator', 'scribe'])
                && nextRow.status !== 'answered'
            );
        case 'notetaker_data':
            return (
                liveDemoCanWriteSessionSurface(state, authUserId, currentRow.session_id, ['notetaker'])
                && liveDemoCanWriteSessionSurface(state, authUserId, nextRow.session_id, ['notetaker'])
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

    if (!['gamemaster', 'whitecell'].includes(normalizedSurface)) {
        return { data: null, error: { message: 'Unsupported operator surface.' } };
    }

    if (normalizedSurface === 'whitecell') {
        const session = state.tables.sessions.find((entry) => (
            entry.id === requested_session_id && entry.status === 'active'
        ));

        if (!session) {
            return { data: null, error: { message: 'This session is not currently joinable.' } };
        }

        if (!['whitecell_lead', 'whitecell_support'].includes(normalizedRole)) {
            return { data: null, error: { message: 'White Cell authorization requires a supported operator role.' } };
        }

        normalizedTeam = null;
    }

    state.tables.operator_grants = state.tables.operator_grants.filter((entry) => !(
        entry.auth_user_id === authUserId && entry.surface === normalizedSurface
    ));

    const grant = normalizeInsertRow('operator_grants', {
        auth_user_id: authUserId,
        surface: normalizedSurface,
        session_id: normalizedSurface === 'whitecell' ? requested_session_id : null,
        team_id: normalizedSurface === 'whitecell' ? normalizedTeam : null,
        role: normalizedSurface === 'whitecell' ? normalizedRole : 'white',
        operator_name: String(requested_operator_name || '').trim() || null
    }, state);

    state.tables.operator_grants.push(grant);

    return {
        data: cloneValue(grant),
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
        timer_running: false,
        timer_last_update: null
    }, state));

    return {
        data: cloneValue(session),
        error: null
    };
}

function deleteLiveDemoSession(state, {
    requested_session_id
}) {
    const authUserId = getCurrentAuthUserId();
    if (!hasPrivilegedSessionAdminGrant(state, authUserId)) {
        return { data: null, error: { message: 'Game Master or White Cell authorization is required.' } };
    }

    state.tables.sessions = state.tables.sessions.filter((entry) => entry.id !== requested_session_id);
    Object.keys(state.tables).forEach((tableName) => {
        if (tableName === 'sessions' || tableName === 'participants') {
            return;
        }

        state.tables[tableName] = state.tables[tableName].filter((entry) => entry.session_id !== requested_session_id);
    });

    return {
        data: { deleted_session_id: requested_session_id },
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
        display_name: participant?.name ?? 'Unknown',
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

    const session = state.tables.sessions.find((entry) => entry.id === requested_session_id);
    if (!session || session.status !== 'active') {
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
            is_active: true,
            heartbeat_at: now,
            joined_at: now,
            last_seen: now,
            disconnected_at: null,
            left_at: null
        }, state);
        state.tables.session_participants.push(seat);
    } else {
        claimStatus = seat.is_active && seat.role === normalizedRole
            ? 'refreshed'
            : (seat.role === normalizedRole ? 'rejoined' : 'reassigned');
        seat = {
            ...seat,
            role: normalizedRole,
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

    const respondedAt = params?.requested_responded_at ?? getTimestamp();
    const updated = {
        ...request,
        response: params?.requested_response ?? '',
        status: request.status === 'withdrawn' ? request.status : 'answered',
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

    async execute() {
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
        channel() {
            return createMockRealtimeChannel();
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
                    return resolvedCode === normalizedCode;
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
                const state = readMockState();
                const result = authorizeDemoOperator(state, params);
                writeMockState(state);
                return result;
            }

            if (functionName === 'create_live_demo_session') {
                const state = readMockState();
                const result = createLiveDemoSession(state, params);
                writeMockState(state);
                return result;
            }

            if (functionName === 'delete_live_demo_session') {
                const state = readMockState();
                const result = deleteLiveDemoSession(state, params);
                writeMockState(state);
                return result;
            }

            if (functionName === 'claim_session_role_seat') {
                const state = readMockState();
                const result = claimSessionRoleSeat(state, params);
                writeMockState(state);
                return result;
            }

            if (functionName === 'heartbeat_session_role_seat') {
                const state = readMockState();
                const result = heartbeatSessionRoleSeat(state, params);
                writeMockState(state);
                return result;
            }

            if (functionName === 'disconnect_session_role_seat') {
                const state = readMockState();
                const result = disconnectSessionRoleSeat(state, params);
                writeMockState(state);
                return result;
            }

            if (functionName === 'operator_remove_session_participant') {
                const state = readMockState();
                const result = operatorRemoveSessionParticipant(state, params);
                writeMockState(state);
                return result;
            }

            if (functionName === 'release_stale_session_role_seats') {
                const state = readMockState();
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
                writeMockState(state);
                return {
                    data: released,
                    error: null
                };
            }

            if (functionName === 'list_active_session_participants') {
                const state = readMockState();
                const result = listActiveSessionParticipants(state, params);
                writeMockState(state);
                return result;
            }

            if (functionName === 'operator_update_game_state') {
                const state = readMockState();
                const result = operatorUpdateGameState(state, params);
                writeMockState(state);
                return result;
            }

            if (functionName === 'operator_adjudicate_action') {
                const state = readMockState();
                const result = operatorAdjudicateAction(state, params);
                writeMockState(state);
                return result;
            }

            if (functionName === 'operator_answer_request') {
                const state = readMockState();
                const result = operatorAnswerRequest(state, params);
                writeMockState(state);
                return result;
            }

            if (functionName === 'operator_send_communication') {
                const state = readMockState();
                const result = operatorSendCommunication(state, params);
                writeMockState(state);
                return result;
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
                const state = readMockState();
                const result = updateProposalRecipientStatus(state, params);
                writeMockState(state);
                return result;
            }

            return { data: null, error: null };
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
                const session = {
                    access_token: `mock_access_${timestamp}`,
                    refresh_token: `mock_refresh_${timestamp}`,
                    expires_at: Math.floor(timestamp / 1000) + 3600,
                    token_type: 'bearer',
                    user: {
                        id: `anon_${timestamp}`,
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
            }
        }
    };
}
