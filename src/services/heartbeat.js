/**
 * Heartbeat Service
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Manages participant presence through periodic heartbeats:
 * - Sends heartbeat to server at regular intervals
 * - Tracks active participants
 * - Handles connection status
 * - Manages participant timeout detection
 */

import { participantsStore } from '../stores/participants.js';
import { sessionStore } from '../stores/session.js';
import { createLogger } from '../utils/logger.js';
import { CONFIG } from '../core/config.js';

const logger = createLogger('HeartbeatService');

/**
 * Heartbeat events
 */
export const HEARTBEAT_EVENTS = {
    SENT: 'sent',
    FAILED: 'failed',
    PARTICIPANT_ACTIVE: 'participant_active',
    PARTICIPANT_INACTIVE: 'participant_inactive',
    CONNECTION_LOST: 'connection_lost',
    CONNECTION_RESTORED: 'connection_restored'
};

/**
 * Heartbeat Service Class
 */
class HeartbeatService {
    constructor() {
        /** @type {number|null} */
        this.heartbeatInterval = null;

        /** @type {number|null} */
        this.checkInterval = null;

        /** @type {Set<Function>} */
        this.subscribers = new Set();

        /** @type {boolean} */
        this.initialized = false;

        /** @type {number} */
        this.failedAttempts = 0;

        /** @type {number} */
        this.maxFailedAttempts = 3;

        /** @type {boolean} */
        this.isOnline = true;

        /** @type {number} */
        this.lastSuccessfulHeartbeat = 0;
    }

    /**
     * Initialize heartbeat service
     * @returns {void}
     */
    initialize() {
        if (this.initialized) {
            return;
        }

        logger.info('Initializing heartbeat service');

        // Set up connectivity listeners
        this.setupConnectivityListeners();

        // Start heartbeat if we have a participant
        const participantId = sessionStore.getSessionData()?.participantId;
        if (participantId) {
            this.start();
        }

        this.initialized = true;
        logger.info('Heartbeat service initialized');
    }

    /**
     * Set up online/offline listeners
     * @private
     */
    setupConnectivityListeners() {
        window.addEventListener('online', () => {
            if (!this.isOnline) {
                this.isOnline = true;
                this.notify(HEARTBEAT_EVENTS.CONNECTION_RESTORED, {
                    timestamp: Date.now()
                });
                this.start();
            }
        });

        window.addEventListener('offline', () => {
            if (this.isOnline) {
                this.isOnline = false;
                this.notify(HEARTBEAT_EVENTS.CONNECTION_LOST, {
                    timestamp: Date.now()
                });
                this.stop();
            }
        });

        // Check initial state
        this.isOnline = navigator.onLine;
    }

    /**
     * Start sending heartbeats
     */
    start() {
        if (this.heartbeatInterval) {
            return;
        }

        logger.info('Starting heartbeat');

        // Send initial heartbeat
        this.sendHeartbeat();

        // Set up regular heartbeat interval
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, CONFIG.HEARTBEAT_INTERVAL_MS);

