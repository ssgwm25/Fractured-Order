/**
 * Participants Store
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Centralized store for participant management including:
 * - Active participant tracking
 * - Heartbeat management
 * - Role availability checking
 * - Real-time presence updates
 */

import { database } from '../services/database.js';
import { sessionStore } from './session.js';
import { createLogger } from '../utils/logger.js';
import { CONFIG, getRoleLimit, isHeartbeatFresh } from '../core/config.js';

const logger = createLogger('ParticipantsStore');

/**
 * @typedef {Object} Participant
 * @property {string} id - Session participant record ID
 * @property {string} session_id - Session ID
 * @property {string} participant_id - Participant ID (from participants table)
 * @property {string} display_name - Display name (from joined participants table)
 * @property {string} role - Role identifier
 * @property {boolean} is_active - Active status
 * @property {string} heartbeat_at - Last heartbeat timestamp
 * @property {string} last_seen - Last seen timestamp
 * @property {string} joined_at - Join timestamp
 * @property {string} disconnected_at - Disconnect timestamp (if disconnected)
 */

/**
 * Participants Store
 * Manages participant state with heartbeat and real-time sync
 */
class ParticipantsStore {
    constructor() {
        /** @type {Participant[]} */
        this.participants = [];

        /** @type {Set<Function>} */
        this.subscribers = new Set();

        /** @type {boolean} */
        this.initialized = false;

        /** @type {string|null} */
        this.sessionId = null;

        /** @type {string|null} */
        this.currentParticipantId = null;

        /** @type {number|null} */
        this.heartbeatInterval = null;

        /** @type {number|null} */
        this.cleanupInterval = null;

        /** @type {Function|null} */
        this.pagehideHandler = null;

        /** @type {Error|null} */
        this.lastLoadError = null;

        /** @type {Promise<Participant[]>|null} */
        this.pendingRosterRefresh = null;
    }

    /**
     * Initialize store with session data
     * @param {string} sessionId - Session ID
     * @param {string} participantId - Current participant's ID
     * @returns {Promise<Participant[]>}
     */
    async initialize(sessionId, participantId = null) {
        if (!sessionId) {
            logger.warn('Cannot initialize without session ID');
            return [];
        }

        this.sessionId = sessionId;
        this.currentParticipantId = participantId || sessionStore.getSessionParticipantId?.() || null;
        logger.info('Initializing participants store for session:', sessionId);

        await this.loadParticipants({
            tolerateError: true
        });

        this.initialized = true;

        // Start heartbeat if we have a current participant, even if roster loading failed.
        if (this.currentParticipantId) {
            await this.startHeartbeat();
        }

        // Start inactive participant cleanup
        this.startCleanup();

        this.notify('initialized', this.participants);

        if (this.lastLoadError) {
            logger.warn('Participants store initialized without a roster snapshot:', this.lastLoadError);
        }

        return this.participants;
    }

    /**
     * Load all participants for the current session
     * @returns {Promise<void>}
     */
    async loadParticipants({ tolerateError = false } = {}) {
        if (!this.sessionId) {
            return [];
        }

        try {
            const data = await database.getSessionParticipants(this.sessionId);

            this.participants = data || [];
            this.lastLoadError = null;
            logger.info(`Loaded ${this.participants.length} participants`);
            this.notify('loaded', this.participants);
            return this.participants;
        } catch (err) {
            this.lastLoadError = err;

            if (tolerateError) {
                logger.warn('Failed to load participants. Continuing without a roster snapshot:', err);
                this.notify('load_failed', err);
                return this.participants;
            }

            logger.error('Failed to load participants:', err);
            throw err;
        }
    }

    /**
     * Refresh the roster snapshot when realtime payloads omit participant joins.
     * @returns {Promise<Participant[]>}
     */
    refreshRosterSnapshot() {
        if (!this.sessionId) {
            return Promise.resolve(this.participants);
        }

        if (!this.pendingRosterRefresh) {
            this.pendingRosterRefresh = this.loadParticipants({
                tolerateError: true
            }).finally(() => {
                this.pendingRosterRefresh = null;
            });
        }

        return this.pendingRosterRefresh;
    }

    /**
     * Get all participants
     * @returns {Participant[]}
     */
    getAll() {
        return [...this.participants];
    }

    /**
     * Get active participants only
     * @returns {Participant[]}
     */
    getActive() {
        return this.participants.filter((participant) => (
            participant.is_active && isHeartbeatFresh(participant.heartbeat_at)
        ));
    }

    /**
     * Get participants by role
     * @param {string} role - Role identifier
     * @returns {Participant[]}
     */
    getByRole(role) {
        return this.participants.filter(p => p.role === role);
    }

