/**
 * Data Synchronization Service
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Coordinates data synchronization between:
 * - Local stores
 * - Supabase database
 * - Real-time subscriptions
 *
 * Ensures data consistency across all connected clients.
 */

import { realtimeService, CHANNELS } from './realtime.js';
import { gameStateStore } from '../stores/gameState.js';
import { actionsStore } from '../stores/actions.js';
import { requestsStore } from '../stores/requests.js';
import { timelineStore } from '../stores/timeline.js';
import { participantsStore } from '../stores/participants.js';
import { communicationsStore } from '../stores/communications.js';
import { sessionStore } from '../stores/session.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SyncService');

/**
 * Sync status states
 */
export const SYNC_STATUS = {
    IDLE: 'idle',
    SYNCING: 'syncing',
    SYNCED: 'synced',
    ERROR: 'error',
    OFFLINE: 'offline'
};

/**
 * Data Synchronization Service Class
 */
class SyncService {
    constructor() {
        /** @type {string} */
        this.status = SYNC_STATUS.IDLE;

        /** @type {Set<Function>} */
        this.statusListeners = new Set();

        /** @type {string|null} */
        this.sessionId = null;

        /** @type {boolean} */
        this.initialized = false;

        /** @type {Function[]} */
        this.unsubscribers = [];

        /** @type {number} */
        this.lastSyncTime = 0;

        /** @type {number} */
        this.syncDebounceTimer = null;

        /** @type {Promise<void>|null} */
        this.initializationPromise = null;
    }

    /**
     * Initialize sync service for a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<void>}
     */
    async initialize(sessionId, {
        participantId = null
    } = {}) {
        if (!sessionId) {
            logger.warn('Cannot initialize without session ID');
            return;
        }

        if (this.initialized && this.sessionId === sessionId) {
            logger.info('Sync service already initialized for this session');
            return;
        }

        if (this.initializationPromise && this.sessionId === sessionId) {
            return this.initializationPromise;
        }

        if ((this.initialized || this.initializationPromise) && this.sessionId && this.sessionId !== sessionId) {
            await this.reset();
        }

        this.sessionId = sessionId;
        this.setStatus(SYNC_STATUS.SYNCING);

        logger.info('Initializing sync service for session:', sessionId);

        this.initializationPromise = (async () => {
            // Initialize all stores
            await this.initializeStores(participantId);

            // Initialize real-time service
            await realtimeService.initialize(sessionId);

            // Set up real-time handlers
            this.setupRealtimeHandlers();

            // Set up online/offline handlers
            this.setupConnectivityHandlers();

            this.initialized = true;
            this.lastSyncTime = Date.now();
            this.setStatus(SYNC_STATUS.SYNCED);

            logger.info('Sync service initialized');
        })().catch((err) => {
            logger.error('Failed to initialize sync service:', err);
            this.setStatus(SYNC_STATUS.ERROR);
            throw err;
        }).finally(() => {
            this.initializationPromise = null;
        });

        return this.initializationPromise;
    }

    /**
     * Initialize all data stores
     * @private
     */
    async initializeStores(participantId = null) {
        const resolvedParticipantId = participantId || sessionStore.getSessionParticipantId?.() || null;

        logger.info('Initializing stores...');

        // Restore the participant seat before protected session reads on reload.
        await participantsStore.initialize(this.sessionId, resolvedParticipantId);

        await Promise.all([
            gameStateStore.initialize(this.sessionId),
            actionsStore.initialize(this.sessionId),
            requestsStore.initialize(this.sessionId),
            timelineStore.initialize(this.sessionId),
            communicationsStore.initialize(this.sessionId)
        ]);

        logger.info('All stores initialized');
    }

    /**
     * Set up real-time change handlers
     * @private
     */
    setupRealtimeHandlers() {
        // Game state changes
        const unsubGameState = realtimeService.on(CHANNELS.GAME_STATE, (eventType, data) => {
            if (eventType === 'UPDATE' || eventType === 'INSERT') {
                gameStateStore.updateFromServer(data.new);
            }
        });
        this.unsubscribers.push(unsubGameState);

        // Actions changes
        const unsubActions = realtimeService.on(CHANNELS.ACTIONS, (eventType, data) => {
            if (['INSERT', 'UPDATE', 'DELETE'].includes(eventType)) {
                actionsStore.updateFromServer(eventType, data.new || data.old);
            }
        });
        this.unsubscribers.push(unsubActions);

        // Requests changes
        const unsubRequests = realtimeService.on(CHANNELS.REQUESTS, (eventType, data) => {
            if (['INSERT', 'UPDATE', 'DELETE'].includes(eventType)) {
                requestsStore.updateFromServer(eventType, data.new || data.old);
            }
        });
        this.unsubscribers.push(unsubRequests);

        // Timeline changes
        const unsubTimeline = realtimeService.on(CHANNELS.TIMELINE, (eventType, data) => {
            if (['INSERT', 'UPDATE', 'DELETE'].includes(eventType)) {
                timelineStore.updateFromServer(eventType, data.new || data.old);
            }
        });
        this.unsubscribers.push(unsubTimeline);

        // Participants changes
        const unsubParticipants = realtimeService.on(CHANNELS.PARTICIPANTS, (eventType, data) => {
            if (['INSERT', 'UPDATE', 'DELETE'].includes(eventType)) {
                participantsStore.updateFromServer(eventType, data.new || data.old);
            }
        });
        this.unsubscribers.push(unsubParticipants);

        // Communications changes
        const unsubCommunications = realtimeService.on(CHANNELS.COMMUNICATIONS, (eventType, data) => {
            if (['INSERT', 'UPDATE', 'DELETE'].includes(eventType)) {
                communicationsStore.updateFromServer(eventType, data.new || data.old);
            }
        });
        this.unsubscribers.push(unsubCommunications);

        // Handle subscription status changes
        const unsubStatus = realtimeService.onAll((eventType, data) => {
            if (eventType === 'subscribed') {
                this.setStatus(SYNC_STATUS.SYNCED);
            } else if (eventType === 'error' || eventType === 'reconnect_failed') {
                this.setStatus(SYNC_STATUS.ERROR);
            }
        });
        this.unsubscribers.push(unsubStatus);

        logger.debug('Real-time handlers set up');
    }

