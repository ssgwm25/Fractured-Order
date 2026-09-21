/**
 * Requests Store (RFI - Requests for Information)
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Centralized store for RFI management including:
 * - CRUD operations for requests
 * - Workflow tracking (pending, returned, resubmitted, answered)
 * - Filtering by team and status
 * - Real-time synchronization
 */

import { database } from '../services/database.js';
import { getConfirmedSeat } from '../core/seatContext.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('RequestsStore');

function getRequestSyncFingerprint(request = {}) {
    return JSON.stringify({
        status: request.status || '',
        workflowState: request.canonical_workflow_state || request.workflow_state || '',
        revision: Number(request.revision_number) || 1,
        responseAt: request.responded_at || '',
        updatedAt: request.updated_at || ''
    });
}

/**
 * Request status constants
 * Schema: status IN ('pending', 'answered', 'withdrawn')
 */
export const REQUEST_STATUS = {
    PENDING: 'pending',
    ANSWERED: 'answered',
    WITHDRAWN: 'withdrawn'
};

/**
 * @typedef {Object} Request
 * @property {string} id - Request ID
 * @property {string} session_id - Session ID
 * @property {string} team - Requesting team
 * @property {number} move - Move number
 * @property {string} query - RFI query
 * @property {string[]} categories - Request categories
 * @property {string} status - Request status
 * @property {string} workflow_state - Revision-aware workflow state
 * @property {number} revision_number - Current RFI revision
 * @property {string|null} review_notes - White Cell clarification notes
 * @property {string} response - White Cell response
 * @property {string} responded_by - Responder identifier
 * @property {string} created_at - Creation timestamp
 * @property {string} responded_at - Response timestamp
 */

/**
 * Requests Store
 * Manages RFI state with filtering and real-time sync
 */
class RequestsStore {
    constructor() {
        /** @type {Request[]} */
        this.requests = [];

        /** @type {Set<Function>} */
        this.subscribers = new Set();

        /** @type {boolean} */
        this.initialized = false;

        /** @type {string|null} */
        this.sessionId = null;

        /** @type {Object} */
        this.filters = {
            status: null,
            team: null,
            move: null
        };
    }

    /**
     * Initialize store with session data
     * @param {string} sessionId - Session ID
     * @returns {Promise<Request[]>}
     */
    async initialize(sessionId) {
        if (!sessionId) {
            logger.warn('Cannot initialize without session ID');
            return [];
        }

        this.sessionId = sessionId;
        logger.info('Initializing requests store for session:', sessionId);

        try {
            await this.loadRequests();
            this.initialized = true;
            this.notify('initialized', this.requests);
            return this.requests;
        } catch (err) {
            logger.error('Failed to initialize requests store:', err);
            throw err;
        }
    }

    /**
     * Load all requests for the current session
     * @returns {Promise<void>}
     */
    async loadRequests() {
        if (!this.sessionId) {
            return;
        }

        try {
            const sessionId = this.sessionId, seat = getConfirmedSeat();
            const data = await database.fetchRequests(sessionId);
            if (sessionId !== this.sessionId || seat !== getConfirmedSeat()) return;

            this.requests = data || [];
            logger.info(`Loaded ${this.requests.length} requests`);
            this.notify('loaded', this.requests);
        } catch (err) {
            logger.error('Failed to load requests:', err);
            throw err;
        }
    }

    /**
     * Get all requests
     * @returns {Request[]}
     */
    getAll() {
        return [...this.requests];
    }

    /**
     * Get filtered requests based on current filters
     * @returns {Request[]}
     */
    getFiltered() {
        let filtered = [...this.requests];

        if (this.filters.status !== null) {
            filtered = filtered.filter(r => r.status === this.filters.status);
        }

        if (this.filters.team !== null) {
            filtered = filtered.filter(r => r.team === this.filters.team);
        }

        if (this.filters.move !== null) {
            filtered = filtered.filter(r => r.move === this.filters.move);
        }

        return filtered;
    }