    /**
     * Get active participants by role
     * @param {string} role - Role identifier
     * @returns {Participant[]}
     */
    getActiveByRole(role) {
        return this.getActive().filter(p => p.role === role);
    }

    /**
     * Get participant by ID
     * @param {string} id - Participant ID
     * @returns {Participant|undefined}
     */
    getById(id) {
        return this.participants.find(p => p.id === id);
    }

    /**
     * Get current participant
     * @returns {Participant|undefined}
     */
    getCurrentParticipant() {
        if (!this.currentParticipantId) return undefined;
        return this.getById(this.currentParticipantId);
    }

    /**
     * Check if a role is available
     * @param {string} role - Role identifier
     * @returns {boolean}
     */
    isRoleAvailable(role) {
        const limit = getRoleLimit(role);
        const activeCount = this.getActiveByRole(role).length;
        return activeCount < limit;
    }

    /**
     * Get available roles
     * @returns {string[]} Array of available role identifiers
     */
    getAvailableRoles() {
        const availableRoles = [];

        Object.keys(CONFIG.ROLE_LIMITS).forEach(role => {
            if (this.isRoleAvailable(role)) {
                availableRoles.push(role);
            }
        });

        return availableRoles;
    }

    /**
     * Get role counts
     * @returns {Object} Role count object
     */
    getRoleCounts() {
        const counts = {};

        this.getActive().forEach(p => {
            counts[p.role] = (counts[p.role] || 0) + 1;
        });

        return counts;
    }

    /**
     * Join session as participant
     * @param {string} displayName - Display name
     * @param {string} role - Role identifier
     * @returns {Promise<Participant>}
     */
    async join(displayName, role) {
        if (!this.sessionId) {
            throw new Error('Store not initialized');
        }

        logger.info('Joining session as:', role);

        try {
            const data = await database.claimParticipantSeat(this.sessionId, role, displayName);

            const existingIndex = this.participants.findIndex((participant) => participant.id === data.id);
            if (existingIndex === -1) {
                this.participants.push(data);
            } else {
                this.participants[existingIndex] = {
                    ...this.participants[existingIndex],
                    ...data
                };
            }

            // Store the session_participant id, not the participant id
            this.currentParticipantId = data.id;

            // Start heartbeat
            this.startHeartbeat();

            this.notify('joined', data);
            logger.info('Joined session with session_participant id:', data.id);

            return data;
        } catch (err) {
            logger.error('Failed to join session:', err);
            throw err;
        }
    }

    /**
     * Leave session
     * @returns {Promise<void>}
     */
    async leave() {
        if (!this.currentParticipantId || !this.sessionId) {
            return;
        }

        logger.info('Leaving session');

        try {
            await database.disconnectParticipant(this.sessionId, this.currentParticipantId);

            this.stopHeartbeat();

            const participant = this.getById(this.currentParticipantId);
            if (participant) {
                participant.is_active = false;
                participant.disconnected_at = new Date().toISOString();
            }

            this.notify('left', { id: this.currentParticipantId });
            this.currentParticipantId = null;

            logger.info('Left session');
        } catch (err) {
            logger.error('Failed to leave session:', err);
        }
    }

    /**
     * Update participant info
     * @param {string} id - Session participant ID
     * @param {Partial<Participant>} updates - Fields to update
     * @returns {Promise<Participant>}
     */
    async update(id, updates) {
        if (!this.sessionId) {
            throw new Error('Store not initialized');
        }

        try {
            const data = await database.updateParticipant(this.sessionId, id, updates);

            const index = this.participants.findIndex(p => p.id === id);
            if (index !== -1) {
                this.participants[index] = { ...this.participants[index], ...data };
            }

            this.notify('updated', data);
            return data;
        } catch (err) {
            logger.error('Failed to update participant:', err);
            throw err;
        }
    }

    /**
     * Send heartbeat for current participant
     * @returns {Promise<void>}
     */
    async sendHeartbeat() {
        if (!this.currentParticipantId || !this.sessionId) {
            return;
        }

        try {
            const now = new Date().toISOString();

            const updatedSeat = await database.updateHeartbeat(this.sessionId, this.currentParticipantId);

            // Update local state
            const participant = this.getById(this.currentParticipantId);
            if (participant) {
                Object.assign(participant, {
                    ...updatedSeat,
                    heartbeat_at: updatedSeat?.heartbeat_at || now,
                    last_seen: updatedSeat?.last_seen || now,
                    is_active: true
                });
            }

            logger.debug('Heartbeat sent');
        } catch (err) {
            logger.error('Failed to send heartbeat:', err);
        }
    }

