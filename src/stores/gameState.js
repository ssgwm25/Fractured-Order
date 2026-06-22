/**
 * Game State Store
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Centralized store for game state management including:
 * - Current move and phase tracking
 * - Timer state management
 * - Game status
 *
 * This store uses a pub/sub pattern for reactive updates across the application.
 */

import { database } from '../services/database.js';
import { createLogger } from '../utils/logger.js';
import { CONFIG } from '../core/config.js';

const logger = createLogger('GameStateStore');

function isMissingGameStateError(error) {
    return error?.code === 'NOT_FOUND' && error?.entity === 'GameState';
}

function buildFallbackGameState(sessionId) {
    const timestamp = new Date().toISOString();

    return {
        id: null,
        session_id: sessionId,
        move: 1,
        phase: 1,
        timer_seconds: CONFIG.DEFAULT_TIMER_SECONDS,
        timer_running: false,
        timer_last_update: null,
        last_updated: timestamp,
        updated_at: timestamp,
        status: 'active'
    };
}

/**
 * @typedef {Object} GameState
 * @property {string} id - Game state record ID
 * @property {string} session_id - Associated session ID
 * @property {number} move - Current move (1-3)
 * @property {number} phase - Current phase (1-5)
 * @property {number} timer_seconds - Remaining timer seconds
 * @property {boolean} timer_running - Whether timer is active
 * @property {string} timer_last_update - ISO timestamp of last timer update
 * @property {string} last_updated - ISO timestamp of last update
 * @property {string} status - Game status (active, paused, completed)
 */

/**
 * Game State Store
 * Manages game state with real-time synchronization
 */
class GameStateStore {
    constructor() {
        /** @type {GameState|null} */
        this.state = null;

        /** @type {Set<Function>} */
        this.subscribers = new Set();

        /** @type {boolean} */
        this.initialized = false;

        /** @type {number|null} */
        this.timerInterval = null;

        /** @type {number} */
        this.lastServerSync = 0;
    }

    /**
     * Initialize the store with session data
     * @param {string} sessionId - Session ID to load
     * @returns {Promise<GameState|null>}
     */
    async initialize(sessionId) {
        if (!sessionId) {
            logger.warn('Cannot initialize without session ID');
            return null;
        }

        logger.info('Initializing game state store for session:', sessionId);

        try {
            const data = await database.getGameState(sessionId);

            if (data) {
                this.initialized = true;
                this.applyServerState(data, 'initialized');

                logger.info('Game state loaded:', {
                    move: data.move,
                    phase: data.phase,
                    timerRunning: data.timer_running
                });
            } else {
                // Create initial game state if it doesn't exist
                await this.createInitialState(sessionId);
            }

            return this.state;
        } catch (err) {
            if (isMissingGameStateError(err)) {
                logger.warn(
                    'Game state row is missing for this session. Using local defaults until the backend is backfilled.'
                );
                this.initialized = true;
                this.applyServerState(buildFallbackGameState(sessionId), 'initialized');
                return this.state;
            }

            logger.error('Failed to initialize game state:', err);
            throw err;
        }
    }

    /**
     * Create initial game state for a new session
     * @param {string} sessionId - Session ID
     * @returns {Promise<GameState>}
     */
    async createInitialState(sessionId) {
        const data = await database.createGameState(sessionId);

        this.initialized = true;
        this.applyServerState(data, 'created');

        logger.info('Initial game state created');
        return this.state;
    }

    /**
     * Get current game state
     * @returns {GameState|null}
     */
    getState() {
        return this.state;
    }

    /**
     * Get current move
     * @returns {number}
     */
    getCurrentMove() {
        return this.state?.move || 1;
    }

    /**
     * Get current phase
     * @returns {number}
     */
    getCurrentPhase() {
        return this.state?.phase || 1;
    }

    /**
     * Get timer seconds
     * @returns {number}
     */
    getTimerSeconds() {
        return this.state?.timer_seconds ?? CONFIG.DEFAULT_TIMER_SECONDS;
    }

    /**
     * Check if timer is running
     * @returns {boolean}
     */
    isTimerRunning() {
        return this.state?.timer_running || false;
    }

    /**
     * Build a timer snapshot that can be persisted without losing elapsed time.
     * The timestamp represents when the accompanying timer_seconds value was measured.
     * @private
     * @param {string} timestamp
     * @returns {{timer_seconds:number,timer_last_update:string}}
     */
    buildTimerPersistenceFields(timestamp = new Date().toISOString()) {
        return {
            timer_seconds: this.state?.timer_seconds ?? CONFIG.DEFAULT_TIMER_SECONDS,
            timer_last_update: timestamp
        };
    }

