/**
 * Form Validation Utilities
 * Validation functions for the ESG Simulation Platform
 */

import { ENUMS } from '../core/enums.js';
import { RequiredFieldError, InvalidValueError, ValidationError } from '../core/errors.js';

/**
 * Validate that a value is not empty
 * @param {any} value - Value to check
 * @param {string} fieldName - Name of the field
 * @throws {RequiredFieldError} If value is empty
 */
export function validateRequired(value, fieldName) {
    if (value === null || value === undefined || value === '') {
        throw new RequiredFieldError(fieldName);
    }
    if (Array.isArray(value) && value.length === 0) {
        throw new RequiredFieldError(fieldName);
    }
}

/**
 * Validate that a value is in an allowed list
 * @param {any} value - Value to check
 * @param {any[]} allowedValues - Array of allowed values
 * @param {string} fieldName - Name of the field
 * @throws {InvalidValueError} If value is not allowed
 */
export function validateEnum(value, allowedValues, fieldName) {
    if (!allowedValues.includes(value)) {
        throw new InvalidValueError(fieldName, value, allowedValues);
    }
}

/**
 * Validate that all values in an array are allowed
 * @param {any[]} values - Values to check
 * @param {any[]} allowedValues - Array of allowed values
 * @param {string} fieldName - Name of the field
 * @throws {InvalidValueError} If any value is not allowed
 */
export function validateEnumArray(values, allowedValues, fieldName) {
    if (!Array.isArray(values)) {
        throw new ValidationError(`${fieldName} must be an array`, fieldName, values);
    }
    for (const value of values) {
        if (!allowedValues.includes(value)) {
            throw new InvalidValueError(fieldName, value, allowedValues);
        }
    }
}

/**
 * Validate a string length
 * @param {string} value - String to check
 * @param {string} fieldName - Name of the field
 * @param {Object} options - Validation options
 * @param {number} [options.min] - Minimum length
 * @param {number} [options.max] - Maximum length
 * @throws {ValidationError} If length is invalid
 */
export function validateLength(value, fieldName, { min = 0, max = Infinity } = {}) {
    if (typeof value !== 'string') {
        throw new ValidationError(`${fieldName} must be a string`, fieldName, value);
    }
    if (value.length < min) {
        throw new ValidationError(
            `${fieldName} must be at least ${min} characters`,
            fieldName,
            value
        );
    }
    if (value.length > max) {
        throw new ValidationError(
            `${fieldName} must be at most ${max} characters`,
            fieldName,
            value
        );
    }
}

/**
 * Validate a number is within range
 * @param {number} value - Number to check
 * @param {string} fieldName - Name of the field
 * @param {Object} options - Validation options
 * @param {number} [options.min] - Minimum value
 * @param {number} [options.max] - Maximum value
 * @throws {ValidationError} If number is out of range
 */
export function validateRange(value, fieldName, { min = -Infinity, max = Infinity } = {}) {
    if (typeof value !== 'number' || isNaN(value)) {
        throw new ValidationError(`${fieldName} must be a number`, fieldName, value);
    }
    if (value < min || value > max) {
        throw new ValidationError(
            `${fieldName} must be between ${min} and ${max}`,
            fieldName,
            value
        );
    }
}

/**
 * Validate an action object
 * @param {Object} action - Action to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAction(action) {
    const errors = [];

    try {
        validateRequired(action.mechanism, 'mechanism');
        validateEnum(action.mechanism, ENUMS.MECHANISMS, 'mechanism');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        validateRequired(action.sector, 'sector');
        validateEnum(action.sector, ENUMS.SECTORS, 'sector');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        validateRequired(action.targets, 'targets');
        validateEnumArray(action.targets, ENUMS.TARGETS, 'targets');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        validateRequired(action.goal, 'goal');
        validateLength(action.goal, 'goal', { min: 10, max: 2000 });
    } catch (e) {
        errors.push(e.message);
    }

    try {
        validateRequired(action.expected_outcomes, 'expected_outcomes');
        validateLength(action.expected_outcomes, 'expected_outcomes', { min: 10, max: 2000 });
    } catch (e) {
        errors.push(e.message);
    }

    try {
        validateRequired(action.ally_contingencies, 'ally_contingencies');
        validateLength(action.ally_contingencies, 'ally_contingencies', { min: 10, max: 2000 });
    } catch (e) {
        errors.push(e.message);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate an RFI (Request for Information) object
 * @param {Object} request - Request to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRequest(request) {
    const errors = [];

    try {
        validateRequired(request.priority, 'priority');
        validateEnum(request.priority, ENUMS.PRIORITY, 'priority');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        validateRequired(request.categories, 'categories');
        validateEnumArray(request.categories, ENUMS.RFI_CATEGORIES, 'categories');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        validateRequired(request.query, 'query');
        validateLength(request.query, 'query', { min: 10, max: 2000 });
    } catch (e) {
        errors.push(e.message);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate an adjudication object
 * @param {Object} adjudication - Adjudication to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAdjudication(adjudication) {
    const errors = [];

    try {
        validateRequired(adjudication.outcome, 'outcome');
        validateEnum(adjudication.outcome, ENUMS.OUTCOMES, 'outcome');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        validateRequired(adjudication.reasoning, 'reasoning');
        validateLength(adjudication.reasoning, 'reasoning', { min: 20, max: 5000 });
    } catch (e) {
        errors.push(e.message);
    }

    try {
        validateRequired(adjudication.consequences, 'consequences');
        validateLength(adjudication.consequences, 'consequences', { min: 20, max: 5000 });
    } catch (e) {
        errors.push(e.message);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate a timeline observation
 * @param {Object} observation - Observation to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateObservation(observation) {
    const errors = [];

    try {
        validateRequired(observation.type, 'type');
        validateEnum(observation.type, ENUMS.OBSERVATION_TYPES, 'type');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        validateRequired(observation.content, 'content');
        validateLength(observation.content, 'content', { min: 1, max: 5000 });
    } catch (e) {
        errors.push(e.message);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate a session name
 * @param {string} name - Session name to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSessionName(name) {
    const errors = [];

    try {
        validateRequired(name, 'name');
        validateLength(name, 'name', { min: 3, max: 100 });
    } catch (e) {
        errors.push(e.message);
    }

    // Check for invalid characters
    if (name && !/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
        errors.push('Session name can only contain letters, numbers, spaces, hyphens, and underscores');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate a session code
 * @param {string} code - Session code to validate
 * @returns {string|null} Error message if invalid, null if valid
 */
