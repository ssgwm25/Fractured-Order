/**
 * Custom Error Classes
 * Specialized error types for the ESG Simulation Platform
 */

/**
 * Base error class for ESG-specific errors
 */
export class ESGError extends Error {
    constructor(message, code = 'ESG_ERROR') {
        super(message);
        this.name = 'ESGError';
        this.code = code;
        this.timestamp = new Date().toISOString();
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            timestamp: this.timestamp
        };
    }
}

/**
 * Session-related errors
 */
export class SessionError extends ESGError {
    constructor(message, code = 'SESSION_ERROR') {
        super(message, code);
        this.name = 'SessionError';
    }
}

/**
 * Error when no session is available
 */
export class NoSessionError extends SessionError {
    constructor(message = 'No active session. Please join a session first.') {
        super(message, 'NO_SESSION');
        this.name = 'NoSessionError';
    }
}

/**
 * Error when session ID is invalid
 */
export class InvalidSessionError extends SessionError {
    constructor(sessionId) {
        super(`Invalid session ID: ${sessionId}`, 'INVALID_SESSION');
        this.name = 'InvalidSessionError';
        this.sessionId = sessionId;
    }
}

/**
 * Authentication and authorization errors
 */
export class AuthError extends ESGError {
    constructor(message, code = 'AUTH_ERROR') {
        super(message, code);
        this.name = 'AuthError';
    }
}

/**
 * Error when password is incorrect
 */
export class InvalidPasswordError extends AuthError {
    constructor() {
        super('Invalid password', 'INVALID_PASSWORD');
        this.name = 'InvalidPasswordError';
    }
}

/**
 * Error when role is not available
 */
export class RoleUnavailableError extends AuthError {
    constructor(role, currentCount, maxAllowed) {
        super(
            `Role "${role}" is not available. ${currentCount}/${maxAllowed} slots filled.`,
            'ROLE_UNAVAILABLE'
        );
        this.name = 'RoleUnavailableError';
        this.role = role;
        this.currentCount = currentCount;
        this.maxAllowed = maxAllowed;
    }
}

/**
 * Error when user lacks permission
 */
export class PermissionDeniedError extends AuthError {
    constructor(action, role) {
        super(
            `Permission denied: Role "${role}" cannot perform "${action}"`,
            'PERMISSION_DENIED'
        );
        this.name = 'PermissionDeniedError';
        this.action = action;
        this.role = role;
    }
}

/**
 * Database operation errors
 */
export class DatabaseError extends ESGError {
    constructor(message, operation, originalError = null) {
        super(message, 'DATABASE_ERROR');
        this.name = 'DatabaseError';
        this.operation = operation;
        this.originalError = originalError;
    }
}

/**
 * Error when record is not found
 */
export class NotFoundError extends DatabaseError {
    constructor(entity, id) {
        super(`${entity} not found: ${id}`, 'find', null);
        this.name = 'NotFoundError';
        this.code = 'NOT_FOUND';
        this.entity = entity;
        this.entityId = id;
    }
}

/**
 * Validation errors
 */
export class ValidationError extends ESGError {
    constructor(message, field = null, value = null) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
        this.field = field;
        this.value = value;
    }
}

/**
 * Runtime configuration errors
 */
export class ConfigurationError extends ESGError {
    constructor(message, issues = [], code = 'CONFIGURATION_ERROR') {
        super(message, code);
        this.name = 'ConfigurationError';
        this.issues = issues;
    }
}

/**
 * Error when required field is missing
 */
export class RequiredFieldError extends ValidationError {
    constructor(field) {
        super(`Required field missing: ${field}`, field);
        this.name = 'RequiredFieldError';
        this.code = 'REQUIRED_FIELD';
    }
}

/**
 * Error when field value is invalid
 */
export class InvalidValueError extends ValidationError {
    constructor(field, value, allowedValues = null) {
        const message = allowedValues
            ? `Invalid value for ${field}: "${value}". Allowed: ${allowedValues.join(', ')}`
            : `Invalid value for ${field}: "${value}"`;
        super(message, field, value);
        this.name = 'InvalidValueError';
        this.code = 'INVALID_VALUE';
        this.allowedValues = allowedValues;
    }
}

/**
 * Network and connectivity errors
 */
