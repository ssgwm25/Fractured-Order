/**
 * Timer Service
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Centralized timer management service that:
 * - Provides accurate timer display across all roles
 * - Syncs timer state with server periodically
 * - Handles timer drift correction
 * - Broadcasts timer events to subscribers
 */

import { gameStateStore } from '../stores/gameState.js';
import { createLogger } from '../utils/logger.js';
import { CONFIG } from '../core/config.js';

const logger = createLogger('TimerService');

/**
 * Timer events
 */
export const TIMER_EVENTS = {
    TICK: 'tick',
    START: 'start',
    PAUSE: 'pause',
    RESET: 'reset',
    FINISHED: 'finished',
    WARNING: 'warning'
};

/**
 * Timer warning thresholds (in seconds)
 */
const WARNING_THRESHOLDS = [
    { seconds: 300, fired: false },  // 5 minutes
    { seconds: 60, fired: false },   // 1 minute
    { seconds: 30, fired: false },   // 30 seconds
    { seconds: 10, fired: false }    // 10 seconds
];

/**
 * Timer Service Class
 */
class TimerService {
    constructor() {
        /** @type {number|null} */
        this.intervalId = null;

        /** @type {Set<Function>} */
        this.subscribers = new Set();

        /** @type {boolean} */
        this.initialized = false;

        /** @type {Function|null} */
        this.storeUnsubscribe = null;

        /** @type {Object[]} */
        this.warningThresholds = JSON.parse(JSON.stringify(WARNING_THRESHOLDS));
    }

    /**
     * Initialize timer service
     * @returns {void}
     */
    initialize() {
        if (this.initialized) {
            return;
        }

        logger.info('Initializing timer service');

        // Subscribe to game state store for timer updates
        this.storeUnsubscribe = gameStateStore.subscribe((event, state) => {
            this.handleStoreEvent(event, state);
        });

        // Check if timer should be running
        if (gameStateStore.isTimerRunning()) {
            this.startInterval();
        }

        this.initialized = true;
        logger.info('Timer service initialized');
    }

    /**
     * Handle game state store events
     * @private
     * @param {string} event - Event type
     * @param {Object} state - Game state
     */
    handleStoreEvent(event, state) {
        switch (event) {
            case 'timer_started':
                this.startInterval();
                this.notify(TIMER_EVENTS.START, this.getTimerData());
                break;

            case 'timer_paused':
                this.stopInterval();
                this.notify(TIMER_EVENTS.PAUSE, this.getTimerData());
                break;

            case 'timer_reset':
                this.resetWarnings();
                this.notify(TIMER_EVENTS.RESET, this.getTimerData());
                break;

            case 'timer_finished':
                this.stopInterval();
                this.notify(TIMER_EVENTS.FINISHED, this.getTimerData());
                break;

            case 'timer_tick':
                this.checkWarnings(state.timer_seconds);
                this.notify(TIMER_EVENTS.TICK, this.getTimerData());
                break;

            case 'synced':
                // Handle timer state from server sync
                if (state.timer_running && !this.intervalId) {
                    this.startInterval();
                } else if (!state.timer_running && this.intervalId) {
                    this.stopInterval();
                }
                break;
        }
    }

    /**
     * Start the local timer interval
     * @private
     */
    startInterval() {
        if (this.intervalId) {
            return;
        }

        logger.debug('Starting timer interval');

        this.intervalId = setInterval(() => {
            const seconds = gameStateStore.getTimerSeconds();
            this.checkWarnings(seconds);
            this.notify(TIMER_EVENTS.TICK, this.getTimerData());
        }, 1000);
    }

