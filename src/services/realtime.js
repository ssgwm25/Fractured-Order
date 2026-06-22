/**
 * Real-time Subscription Service
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Manages Supabase real-time subscriptions for:
 * - Game state changes
 * - Action updates
 * - RFI updates
 * - Timeline events
 * - Participant presence
 *
 * Provides a unified interface for subscribing to database changes.
 */

import { supabase } from './supabase.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('RealtimeService');

/**
 * Subscription channel types
 */
export const CHANNELS = {
    GAME_STATE: 'game_state',
    ACTIONS: 'actions',
    REQUESTS: 'requests',
    TIMELINE: 'timeline',
    PARTICIPANTS: 'session_participants',  // Changed from 'participants' to track active session presence
    COMMUNICATIONS: 'communications'
};

/**
 * Real-time Service Class
 * Manages all Supabase real-time subscriptions
 */
class RealtimeService {
    constructor() {
        /** @type {Map<string, Object>} */
        this.channels = new Map();

        /** @type {Map<string, Set<Function>>} */
        this.handlers = new Map();

        /** @type {string|null} */
        this.sessionId = null;

        /** @type {boolean} */
        this.connected = false;

        /** @type {number} */
        this.reconnectAttempts = 0;

        /** @type {number} */
        this.maxReconnectAttempts = 5;
    }

    /**
     * Initialize real-time service for a session
     * @param {string} sessionId - Session ID to subscribe to
     * @returns {Promise<void>}
     */
    async initialize(sessionId) {
        if (!sessionId) {
            logger.warn('Cannot initialize without session ID');
            return;
        }

        if (this.connected && this.sessionId === sessionId && this.channels.size > 0) {
            logger.info('Real-time service already initialized for this session');
            return;
        }

        if (this.sessionId && this.sessionId !== sessionId) {
            await this.reset();
        }

        this.sessionId = sessionId;
        logger.info('Initializing real-time service for session:', sessionId);

        try {
            // Subscribe to all relevant tables
            await this.subscribeToGameState();
            await this.subscribeToActions();
            await this.subscribeToRequests();
            await this.subscribeToTimeline();
            await this.subscribeToParticipants();
            await this.subscribeToCommunications();

            this.connected = true;
            this.reconnectAttempts = 0;

            logger.info('Real-time service initialized');
        } catch (err) {
            logger.error('Failed to initialize real-time service:', err);
            throw err;
        }
    }