export class NetworkError extends ESGError {
    constructor(message = 'Network error. Please check your connection.') {
        super(message, 'NETWORK_ERROR');
        this.name = 'NetworkError';
    }
}

/**
 * Error when offline
 */
export class OfflineError extends NetworkError {
    constructor() {
        super('You are currently offline. Reconnect to continue using the app.');
        this.name = 'OfflineError';
        this.code = 'OFFLINE';
    }
}

/**
 * Real-time subscription errors
 */
export class RealtimeError extends ESGError {
    constructor(message, channel = null) {
        super(message, 'REALTIME_ERROR');
        this.name = 'RealtimeError';
        this.channel = channel;
    }
}

/**
 * Game state errors
 */
export class GameStateError extends ESGError {
    constructor(message, code = 'GAME_STATE_ERROR') {
        super(message, code);
        this.name = 'GameStateError';
    }
}

/**
 * Error when move is invalid
 */
export class InvalidMoveError extends GameStateError {
    constructor(move) {
        super(`Invalid move: ${move}. Move must be between 1 and 3.`, 'INVALID_MOVE');
        this.name = 'InvalidMoveError';
        this.move = move;
    }
}

/**
 * Error when phase is invalid
 */
export class InvalidPhaseError extends GameStateError {
    constructor(phase) {
        super(`Invalid phase: ${phase}. Phase must be between 1 and 5.`, 'INVALID_PHASE');
        this.name = 'InvalidPhaseError';
        this.phase = phase;
    }
}

/**
 * Export errors
 */
export class ExportError extends ESGError {
    constructor(message, format = null) {
        super(message, 'EXPORT_ERROR');
        this.name = 'ExportError';
        this.format = format;
    }
}

/**
 * Create an error from a Supabase error response
 * @param {Object} supabaseError - Supabase error object
 * @param {string} operation - The operation that failed
 * @returns {DatabaseError}
 */
export function fromSupabaseError(supabaseError, operation) {
    const message = supabaseError?.message || 'Unknown database error';
    const error = new DatabaseError(message, operation, supabaseError);
    error.source = 'supabase';
    error.userSafe = false;
    return error;
}

const DATABASE_OPERATION_MESSAGES = {
    authorizeOperatorAccess: 'Operator access could not be authorized. Check the access code and try again.',
    getOperatorGrant: 'Operator access could not be verified. Return to the landing page and authorize again.',
    requireOperatorGrant: 'Operator access is required. Return to the landing page and authorize again.',
    createSession: 'Could not create the session. Check the session name and join code, then try again.',
    getSession: 'Could not load that session. Refresh and try again.',
    getActiveSessions: 'Could not load sessions. Refresh and try again.',
    lookupJoinableSessionByCode: 'Session not found. Please check the code and try again.',
    updateSession: 'Could not update the session. Refresh and try again.',
    deleteSession: 'Could not delete the session. Refresh the session list and try again.',
    createGameState: 'Could not create the session state. Refresh and try again.',
    getGameState: 'Could not load the current game state. Refresh and try again.',
    updateGameState: 'Could not update the game state. Refresh and try again.',
    claimParticipantSeat: 'Could not claim that seat. Check whether the role is still available, then try again.',
    updateParticipant: 'Could not update the participant record. Refresh and try again.',
    disconnectParticipant: 'Could not release this seat. Refresh and try again.',
    removeSessionParticipant: 'Could not remove that participant. Refresh the roster and try again.',
    releaseStaleParticipantSeats: 'Could not release stale participant seats. Refresh and try again.',
    getActiveParticipants: 'Could not load participants. Refresh and try again.',
    createAction: 'Could not save the action. Check the form and try again.',
    fetchActions: 'Could not load actions. Refresh and try again.',
    getAction: 'Could not load the action. Refresh and try again.',
    updateAction: 'Could not update the action. Refresh and try again.',
    adjudicateAction: 'Could not record the deliberation. Refresh and try again.',
    deleteAction: 'Could not delete the draft action. Refresh and try again.',
    createRequest: 'Could not submit the RFI. Check the form and try again.',
    fetchRequests: 'Could not load RFIs. Refresh and try again.',
    updateRequest: 'Could not update the RFI. Refresh and try again.',
    createCommunication: 'Could not send the message. Check the session state and try again.',
    updateProposalRecipientStatus: 'Could not update the proposal status. Refresh proposals and try again.',
    fetchCommunications: 'Could not load communications. Refresh and try again.',
    createTimelineEvent: 'The update was saved, but the activity record could not be completed. Refresh and verify the session record.',
    fetchTimeline: 'Could not load the timeline. Refresh and try again.',
    fetchSessionBundle: 'Could not load the session bundle. Refresh and try again.',
    fetchResearchExportBundle: 'Could not prepare the research export. Refresh and try again.',
    saveNotetakerData: 'Could not save notes. Reload the move notes and try again.',
    updateNotetakerData: 'Could not save notes. Reload the move notes and try again.',
    createNotetakerData: 'Could not save notes. Reload the move notes and try again.',
    getNotetakerData: 'Could not load notes. Refresh and try again.',
    fetchNotetakerData: 'Could not load notes. Refresh and try again.'
};

