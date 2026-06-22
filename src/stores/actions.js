/**
 * Actions Store
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Centralized store for action management including:
 * - CRUD operations for actions
 * - Filtering by move, status, team
 * - Real-time synchronization
 *
 * Uses pub/sub pattern for reactive updates.
 */

import { database } from '../services/database.js';
import { createLogger } from '../utils/logger.js';
import { ENUMS } from '../core/enums.js';

const logger = createLogger('ActionsStore');

/**
 * @typedef {Object} Action
 * @property {string} id - Action ID
 * @property {string} session_id - Session ID
 * @property {string} team - Team identifier (blue, red)
 * @property {number} move - Move number (1-3)
 * @property {string} title - Action title
 * @property {string} description - Action description
 * @property {string} mechanism - Economic mechanism
 * @property {string} sector - Target sector
 * @property {string} target - Target entity
 * @property {string} priority - Priority level
 * @property {string} status - Action status
 * @property {string} outcome - Adjudication outcome
 * @property {string} adjudication_notes - White Cell notes
 * @property {string} rationale - Action rationale
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 */

/**
 * Actions Store
 * Manages action state with filtering and real-time sync
 */
class ActionsStore {
    constructor() {
        /** @type {Action[]} */
        this.actions = [];

        /** @type {Set<Function>} */
        this.subscribers = new Set();

        /** @type {boolean} */
        this.initialized = false;

        /** @type {string|null} */
        this.sessionId = null;

        /** @type {Object} */
        this.filters = {
            move: null,
            status: null,
            team: null,
            mechanism: null
        };
    }

    /**
     * Initialize store with session data
     * @param {string} sessionId - Session ID
     * @returns {Promise<Action[]>}
     */
    async initialize(sessionId) {
        if (!sessionId) {
            logger.warn('Cannot initialize without session ID');
            return [];
        }

        this.sessionId = sessionId;
        logger.info('Initializing actions store for session:', sessionId);

        try {
            await this.loadActions();
            this.initialized = true;
            this.notify('initialized', this.actions);
            return this.actions;
        } catch (err) {
            logger.error('Failed to initialize actions store:', err);
            throw err;
        }
    }

    /**
     * Load all actions for the current session
     * @returns {Promise<void>}
     */
    async loadActions() {
        if (!this.sessionId) {
            return;
        }

        try {
            const data = await database.fetchActions(this.sessionId);

            this.actions = data || [];
            logger.info(`Loaded ${this.actions.length} actions`);
            this.notify('loaded', this.actions);
        } catch (err) {
            logger.error('Failed to load actions:', err);
            throw err;
        }
    }

    /**
     * Get all actions
     * @returns {Action[]}
     */
    getAll() {
        return [...this.actions];
    }

    /**
     * Get filtered actions based on current filters
     * @returns {Action[]}
     */
    getFiltered() {
        let filtered = [...this.actions];

        if (this.filters.move !== null) {
            filtered = filtered.filter(a => a.move === this.filters.move);
        }

        if (this.filters.status !== null) {
            filtered = filtered.filter(a => a.status === this.filters.status);
        }

        if (this.filters.team !== null) {
            filtered = filtered.filter(a => a.team === this.filters.team);
        }

        if (this.filters.mechanism !== null) {
            filtered = filtered.filter(a => a.mechanism === this.filters.mechanism);
        }

        return filtered;
    }

    /**
     * Get actions by move
     * @param {number} move - Move number
     * @returns {Action[]}
     */
    getByMove(move) {
        return this.actions.filter(a => a.move === move);
    }

    /**
     * Get actions by status
     * @param {string} status - Action status
     * @returns {Action[]}
     */
    getByStatus(status) {
        return this.actions.filter(a => a.status === status);
    }

    /**
     * Get actions by team
     * @param {string} team - Team identifier
     * @returns {Action[]}
     */
    getByTeam(team) {
        return this.actions.filter(a => a.team === team);
    }

    /**
     * Get pending actions (submitted but not adjudicated)
     * @returns {Action[]}
     */
    getPending() {
        return this.actions.filter(a => a.status === ENUMS.ACTION_STATUS.SUBMITTED);
    }

    /**
     * Get action by ID
     * @param {string} id - Action ID
     * @returns {Action|undefined}
     */
    getById(id) {
        return this.actions.find(a => a.id === id);
    }

    /**
     * Set filter value
     * @param {string} filterName - Filter name (move, status, team, mechanism)
     * @param {*} value - Filter value (null to clear)
     */
    setFilter(filterName, value) {
        if (filterName in this.filters) {
            this.filters[filterName] = value;
            this.notify('filtered', this.getFiltered());
        }
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        this.filters = {
            move: null,
            status: null,
            team: null,
            mechanism: null
        };
        this.notify('filtered', this.getFiltered());
    }