    /**
     * Stop the local timer interval
     * @private
     */
    stopInterval() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.debug('Timer interval stopped');
        }
    }

    /**
     * Check and fire warning thresholds
     * @private
     * @param {number} seconds - Current timer seconds
     */
    checkWarnings(seconds) {
        for (const threshold of this.warningThresholds) {
            if (!threshold.fired && seconds <= threshold.seconds && seconds > 0) {
                threshold.fired = true;
                this.notify(TIMER_EVENTS.WARNING, {
                    threshold: threshold.seconds,
                    remaining: seconds,
                    formatted: this.formatTime(seconds)
                });
                logger.info(`Timer warning: ${threshold.seconds} seconds remaining`);
            }
        }
    }

    /**
     * Reset warning thresholds
     * @private
     */
    resetWarnings() {
        this.warningThresholds = JSON.parse(JSON.stringify(WARNING_THRESHOLDS));
    }

    /**
     * Start the timer
     * @returns {Promise<void>}
     */
    async start() {
        await gameStateStore.startTimer();
    }

    /**
     * Pause the timer
     * @returns {Promise<void>}
     */
    async pause() {
        await gameStateStore.pauseTimer();
    }

    /**
     * Reset the timer
     * @param {number} seconds - Optional seconds to reset to
     * @returns {Promise<void>}
     */
    async reset(seconds = CONFIG.DEFAULT_TIMER_SECONDS) {
        this.resetWarnings();
        await gameStateStore.resetTimer(seconds);
    }

    /**
     * Set timer to specific value
     * @param {number} seconds - Timer value in seconds
     * @returns {Promise<void>}
     */
    async setTime(seconds) {
        await gameStateStore.setTimer(seconds);
    }

    /**
     * Add time to the timer
     * @param {number} seconds - Seconds to add
     * @returns {Promise<void>}
     */
    async addTime(seconds) {
        const current = gameStateStore.getTimerSeconds();
        await gameStateStore.setTimer(current + seconds);
    }

    /**
     * Get current timer data
     * @returns {Object}
     */
    getTimerData() {
        const seconds = gameStateStore.getTimerSeconds();
        const isRunning = gameStateStore.isTimerRunning();

        return {
            seconds,
            isRunning,
            formatted: this.formatTime(seconds),
            minutes: Math.floor(seconds / 60),
            remainderSeconds: seconds % 60,
            percentRemaining: this.getPercentRemaining(seconds)
        };
    }

    /**
     * Get current timer seconds
     * @returns {number}
     */
    getSeconds() {
        return gameStateStore.getTimerSeconds();
    }

    /**
     * Check if timer is running
     * @returns {boolean}
     */
    isRunning() {
        return gameStateStore.isTimerRunning();
    }

    /**
     * Format seconds to display string
     * @param {number} seconds - Seconds to format
     * @returns {string} Formatted time string (MM:SS)
     */
    formatTime(seconds) {
        const mins = Math.floor(Math.max(0, seconds) / 60);
        const secs = Math.max(0, seconds) % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Format seconds to extended display string
     * @param {number} seconds - Seconds to format
     * @returns {string} Formatted time string (HH:MM:SS or MM:SS)
     */
    formatTimeExtended(seconds) {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Get percentage of time remaining
     * @param {number} seconds - Current seconds
     * @param {number} total - Total seconds (defaults to CONFIG.DEFAULT_TIMER_SECONDS)
     * @returns {number} Percentage (0-100)
     */
    getPercentRemaining(seconds, total = CONFIG.DEFAULT_TIMER_SECONDS) {
        if (total <= 0) return 0;
        return Math.max(0, Math.min(100, (seconds / total) * 100));
    }

    /**
     * Subscribe to timer events
     * @param {Function} callback - Callback function (event, data)
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.subscribers.add(callback);

        // Immediately send current state
        callback(TIMER_EVENTS.TICK, this.getTimerData());

        return () => this.subscribers.delete(callback);
    }

    /**
     * Subscribe to specific event
     * @param {string} eventType - Event type to subscribe to
     * @param {Function} callback - Callback function (data)
     * @returns {Function} Unsubscribe function
     */
    on(eventType, callback) {
        const wrappedCallback = (event, data) => {
            if (event === eventType) {
                callback(data);
            }
        };

        this.subscribers.add(wrappedCallback);
        return () => this.subscribers.delete(wrappedCallback);
    }

    /**
     * Notify all subscribers
     * @private
     * @param {string} event - Event type
     * @param {Object} data - Event data
     */
    notify(event, data) {
        this.subscribers.forEach(callback => {
            try {
                callback(event, data);
            } catch (err) {
                logger.error('Timer subscriber error:', err);
            }
        });
    }

    /**
     * Reset service state
     */
    reset() {
        this.stopInterval();
        this.resetWarnings();
        this.subscribers.clear();

        if (this.storeUnsubscribe) {
            this.storeUnsubscribe();
            this.storeUnsubscribe = null;
        }

        this.initialized = false;
        logger.info('Timer service reset');
    }

    /**
     * Cleanup on destroy
     */
    destroy() {
        this.reset();
    }
}

// Export singleton instance
export const timerService = new TimerService();

export default timerService;