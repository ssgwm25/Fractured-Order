/**
 * Logger Utility
 * Debug logging for the ESG Simulation Platform
 */

import { CONFIG } from '../core/config.js';

/**
 * Log levels
 */
export const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

/**
 * Current log level (controlled by CONFIG.DEBUG)
 */
let currentLevel = CONFIG.DEBUG ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;

/**
 * Log history for debugging
 */
const logHistory = [];
const MAX_HISTORY = 1000;

/**
 * Format a log entry
 * @param {string} level - Log level name
 * @param {string} module - Module name
 * @param {string} message - Log message
 * @param {any[]} args - Additional arguments
 * @returns {Object} Formatted log entry
 */
function formatEntry(level, module, message, args) {
    return {
        timestamp: new Date().toISOString(),
        level,
        module,
        message,
        args: args.length > 0 ? args : undefined
    };
}

/**
 * Add entry to history
 * @param {Object} entry - Log entry
 */
function addToHistory(entry) {
    logHistory.push(entry);
    if (logHistory.length > MAX_HISTORY) {
        logHistory.shift();
    }
}

/**
 * Get console style for a log level
 * @param {string} level - Log level name
 * @returns {string} Console style string
 */
function getStyle(level) {
    const styles = {
        DEBUG: 'color: #6b7280; font-weight: normal;',
        INFO: 'color: #3b82f6; font-weight: normal;',
        WARN: 'color: #f59e0b; font-weight: bold;',
        ERROR: 'color: #ef4444; font-weight: bold;'
    };
    return styles[level] || '';
}

/**
 * Logger class for a specific module
 */
class ModuleLogger {
    constructor(moduleName) {
        this.moduleName = moduleName;
    }

    /**
     * Log a debug message
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    debug(message, ...args) {
        log(LOG_LEVELS.DEBUG, this.moduleName, message, args);
    }

    /**
     * Log an info message
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    info(message, ...args) {
        log(LOG_LEVELS.INFO, this.moduleName, message, args);
    }

    /**
     * Log a warning message
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    warn(message, ...args) {
        log(LOG_LEVELS.WARN, this.moduleName, message, args);
    }

    /**
     * Log an error message
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    error(message, ...args) {
        log(LOG_LEVELS.ERROR, this.moduleName, message, args);
    }

    /**
     * Log a group of messages
     * @param {string} label - Group label
     * @param {Function} callback - Callback containing log statements
     */
    group(label, callback) {
        if (currentLevel <= LOG_LEVELS.DEBUG) {
            console.group(`[${this.moduleName}] ${label}`);
            callback();
            console.groupEnd();
        }
    }

    /**
     * Log with timing
     * @param {string} label - Timer label
     * @returns {{ end: Function }} Timer object with end method
     */
    time(label) {
        const start = performance.now();
        const fullLabel = `[${this.moduleName}] ${label}`;

        return {
            end: () => {
                const duration = performance.now() - start;
                this.debug(`${label} completed in ${duration.toFixed(2)}ms`);
                return duration;
            }
        };
    }

    /**
     * Log a table
     * @param {any[]} data - Data to display as table
     * @param {string[]} [columns] - Columns to display
     */
    table(data, columns) {
        if (currentLevel <= LOG_LEVELS.DEBUG) {
            console.log(`[${this.moduleName}]`);
            console.table(data, columns);
        }
    }
}

/**
 * Internal log function
 * @param {number} level - Log level
 * @param {string} module - Module name
 * @param {string} message - Log message
 * @param {any[]} args - Additional arguments
 */
function log(level, module, message, args) {
    const levelName = Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === level) || 'INFO';
    const entry = formatEntry(levelName, module, message, args);

    // Always add to history
    addToHistory(entry);

    // Only output if level is high enough
    if (level < currentLevel) {
        return;
    }

    const prefix = `%c[${levelName}] [${module}]`;
    const style = getStyle(levelName);

    switch (level) {
        case LOG_LEVELS.DEBUG:
            console.debug(prefix, style, message, ...args);
            break;
        case LOG_LEVELS.INFO:
            console.info(prefix, style, message, ...args);
            break;
        case LOG_LEVELS.WARN:
            console.warn(prefix, style, message, ...args);
            break;
        case LOG_LEVELS.ERROR:
            console.error(prefix, style, message, ...args);
            break;
        default:
            console.log(prefix, style, message, ...args);
    }
}

/**
 * Create a logger for a specific module
 * @param {string} moduleName - Name of the module
 * @returns {ModuleLogger} Logger instance
 */
export function createLogger(moduleName) {
    return new ModuleLogger(moduleName);
}

/**
 * Set the current log level
 * @param {number} level - Log level (use LOG_LEVELS constants)
 */
export function setLogLevel(level) {
    if (typeof level === 'string') {
        level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    }
    currentLevel = level;
}

/**
 * Get the current log level
 * @returns {number} Current log level
 */
export function getLogLevel() {
    return currentLevel;
}

/**
 * Enable debug mode
 */
export function enableDebug() {
    currentLevel = LOG_LEVELS.DEBUG;
}

/**
 * Disable debug mode
 */
export function disableDebug() {
    currentLevel = LOG_LEVELS.WARN;
}

/**
 * Get log history
 * @param {Object} options - Filter options
 * @param {string} options.level - Filter by level
 * @param {string} options.module - Filter by module
 * @param {number} options.limit - Maximum entries to return
 * @returns {Object[]} Log history
 */
export function getHistory({ level, module, limit = 100 } = {}) {
    let filtered = [...logHistory];

    if (level) {
        filtered = filtered.filter(e => e.level === level.toUpperCase());
    }

    if (module) {
        filtered = filtered.filter(e => e.module === module);
    }

    return filtered.slice(-limit);
}

/**
 * Clear log history
 */
export function clearHistory() {
    logHistory.length = 0;
}

/**
 * Export log history to a string
 * @returns {string} JSON string of log history
 */
export function exportHistory() {
    return JSON.stringify(logHistory, null, 2);
}

/**
 * Download log history as a file
 */
export function downloadHistory() {
    const content = exportHistory();
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esg_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Create default logger
const defaultLogger = createLogger('App');

export default {
    createLogger,
    setLogLevel,
    getLogLevel,
    enableDebug,
    disableDebug,
    getHistory,
    clearHistory,
    exportHistory,
    downloadHistory,
    LOG_LEVELS,
    // Default logger methods
    debug: defaultLogger.debug.bind(defaultLogger),
    info: defaultLogger.info.bind(defaultLogger),
    warn: defaultLogger.warn.bind(defaultLogger),
    error: defaultLogger.error.bind(defaultLogger)
};