    /**
     * Start the game timer
     * @returns {Promise<void>}
     */
    async startTimer() {
        if (!this.state || this.state.timer_running) {
            return this.state;
        }

        logger.info('Starting timer');

        const timestamp = new Date().toISOString();

        return this.persistState({
            ...this.buildTimerPersistenceFields(timestamp),
            timer_running: true,
        }, 'timer_started');
    }

    /**
     * Pause the game timer
     * @returns {Promise<void>}
     */
    async pauseTimer() {
        if (!this.state || !this.state.timer_running) {
            return this.state;
        }

        logger.info('Pausing timer');

        const timestamp = new Date().toISOString();

        return this.persistState({
            ...this.buildTimerPersistenceFields(timestamp),
            timer_running: false,
        }, 'timer_paused');
    }

    /**
     * Reset the timer to default value
     * @param {number} seconds - Optional custom seconds value
     * @returns {Promise<void>}
     */
    async resetTimer(seconds = CONFIG.DEFAULT_TIMER_SECONDS) {
        if (!this.state) {
            return this.state;
        }

        logger.info('Resetting timer to', seconds, 'seconds');

        return this.persistState({
            timer_seconds: seconds,
            timer_running: false,
            timer_last_update: new Date().toISOString()
        }, 'timer_reset');
    }

    /**
     * Set timer to specific value
     * @param {number} seconds - Timer value in seconds
     * @returns {Promise<void>}
     */
    async setTimer(seconds) {
        if (!this.state) {
            return this.state;
        }

        return this.persistState({
            timer_seconds: Math.max(0, seconds),
            timer_last_update: new Date().toISOString()
        }, 'timer_updated');
    }

