/**
 * Database Service
 * CRUD operations for all database tables
 */

import { ensureBrowserIdentity, getRuntimeConfigStatus, supabase } from './supabase.js';
import { sessionStore } from '../stores/session.js';
import { createLogger } from '../utils/logger.js';
import { CONFIG, getRoleLimit } from '../core/config.js';
import { DatabaseError, NotFoundError, fromSupabaseError } from '../core/errors.js';
import {
    ENUMS,
    canAdjudicateAction,
    canDeleteAction,
    canEditAction,
    canSubmitAction,
    isValidActionStatus
} from '../core/enums.js';
import {
    PROPOSAL_ACTION_MECHANISM,
    parseProposalDetails
} from '../features/actions/proposalDetails.js';
import {
    MOVE_RESPONSE_ACTION_MECHANISM,
    parseMoveResponseDetails
} from '../features/actions/moveResponseDetails.js';
import {
    annotateObservationTimelineEntries,
    buildNotetakerParticipantContext,
    mergeObservationTimeline,
    mergeParticipantScopedNotetakerSection
} from '../features/notetaker/storage.js';

const logger = createLogger('Database');
let latestAuthenticatedSession = null;

async function ensureAuthenticatedBrowser() {
    latestAuthenticatedSession = await ensureBrowserIdentity({
        clientId: sessionStore.getClientId()
    });

    return latestAuthenticatedSession;
}

// A stable browser identity (auth_user_id) that arrives with a new client_id can
// collide on the global participants.auth_user_id unique index when a backend has
// not yet applied the auth-identity reconcile patch. Detect that specific failure
// so the seat claim can self-heal by re-aligning to the existing identity.
function isDuplicateAuthIdentityError(error) {
    if (!error) {
        return false;
    }
    const haystack = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
    if (haystack.includes('idx_participants_auth_user_id')) {
        return true;
    }
    return error.code === '23505' && haystack.includes('auth_user_id');
}

export function getDatabaseRuntimeStatus() {
    return getRuntimeConfigStatus();
}

export function mergeNotetakerRecord(existingRecord = null, noteData = {}, {
    clientId = null,
    timestamp = new Date().toISOString()
} = {}) {
    const resolvedTeamId = noteData.team ?? existingRecord?.team ?? null;
    const participantContext = buildNotetakerParticipantContext(noteData, {
        fallbackClientId: noteData.client_id ?? existingRecord?.client_id ?? clientId
    });
    const replacementTimeline = Array.isArray(noteData.observation_timeline)
        ? annotateObservationTimelineEntries(noteData.observation_timeline, {
            teamId: resolvedTeamId,
            timestamp,
            ...participantContext
        })
        : null;
    const appendedTimeline = annotateObservationTimelineEntries(noteData.observation_timeline_append, {
        teamId: resolvedTeamId,
        timestamp,
        ...participantContext
    });
    const mergedTeam = (
        existingRecord?.team
        && noteData.team
        && existingRecord.team !== noteData.team
    )
        ? 'shared'
        : (noteData.team ?? existingRecord?.team ?? null);

    return {
        session_id: noteData.session_id ?? existingRecord?.session_id ?? null,
        move: noteData.move ?? existingRecord?.move ?? null,
        phase: noteData.phase ?? existingRecord?.phase ?? null,
        team: mergedTeam,
        client_id: participantContext.clientId ?? existingRecord?.client_id ?? clientId ?? null,
        dynamics_analysis: noteData.dynamics_analysis === undefined
            ? existingRecord?.dynamics_analysis ?? {}
            : mergeParticipantScopedNotetakerSection(existingRecord?.dynamics_analysis, noteData.dynamics_analysis, {
                teamId: resolvedTeamId,
                timestamp,
                ...participantContext
            }),
        external_factors: noteData.external_factors === undefined
            ? existingRecord?.external_factors ?? {}
            : mergeParticipantScopedNotetakerSection(existingRecord?.external_factors, noteData.external_factors, {
                teamId: resolvedTeamId,
                timestamp,
                ...participantContext
            }),
        observation_timeline: mergeObservationTimeline(existingRecord?.observation_timeline, {
            replacementEntries: replacementTimeline,
            appendedEntries: appendedTimeline
        }),
        updated_at: timestamp
    };
}

function normalizeParticipantSeatRecord(record = null) {
    if (!record || typeof record !== 'object') {
        return record;
    }

    return {
        ...record,
        display_name: record.display_name ?? record.participant_name ?? record.participants?.name ?? null,
        client_id: record.client_id ?? record.participants?.client_id ?? null,
        participantSessionId: record.id,
        participantId: record.participant_id
    };
}

function normalizeSeatClaimRole(role = '') {
    if (role === null || role === undefined) {
        return role ?? '';
    }

    const rawRole = String(role);
    const compatibilityNormalizedRole = typeof rawRole.normalize === 'function'
        ? rawRole.normalize('NFKC')
        : rawRole;

    return compatibilityNormalizedRole
        .replace(/[^a-z_]+/gi, '')
        .toLowerCase();
}

function encodeDebugString(value = '') {
    return Array.from(String(value || ''))
        .map((character) => character.codePointAt(0)?.toString(16)?.padStart(4, '0'))
        .join(' ');
}

function resolvePersistedActionMechanism(actionData = {}, {
    allowEmptyMechanism = false
} = {}) {
    const hasExplicitMechanism = 'mechanism' in actionData;
    const explicitMechanism = typeof actionData.mechanism === 'string'
        ? actionData.mechanism.trim()
        : '';
    if (explicitMechanism) {
        return explicitMechanism;
    }

    if (parseProposalDetails(actionData.ally_contingencies)) {
        return PROPOSAL_ACTION_MECHANISM;
    }

    if (parseMoveResponseDetails(actionData.ally_contingencies)) {
        return MOVE_RESPONSE_ACTION_MECHANISM;
    }

    if (allowEmptyMechanism && hasExplicitMechanism) {
        // Draft rows keep the column non-null while the facilitator is still working.
        return '';
    }

    return null;
}

