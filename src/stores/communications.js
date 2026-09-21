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
import { getConfirmedSeat } from '../core/seatContext.js';
import { getProposalThreadMessageKey } from '../features/actions/proposalRecipientState.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CommunicationsStore');

function getCommunicationIdentity(communication = {}) {
    return getProposalThreadMessageKey(communication)
        || (communication?.id ? `communication:${communication.id}` : null);
}

function deduplicateCommunications(communications = []) {
    const byIdentity = new Map();
    (communications || []).forEach((communication) => {
        const identity = getCommunicationIdentity(communication);
        if (!identity) return;

        const existing = byIdentity.get(identity);
        if (!existing || String(communication.id || '').localeCompare(String(existing.id || '')) < 0) {
            byIdentity.set(identity, communication);
        }
    });
    return Array.from(byIdentity.values());
}

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
            const sessionId = this.sessionId, seat = getConfirmedSeat();
            const data = await database.fetchCommunications(sessionId);
            if (sessionId !== this.sessionId || seat !== getConfirmedSeat()) return;
            this.communications = deduplicateCommunications(data || []).sort(
                (left, right) => new Date(right.created_at) - new Date(left.created_at)
            );
            this.notify('loaded', this.getAll());
        } catch (error) {
            logger.error('Failed to load communications:', error);
            throw error;
        }
    }

    /**
     * Reconcile the initial snapshot after realtime subscriptions are active.
     *
     * A communication can be committed after the first snapshot query but
     * before the realtime handler is ready. Merge instead of replacing so a
     * realtime row received while this query is in flight cannot be lost.
     * Subscribers receive a distinct event so newly discovered rows can be
     * announced without replaying the initial history.
     *
     * @returns {Promise<Array<Object>>} Communications discovered by the reconciliation
     */
    async reconcileCommunications() {
        if (!this.sessionId) {
            return [];
        }

        try {
            const sessionId = this.sessionId, seat = getConfirmedSeat();
            const communicationsAtQueryStart = new Map(
                this.communications
                    .filter((communication) => getCommunicationIdentity(communication))
                    .map((communication) => [getCommunicationIdentity(communication), communication])
            );
            const fetchedCommunications = await database.fetchCommunications(this.sessionId) || [];
            if (sessionId !== this.sessionId || seat !== getConfirmedSeat()) return [];
            const reconciledById = new Map(
                deduplicateCommunications(fetchedCommunications)
                    .filter((communication) => getCommunicationIdentity(communication))
                    .map((communication) => [getCommunicationIdentity(communication), communication])
            );

            // Preserve rows inserted or replaced by realtime while the query
            // was in flight; otherwise the fetched server row is authoritative.
            this.communications.forEach((communication) => {
                if (
                    communication?.id
                    && (
                        communicationsAtQueryStart.get(getCommunicationIdentity(communication)) !== communication
                    )
                ) {
                    reconciledById.set(getCommunicationIdentity(communication), communication);
                }
            });

            const discovered = fetchedCommunications.filter(
                (communication) => (
                    getCommunicationIdentity(communication)
                    && !communicationsAtQueryStart.has(getCommunicationIdentity(communication))
                )
            );

            this.communications = Array.from(reconciledById.values()).sort((left, right) => (
                new Date(right.created_at) - new Date(left.created_at)
                || String(left.id).localeCompare(String(right.id))
            ));
            this.notify('reconciled', discovered);

            return discovered;
        } catch (error) {
            logger.error('Failed to reconcile communications after realtime subscription:', error);
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
                if (!this.communications.find((entry) => (
                    entry.id === communication.id
                    || getCommunicationIdentity(entry) === getCommunicationIdentity(communication)
                ))) {
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