const USER_SAFE_DATABASE_MESSAGES = [
    'This browser is still attached to a previous session seat.',
    'Notetaker notes changed while saving.',
    'Operator authorization is required.'
];

function isErrorNamed(error, name) {
    return error instanceof globalThis.Error
        ? error.name === name
        : error?.name === name;
}

function isUserSafeDatabaseMessage(message = '') {
    return USER_SAFE_DATABASE_MESSAGES.some((safePrefix) => message.startsWith(safePrefix));
}

function getDatabaseUserMessage(error, fallback) {
    const message = String(error?.message || '');
    if (error?.userSafe === true || isUserSafeDatabaseMessage(message)) {
        return message;
    }

    const operation = error?.operation || null;
    if (operation && DATABASE_OPERATION_MESSAGES[operation]) {
        return DATABASE_OPERATION_MESSAGES[operation];
    }

    return fallback;
}

/**
 * Determine if an error is a network-related error
 * @param {Error} error - The error to check
 * @returns {boolean}
 */
export function isNetworkError(error) {
    if (!error) return false;
    if (error instanceof NetworkError) return true;
    if (error instanceof OfflineError) return true;
    if (error.message?.includes('fetch')) return true;
    if (error.message?.includes('network')) return true;
    if (error.code === 'ECONNREFUSED') return true;
    return false;
}

/**
 * Get a user-friendly message from an error
 * @param {Error} error - The error
 * @param {Object|string} options - Optional fallback message or options object
 * @param {string} [options.fallback] - Safe fallback message for this UI action
 * @returns {string}
 */
export function getUserMessage(error, options = {}) {
    const fallback = typeof options === 'string'
        ? options
        : (options?.fallback || 'An unexpected error occurred. Please try again.');

    if (error instanceof DatabaseError || isErrorNamed(error, 'DatabaseError')) {
        return getDatabaseUserMessage(error, fallback);
    }

    if (error instanceof ConfigurationError || isErrorNamed(error, 'ConfigurationError')) {
        return error.message || fallback;
    }

    if (error instanceof AuthError || isErrorNamed(error, 'AuthError')) {
        return error.message || fallback;
    }

    if (error instanceof ValidationError || isErrorNamed(error, 'ValidationError')) {
        return error.message || fallback;
    }

    if (error instanceof OfflineError || isErrorNamed(error, 'OfflineError')) {
        return error.message || 'You are currently offline. Reconnect and try again.';
    }

    if (error instanceof NetworkError || isErrorNamed(error, 'NetworkError') || isNetworkError(error)) {
        return 'Network error. Please check your connection and try again.';
    }

    if (error instanceof ESGError) {
        return error.message;
    }

    return fallback;
}

export default {
    ESGError,
    SessionError,
    NoSessionError,
    InvalidSessionError,
    AuthError,
    InvalidPasswordError,
    RoleUnavailableError,
    PermissionDeniedError,
    DatabaseError,
    NotFoundError,
    ValidationError,
    RequiredFieldError,
    InvalidValueError,
    NetworkError,
    OfflineError,
    RealtimeError,
    GameStateError,
    InvalidMoveError,
    InvalidPhaseError,
    ExportError,
    fromSupabaseError,
    isNetworkError,
    getUserMessage
};