    /**
     * Start heartbeat interval
     * @private
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.bindPagehideKeepalive();

        // Send initial heartbeat
        const initialHeartbeat = this.sendHeartbeat();

        // Set up interval
        this.heartbeatInterval = setInterval(() => {
            void this.sendHeartbeat();
        }, CONFIG.HEARTBEAT_INTERVAL_MS);

        logger.info('Heartbeat started');
        return initialHeartbeat;
    }

    /**
     * Stop heartbeat interval
     * @private
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        this.unbindPagehideKeepalive();
        logger.info('Heartbeat stopped');
    }

    /**
     * Register a keepalive disconnect when the page is hidden
     * @private
     */
    bindPagehideKeepalive() {
        if (typeof window === 'undefined' || this.pagehideHandler || !this.sessionId || !this.currentParticipantId) {
            return;
        }

        this.pagehideHandler = () => {
            void database.disconnectParticipantKeepalive(this.sessionId, this.currentParticipantId);
        };

        window.addEventListener('pagehide', this.pagehideHandler);
    }

    /**
     * Remove the keepalive disconnect handler
     * @private
     */
    unbindPagehideKeepalive() {
        if (typeof window === 'undefined' || !this.pagehideHandler) {
            return;
        }

        window.removeEventListener('pagehide', this.pagehideHandler);
        this.pagehideHandler = null;
    }

    /**
     * Start inactive participant cleanup interval
     * @private
     */
    startCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Clean up every minute
        this.cleanupInterval = setInterval(() => {
            this.markInactiveParticipants();
        }, CONFIG.PRESENCE_CLEANUP_INTERVAL_MS);
    }

    /**
     * Mark participants as inactive if heartbeat is stale
     * @private
     */
    markInactiveParticipants() {
        let changed = false;

        this.participants.forEach(participant => {
            if (participant.is_active) {
                if (!isHeartbeatFresh(participant.heartbeat_at)) {
                    participant.is_active = false;
                    changed = true;
                    logger.debug('Marked participant inactive:', participant.id);
                }
            }
        });

        if (changed) {
            this.notify('presence_updated', this.getActive());
        }
    }

    /**
     * Update from server (real-time sync)
     * @param {string} eventType - Event type (INSERT, UPDATE, DELETE)
     * @param {Participant} participant - Participant data
     */
    updateFromServer(eventType, participant) {
        const existingParticipant = participant?.id
            ? this.participants.find((candidate) => candidate.id === participant.id)
            : null;
        const normalizedParticipant = participant
            ? {
                ...existingParticipant,
                ...participant,
                display_name: participant.display_name
                    ?? participant.participant_name
                    ?? participant.participants?.name
                    ?? existingParticipant?.display_name
                    ?? null,
                client_id: participant.client_id
                    ?? participant.participants?.client_id
                    ?? existingParticipant?.client_id
                    ?? null
            }
            : participant;

        switch (eventType) {
            case 'INSERT':
                if (!this.participants.find(p => p.id === normalizedParticipant.id)) {
                    this.participants.push(normalizedParticipant);
                    this.notify('joined', normalizedParticipant);
                }

                if (!normalizedParticipant?.display_name) {
                    void this.refreshRosterSnapshot();
                }
                break;

            case 'UPDATE':
                const updateIndex = this.participants.findIndex(p => p.id === normalizedParticipant.id);
                if (updateIndex !== -1) {
                    const wasActive = this.participants[updateIndex].is_active;
                    this.participants[updateIndex] = normalizedParticipant;

                    if (wasActive && !normalizedParticipant.is_active) {
                        this.notify('left', normalizedParticipant);
                    } else {
                        this.notify('updated', normalizedParticipant);
                    }
                } else if (normalizedParticipant) {
                    this.participants.push(normalizedParticipant);
                    this.notify('joined', normalizedParticipant);
                }

                if (!normalizedParticipant?.display_name) {
                    void this.refreshRosterSnapshot();
                }
                break;

            case 'DELETE':
                this.participants = this.participants.filter(p => p.id !== normalizedParticipant.id);
                this.notify('removed', normalizedParticipant);
                break;
        }

        this.notify('presence_updated', this.getActive());
        logger.debug('Participants updated from server:', eventType);
    }

    /**
     * Get participant statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const active = this.getActive();

        return {
            total: this.participants.length,
            active: active.length,
            inactive: this.participants.length - active.length,
            byRole: this.getRoleCounts()
        };
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
        this.stopHeartbeat();

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        this.participants = [];
        this.initialized = false;
        this.sessionId = null;
        this.currentParticipantId = null;
        this.lastLoadError = null;
        this.pendingRosterRefresh = null;
        this.notify('reset', []);
        logger.info('Participants store reset');
    }

    /**
     * Cleanup on destroy
     */
    destroy() {
        void this.leave();
        this.reset();
        this.subscribers.clear();
    }
}

// Export singleton instance
export const participantsStore = new ParticipantsStore();

export default participantsStore;