    /**
     * Get pending requests
     * @returns {Request[]}
     */
    getPending() {
        return this.requests.filter(r => r.status === REQUEST_STATUS.PENDING);
    }

    /**
     * Get pending requests count
     * @returns {number}
     */
    getPendingCount() {
        return this.getPending().length;
    }

    /**
     * Get requests by team
     * @param {string} team - Team identifier
     * @returns {Request[]}
     */
    getByTeam(team) {
        return this.requests.filter(r => r.team === team);
    }

    /**
     * Get requests by status
     * @param {string} status - Request status
     * @returns {Request[]}
     */
    getByStatus(status) {
        return this.requests.filter(r => r.status === status);
    }

    /**
     * Get request by ID
     * @param {string} id - Request ID
     * @returns {Request|undefined}
     */
    getById(id) {
        return this.requests.find(r => r.id === id);
    }

    /**
     * Set filter value
     * @param {string} filterName - Filter name
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
            status: null,
            team: null,
            move: null
        };
        this.notify('filtered', this.getFiltered());
    }

    /**
     * Create a new request (RFI)
     * @param {Partial<Request>} requestData - Request data
     * @returns {Promise<Request>}
     */
    async create(requestData) {
        if (!this.sessionId) {
            throw new Error('Store not initialized');
        }

        const newRequest = {
            session_id: this.sessionId,
            status: REQUEST_STATUS.PENDING,
            ...requestData,
            created_at: new Date().toISOString()
        };

        logger.info('Creating RFI from team:', newRequest.team);

        try {
            const data = await database.createRequest(newRequest);

            if (!this.requests.some((request) => request.id === data.id)) {
                this.requests.push(data);
                this.notify('created', data);
            }
            logger.info('RFI created:', data.id);

            return data;
        } catch (err) {
            logger.error('Failed to create RFI:', err);
            throw err;
        }
    }

    /**
     * Respond to a request
     * @param {string} id - Request ID
     * @param {string} response - Response text
     * @param {string} respondedBy - Responder identifier
     * @returns {Promise<Request>}
     */
    async respond(id, response, respondedBy = 'white_cell') {
        logger.info('Responding to RFI:', id);

        try {
            const updates = {
                response,
                responded_by: respondedBy,
                status: REQUEST_STATUS.ANSWERED,
                responded_at: new Date().toISOString()
            };

            const existing = this.getById(id);
            const data = await database.updateRequest(id, updates, ...(existing?.delegation_id ? [existing] : []));

            // Update local state
            const index = this.requests.findIndex(r => r.id === id);
            if (index !== -1) {
                this.requests[index] = { ...this.requests[index], ...data };
            }

            this.notify('responded', data);
            logger.info('RFI responded:', id);

            return data;
        } catch (err) {
            logger.error('Failed to respond to RFI:', err);
            throw err;
        }
    }

    async reconcileRequests() {
        if (!this.sessionId) return [];
        const sessionId = this.sessionId, seat = getConfirmedSeat();

        const atQueryStart = new Map(this.requests
            .filter((request) => request?.id)
            .map((request) => [request.id, getRequestSyncFingerprint(request)]));
        const fetched = await database.fetchRequests(this.sessionId) || [];
        if (sessionId !== this.sessionId || seat !== getConfirmedSeat()) return [];
        const reconciled = new Map(fetched.filter((request) => request?.id).map((request) => [request.id, request]));

        this.requests.forEach((request) => {
            if (!request?.id) return;
            const changedDuringQuery = atQueryStart.get(request.id) !== getRequestSyncFingerprint(request);
            if (changedDuringQuery) reconciled.set(request.id, request);
        });

        const discovered = fetched.filter((request) => (
            request?.id && atQueryStart.get(request.id) !== getRequestSyncFingerprint(request)
        ));
        this.requests = Array.from(reconciled.values());
        this.notify('reconciled', discovered);
        return discovered;
    }