    /**
     * Set up connectivity handlers
     * @private
     */
    setupConnectivityHandlers() {
        const handleOnline = () => {
            logger.info('Connection restored');
            this.setStatus(SYNC_STATUS.SYNCING);
            this.resync();
        };

        const handleOffline = () => {
            logger.warn('Connection lost');
            this.setStatus(SYNC_STATUS.OFFLINE);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        this.unsubscribers.push(() => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        });
    }

    /**
     * Resync all data from server
     * @returns {Promise<void>}
     */
    async resync() {
        if (!this.sessionId) {
            return;
        }

        // Debounce rapid resync calls
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
        }

        this.syncDebounceTimer = setTimeout(async () => {
            logger.info('Resyncing all data...');
            this.setStatus(SYNC_STATUS.SYNCING);

            try {
                await Promise.all([
                    gameStateStore.initialize(this.sessionId),
                    actionsStore.loadActions(),
                    requestsStore.loadRequests(),
                    timelineStore.loadEvents(),
                    participantsStore.loadParticipants({
                        tolerateError: true
                    }),
                    communicationsStore.loadCommunications()
                ]);

                this.lastSyncTime = Date.now();
                this.setStatus(SYNC_STATUS.SYNCED);
                logger.info('Resync complete');
            } catch (err) {
                logger.error('Resync failed:', err);
                this.setStatus(SYNC_STATUS.ERROR);
            }
        }, 500);
    }

    /**
     * Force refresh a specific store
     * @param {string} storeName - Store to refresh
     * @returns {Promise<void>}
     */
    async refreshStore(storeName) {
        logger.info('Refreshing store:', storeName);

        try {
            switch (storeName) {
                case 'gameState':
                    await gameStateStore.initialize(this.sessionId);
                    break;
                case 'actions':
                    await actionsStore.loadActions();
                    break;
                case 'requests':
                    await requestsStore.loadRequests();
                    break;
                case 'timeline':
                    await timelineStore.loadEvents();
                    break;
                case 'participants':
                    await participantsStore.loadParticipants();
                    break;
                case 'communications':
                    await communicationsStore.loadCommunications();
                    break;
                default:
                    logger.warn('Unknown store:', storeName);
            }
        } catch (err) {
            logger.error('Failed to refresh store:', storeName, err);
            throw err;
        }
    }

    /**
     * Set sync status and notify listeners
     * @private
     * @param {string} status - New status
     */
    setStatus(status) {
        if (this.status !== status) {
            this.status = status;
            this.notifyStatusListeners(status);
        }
    }

    /**
     * Get current sync status
     * @returns {string}
     */
    getStatus() {
        return this.status;
    }

    /**
     * Get last sync time
     * @returns {number}
     */
    getLastSyncTime() {
        return this.lastSyncTime;
    }

    /**
     * Check if service is synced
     * @returns {boolean}
     */
    isSynced() {
        return this.status === SYNC_STATUS.SYNCED;
    }

    /**
     * Check if service is offline
     * @returns {boolean}
     */
    isOffline() {
        return this.status === SYNC_STATUS.OFFLINE;
    }

    /**
     * Subscribe to status changes
     * @param {Function} listener - Status change listener
     * @returns {Function} Unsubscribe function
     */
    onStatusChange(listener) {
        this.statusListeners.add(listener);
        return () => this.statusListeners.delete(listener);
    }

    /**
     * Notify status listeners
     * @private
     * @param {string} status - New status
     */
    notifyStatusListeners(status) {
        this.statusListeners.forEach(listener => {
            try {
                listener(status);
            } catch (err) {
                logger.error('Status listener error:', err);
            }
        });
    }

    /**
     * Get sync service info
     * @returns {Object}
     */
    getInfo() {
        return {
            status: this.status,
            sessionId: this.sessionId,
            initialized: this.initialized,
            lastSyncTime: this.lastSyncTime,
            realtime: realtimeService.getStatus()
        };
    }

    /**
     * Reset all stores and service
     */
    async reset() {
        logger.info('Resetting sync service');

        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            this.syncDebounceTimer = null;
        }

        // Unsubscribe from all handlers
        this.unsubscribers.forEach(unsub => {
            try {
                unsub();
            } catch (err) {
                logger.error('Error during unsubscribe:', err);
            }
        });
        this.unsubscribers = [];

        // Reset real-time service
        await realtimeService.reset();

        // Reset all stores
        gameStateStore.reset();
        actionsStore.reset();
        requestsStore.reset();
        timelineStore.reset();
        participantsStore.reset();
        communicationsStore.reset();

        // Reset local state
        this.sessionId = null;
        this.initialized = false;
        this.lastSyncTime = 0;
        this.setStatus(SYNC_STATUS.IDLE);

        logger.info('Sync service reset complete');
    }

    /**
     * Cleanup on destroy
     */
    async destroy() {
        await this.reset();
        this.statusListeners.clear();
    }
}

// Export singleton instance
export const syncService = new SyncService();

export default syncService;