        // Set up participant activity check interval
        this.startActivityCheck();
    }

    /**
     * Stop sending heartbeats
     */
    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        logger.info('Heartbeat stopped');
    }

    /**
     * Send a heartbeat
     * @private
     */
    async sendHeartbeat() {
        if (!this.isOnline) {
            return;
        }

        try {
            await participantsStore.sendHeartbeat();

            this.failedAttempts = 0;
            this.lastSuccessfulHeartbeat = Date.now();

            this.notify(HEARTBEAT_EVENTS.SENT, {
                timestamp: this.lastSuccessfulHeartbeat
            });

            logger.debug('Heartbeat sent successfully');
        } catch (err) {
            this.failedAttempts++;
            logger.error('Heartbeat failed:', err);

            this.notify(HEARTBEAT_EVENTS.FAILED, {
                error: err,
                attempts: this.failedAttempts
            });

            // If we've failed too many times, consider connection lost
            if (this.failedAttempts >= this.maxFailedAttempts) {
                this.handleConnectionLost();
            }
        }
    }

    /**
     * Handle connection lost
     * @private
     */
    handleConnectionLost() {
        logger.warn('Connection appears to be lost after multiple failed heartbeats');

        this.notify(HEARTBEAT_EVENTS.CONNECTION_LOST, {
            timestamp: Date.now(),
            lastSuccessful: this.lastSuccessfulHeartbeat
        });

        // Attempt to reconnect with backoff
        this.attemptReconnect();
    }

    /**
     * Attempt to reconnect with exponential backoff
     * @private
     */
    attemptReconnect() {
        const backoffTime = Math.min(1000 * Math.pow(2, this.failedAttempts), 30000);

        logger.info(`Attempting reconnect in ${backoffTime}ms`);

        setTimeout(async () => {
            if (navigator.onLine) {
                try {
                    await this.sendHeartbeat();

                    if (this.failedAttempts === 0) {
                        this.notify(HEARTBEAT_EVENTS.CONNECTION_RESTORED, {
                            timestamp: Date.now()
                        });
                    }
                } catch (err) {
                    this.attemptReconnect();
                }
            } else {
                this.attemptReconnect();
            }
        }, backoffTime);
    }

    /**
     * Start checking participant activity
     * @private
     */
    startActivityCheck() {
        if (this.checkInterval) {
            return;
        }

        // Check every minute
        this.checkInterval = setInterval(() => {
            this.checkParticipantActivity();
        }, 60000);
    }

    /**
     * Check participant activity and notify of changes
     * @private
     */
    checkParticipantActivity() {
        const participants = participantsStore.getAll();
        const cutoffTime = Date.now() - (CONFIG.HEARTBEAT_INTERVAL_MS * 3);

        participants.forEach(participant => {
            const lastHeartbeat = new Date(participant.heartbeat_at).getTime();
            const wasActive = participant.is_active;
            const isNowActive = lastHeartbeat > cutoffTime;

            if (wasActive && !isNowActive) {
                this.notify(HEARTBEAT_EVENTS.PARTICIPANT_INACTIVE, {
                    participant,
                    lastHeartbeat: participant.heartbeat_at
                });
            } else if (!wasActive && isNowActive) {
                this.notify(HEARTBEAT_EVENTS.PARTICIPANT_ACTIVE, {
                    participant
                });
            }
        });
    }

    /**
     * Get heartbeat status
     * @returns {Object}
     */
    getStatus() {
        return {
            isRunning: !!this.heartbeatInterval,
            isOnline: this.isOnline,
            failedAttempts: this.failedAttempts,
            lastSuccessfulHeartbeat: this.lastSuccessfulHeartbeat,
            timeSinceLastHeartbeat: this.lastSuccessfulHeartbeat
                ? Date.now() - this.lastSuccessfulHeartbeat
                : null
        };
    }

    /**
     * Check if connection is healthy
     * @returns {boolean}
     */
    isHealthy() {
        if (!this.isOnline) return false;
        if (this.failedAttempts >= this.maxFailedAttempts) return false;

        // Check if last heartbeat was within acceptable window
        const timeSinceLastHeartbeat = Date.now() - this.lastSuccessfulHeartbeat;
        return timeSinceLastHeartbeat < (CONFIG.HEARTBEAT_INTERVAL_MS * 2);
    }

    /**
     * Subscribe to heartbeat events
     * @param {Function} callback - Callback function (event, data)
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    /**
     * Subscribe to specific event
     * @param {string} eventType - Event type
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
                logger.error('Heartbeat subscriber error:', err);
            }
        });
    }

    /**
     * Reset service state
     */
    reset() {
        this.stop();
        this.failedAttempts = 0;
        this.lastSuccessfulHeartbeat = 0;
        this.subscribers.clear();
        this.initialized = false;
        logger.info('Heartbeat service reset');
    }

    /**
     * Cleanup on destroy
     */
    destroy() {
        this.reset();
    }
}

// Export singleton instance
export const heartbeatService = new HeartbeatService();

export default heartbeatService;