    /**
     * Revise and resubmit an RFI returned by White Cell.
     * The database trigger owns the workflow transition and revision identity.
     * @param {string} id - Existing RFI ID
     * @param {{query: string, categories: string[]}} updates
     * @returns {Promise<Request>}
     */
    async resubmit(id, updates = {}, reviewedRequest = null) {
        const existing = this.getById(id);
        if (!existing || existing.status !== REQUEST_STATUS.PENDING || existing.workflow_state !== 'returned_to_team') {
            throw new Error('Only an RFI returned for clarification can be resubmitted');
        }

        const data = await database.updateRequest(id, {
            query: updates.query,
            categories: updates.categories
        }, ...(existing.delegation_id ? [reviewedRequest || existing] : []));
        const index = this.requests.findIndex((request) => request.id === id);
        if (index !== -1) {
            this.requests[index] = data;
        }
        this.notify('resubmitted', data);
        return data;
    }

    /**
     * Withdraw a request
     * @param {string} id - Request ID
     * @param {string} reason - Optional withdrawal reason
     * @returns {Promise<Request>}
     */
    async withdraw(id, reason = '') {
        logger.info('Withdrawing RFI:', id);

        try {
            const updates = {
                status: REQUEST_STATUS.WITHDRAWN,
                response: reason || 'Request withdrawn',
                responded_at: new Date().toISOString()
            };

            const data = await database.updateRequest(id, updates);

            // Update local state
            const index = this.requests.findIndex(r => r.id === id);
            if (index !== -1) {
                this.requests[index] = { ...this.requests[index], ...data };
            }

            this.notify('withdrawn', data);
            logger.info('RFI withdrawn:', id);

            return data;
        } catch (err) {
            logger.error('Failed to withdraw RFI:', err);
            throw err;
        }
    }

    /**
     * Delete a request
     * @param {string} id - Request ID
     * @returns {Promise<void>}
     */
    async delete(id) {
        logger.info('Deleting RFI:', id);

        try {
            await database.deleteRequest(id);

            this.requests = this.requests.filter(r => r.id !== id);
            this.notify('deleted', { id });
            logger.info('RFI deleted:', id);
        } catch (err) {
            logger.error('Failed to delete RFI:', err);
            throw err;
        }
    }

    /**
     * Update from server (real-time sync)
     * @param {string} eventType - Event type (INSERT, UPDATE, DELETE)
     * @param {Request} request - Request data
     */
    updateFromServer(eventType, request) {
        switch (eventType) {
            case 'INSERT':
                if (!this.requests.find(r => r.id === request.id)) {
                    this.requests.push(request);
                    this.notify('created', request);
                }
                break;

            case 'UPDATE':
                const updateIndex = this.requests.findIndex(r => r.id === request.id);
                if (updateIndex !== -1) {
                    this.requests[updateIndex] = request;

                    // Determine specific event
                    if (request.status === REQUEST_STATUS.ANSWERED) {
                        this.notify('responded', request);
                    } else if (request.status === REQUEST_STATUS.WITHDRAWN) {
                        this.notify('withdrawn', request);
                    } else {
                        this.notify('updated', request);
                    }
                }
                break;

            case 'DELETE':
                this.requests = this.requests.filter(r => r.id !== request.id);
                this.notify('deleted', request);
                break;
        }

        logger.debug('Requests updated from server:', eventType);
    }

    /**
     * Get request statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const stats = {
            total: this.requests.length,
            pending: 0,
            answered: 0,
            withdrawn: 0,
            byTeam: {}
        };

        this.requests.forEach(request => {
            // By status
            if (request.status === REQUEST_STATUS.PENDING) stats.pending++;
            else if (request.status === REQUEST_STATUS.ANSWERED) stats.answered++;
            else if (request.status === REQUEST_STATUS.WITHDRAWN) stats.withdrawn++;

            // By team
            stats.byTeam[request.team] = (stats.byTeam[request.team] || 0) + 1;
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
        this.requests = [];
        this.filters = {
            status: null,
            team: null,
            move: null
        };
        this.initialized = false;
        this.sessionId = null;
        this.notify('reset', []);
        logger.info('Requests store reset');
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
export const requestsStore = new RequestsStore();

export default requestsStore;