    /**
     * Subscribe to game state changes
     * @private
     */
    async subscribeToGameState() {
        const channelName = `${CHANNELS.GAME_STATE}:${this.sessionId}`;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'game_state',
                    filter: `session_id=eq.${this.sessionId}`
                },
                (payload) => this.handleChange(CHANNELS.GAME_STATE, payload)
            )
            .subscribe((status) => {
                this.handleSubscriptionStatus(CHANNELS.GAME_STATE, status);
            });

        this.channels.set(CHANNELS.GAME_STATE, channel);
        logger.debug('Subscribed to game state changes');
    }

    /**
     * Subscribe to actions changes
     * @private
     */
    async subscribeToActions() {
        const channelName = `${CHANNELS.ACTIONS}:${this.sessionId}`;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'actions',
                    filter: `session_id=eq.${this.sessionId}`
                },
                (payload) => this.handleChange(CHANNELS.ACTIONS, payload)
            )
            .subscribe((status) => {
                this.handleSubscriptionStatus(CHANNELS.ACTIONS, status);
            });

        this.channels.set(CHANNELS.ACTIONS, channel);
        logger.debug('Subscribed to actions changes');
    }

    /**
     * Subscribe to requests (RFI) changes
     * @private
     */
    async subscribeToRequests() {
        const channelName = `${CHANNELS.REQUESTS}:${this.sessionId}`;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'requests',
                    filter: `session_id=eq.${this.sessionId}`
                },
                (payload) => this.handleChange(CHANNELS.REQUESTS, payload)
            )
            .subscribe((status) => {
                this.handleSubscriptionStatus(CHANNELS.REQUESTS, status);
            });

        this.channels.set(CHANNELS.REQUESTS, channel);
        logger.debug('Subscribed to requests changes');
    }

    /**
     * Subscribe to timeline changes
     * @private
     */
    async subscribeToTimeline() {
        const channelName = `${CHANNELS.TIMELINE}:${this.sessionId}`;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'timeline',
                    filter: `session_id=eq.${this.sessionId}`
                },
                (payload) => this.handleChange(CHANNELS.TIMELINE, payload)
            )
            .subscribe((status) => {
                this.handleSubscriptionStatus(CHANNELS.TIMELINE, status);
            });

        this.channels.set(CHANNELS.TIMELINE, channel);
        logger.debug('Subscribed to timeline changes');
    }

    /**
     * Subscribe to participant changes (session_participants table)
     * @private
     */
    async subscribeToParticipants() {
        const channelName = `${CHANNELS.PARTICIPANTS}:${this.sessionId}`;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'session_participants',  // Changed from 'participants' to track active session presence
                    filter: `session_id=eq.${this.sessionId}`
                },
                (payload) => this.handleChange(CHANNELS.PARTICIPANTS, payload)
            )
            .subscribe((status) => {
                this.handleSubscriptionStatus(CHANNELS.PARTICIPANTS, status);
            });

        this.channels.set(CHANNELS.PARTICIPANTS, channel);
        logger.debug('Subscribed to session_participants changes');
    }

    /**
     * Subscribe to communications changes
     * @private
     */
    async subscribeToCommunications() {
        const channelName = `${CHANNELS.COMMUNICATIONS}:${this.sessionId}`;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'communications',
                    filter: `session_id=eq.${this.sessionId}`
                },
                (payload) => this.handleChange(CHANNELS.COMMUNICATIONS, payload)
            )
            .subscribe((status) => {
                this.handleSubscriptionStatus(CHANNELS.COMMUNICATIONS, status);
            });

        this.channels.set(CHANNELS.COMMUNICATIONS, channel);
        logger.debug('Subscribed to communications changes');
    }

    /**
     * Handle subscription status changes
     * @private
     * @param {string} channelType - Channel type
     * @param {string} status - Subscription status
     */
    handleSubscriptionStatus(channelType, status) {
        logger.debug(`Channel ${channelType} status:`, status);

        if (status === 'SUBSCRIBED') {
            this.notifyHandlers(channelType, 'subscribed', { channelType });
        } else if (status === 'CHANNEL_ERROR') {
            logger.error(`Channel ${channelType} error`);
            this.notifyHandlers(channelType, 'error', { channelType });
            this.handleReconnect(channelType);
        } else if (status === 'TIMED_OUT') {
            logger.warn(`Channel ${channelType} timed out`);
            this.handleReconnect(channelType);
        } else if (status === 'CLOSED') {
            logger.info(`Channel ${channelType} closed`);
            this.notifyHandlers(channelType, 'closed', { channelType });
        }
    }

    /**
     * Handle incoming changes
     * @private
     * @param {string} channelType - Channel type
     * @param {Object} payload - Change payload
     */
    handleChange(channelType, payload) {
        const { eventType, new: newRecord, old: oldRecord } = payload;

        logger.debug(`${channelType} change:`, eventType);

        this.notifyHandlers(channelType, eventType, {
            eventType,
            new: newRecord,
            old: oldRecord,
            channelType
        });
    }

    /**
     * Handle reconnection attempts
     * @private
     * @param {string} channelType - Channel type to reconnect
     */
    async handleReconnect(channelType) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Max reconnection attempts reached');
            this.notifyHandlers(channelType, 'reconnect_failed', { channelType });
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

        logger.info(`Reconnecting ${channelType} in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(async () => {
            try {
                // Unsubscribe from existing channel
                const existingChannel = this.channels.get(channelType);
                if (existingChannel) {
                    await supabase.removeChannel(existingChannel);
                }

                // Resubscribe based on channel type
                switch (channelType) {
                    case CHANNELS.GAME_STATE:
                        await this.subscribeToGameState();
                        break;
                    case CHANNELS.ACTIONS:
                        await this.subscribeToActions();
                        break;
                    case CHANNELS.REQUESTS:
                        await this.subscribeToRequests();
                        break;
                    case CHANNELS.TIMELINE:
                        await this.subscribeToTimeline();
                        break;
                    case CHANNELS.PARTICIPANTS:
                        await this.subscribeToParticipants();
                        break;
                    case CHANNELS.COMMUNICATIONS:
                        await this.subscribeToCommunications();
                        break;
                }

                this.reconnectAttempts = 0;
                logger.info(`Reconnected to ${channelType}`);
            } catch (err) {
                logger.error(`Reconnection failed for ${channelType}:`, err);
                this.handleReconnect(channelType);
            }
        }, delay);
    }

    /**
     * Register a handler for a specific channel
     * @param {string} channelType - Channel type (from CHANNELS)
     * @param {Function} handler - Handler function (eventType, data) => void
     * @returns {Function} Unsubscribe function
     */
    on(channelType, handler) {
        if (!this.handlers.has(channelType)) {
            this.handlers.set(channelType, new Set());
        }

        this.handlers.get(channelType).add(handler);

        return () => {
            const handlers = this.handlers.get(channelType);
            if (handlers) {
                handlers.delete(handler);
            }
        };
    }

    /**
     * Register a handler for all channels
     * @param {Function} handler - Handler function (eventType, data) => void
     * @returns {Function} Unsubscribe function
     */
    onAll(handler) {
        const unsubscribes = Object.values(CHANNELS).map(channel =>
            this.on(channel, handler)
        );

        return () => unsubscribes.forEach(unsub => unsub());
    }

    /**
     * Notify all handlers for a channel
     * @private
     * @param {string} channelType - Channel type
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     */
    notifyHandlers(channelType, eventType, data) {
        const handlers = this.handlers.get(channelType);
        if (!handlers) return;

        handlers.forEach(handler => {
            try {
                handler(eventType, data);
            } catch (err) {
                logger.error('Handler error:', err);
            }
        });
    }

    /**
     * Unsubscribe from a specific channel
     * @param {string} channelType - Channel type to unsubscribe from
     */
    async unsubscribe(channelType) {
        const channel = this.channels.get(channelType);
        if (channel) {
            await supabase.removeChannel(channel);
            this.channels.delete(channelType);
            this.handlers.delete(channelType);
            logger.info(`Unsubscribed from ${channelType}`);
        }
    }

    /**
     * Unsubscribe from all channels
     */
    async unsubscribeAll() {
        logger.info('Unsubscribing from all channels');

        for (const [channelType, channel] of this.channels) {
            try {
                await supabase.removeChannel(channel);
            } catch (err) {
                logger.error(`Error unsubscribing from ${channelType}:`, err);
            }
        }

        this.channels.clear();
        this.handlers.clear();
        this.connected = false;
    }

    /**
     * Check if service is connected
     * @returns {boolean}
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Get connection status for all channels
     * @returns {Object} Status object
     */
    getStatus() {
        const status = {
            connected: this.connected,
            sessionId: this.sessionId,
            channels: {}
        };

        for (const [type, channel] of this.channels) {
            status.channels[type] = channel.state || 'unknown';
        }

        return status;
    }

    /**
     * Reset service state
     */
    async reset() {
        await this.unsubscribeAll();
        this.sessionId = null;
        this.reconnectAttempts = 0;
        logger.info('Real-time service reset');
    }

    /**
     * Cleanup on destroy
     */
    async destroy() {
        await this.reset();
    }
}

// Export singleton instance
export const realtimeService = new RealtimeService();

export default realtimeService;