    /**
     * Start local timer interval
     * @private
     */
    startLocalTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timerInterval = setInterval(() => {
            if (this.state && this.state.timer_running && this.state.timer_seconds > 0) {
                this.state.timer_seconds--;
                this.notify('timer_tick', this.state);

                // Sync to server every 30 seconds to prevent drift
                const now = Date.now();
                if (now - this.lastServerSync >= 30000) {
                    void this.syncToServer();
                    this.lastServerSync = now;
                }

                // Timer finished
                if (this.state.timer_seconds <= 0) {
                    void this.pauseTimer();
                    this.notify('timer_finished', this.state);
                }
            }
        }, 1000);
    }

    /**
     * Stop local timer interval
     * @private
     */
    stopLocalTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * Advance to next phase
     * @returns {Promise<boolean>} Success status
     */
    async advancePhase() {
        if (!this.state) {
            return false;
        }

        const currentPhase = this.state.phase;

        // Check if at max phase
        if (currentPhase >= 5) {
            logger.warn('Already at maximum phase');
            return false;
        }

        const newPhase = currentPhase + 1;
        logger.info('Advancing phase from', currentPhase, 'to', newPhase);

        return this.persistState({ phase: newPhase }, 'phase_advanced');
    }

    /**
     * Return to previous phase
     * @returns {Promise<GameState|false>}
     */
    async regressPhase() {
        if (!this.state) {
            return false;
        }

        const currentPhase = this.state.phase;
        if (currentPhase <= 1) {
            logger.warn('Already at minimum phase');
            return false;
        }

        const newPhase = currentPhase - 1;
        logger.info('Regressing phase from', currentPhase, 'to', newPhase);

        return this.persistState({ phase: newPhase }, 'phase_regressed');
    }

    /**
     * Advance to next move
     * @returns {Promise<boolean>} Success status
     */
    async advanceMove() {
        if (!this.state) {
            return false;
        }

        const currentMove = this.state.move;

        // Check if at max move
        if (currentMove >= 3) {
            logger.warn('Already at maximum move');
            return false;
        }

        const newMove = currentMove + 1;
        logger.info('Advancing move from', currentMove, 'to', newMove);

        return this.persistState({
            move: newMove,
            phase: 1
        }, 'move_advanced');
    }

    /**
     * Return to previous move
     * @returns {Promise<GameState|false>}
     */
    async regressMove() {
        if (!this.state) {
            return false;
        }

        const currentMove = this.state.move;
        if (currentMove <= 1) {
            logger.warn('Already at minimum move');
            return false;
        }

        const newMove = currentMove - 1;
        logger.info('Regressing move from', currentMove, 'to', newMove);

        return this.persistState({
            move: newMove,
            phase: 1
        }, 'move_regressed');
    }

    /**
     * Set game status
     * @param {string} status - New status (active, paused, completed)
     * @returns {Promise<void>}
     */
    async setStatus(status) {
        if (!this.state) {
            return this.state;
        }

        logger.info('Setting game status to:', status);

        if (status === 'paused' || status === 'completed') {
            await this.pauseTimer();
        }

        return this.persistState({ status }, 'status_changed');
    }

    /**
     * Persist partial state and publish the updated server state
     * @private
     * @param {Partial<GameState>} updates
     * @param {string} event
     * @returns {Promise<GameState>}
     */
    async persistState(updates, event) {
        if (!this.state?.session_id) {
            return this.state;
        }

        const data = await database.updateGameState(this.state.session_id, updates);
        this.applyServerState(data, event);
        return this.state;
    }

    /**
     * Sync current state to server
     * @private
     * @returns {Promise<void>}
     */
    async syncToServer() {
        if (!this.state?.session_id) {
            return;
        }

        try {
            const timestamp = this.state.timer_running
                ? new Date().toISOString()
                : (this.state.timer_last_update || new Date().toISOString());
            const data = await database.updateGameState(this.state.session_id, {
                move: this.state.move,
                phase: this.state.phase,
                timer_seconds: this.state.timer_seconds,
                timer_running: this.state.timer_running,
                timer_last_update: timestamp,
                status: this.state.status
            });

            this.applyServerState(data, 'synced');
            this.lastServerSync = Date.now();
        } catch (err) {
            logger.error('Error syncing game state:', err);
        }
    }

    /**
     * Calculate the effective timer seconds from the server payload
     * @private
     * @param {GameState} state
     * @returns {GameState}
     */
    normalizeState(state) {
        if (!state) {
            return state;
        }

        const normalizedState = { ...state };
        const storedSeconds = normalizedState.timer_seconds ?? CONFIG.DEFAULT_TIMER_SECONDS;

        if (!normalizedState.timer_running || !normalizedState.timer_last_update) {
            normalizedState.timer_seconds = storedSeconds;
            return normalizedState;
        }

        const lastUpdate = new Date(normalizedState.timer_last_update).getTime();
        if (Number.isNaN(lastUpdate)) {
            normalizedState.timer_seconds = storedSeconds;
            return normalizedState;
        }

        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastUpdate) / 1000));
        normalizedState.timer_seconds = Math.max(0, storedSeconds - elapsedSeconds);
        normalizedState.timer_running = normalizedState.timer_seconds > 0;

        return normalizedState;
    }

    /**
     * Apply an authoritative server state to the local store
     * @private
     * @param {GameState} nextState
     * @param {string} event
     */
    applyServerState(nextState, event = 'synced') {
        this.state = this.normalizeState(nextState);

        if (this.state?.timer_running) {
            this.startLocalTimer();
        } else {
            this.stopLocalTimer();
        }

        this.lastServerSync = Date.now();
        this.notify(event, this.state);
    }

    /**
     * Update state from server (for real-time sync)
     * @param {Partial<GameState>} updates - State updates from server
     */
    updateFromServer(updates) {
        if (!updates) {
            return;
        }

        if (!this.state) {
            this.applyServerState(updates, 'synced');
            logger.debug('Game state updated from server');
            return;
        }

        const serverTime = new Date(updates.updated_at || updates.last_updated || updates.timer_last_update || 0).getTime();
        const localTime = new Date(
            this.state.updated_at || this.state.last_updated || this.state.timer_last_update || 0
        ).getTime();

        if (serverTime >= localTime || Number.isNaN(localTime)) {
            this.applyServerState({
                ...this.state,
                ...updates
            }, 'synced');
            logger.debug('Game state updated from server');
        }
    }

    /**
     * Subscribe to state changes
     * @param {Function} callback - Callback function (event, state)
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    /**
     * Notify all subscribers
     * @private
     * @param {string} event - Event type
     * @param {GameState} state - Current state
     */
    notify(event, state) {
        this.subscribers.forEach(callback => {
            try {
                callback(event, { ...state });
            } catch (err) {
                logger.error('Subscriber error:', err);
            }
        });
    }

    /**
     * Reset store state
     */
    reset() {
        this.stopLocalTimer();
        this.state = null;
        this.initialized = false;
        this.lastServerSync = 0;
        this.notify('reset', null);
        logger.info('Game state store reset');
    }

    /**
     * Cleanup on destroy
     */
    destroy() {
        this.stopLocalTimer();
        this.state = null;
        this.subscribers.clear();
    }
}

// Export singleton instance
export const gameStateStore = new GameStateStore();

export default gameStateStore;
