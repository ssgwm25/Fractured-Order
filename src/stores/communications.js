/**
 * Communications Store
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Centralized store for White Cell communications including:
 * - Session-scoped message history
 * - Recipient filtering
 * - Real-time synchronization
 */

import { database } from '../services/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CommunicationsStore');

class CommunicationsStore {
    constructor() {
        /** @type {Array<Object>} */
        this.communications = [];

        /** @type {Set<Function>} */
        this.subscribers = new Set();

        /** @type {boolean} */
        this.initialized = false;

        /** @type {string|null} */
        this.sessionId = null;
    }

    /**
     * Initialize store with session data
     * @param {string} sessionId
     * @returns {Promise<Array<Object>>}
     */
    async initialize(sessionId) {
        if (!sessionId) {
            logger.warn('Cannot initialize without session ID');
            return [];
        }

        this.sessionId = sessionId;
        logger.info('Initializing communications store for session:', sessionId);

        try {
            await this.loadCommunications();
            this.initialized = true;
            this.notify('initialized', this.getAll());
            return this.getAll();
        } catch (error) {
            logger.error('Failed to initialize communications store:', error);
            throw error;
        }
    }

    /**
     * Load all communications for the current session
     * @returns {Promise<void>}
     */
    async loadCommunications() {
        if (!this.sessionId) {
            return;
        }

        try {
            const data = await database.fetchCommunications(this.sessionId);
            this.communications = (data || []).sort(
                (left, right) => new Date(right.created_at) - new Date(left.created_at)
            );
            this.notify('loaded', this.getAll());
        } catch (error) {
            logger.error('Failed to load communications:', error);
            throw error;
        }
    }

    /**
     * Get all communications
     * @returns {Array<Object>}
     */
    getAll() {
        return [...this.communications];
    }

    /**
     * Get communications by recipient
     * @param {string|Set<string>} recipients
     * @returns {Array<Object>}
     */
    getByRecipients(recipients) {
        const recipientSet = recipients instanceof Set
            ? recipients
            : new Set(Array.isArray(recipients) ? recipients : [recipients]);

        return this.communications.filter((communication) => recipientSet.has(communication.to_role));
    }

    /**
     * Update store from realtime payload
     * @param {string} eventType
     * @param {Object} communication
     */
    updateFromServer(eventType, communication) {
        switch (eventType) {
            case 'INSERT':
                if (!this.communications.find((entry) => entry.id === communication.id)) {
                    this.communications.unshift(communication);
                    this.communications.sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
                    this.notify('created', communication);
                }
                break;

            case 'UPDATE': {
                const index = this.communications.findIndex((entry) => entry.id === communication.id);
                if (index !== -1) {
                    this.communications[index] = communication;
                    this.communications.sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
                    this.notify('updated', communication);
                }
                break;
            }

            case 'DELETE':
                this.communications = this.communications.filter((entry) => entry.id !== communication.id);
                this.notify('deleted', communication);
                break;
        }

        logger.debug('Communications updated from server:', eventType);
    }

    /**
     * Subscribe to store changes
     * @param {Function} callback
     * @returns {Function}
     */
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    /**
     * Notify subscribers
     * @param {string} event
     * @param {*} payload
     */
    notify(event, payload) {
        this.subscribers.forEach((callback) => {
            try {
                callback(event, payload);
            } catch (error) {
                logger.error('Subscriber error:', error);
            }
        });
    }

    /**
     * Reset store state while preserving subscriptions for session changes
     */
    reset() {
        this.communications = [];
        this.initialized = false;
        this.sessionId = null;
        this.notify('reset', []);
        logger.info('Communications store reset');
    }

    /**
     * Cleanup store state
     */
    destroy() {
        this.reset();
        this.subscribers.clear();
    }
}

export const communicationsStore = new CommunicationsStore();

export default communicationsStore;