function resolveActionWritePayload(actionData = {}, operation = 'actionWrite', {
    requireMechanism = false,
    allowEmptyMechanism = false
} = {}) {
    const hasExplicitMechanism = 'mechanism' in actionData;
    const mechanism = resolvePersistedActionMechanism(actionData, {
        allowEmptyMechanism
    });
    const shouldWriteMechanism = requireMechanism || hasExplicitMechanism || Boolean(mechanism);

    if (shouldWriteMechanism && mechanism == null) {
        if (allowEmptyMechanism && hasExplicitMechanism) {
            return {
                ...actionData,
                mechanism: ''
            };
        }

        throw new DatabaseError('Action mechanism is required.', operation);
    }

    return {
        ...actionData,
        ...(shouldWriteMechanism ? { mechanism } : {})
    };
}

function normalizeOperatorGrantRecord(record = null) {
    if (!record || typeof record !== 'object') {
        return record;
    }

    return {
        ...record,
        grantId: record.grantId ?? record.id ?? null,
        operatorName: record.operatorName ?? record.operator_name ?? null,
        sessionId: record.sessionId ?? record.session_id ?? null,
        teamId: record.teamId ?? record.team_id ?? null,
        grantedAt: record.grantedAt ?? record.granted_at ?? null,
        verifiedAt: new Date().toISOString()
    };
}

function isOperatorRequestResponseUpdate(updates = {}) {
    return (
        updates.status === 'answered'
        || 'response' in updates
        || 'responded_at' in updates
        || 'answered_at' in updates
    );
}

function shouldFallbackActiveParticipantsQuery(error = null) {
    const message = String(error?.message || '').toLowerCase();
    return (
        message.includes('release_stale_session_role_seats')
        && message.includes('not unique')
    );
}

async function fetchSessionParticipantsDirect(sessionId, { activeOnly = false } = {}) {
    let query = supabase
        .from('session_participants')
        .select('*, participants(name, client_id)')
        .eq('session_id', sessionId);

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('joined_at', { ascending: true });

    if (error) {
        throw fromSupabaseError(
            error,
            activeOnly ? 'getActiveParticipantsFallback' : 'getSessionParticipants'
        );
    }

    return (data || []).map((participant) => normalizeParticipantSeatRecord(participant));
}

function shouldUseOperatorCommunicationPath(commData = {}) {
    const fromRole = String(commData?.from_role || '').trim().toLowerCase();
    return fromRole === 'white_cell';
}

async function invokeKeepaliveRpc(functionName, payload = {}) {
    const accessToken = latestAuthenticatedSession?.access_token;
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY || !accessToken) {
        return false;
    }

    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
            method: 'POST',
            keepalive: true,
            headers: {
                apikey: CONFIG.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify(payload)
        });

        return response.ok;
    } catch (error) {
        logger.warn('Keepalive RPC failed:', error);
        return false;
    }
}

const RESEARCH_TABLE_QUERY_CONFIG = Object.freeze({
    research_audit_event_log: { orderField: 'event_id', ascending: true },
    research_participant: { orderField: 'first_seen_utc', ascending: true },
    research_note: { orderField: 'created_utc', ascending: true },
    research_note_revision: { orderField: 'edited_utc', ascending: true },
    research_draft_revision: { orderField: 'created_utc', ascending: true },
    research_state_transition: { orderField: 'transition_utc', ascending: true },
    research_action_content: { orderField: 'submitted_utc', ascending: true },
    research_proposal_content: { orderField: 'submitted_utc', ascending: true },
    research_adjudication_content: { orderField: 'adjudicated_utc', ascending: true },
    research_move_response_content: { orderField: 'submitted_utc', ascending: true },
    research_rfi_content: { orderField: 'raised_utc', ascending: true },
    research_interaction_edge: { orderField: 'occurred_utc', ascending: true },
    research_data_quality_event: { orderField: 'occurred_utc', ascending: true },
    research_derived_participant_metrics: { orderField: 'participant_pseudonym', ascending: true },
    research_derived_session_metrics: { orderField: 'session_id', ascending: true },
    research_export_codebook: { orderField: 'table_name', ascending: true }
});

function normalizeResearchCaptureMode(value) {
    return String(value || '').trim().toLowerCase() === 'standard'
        ? 'standard'
        : 'research';
}

/**
 * Database service with CRUD operations for all tables
 */
