import { getRoleDisplayName } from '../core/teamContext.js';

/**
 * Formatting Utilities
 * Date, time, and text formatting functions
 */

/**
 * Format a date to local string
 * @param {string|Date} date - Date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export function formatDate(date, options = {}) {
    if (!date) return '';

    const dateObj = typeof date === 'string' ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
        return '';
    }

    const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options
    };

    return dateObj.toLocaleDateString(undefined, defaultOptions);
}

/**
 * Format a time
 * @param {string|Date} date - Date/time to format
 * @param {boolean} includeSeconds - Whether to include seconds
 * @returns {string} Formatted time string
 */
export function formatTime(date, includeSeconds = false) {
    if (!date) return '';

    const dateObj = typeof date === 'string' ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
        return '';
    }

    const options = {
        hour: '2-digit',
        minute: '2-digit',
        ...(includeSeconds && { second: '2-digit' })
    };

    return dateObj.toLocaleTimeString(undefined, options);
}

/**
 * Format a date and time
 * @param {string|Date} date - Date/time to format
 * @param {boolean} includeSeconds - Whether to include seconds
 * @returns {string} Formatted datetime string
 */
export function formatDateTime(date, includeSeconds = false) {
    if (!date) return '';

    const dateObj = typeof date === 'string' ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
        return '';
    }

    return `${formatDate(dateObj)} ${formatTime(dateObj, includeSeconds)}`;
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 * @param {number} totalSeconds - Total seconds
 * @param {boolean} includeHours - Whether to always include hours
 * @returns {string} Formatted time string
 */
export function formatDuration(totalSeconds, includeHours = false) {
    if (typeof totalSeconds !== 'number' || isNaN(totalSeconds)) {
        return '00:00';
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const pad = (num) => num.toString().padStart(2, '0');

    if (hours > 0 || includeHours) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Format a relative time (e.g., "5 minutes ago")
 * @param {string|Date} date - Date to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date) {
    if (!date) return '';

    const dateObj = typeof date === 'string' ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
        return '';
    }

    const now = new Date();
    const diffMs = now - dateObj;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
        return 'just now';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
        return formatDate(dateObj);
    }
}

/**
 * Truncate text to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add when truncated
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength = 100, suffix = '...') {
    if (!text || typeof text !== 'string') return '';

    if (text.length <= maxLength) {
        return text;
    }

    return text.slice(0, maxLength - suffix.length).trim() + suffix;
}

/**
 * Capitalize first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
export function capitalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert string to title case
 * @param {string} str - String to convert
 * @returns {string} Title case string
 */
export function toTitleCase(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => capitalize(word))
        .join(' ');
}

/**
 * Format a status for display
 * @param {string} status - Status string
 * @returns {string} Formatted status
 */
export function formatStatus(status) {
    if (!status) return '';
    if (String(status).trim().toLowerCase() === 'adjudicated') {
        return 'Deliberation Underway';
    }
    return toTitleCase(status.replace(/_/g, ' '));
}

/**
 * Format a role name for display
 * @param {string} role - Role identifier
 * @returns {string} Formatted role name
 */
export function formatRoleName(role) {
    return getRoleDisplayName(role) || formatStatus(role);
}

/**
 * Format a priority level for display
 * @param {string} priority - Priority level
 * @returns {string} Formatted priority with icon
 */
export function formatPriority(priority) {
    const priorities = {
        'NORMAL': 'Normal',
        'HIGH': 'High',
        'URGENT': 'Urgent'
    };

    return priorities[priority] || priority;
}

/**
 * Format an outcome for display
 * @param {string} outcome - Outcome type
 * @returns {string} Formatted outcome
 */
export function formatOutcome(outcome) {
    const outcomes = {
        'SUCCESS': 'Success',
        'PARTIAL_SUCCESS': 'Partial Success',
        'FAIL': 'Fail',
        'BACKFIRE': 'Backfire'
    };

    return outcomes[outcome] || outcome;
}

/**
 * Format a number with thousand separators
 * @param {number} num - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number
 */
export function formatNumber(num, decimals = 0) {
    if (typeof num !== 'number' || isNaN(num)) return '0';
    return num.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Format bytes to human readable size
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Generate a random ID
 * @param {number} length - Length of the ID
 * @returns {string} Random ID
 */
export function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Format array as comma-separated list
 * @param {string[]} items - Array of items
 * @param {string} conjunction - Final conjunction (e.g., "and", "or")
 * @returns {string} Formatted list
 */
export function formatList(items, conjunction = 'and') {
    if (!Array.isArray(items) || items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return items.join(` ${conjunction} `);

    return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`;
}

/**
 * Pluralize a word based on count
 * @param {number} count - Count
 * @param {string} singular - Singular form
 * @param {string} [plural] - Plural form (defaults to singular + 's')
 * @returns {string} Pluralized string with count
 */
export function pluralize(count, singular, plural = null) {
    const word = count === 1 ? singular : (plural || `${singular}s`);
    return `${count} ${word}`;
}

export default {
    formatDate,
    formatTime,
    formatDateTime,
    formatDuration,
    formatRelativeTime,
    truncate,
    capitalize,
    toTitleCase,
    formatStatus,
    formatRoleName,
    formatPriority,
    formatOutcome,
    formatNumber,
    formatFileSize,
    generateId,
    formatList,
    pluralize
};
