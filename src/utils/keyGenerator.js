/**
 * Storage Key Generator
 * Generates consistent storage keys across all roles
 * CRITICAL: This fixes the storage key inconsistency problem from the previous implementation
 */

import { CONFIG } from '../core/config.js';

/**
 * Generate a consistent storage key
 * @param {string} dataType - Type of data (actions, requests, timeline, etc.)
 * @param {string} sessionId - Session ID
 * @param {number} [move] - Move number (optional, for move-specific data)
 * @returns {string} Storage key
 */
export function getStorageKey(dataType, sessionId, move = null) {
    if (!sessionId) {
        console.warn('[KeyGenerator] No session ID provided, using legacy key');
        return move !== null
            ? `${CONFIG.STORAGE_PREFIX}_${dataType}_move_${move}`
            : `${CONFIG.STORAGE_PREFIX}_${dataType}`;
    }

    return move !== null
        ? `${CONFIG.STORAGE_PREFIX}_${dataType}_session_${sessionId}_move_${move}`
        : `${CONFIG.STORAGE_PREFIX}_${dataType}_session_${sessionId}`;
}

/**
 * Get all possible keys for a data type (for migration/fallback lookup)
 * @param {string} dataType - Type of data
 * @param {string} sessionId - Session ID
 * @param {number} [move] - Move number (optional)
 * @returns {string[]} Array of possible keys, prioritized from newest to oldest format
 */
export function getPossibleKeys(dataType, sessionId, move = null) {
    const keys = [];

    // Session-based key (preferred - newest format)
    if (sessionId) {
        if (move !== null) {
            keys.push(`${CONFIG.STORAGE_PREFIX}_${dataType}_session_${sessionId}_move_${move}`);
        } else {
            keys.push(`${CONFIG.STORAGE_PREFIX}_${dataType}_session_${sessionId}`);
        }
    }

    // Legacy patterns (for backward compatibility)
    if (move !== null) {
        keys.push(`${CONFIG.STORAGE_PREFIX}_${dataType}_move_${move}`);
        keys.push(`blue${capitalize(dataType)}_move_${move}`);
        keys.push(`${dataType}_move_${move}`);
    } else {
        keys.push(`${CONFIG.STORAGE_PREFIX}_${dataType}`);
        keys.push(`blue${capitalize(dataType)}`);
        keys.push(dataType);
    }

    return keys;
}

/**
 * Get data from storage, trying all possible key formats
 * @param {string} dataType - Type of data
 * @param {string} sessionId - Session ID
 * @param {number} [move] - Move number (optional)
 * @returns {any|null} Parsed data or null if not found
 */
export function getFromStorage(dataType, sessionId, move = null) {
    const possibleKeys = getPossibleKeys(dataType, sessionId, move);

    for (const key of possibleKeys) {
        const data = localStorage.getItem(key);
        if (data) {
            try {
                const parsed = JSON.parse(data);
                // If we found data with a legacy key, migrate it to the new format
                const preferredKey = possibleKeys[0];
                if (key !== preferredKey) {
                    console.log(`[KeyGenerator] Migrating data from "${key}" to "${preferredKey}"`);
                    localStorage.setItem(preferredKey, data);
                    localStorage.removeItem(key);
                }
                return parsed;
            } catch (e) {
                console.error(`[KeyGenerator] Failed to parse data from key "${key}":`, e);
            }
        }
    }

    return null;
}

/**
 * Save data to storage with consistent key
 * @param {string} dataType - Type of data
 * @param {string} sessionId - Session ID
 * @param {any} data - Data to save
 * @param {number} [move] - Move number (optional)
 */
export function saveToStorage(dataType, sessionId, data, move = null) {
    const key = getStorageKey(dataType, sessionId, move);
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error(`[KeyGenerator] Failed to save data to key "${key}":`, e);
        // If localStorage is full, try to clear old data
        if (e.name === 'QuotaExceededError') {
            clearOldStorageData();
            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch (retryError) {
                console.error('[KeyGenerator] Failed to save even after clearing old data');
            }
        }
    }
}

/**
 * Remove data from storage
 * @param {string} dataType - Type of data
 * @param {string} sessionId - Session ID
 * @param {number} [move] - Move number (optional)
 */
export function removeFromStorage(dataType, sessionId, move = null) {
    const key = getStorageKey(dataType, sessionId, move);
    localStorage.removeItem(key);
}

/**
 * Clear all storage data for a session
 * @param {string} sessionId - Session ID
 */
export function clearSessionStorage(sessionId) {
    const prefix = `${CONFIG.STORAGE_PREFIX}_`;
    const sessionSuffix = `_session_${sessionId}`;

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix) && key.includes(sessionSuffix)) {
            keysToRemove.push(key);
        }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`[KeyGenerator] Cleared ${keysToRemove.length} keys for session ${sessionId}`);
}

/**
 * Clear old/orphaned storage data
 */
export function clearOldStorageData() {
    const prefix = CONFIG.STORAGE_PREFIX;
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            try {
                const data = JSON.parse(localStorage.getItem(key));
                // Check if data has a timestamp and is older than maxAge
                if (data && data._timestamp && (now - data._timestamp) > maxAge) {
                    keysToRemove.push(key);
                }
            } catch (e) {
                // If we can't parse it, it might be corrupted - remove it
                keysToRemove.push(key);
            }
        }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`[KeyGenerator] Cleared ${keysToRemove.length} old/corrupted keys`);
}

/**
 * Get all storage keys for the application
 * @returns {string[]} Array of all ESG-related storage keys
 */
export function getAllStorageKeys() {
    const prefix = CONFIG.STORAGE_PREFIX;
    const keys = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            keys.push(key);
        }
    }

    return keys;
}

/**
 * Capitalize first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export default {
    getStorageKey,
    getPossibleKeys,
    getFromStorage,
    saveToStorage,
    removeFromStorage,
    clearSessionStorage,
    clearOldStorageData,
    getAllStorageKeys
};