export const database = {
    async authorizeOperatorAccess({
        surface,
        accessCode,
        sessionId = null,
        teamId = null,
        role = null,
        operatorName = null
    } = {}) {
        await ensureAuthenticatedBrowser();

        const { data, error } = await supabase.rpc('authorize_demo_operator', {
            requested_surface: surface,
            requested_operator_code: accessCode,
            requested_session_id: sessionId,
            requested_team_id: teamId,
            requested_role: role,
            requested_operator_name: operatorName
        });

        if (error) {
            throw fromSupabaseError(error, 'authorizeOperatorAccess');
        }

        return normalizeOperatorGrantRecord(data);
    },

    async getOperatorGrant(surface, {
        sessionId = null,
        teamId = null,
        role = null
    } = {}) {
        await ensureAuthenticatedBrowser();

        let query = supabase
            .from('operator_grants')
            .select('*')
            .eq('surface', surface);

        if (sessionId) {
            query = query.eq('session_id', sessionId);
        }

        if (teamId) {
            query = query.eq('team_id', teamId);
        }

        if (role) {
            query = query.eq('role', role);
        }

        const { data, error } = await query
            .order('granted_at', { ascending: false })
            .maybeSingle();

        if (error) {
            throw fromSupabaseError(error, 'getOperatorGrant');
        }

        return normalizeOperatorGrantRecord(data);
    },

    async requireOperatorGrant(surface, options = {}) {
        const grant = await this.getOperatorGrant(surface, options);
        if (!grant) {
            throw new DatabaseError('Operator authorization is required.', 'requireOperatorGrant');
        }

        return grant;
    },

    // ==================== SESSIONS ====================

    /**
     * Create a new session
     * @param {Object} sessionData - Session data
     * @returns {Promise<Object>} Created session
     */
    async createSession(sessionData) {
        await ensureAuthenticatedBrowser();
        logger.debug('Creating session:', sessionData.name);

        const normalizedSessionCode = typeof sessionData.session_code === 'string'
            ? sessionData.session_code.trim().toUpperCase()
            : null;

        // Persist session_code as a first-class column and mirror it into metadata for older exports.
        const metadata = {
            ...sessionData.metadata,
            session_code: normalizedSessionCode,
            description: sessionData.description || null
        };

        const { data, error } = await supabase.rpc('create_live_demo_session', {
            requested_name: sessionData.name,
            requested_session_code: normalizedSessionCode,
            requested_description: metadata.description
        });

        if (error) {
            throw fromSupabaseError(error, 'createSession');
        }

        logger.info('Session created:', data.id);
        return data;
    },

    /**
     * Get a session by ID
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Session data
     */
    async getSession(sessionId) {
        await ensureAuthenticatedBrowser();
        const { data, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                throw new NotFoundError('Session', sessionId);
            }
            throw fromSupabaseError(error, 'getSession');
        }

        return data;
    },

    /**
     * Get all active sessions
     * @returns {Promise<Object[]>} List of sessions
     */
    async getActiveSessions() {
        await ensureAuthenticatedBrowser();
        const { data, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) {
            throw fromSupabaseError(error, 'getActiveSessions');
        }

        return data || [];
    },

    /**
     * Resolve a participant-facing session code through the server-side RPC.
     * Operator note: do not restore browser-side session listing for public joins.
     * Public join prompts must call this contract instead of filtering getActiveSessions().
     * @param {string} sessionCode - Participant-entered session code
     * @returns {Promise<{id: string, name: string, session_code: string, status: string}>}
     */
    async lookupJoinableSessionByCode(sessionCode) {
        await ensureAuthenticatedBrowser();
        const normalizedCode = typeof sessionCode === 'string'
            ? sessionCode.trim().toUpperCase()
            : '';

        const { data, error } = await supabase.rpc('lookup_joinable_session_by_code', {
            requested_code: normalizedCode
        });

        if (error) {
            throw fromSupabaseError(error, 'lookupJoinableSessionByCode');
        }

        return {
            id: data?.id,
            name: data?.name,
            session_code: data?.session_code ?? normalizedCode,
            status: data?.status
        };
    },

    /**
     * Update a session
     * @param {string} sessionId - Session ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated session
     */
    async updateSession(sessionId, updates) {
        await ensureAuthenticatedBrowser();
        const { data, error } = await supabase
            .from('sessions')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', sessionId)
            .select()
            .single();

        if (error) {
            throw fromSupabaseError(error, 'updateSession');
        }

        return data;
    },

    /**
     * Delete a session (cascades to all related data)
     * @param {string} sessionId - Session ID
     */
    async deleteSession(sessionId) {
        await ensureAuthenticatedBrowser();
        const { error } = await supabase.rpc('delete_live_demo_session', {
            requested_session_id: sessionId
        });

        if (error) {
            throw fromSupabaseError(error, 'deleteSession');
        }

        logger.info('Session deleted:', sessionId);
    },

    // ==================== GAME STATE ====================

    /**
     * Create initial game state for a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Created game state
     */
    async createGameState(sessionId) {
        await ensureAuthenticatedBrowser();
        const { data, error } = await supabase
            .from('game_state')
            .insert({
                session_id: sessionId,
                move: 1,
                phase: 1,
                timer_seconds: 5400, // 90 minutes default
                timer_running: false,
                timer_last_update: null
            })
            .select()
            .single();

        if (error) {
            throw fromSupabaseError(error, 'createGameState');
        }

        return data;
    },

    /**
     * Get game state for a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Game state
     */
    async getGameState(sessionId) {
        await ensureAuthenticatedBrowser();
        const { data, error } = await supabase
            .from('game_state')
            .select('*')
            .eq('session_id', sessionId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                throw new NotFoundError('GameState', sessionId);
            }
            throw fromSupabaseError(error, 'getGameState');
        }

        return data;
    },

    /**
     * Update game state
     * @param {string} sessionId - Session ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated game state
     */
    async updateGameState(sessionId, updates) {
        await ensureAuthenticatedBrowser();
        // Map any legacy field names to schema field names
        const mappedUpdates = { ...updates };

        // Map current_move -> move, current_phase -> phase
        if ('current_move' in mappedUpdates) {
            mappedUpdates.move = mappedUpdates.current_move;
            delete mappedUpdates.current_move;
        }
        if ('current_phase' in mappedUpdates) {
            mappedUpdates.phase = mappedUpdates.current_phase;
            delete mappedUpdates.current_phase;
        }
        // Map last_update -> timer_last_update for timer updates
        if ('last_update' in mappedUpdates) {
            mappedUpdates.timer_last_update = mappedUpdates.last_update;
            delete mappedUpdates.last_update;
        }

        const { data, error } = await supabase.rpc('operator_update_game_state', {
            requested_session_id: sessionId,
            requested_move: mappedUpdates.move ?? null,
            requested_phase: mappedUpdates.phase ?? null,
            requested_timer_seconds: mappedUpdates.timer_seconds ?? null,
            requested_timer_running: mappedUpdates.timer_running ?? null,
            requested_timer_last_update: mappedUpdates.timer_last_update ?? null
        });

        if (error) {
            throw fromSupabaseError(error, 'updateGameState');
        }

        return data;
    },

    /**
     * Log a game state transition
     * @param {string} sessionId - Session ID
     * @param {string} transitionType - Type of transition (move, phase)
     * @param {number} fromValue - Previous value
     * @param {number} toValue - New value
     */
    async logTransition(sessionId, transitionType, fromValue, toValue) {
        await ensureAuthenticatedBrowser();
        const { error } = await supabase
            .from('game_state_transitions')
            .insert({
                session_id: sessionId,
                transition_type: transitionType,
                from_value: fromValue,
                to_value: toValue,
                client_id: sessionStore.getClientId()
            });

        if (error) {
            logger.error('Failed to log transition:', error);
        }
    },

    // ==================== PARTICIPANTS ====================

    /**
     * Claim a seat for the current browser identity through the server-side RPC.
     * This is the authoritative join contract for public participants and White Cell operators.
     * @param {string} sessionId - Session ID
     * @param {string} role - Participant role
     * @param {string} name - Display name
     * @returns {Promise<Object>} Claimed session_participant record
     */
    async claimParticipantSeat(sessionId, role, name = '') {
        const authSession = await ensureAuthenticatedBrowser();
        const normalizedRole = normalizeSeatClaimRole(role);
        logger.debug('Seat claim request payload:', {
            sessionId,
            role,
            normalizedRole,
            roleCodePoints: encodeDebugString(role),
            normalizedRoleCodePoints: encodeDebugString(normalizedRole),
            clientId: sessionStore.getClientId()
        });

        const runClaim = () => supabase.rpc('claim_session_role_seat', {
            requested_session_id: sessionId,
            requested_role: normalizedRole,
            requested_name: name || null,
            requested_client_id: sessionStore.getClientId(),
            requested_timeout_seconds: CONFIG.HEARTBEAT_TIMEOUT_SECONDS
        });

        let { data, error } = await runClaim();

        // Self-heal: a previous participants row already owns this browser identity
        // under a different client_id. Re-align to that row's client_id and retry
        // once so the claim reconciles on client_id instead of inserting a duplicate.
        if (error && isDuplicateAuthIdentityError(error)) {
            logger.warn('Seat claim hit a stale browser-identity row; re-aligning client id and retrying.');
            const realigned = await this.realignClientIdToAuthIdentity(authSession?.user?.id);
            if (realigned) {
                ({ data, error } = await runClaim());
            }
        }

        if (error) {
            logger.error('Seat claim RPC failed:', error);
            if (isDuplicateAuthIdentityError(error)) {
                throw new DatabaseError(
                    'This browser is still attached to a previous session seat. Please refresh and try again, '
                    + 'or ask the operator to remove your seat from the participant roster.',
                    'claimParticipantSeat',
                    error
                );
            }
            throw fromSupabaseError(error, 'claimParticipantSeat');
        }

        const claimedSeat = normalizeParticipantSeatRecord(data);
        logger.info('Participant seat claimed:', {
            role: normalizedRole,
            sessionId: sessionId?.substring?.(0, 8),
            claimStatus: claimedSeat?.claim_status
        });

        return claimedSeat;
    },

    /**
     * Re-align the local client id to the participants row that already owns the
     * current browser auth identity, so a seat claim can reconcile on client_id.
     * @param {string} authUserId - Supabase auth user id for this browser
     * @returns {Promise<boolean>} Whether the client id was changed
     */
    async realignClientIdToAuthIdentity(authUserId) {
        if (!authUserId) {
            return false;
        }

        const { data, error } = await supabase
            .from('participants')
            .select('client_id')
            .eq('auth_user_id', authUserId)
            .maybeSingle();

        if (error) {
            logger.warn('Could not resolve existing participant identity for re-align:', error);
            return false;
        }

        const existingClientId = data?.client_id;
        if (!existingClientId || existingClientId === sessionStore.getClientId()) {
            return false;
        }

        sessionStore.setClientId(existingClientId);
        logger.info('Re-aligned client id to the existing browser-identity participant row.');
        return true;
    },

    async registerParticipant(sessionId, role, name = '') {
        return this.claimParticipantSeat(sessionId, role, name);
    },

    /**
     * Update participant record
     * @param {string} sessionId - Session ID
     * @param {string} sessionParticipantId - Session participant record ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated record
     */
    async updateParticipant(sessionId, sessionParticipantId, updates) {
        await ensureAuthenticatedBrowser();
        const { data, error } = await supabase
            .from('session_participants')
            .update(updates)
            .eq('id', sessionParticipantId)
            .eq('session_id', sessionId)
            .select()
            .single();

        if (error) {
            throw fromSupabaseError(error, 'updateParticipant');
        }

        return normalizeParticipantSeatRecord(data);
    },

    /**
     * Update heartbeat for current participant
     * @param {string} sessionId - Session ID
     */
    async updateHeartbeat(sessionId, sessionParticipantId = sessionStore.getSessionParticipantId?.()) {
        await ensureAuthenticatedBrowser();

        if (!sessionParticipantId) {
            throw new DatabaseError('Cannot send a heartbeat without a claimed seat.', 'updateHeartbeat');
        }

        const { data, error } = await supabase.rpc('heartbeat_session_role_seat', {
            requested_session_id: sessionId,
            requested_session_participant_id: sessionParticipantId,
            requested_client_id: sessionStore.getClientId(),
            requested_timeout_seconds: CONFIG.HEARTBEAT_TIMEOUT_SECONDS
        });

        if (error) {
            throw fromSupabaseError(error, 'updateHeartbeat');
        }

        return normalizeParticipantSeatRecord(data);
    },

    /**
     * Mark participant as disconnected
     * @param {string} sessionId - Session ID
     * @param {string} sessionParticipantId - Session participant ID
     */
    async disconnectParticipant(sessionId, sessionParticipantId) {
        await ensureAuthenticatedBrowser();
        if (!sessionParticipantId) {
            return null;
        }

        const { data, error } = await supabase.rpc('disconnect_session_role_seat', {
            requested_session_id: sessionId,
            requested_session_participant_id: sessionParticipantId,
            requested_client_id: sessionStore.getClientId(),
            requested_timeout_seconds: CONFIG.HEARTBEAT_TIMEOUT_SECONDS
        });

        if (error) {
            throw fromSupabaseError(error, 'disconnectParticipant');
        }

        return normalizeParticipantSeatRecord(data);
    },

    /**
     * Remove a participant seat from a session through the protected Game Master RPC.
     * @param {string} sessionId - Session ID
     * @param {string} sessionParticipantId - Session participant ID
     * @returns {Promise<Object>} Removed seat payload
     */
    async removeSessionParticipant(sessionId, sessionParticipantId) {
        await ensureAuthenticatedBrowser();
        const { data, error } = await supabase.rpc('operator_remove_session_participant', {
            requested_session_id: sessionId,
            requested_session_participant_id: sessionParticipantId
        });

        if (error) {
            throw fromSupabaseError(error, 'removeSessionParticipant');
        }

        return normalizeParticipantSeatRecord(data);
    },

    async disconnectParticipantKeepalive(sessionId, sessionParticipantId) {
        if (!sessionId || !sessionParticipantId) {
            return false;
        }

        return invokeKeepaliveRpc('disconnect_session_role_seat', {
            requested_session_id: sessionId,
            requested_session_participant_id: sessionParticipantId,
            requested_client_id: sessionStore.getClientId(),
            requested_timeout_seconds: CONFIG.HEARTBEAT_TIMEOUT_SECONDS
        });
    },

    async releaseStaleParticipantSeats(sessionId) {
        await ensureAuthenticatedBrowser();

        const { data, error } = await supabase.rpc('release_stale_session_role_seats', {
            requested_session_id: sessionId,
            requested_timeout_seconds: CONFIG.HEARTBEAT_TIMEOUT_SECONDS
        });

        if (error) {
            throw fromSupabaseError(error, 'releaseStaleParticipantSeats');
        }

        return data ?? 0;
    },

    /**
     * Get the full participant seat history for a session, including inactive seats.
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object[]>} Session participants with names from the participants table
     */
    async getSessionParticipants(sessionId) {
        await ensureAuthenticatedBrowser();
        return fetchSessionParticipantsDirect(sessionId);
    },

    /**
     * Get active participants for a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object[]>} Active participants with names from participants table
     */
    async getActiveParticipants(sessionId) {
        await ensureAuthenticatedBrowser();
        const { data, error } = await supabase.rpc('list_active_session_participants', {
            requested_session_id: sessionId,
            requested_timeout_seconds: CONFIG.HEARTBEAT_TIMEOUT_SECONDS
        });

        if (error) {
            if (shouldFallbackActiveParticipantsQuery(error)) {
                logger.warn('Participant roster RPC is ambiguous on this backend. Falling back to direct session_participants read.', {
                    sessionId
                });
                return fetchSessionParticipantsDirect(sessionId, { activeOnly: true });
            }
            throw fromSupabaseError(error, 'getActiveParticipants');
        }

        return (data || []).map((participant) => normalizeParticipantSeatRecord(participant));
    },

    /**
     * Check role availability
     * @param {string} sessionId - Session ID
     * @param {string} role - Role to check
     * @param {number} maxAllowed - Maximum allowed for this role
     * @returns {Promise<Object>} Availability info
     */
    async checkRoleAvailability(sessionId, role, maxAllowed) {
        const activeParticipants = await this.getActiveParticipants(sessionId);
        const currentCount = activeParticipants.filter((participant) => participant.role === role).length;
        const resolvedMaxAllowed = maxAllowed ?? getRoleLimit(role);

        return {
            available: currentCount < resolvedMaxAllowed,
            currentCount,
            maxAllowed: resolvedMaxAllowed
        };
    },

    // ==================== ACTIONS ====================

    /**
     * Create an action
     * @param {Object} actionData - Action data
     * @returns {Promise<Object>} Created action
     */
    async createAction(actionData) {
        await ensureAuthenticatedBrowser();
        const status = actionData.status ?? ENUMS.ACTION_STATUS.DRAFT;
        if (!isValidActionStatus(status)) {
            throw new DatabaseError(`Invalid action status: ${status}`, 'createAction');
        }
        const resolvedActionData = resolveActionWritePayload(actionData, 'createAction', {
            requireMechanism: true,
            allowEmptyMechanism: status === ENUMS.ACTION_STATUS.DRAFT
        });
        const submittedAt = status === ENUMS.ACTION_STATUS.SUBMITTED
            ? (resolvedActionData.submitted_at || new Date().toISOString())
            : (resolvedActionData.submitted_at || null);

        const { data, error } = await supabase
            .from('actions')
            .insert({
                session_id: resolvedActionData.session_id,
                client_id: resolvedActionData.client_id,
                move: resolvedActionData.move,
                phase: resolvedActionData.phase,
                team: resolvedActionData.team,
                mechanism: resolvedActionData.mechanism,
                sector: resolvedActionData.sector,
                exposure_type: resolvedActionData.exposure_type,
                targets: resolvedActionData.targets || [],
                goal: resolvedActionData.goal,
                expected_outcomes: resolvedActionData.expected_outcomes,
                ally_contingencies: resolvedActionData.ally_contingencies,
                priority: resolvedActionData.priority,
                status,
                submitted_at: submittedAt,
                adjudicated_at: resolvedActionData.adjudicated_at || null
            })
            .select()
            .single();

        if (error) {
            throw fromSupabaseError(error, 'createAction');
        }

        logger.info('Action created:', data.id);
        return data;
    },

    /**
     * Get actions for a session
     * @param {string} sessionId - Session ID
     * @param {Object} filters - Optional filters
     * @returns {Promise<Object[]>} Actions
     */
    async fetchActions(sessionId, filters = {}) {
        let query = supabase
            .from('actions')
            .select('*')
            .eq('session_id', sessionId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false });

        if (filters.move) {
            query = query.eq('move', filters.move);
        }

        if (filters.status) {
            query = query.eq('status', filters.status);
        }

        if (Array.isArray(filters.statuses) && filters.statuses.length > 0) {
            query = query.in('status', filters.statuses);
        }

        if (filters.team) {
            query = query.eq('team', filters.team);
        }

        const { data, error } = await query;

        if (error) {
            throw fromSupabaseError(error, 'fetchActions');
        }

        return data || [];
    },

    /**
     * Get a single action by ID
     * @param {string} actionId - Action ID
     * @returns {Promise<Object>} Action
     */
    async getAction(actionId) {
        const { data, error } = await supabase
            .from('actions')
            .select('*')
            .eq('id', actionId)
            .eq('is_deleted', false)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                throw new NotFoundError('Action', actionId);
            }
            throw fromSupabaseError(error, 'getAction');
        }

        return data;
    },

    /**
     * Update an action
     * @param {string} actionId - Action ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated action
     */
    async updateAction(actionId, updates, {
        allowEmptyMechanism = false
    } = {}) {
        await ensureAuthenticatedBrowser();
        if ('status' in updates && !isValidActionStatus(updates.status)) {
            throw new DatabaseError(`Invalid action status: ${updates.status}`, 'updateAction');
        }
        const resolvedUpdates = resolveActionWritePayload(updates, 'updateAction', {
            allowEmptyMechanism
        });

        const { data, error } = await supabase
            .from('actions')
            .update({
                ...resolvedUpdates,
                updated_at: new Date().toISOString()
            })
            .eq('id', actionId)
            .select()
            .single();

        if (error) {
            throw fromSupabaseError(error, 'updateAction');
        }

        return data;
    },

    /**
     * Update a draft action only
     * @param {string} actionId - Action ID
     * @param {Object} updates - Updates to apply to a draft action
     * @returns {Promise<Object>} Updated action
     */
    async updateDraftAction(actionId, updates) {
        const existingAction = await this.getAction(actionId);

        if (!canEditAction(existingAction)) {
            throw new DatabaseError('Only draft actions can be edited.', 'updateDraftAction');
        }

        const {
            status,
            submitted_at,
            adjudicated_at,
            outcome,
            adjudication_notes,
            ...draftUpdates
        } = updates;

        return this.updateAction(actionId, draftUpdates, {
            allowEmptyMechanism: true
        });
    },

    /**
     * Submit a draft action for White Cell review
     * @param {string} actionId - Action ID
     * @returns {Promise<Object>} Updated action
     */
    async submitAction(actionId) {
        const existingAction = await this.getAction(actionId);

        if (!canSubmitAction(existingAction)) {
            throw new DatabaseError('Only draft actions can be submitted.', 'submitAction');
        }

        return this.updateAction(actionId, {
            status: ENUMS.ACTION_STATUS.SUBMITTED,
            submitted_at: new Date().toISOString()
        });
    },

    /**
     * Adjudicate a submitted action
     * @param {string} actionId - Action ID
     * @param {Object} adjudication - Adjudication data
     * @returns {Promise<Object>} Updated action
     */
    async adjudicateAction(actionId, adjudication = {}) {
        const existingAction = await this.getAction(actionId);

        if (!canAdjudicateAction(existingAction)) {
            throw new DatabaseError('Only submitted actions can be adjudicated.', 'adjudicateAction');
        }

        await ensureAuthenticatedBrowser();
        const { data, error } = await supabase.rpc('operator_adjudicate_action', {
            requested_action_id: actionId,
            requested_outcome: adjudication.outcome,
            requested_adjudication_notes: adjudication.adjudication_notes || null,
            requested_adjudicated_at: adjudication.adjudicated_at || new Date().toISOString()
        });

        if (error) {
            throw fromSupabaseError(error, 'adjudicateAction');
        }

        return data;
    },

    /**
     * Delete an action (soft delete)
     * @param {string} actionId - Action ID
     */
    async deleteAction(actionId) {
        await ensureAuthenticatedBrowser();
        const { error } = await supabase
            .from('actions')
            .update({
                is_deleted: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', actionId);

        if (error) {
            throw fromSupabaseError(error, 'deleteAction');
        }

        logger.info('Action deleted:', actionId);
    },

    /**
     * Delete a draft action only
     * @param {string} actionId - Action ID
     */
    async deleteDraftAction(actionId) {
        const existingAction = await this.getAction(actionId);

        if (!canDeleteAction(existingAction)) {
            throw new DatabaseError('Only draft actions can be deleted.', 'deleteDraftAction');
        }

        await this.deleteAction(actionId);
    },

    // ==================== REQUESTS (RFIs) ====================

    /**
     * Create a request (RFI)
     * @param {Object} requestData - Request data
     * @returns {Promise<Object>} Created request
     */
    async createRequest(requestData) {
        await ensureAuthenticatedBrowser();
        const query = requestData.query ?? requestData.question ?? null;
        const { data, error } = await supabase
            .from('requests')
            .insert({
                session_id: requestData.session_id,
                team: requestData.team,
                client_id: requestData.client_id,
                move: requestData.move,
                phase: requestData.phase,
                priority: requestData.priority,
                categories: requestData.categories,
                query,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            throw fromSupabaseError(error, 'createRequest');
        }

        logger.info('Request created:', data.id);
        return data;
    },

    /**
     * Get requests for a session
     * @param {string} sessionId - Session ID
     * @param {Object} filters - Optional filters
     * @returns {Promise<Object[]>} Requests
     */
    async fetchRequests(sessionId, filters = {}) {
        let query = supabase
            .from('requests')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false });

        if (filters.status) {
            query = query.eq('status', filters.status);
        }

        if (filters.move) {
            query = query.eq('move', filters.move);
        }

        if (filters.team) {
            query = query.eq('team', filters.team);
        }

        const { data, error } = await query;

        if (error) {
            throw fromSupabaseError(error, 'fetchRequests');
        }

        return data || [];
    },

    /**
     * Update a request
     * @param {string} requestId - Request ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated request
     */
    async updateRequest(requestId, updates) {
        await ensureAuthenticatedBrowser();

        if (isOperatorRequestResponseUpdate(updates)) {
            const { data, error } = await supabase.rpc('operator_answer_request', {
                requested_request_id: requestId,
                requested_response: updates.response ?? '',
                requested_responded_at: updates.responded_at ?? updates.answered_at ?? new Date().toISOString()
            });

            if (error) {
                throw fromSupabaseError(error, 'updateRequest');
            }

            return data;
        }

        const { data, error } = await supabase
            .from('requests')
            .update(updates)
            .eq('id', requestId)
            .select()
            .single();

        if (error) {
            throw fromSupabaseError(error, 'updateRequest');
        }

        return data;
    },

    // ==================== COMMUNICATIONS ====================

    /**
     * Create a communication
     * @param {Object} commData - Communication data
     * @returns {Promise<Object>} Created communication
     */
    async createCommunication(commData) {
        await ensureAuthenticatedBrowser();

        if (shouldUseOperatorCommunicationPath(commData)) {
            const { data, error } = await supabase.rpc('operator_send_communication', {
                requested_session_id: commData.session_id,
                requested_to_role: commData.to_role || 'all',
                requested_type: commData.type,
                requested_content: commData.content,
                requested_title: commData.title || null,
                requested_linked_request_id: commData.linked_request_id || null,
                requested_metadata: commData.metadata || {}
            });

            if (error) {
                throw fromSupabaseError(error, 'createCommunication');
            }

            return data;
        }

        const { data, error } = await supabase
            .from('communications')
            .insert({
                session_id: commData.session_id,
                linked_request_id: commData.linked_request_id || null,
                type: commData.type,
                from_role: commData.from_role,
                to_role: commData.to_role || 'all',
                content: commData.content,
                metadata: commData.metadata || {}
            })
            .select()
            .single();

        if (error) {
            throw fromSupabaseError(error, 'createCommunication');
        }

        return data;
    },

    async updateProposalRecipientStatus(communicationId, status, extraMetadata = {}) {
        await ensureAuthenticatedBrowser();

        const { data, error } = await supabase.rpc('update_proposal_recipient_status', {
            requested_communication_id: communicationId,
            requested_status: status,
            requested_metadata: extraMetadata
        });

        if (error) {
            throw fromSupabaseError(error, 'updateProposalRecipientStatus');
        }

        return data;
    },

    /**
     * Get communications for a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object[]>} Communications
     */
    async fetchCommunications(sessionId) {
        const { data, error } = await supabase
            .from('communications')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false });

        if (error) {
            throw fromSupabaseError(error, 'fetchCommunications');
        }

        return data || [];
    },

    async getResearchCaptureMode() {
        const { data, error } = await supabase.rpc('live_demo_research_capture_mode');
        if (error) {
            logger.warn('Research capture mode RPC unavailable; defaulting to research.', error);
            return 'research';
        }

        return normalizeResearchCaptureMode(data);
    },

    async getResearchBuildHash() {
        const { data, error } = await supabase.rpc('live_demo_software_build_hash');
        if (error) {
            logger.warn('Research build hash RPC unavailable; omitting runtime build hash.', error);
            return null;
        }

        const normalizedValue = typeof data === 'string' ? data.trim() : '';
        return normalizedValue || null;
    },

    async fetchResearchTable(tableName, sessionId) {
        const queryConfig = RESEARCH_TABLE_QUERY_CONFIG[tableName];
        if (!queryConfig) {
            throw new DatabaseError(`Unsupported research table: ${tableName}`, 'fetchResearchTable');
        }

        let query = supabase
            .from(tableName)
            .select('*');

        if (sessionId) {
            query = query.eq('session_id', sessionId);
        }

        if (queryConfig.orderField) {
            query = query.order(queryConfig.orderField, { ascending: queryConfig.ascending !== false });
        }

        const { data, error } = await query;
        if (error) {
            logger.warn(`Research table ${tableName} is unavailable; continuing with derived export data.`, error);
            return [];
        }

        return data || [];
    },

    // ==================== TIMELINE ====================

    /**
     * Create a timeline event
     * @param {Object} eventData - Event data
     * @returns {Promise<Object>} Created event
     */
    async createTimelineEvent(eventData) {
        await ensureAuthenticatedBrowser();
        const rawMetadata = eventData.metadata && typeof eventData.metadata === 'object'
            ? { ...eventData.metadata }
            : null;
        const category = eventData.category ?? rawMetadata?.category ?? null;
        const factionTag = eventData.faction_tag ?? rawMetadata?.faction_tag ?? null;
        const debateMarker = eventData.debate_marker ?? rawMetadata?.debate_marker ?? null;
        if (rawMetadata) {
            delete rawMetadata.category;
            delete rawMetadata.faction_tag;
            delete rawMetadata.debate_marker;
        }
        const metadata = rawMetadata && Object.keys(rawMetadata).length ? rawMetadata : null;
        const type = eventData.type ?? eventData.event_type ?? null;
        const content = eventData.content ?? eventData.description ?? null;

        const { data, error } = await supabase
            .from('timeline')
            .insert({
                session_id: eventData.session_id,
                team: eventData.team || 'blue',
                type,
                content,
                category,
                faction_tag: factionTag,
                debate_marker: debateMarker,
                metadata,
                move: eventData.move,
                phase: eventData.phase,
                client_id: eventData.client_id
            })
            .select()
            .single();

        if (error) {
            throw fromSupabaseError(error, 'createTimelineEvent');
        }

        return data;
    },

    /**
     * Get timeline events for a session
     * @param {string} sessionId - Session ID
     * @param {Object} filters - Optional filters
     * @returns {Promise<Object[]>} Timeline events
     */
    async fetchTimeline(sessionId, filters = {}) {
        let query = supabase
            .from('timeline')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false });

        if (filters.type) {
            query = query.eq('type', filters.type);
        }

        if (filters.team) {
            query = query.eq('team', filters.team);
        }

        if (filters.move) {
            query = query.eq('move', filters.move);
        }

        if (filters.limit) {
            query = query.limit(filters.limit);
        }

        const { data, error } = await query;

        if (error) {
            throw fromSupabaseError(error, 'fetchTimeline');
        }

        return data || [];
    },

    /**
     * Get a full monitoring/export bundle for a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Session bundle
     */
    async fetchSessionBundle(sessionId) {
        const [session, gameState, participants, actions, requests, timeline] = await Promise.all([
            this.getSession(sessionId),
            this.getGameState(sessionId).catch(() => null),
            this.getSessionParticipants(sessionId).catch(() => []),
            this.fetchActions(sessionId).catch(() => []),
            this.fetchRequests(sessionId).catch(() => []),
            this.fetchTimeline(sessionId).catch(() => [])
        ]);

        return {
            session,
            gameState,
            participants,
            actions,
            requests,
            timeline
        };
    },

    async fetchResearchExportBundle(sessionId) {
        const [
            sessionBundle,
            communications,
            notetakerData,
            captureMode,
            softwareBuildHash,
            researchAuditEventLog,
            researchParticipants,
            researchNotes,
            researchNoteRevisions,
            researchDraftRevisions,
            researchStateTransitions,
            researchActionContent,
            researchProposalContent,
            researchAdjudicationContent,
            researchMoveResponseContent,
            researchRfiContent,
            researchInteractionEdges,
            researchDataQualityEvents,
            researchDerivedParticipantMetrics,
            researchDerivedSessionMetrics,
            researchCodebook
        ] = await Promise.all([
            this.fetchSessionBundle(sessionId),
            this.fetchCommunications(sessionId).catch(() => []),
            this.fetchNotetakerData(sessionId).catch(() => []),
            this.getResearchCaptureMode(),
            this.getResearchBuildHash(),
            this.fetchResearchTable('research_audit_event_log', sessionId),
            this.fetchResearchTable('research_participant', sessionId),
            this.fetchResearchTable('research_note', sessionId),
            this.fetchResearchTable('research_note_revision', null),
            this.fetchResearchTable('research_draft_revision', sessionId),
            this.fetchResearchTable('research_state_transition', sessionId),
            this.fetchResearchTable('research_action_content', sessionId),
            this.fetchResearchTable('research_proposal_content', sessionId),
            this.fetchResearchTable('research_adjudication_content', sessionId),
            this.fetchResearchTable('research_move_response_content', sessionId),
            this.fetchResearchTable('research_rfi_content', sessionId),
            this.fetchResearchTable('research_interaction_edge', sessionId),
            this.fetchResearchTable('research_data_quality_event', sessionId),
            this.fetchResearchTable('research_derived_participant_metrics', sessionId),
            this.fetchResearchTable('research_derived_session_metrics', sessionId),
            this.fetchResearchTable('research_export_codebook', null)
        ]);
        const researchNoteIds = new Set(
            researchNotes
                .map((note) => note?.note_id)
                .filter(Boolean)
        );

        return {
            ...sessionBundle,
            communications,
            notetakerData,
            captureMode,
            softwareBuildHash,
            researchAuditEventLog,
            researchParticipants,
            researchNotes,
            researchNoteRevisions: researchNoteIds.size
                ? researchNoteRevisions.filter((revision) => researchNoteIds.has(revision?.note_id))
                : researchNoteRevisions,
            researchDraftRevisions,
            researchStateTransitions,
            researchActionContent,
            researchProposalContent,
            researchAdjudicationContent,
            researchMoveResponseContent,
            researchRfiContent,
            researchInteractionEdges,
            researchDataQualityEvents,
            researchDerivedParticipantMetrics,
            researchDerivedSessionMetrics,
            researchCodebook
        };
    },

    // ==================== NOTETAKER DATA ====================

    /**
     * Save or update notetaker data
     * @param {Object} noteData - Notetaker data
     * @returns {Promise<Object>} Saved data
     */
    async saveNotetakerData(noteData) {
        await ensureAuthenticatedBrowser();
        const normalizedPayload = {
            ...noteData,
            ...buildNotetakerParticipantContext(noteData, {
                fallbackClientId: sessionStore.getClientId(),
                fallbackParticipantLabel: sessionStore.getSessionData()?.displayName || null
            })
        };
        const maxAttempts = 4;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const timestamp = new Date().toISOString();
            const { data: existing, error: existingError } = await supabase
                .from('notetaker_data')
                .select('*')
                .eq('session_id', normalizedPayload.session_id)
                .eq('move', normalizedPayload.move)
                .maybeSingle();

            if (existingError) {
                throw fromSupabaseError(existingError, 'getNotetakerDataForSave');
            }

            const mergedRecord = mergeNotetakerRecord(existing, normalizedPayload, {
                clientId: sessionStore.getClientId(),
                timestamp
            });

            if (existing) {
                const { data, error } = await supabase
                    .from('notetaker_data')
                    .update(mergedRecord)
                    .eq('id', existing.id)
                    .eq('updated_at', existing.updated_at)
                    .select()
                    .maybeSingle();

                if (error) {
                    throw fromSupabaseError(error, 'updateNotetakerData');
                }

                if (data) {
                    return data;
                }

                logger.warn('Retrying notetaker save after a concurrent update.', {
                    attempt,
                    sessionId: normalizedPayload.session_id,
                    move: normalizedPayload.move
                });
                continue;
            }

            const { data, error } = await supabase
                .from('notetaker_data')
                .insert(mergedRecord)
                .select()
                .single();

            if (!error) {
                return data;
            }

            if (error.code === '23505' || /duplicate key/i.test(error.message || '')) {
                logger.warn('Retrying notetaker insert after a concurrent create.', {
                    attempt,
                    sessionId: normalizedPayload.session_id,
                    move: normalizedPayload.move
                });
                continue;
            }

            throw fromSupabaseError(error, 'createNotetakerData');
        }

        throw new DatabaseError(
            'Notetaker notes changed while saving. Reload the move notes and try again.',
            'saveNotetakerData'
        );
    },

    /**
     * Get notetaker data for a specific session and move
     * @param {string} sessionId - Session ID
     * @param {number} move - Move number
     * @returns {Promise<Object|null>} Notetaker data for the move
     */
    async getNotetakerData(sessionId, move) {
        const { data, error } = await supabase
            .from('notetaker_data')
            .select('*')
            .eq('session_id', sessionId)
            .eq('move', move)
            .maybeSingle();

        if (error) {
            throw fromSupabaseError(error, 'getNotetakerData');
        }

        return data;
    },

    /**
     * Get notetaker data for a session
     * @param {string} sessionId - Session ID
     * @param {number} [move] - Specific move (optional)
     * @returns {Promise<Object[]>} Notetaker data
     */
    async fetchNotetakerData(sessionId, move = null) {
        let query = supabase
            .from('notetaker_data')
            .select('*')
            .eq('session_id', sessionId)
            .order('move', { ascending: true });

        if (move !== null && move !== undefined) {
            query = query.eq('move', move);
        }

        const { data, error } = await query;

        if (error) {
            throw fromSupabaseError(error, 'fetchNotetakerData');
        }

        return data || [];
    }
};

export default database;
