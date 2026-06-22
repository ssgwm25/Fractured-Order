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
    return new DatabaseError(message, operation, supabaseError);
}

/**
 * Determine if an error is a network-related error
 * @param {Error} error - The error to check
 * @returns {boolean}
 */
export function isNetworkError(error) {
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
 * @returns {string}
 */
export function getUserMessage(error) {
    if (error instanceof ESGError) {
        return error.message;
    }

    if (isNetworkError(error)) {
        return 'Network error. Please check your connection and try again.';
    }

    return 'An unexpected error occurred. Please try again.';
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