export function validateSessionCode(code) {
    if (!code || typeof code !== 'string') {
        return 'Session code is required';
    }

    const trimmed = code.trim();

    if (trimmed.length < 3) {
        return 'Session code must be at least 3 characters';
    }

    if (trimmed.length > 50) {
        return 'Session code must be less than 50 characters';
    }

    // Session codes should be alphanumeric with optional hyphens/underscores
    if (!/^[a-zA-Z0-9\-_]+$/.test(trimmed)) {
        return 'Session code can only contain letters, numbers, hyphens, and underscores';
    }

    return null;
}

/**
 * Validate game state values
 * @param {Object} state - Game state to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateGameState(state) {
    const errors = [];

    if (state.move !== undefined) {
        try {
            validateRange(state.move, 'move', { min: 1, max: 3 });
        } catch (e) {
            errors.push(e.message);
        }
    }

    if (state.phase !== undefined) {
        try {
            validateRange(state.phase, 'phase', { min: 1, max: 5 });
        } catch (e) {
            errors.push(e.message);
        }
    }

    if (state.timer_seconds !== undefined) {
        try {
            validateRange(state.timer_seconds, 'timer_seconds', { min: 0, max: 36000 });
        } catch (e) {
            errors.push(e.message);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Sanitize a string for safe display (prevent XSS)
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * Validate and sanitize form data
 * @param {Object} data - Form data object
 * @param {Object} schema - Validation schema
 * @returns {{ valid: boolean, errors: string[], sanitized: Object }}
 */
export function validateFormData(data, schema) {
    const errors = [];
    const sanitized = {};

    for (const [field, rules] of Object.entries(schema)) {
        const value = data[field];

        // Check required
        if (rules.required) {
            try {
                validateRequired(value, field);
            } catch (e) {
                errors.push(e.message);
                continue;
            }
        }

        // Skip further validation if not provided and not required
        if (value === undefined || value === null || value === '') {
            continue;
        }

        // Type validation
        if (rules.type === 'string') {
            sanitized[field] = sanitizeString(String(value));
            if (rules.minLength || rules.maxLength) {
                try {
                    validateLength(value, field, { min: rules.minLength, max: rules.maxLength });
                } catch (e) {
                    errors.push(e.message);
                }
            }
        } else if (rules.type === 'number') {
            sanitized[field] = Number(value);
            if (rules.min !== undefined || rules.max !== undefined) {
                try {
                    validateRange(sanitized[field], field, { min: rules.min, max: rules.max });
                } catch (e) {
                    errors.push(e.message);
                }
            }
        } else if (rules.type === 'enum') {
            sanitized[field] = value;
            try {
                validateEnum(value, rules.values, field);
            } catch (e) {
                errors.push(e.message);
            }
        } else if (rules.type === 'array') {
            sanitized[field] = Array.isArray(value) ? value : [value];
            if (rules.values) {
                try {
                    validateEnumArray(sanitized[field], rules.values, field);
                } catch (e) {
                    errors.push(e.message);
                }
            }
        } else {
            sanitized[field] = value;
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        sanitized
    };
}

export default {
    validateRequired,
    validateEnum,
    validateEnumArray,
    validateLength,
    validateRange,
    validateAction,
    validateRequest,
    validateAdjudication,
    validateObservation,
    validateSessionName,
    validateSessionCode,
    validateGameState,
    sanitizeString,
    validateFormData
};