    /**
     * Create a new action
     * @param {Partial<Action>} actionData - Action data
     * @returns {Promise<Action>}
     */
    async create(actionData) {
        if (!this.sessionId) {
            throw new Error('Store not initialized');
        }

        const newAction = {
            session_id: this.sessionId,
            status: ENUMS.ACTION_STATUS.DRAFT,
            ...actionData,
            created_at: new Date().toISOString()
        };

        logger.info('Creating action:', newAction.goal || newAction.title || 'Untitled action');

        try {
            const data = await database.createAction(newAction);

            this.actions.push(data);
            this.notify('created', data);
            logger.info('Action created:', data.id);

            return data;
        } catch (err) {
            logger.error('Failed to create action:', err);
            throw err;
        }
    }

    /**
     * Update an existing action
     * @param {string} id - Action ID
     * @param {Partial<Action>} updates - Fields to update
     * @returns {Promise<Action>}
     */
    async update(id, updates) {
        logger.info('Updating action:', id);

        try {
            const data = await database.updateAction(id, {
                ...updates,
                updated_at: new Date().toISOString()
            });

            // Update local state
            const index = this.actions.findIndex(a => a.id === id);
            if (index !== -1) {
                this.actions[index] = { ...this.actions[index], ...data };
            }

            this.notify('updated', data);
            logger.info('Action updated:', id);

            return data;
        } catch (err) {
            logger.error('Failed to update action:', err);
            throw err;
        }
    }

    /**
     * Submit an action for adjudication
     * @param {string} id - Action ID
     * @returns {Promise<Action>}
     */
    async submit(id) {
        return this.update(id, {
            status: ENUMS.ACTION_STATUS.SUBMITTED,
            submitted_at: new Date().toISOString()
        });
    }

    /**
     * Adjudicate an action
     * @param {string} id - Action ID
     * @param {string} outcome - Adjudication outcome
     * @param {string} notes - Adjudication notes
     * @returns {Promise<Action>}
     */
    async adjudicate(id, outcome, notes = '') {
        logger.info('Adjudicating action:', id, 'with outcome:', outcome);

        return this.update(id, {
            status: ENUMS.ACTION_STATUS.ADJUDICATED,
            outcome,
            adjudication_notes: notes,
            adjudicated_at: new Date().toISOString()
        });
    }

    /**
     * Delete an action
     * @param {string} id - Action ID
     * @returns {Promise<void>}
     */
    async delete(id) {
        logger.info('Deleting action:', id);

        try {
            await database.deleteAction(id);

            // Remove from local state
            this.actions = this.actions.filter(a => a.id !== id);
            this.notify('deleted', { id });
            logger.info('Action deleted:', id);
        } catch (err) {
            logger.error('Failed to delete action:', err);
            throw err;
        }
    }

    /**
     * Update from server (real-time sync)
     * @param {string} eventType - Event type (INSERT, UPDATE, DELETE)
     * @param {Action} action - Action data
     */
    updateFromServer(eventType, action) {
        switch (eventType) {
            case 'INSERT':
                if (!this.actions.find(a => a.id === action.id)) {
                    this.actions.push(action);
                    this.notify('created', action);
                }
                break;

            case 'UPDATE':
                const updateIndex = this.actions.findIndex(a => a.id === action.id);
                if (updateIndex !== -1) {
                    this.actions[updateIndex] = action;
                    this.notify('updated', action);
                }
                break;

            case 'DELETE':
                this.actions = this.actions.filter(a => a.id !== action.id);
                this.notify('deleted', action);
                break;
        }

        logger.debug('Actions updated from server:', eventType);
    }

    /**
     * Get action statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const stats = {
            total: this.actions.length,
            byStatus: {},
            byMove: {},
            byMechanism: {}
        };

        this.actions.forEach(action => {
            // By status
            stats.byStatus[action.status] = (stats.byStatus[action.status] || 0) + 1;

            // By move
            stats.byMove[action.move] = (stats.byMove[action.move] || 0) + 1;

            // By mechanism
            if (action.mechanism) {
                stats.byMechanism[action.mechanism] = (stats.byMechanism[action.mechanism] || 0) + 1;
            }
        });

        return stats;
    }

    /**
     * Subscribe to store changes
     * @param {Function} callback - Callback function (event, data)
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
     * @param {*} data - Event data
     */
    notify(event, data) {
        this.subscribers.forEach(callback => {
            try {
                callback(event, data);
            } catch (err) {
                logger.error('Subscriber error:', err);
            }
        });
    }

    /**
     * Reset store state
     */
    reset() {
        this.actions = [];
        this.filters = {
            move: null,
            status: null,
            team: null,
            mechanism: null
        };
        this.initialized = false;
        this.sessionId = null;
        this.notify('reset', []);
        logger.info('Actions store reset');
    }

    /**
     * Cleanup store state
     */
    destroy() {
        this.reset();
        this.subscribers.clear();
    }
}

// Export singleton instance
export const actionsStore = new ActionsStore();

export default actionsStore;
