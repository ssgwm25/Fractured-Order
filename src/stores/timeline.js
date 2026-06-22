/**
 * Timeline Store
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Centralized store for timeline event management including:
 * - Game events, captures, communications
 * - Filtering by move, event type, team
 * - Real-time synchronization
 */

import { database } from '../services/database.js';
import { sessionStore } from './session.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('TimelineStore');

const getEventType = (event) => event?.type ?? event?.event_type ?? null;
const getEventContent = (event) => event?.content ?? event?.description ?? null;
const getEventActor = (event) => event?.actor ?? event?.metadata?.actor ?? null;
const normalizeEvent = (event) => ({
    ...event,
    type: getEventType(event),
    content: getEventContent(event),
    actor: getEventActor(event)
});

/**
 * Timeline event types
 */
export const EVENT_TYPES = {
    // Game events
    PHASE_CHANGE: 'PHASE_CHANGE',
    MOVE_CHANGE: 'MOVE_CHANGE',
    TIMER_START: 'TIMER_START',
    TIMER_PAUSE: 'TIMER_PAUSE',
    TIMER_RESET: 'TIMER_RESET',

    // Action events
    ACTION_CREATED: 'ACTION_CREATED',
    ACTION_SUBMITTED: 'ACTION_SUBMITTED',
    ACTION_ADJUDICATED: 'ACTION_ADJUDICATED',

    // Communication events
    INJECT: 'INJECT',
    ANNOUNCEMENT: 'ANNOUNCEMENT',
    GUIDANCE: 'GUIDANCE',

    // Capture events
    NOTE: 'NOTE',
    MOMENT: 'MOMENT',
    QUOTE: 'QUOTE',

    // Participant events
    PARTICIPANT_JOINED: 'PARTICIPANT_JOINED',
    PARTICIPANT_LEFT: 'PARTICIPANT_LEFT'
};

/**
 * @typedef {Object} TimelineEvent
 * @property {string} id - Event ID
 * @property {string} session_id - Session ID
 * @property {string} type - Event type
 * @property {string} content - Event content/description
 * @property {string} team - Associated team
 * @property {string} actor - Actor/user who created event
 * @property {number} move - Move number
 * @property {number} phase - Phase number
 * @property {string} related_id - Related entity ID
 * @property {Object} metadata - Additional metadata
 * @property {string} created_at - Creation timestamp
 */

/**
 * Timeline Store
 * Manages timeline events with filtering and real-time sync
 */
class TimelineStore {
    constructor() {
        /** @type {TimelineEvent[]} */
        this.events = [];

        /** @type {Set<Function>} */
        this.subscribers = new Set();

        /** @type {boolean} */
        this.initialized = false;

        /** @type {string|null} */
        this.sessionId = null;

        /** @type {Object} */
        this.filters = {
            move: null,
            eventType: null,
            team: null
        };
    }

    /**
     * Initialize store with session data
     * @param {string} sessionId - Session ID
     * @returns {Promise<TimelineEvent[]>}
     */
    async initialize(sessionId) {
        if (!sessionId) {
            logger.warn('Cannot initialize without session ID');
            return [];
        }

        this.sessionId = sessionId;
        logger.info('Initializing timeline store for session:', sessionId);

        try {
            await this.loadEvents();
            this.initialized = true;
            this.notify('initialized', this.events);
            return this.events;
        } catch (err) {
            logger.error('Failed to initialize timeline store:', err);
            throw err;
        }
    }

    /**
     * Load all timeline events for the current session
     * @returns {Promise<void>}
     */
    async loadEvents() {
        if (!this.sessionId) {
            return;
        }

        try {
            const data = await database.fetchTimeline(this.sessionId);

            // Sort by creation time descending (newest first)
            this.events = (data || [])
                .map(normalizeEvent)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            logger.info(`Loaded ${this.events.length} timeline events`);
            this.notify('loaded', this.events);
        } catch (err) {
            logger.error('Failed to load timeline events:', err);
            throw err;
        }
    }

    /**
     * Get all events
     * @returns {TimelineEvent[]}
     */
    getAll() {
        return [...this.events];
    }

    /**
     * Get filtered events based on current filters
     * @returns {TimelineEvent[]}
     */
    getFiltered() {
        let filtered = [...this.events];

        if (this.filters.move !== null) {
            filtered = filtered.filter(e => e.move === this.filters.move);
        }

        if (this.filters.eventType !== null) {
            filtered = filtered.filter(e => getEventType(e) === this.filters.eventType);
        }

        if (this.filters.team !== null) {
            filtered = filtered.filter(e => e.team === this.filters.team);
        }

        return filtered;
    }

    /**
     * Get events by move
     * @param {number} move - Move number
     * @returns {TimelineEvent[]}
     */
    getByMove(move) {
        return this.events.filter(e => e.move === move);
    }

    /**
     * Get events by type
     * @param {string} eventType - Event type
     * @returns {TimelineEvent[]}
     */
    getByType(eventType) {
        return this.events.filter(e => getEventType(e) === eventType);
    }

    /**
     * Get events by team
     * @param {string} team - Team identifier
     * @returns {TimelineEvent[]}
     */
    getByTeam(team) {
        return this.events.filter(e => e.team === team);
    }

    /**
     * Get capture events (notes, moments, quotes)
     * @returns {TimelineEvent[]}
     */
    getCaptures() {
        const captureTypes = [EVENT_TYPES.NOTE, EVENT_TYPES.MOMENT, EVENT_TYPES.QUOTE];
        return this.events.filter(e => captureTypes.includes(getEventType(e)));
    }

    /**
     * Get communication events (injects, announcements, guidance)
     * @returns {TimelineEvent[]}
     */
    getCommunications() {
        const commTypes = [EVENT_TYPES.INJECT, EVENT_TYPES.ANNOUNCEMENT, EVENT_TYPES.GUIDANCE];
        return this.events.filter(e => commTypes.includes(getEventType(e)));
    }

    /**
     * Get game events (phase/move changes, timer events)
     * @returns {TimelineEvent[]}
     */
    getGameEvents() {
        const gameTypes = [
            EVENT_TYPES.PHASE_CHANGE,
            EVENT_TYPES.MOVE_CHANGE,
            EVENT_TYPES.TIMER_START,
            EVENT_TYPES.TIMER_PAUSE,
            EVENT_TYPES.TIMER_RESET
        ];
        return this.events.filter(e => gameTypes.includes(getEventType(e)));
    }

    /**
     * Get recent events (limited)
     * @param {number} limit - Number of events to return
     * @returns {TimelineEvent[]}
     */
    getRecent(limit = 20) {
        return this.events.slice(0, limit);
    }

    /**
     * Get event by ID
     * @param {string} id - Event ID
     * @returns {TimelineEvent|undefined}
     */
    getById(id) {
        return this.events.find(e => e.id === id);
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
            move: null,
            eventType: null,
            team: null
        };
        this.notify('filtered', this.getFiltered());
    }

    /**
     * Create a new timeline event
     * @param {Partial<TimelineEvent>} eventData - Event data
     * @returns {Promise<TimelineEvent>}
     */
    async create(eventData) {
        if (!this.sessionId) {
            throw new Error('Store not initialized');
        }

        const newEvent = {
            session_id: this.sessionId,
            ...eventData,
            created_at: new Date().toISOString()
        };

        logger.info('Creating timeline event:', newEvent.type ?? newEvent.event_type);

        try {
            const data = await database.createTimelineEvent(newEvent);
            const normalized = normalizeEvent(data);

            // Add to beginning of array (newest first)
            this.events.unshift(normalized);
            this.notify('created', normalized);
            logger.info('Timeline event created:', normalized.id);

            return normalized;
        } catch (err) {
            logger.error('Failed to create timeline event:', err);
            throw err;
        }
    }

    /**
     * Create a capture event
     * @param {string} type - Capture type (NOTE, MOMENT, QUOTE)
     * @param {string} content - Capture content
     * @param {string} team - Team identifier
     * @param {Object} options - Additional options
     * @returns {Promise<TimelineEvent>}
     */
    async createCapture(type, content, team, options = {}) {
        const sessionData = sessionStore.getSessionData();
        const gameState = sessionData?.gameState;

        return this.create({
            type: type,
            content,
            team,
            metadata: {
                actor: options.actor || sessionData?.displayName || 'Unknown',
                ...options.metadata
            },
            move: options.move ?? gameState?.move ?? 1,
            phase: options.phase ?? gameState?.phase ?? 1
        });
    }

    /**
     * Create a game event
     * @param {string} type - Event type
     * @param {string} content - Event description
     * @param {Object} options - Additional options
     * @returns {Promise<TimelineEvent>}
     */
    async createGameEvent(type, content, options = {}) {
        const sessionData = sessionStore.getSessionData();
        const gameState = sessionData?.gameState;

        return this.create({
            type: type,
            content,
            team: 'system',
            move: options.move ?? gameState?.move ?? 1,
            phase: options.phase ?? gameState?.phase ?? 1,
            metadata: options.metadata || null
        });
    }

    /**
     * Create a communication event
     * @param {string} type - Communication type (INJECT, ANNOUNCEMENT, GUIDANCE)
     * @param {string} content - Communication content
     * @param {string} toTeam - Target team
     * @param {Object} options - Additional options
     * @returns {Promise<TimelineEvent>}
     */
    async createCommunication(type, content, toTeam, options = {}) {
        const sessionData = sessionStore.getSessionData();
        const gameState = sessionData?.gameState;

        return this.create({
            type: type,
            content,
            team: 'white_cell',
            move: options.move ?? gameState?.move ?? 1,
            phase: options.phase ?? gameState?.phase ?? 1,
            metadata: {
                actor: options.actor || 'White Cell',
                to_team: toTeam,
                ...options.metadata
            }
        });
    }

    /**
     * Delete an event
     * @param {string} id - Event ID
     * @returns {Promise<void>}
     */
    async delete(id) {
        logger.info('Deleting timeline event:', id);

        try {
            await database.deleteTimelineEvent(id);

            this.events = this.events.filter(e => e.id !== id);
            this.notify('deleted', { id });
            logger.info('Timeline event deleted:', id);
        } catch (err) {
            logger.error('Failed to delete timeline event:', err);
            throw err;
        }
    }

    /**
     * Update from server (real-time sync)
     * @param {string} eventType - Event type (INSERT, UPDATE, DELETE)
     * @param {TimelineEvent} event - Event data
     */
    updateFromServer(eventType, event) {
        const normalized = normalizeEvent(event);
        switch (eventType) {
            case 'INSERT':
                if (!this.events.find(e => e.id === normalized.id)) {
                    this.events.unshift(normalized);
                    // Re-sort to maintain order
                    this.events.sort((a, b) =>
                        new Date(b.created_at) - new Date(a.created_at)
                    );
                    this.notify('created', normalized);
                }
                break;

            case 'UPDATE':
                const updateIndex = this.events.findIndex(e => e.id === normalized.id);
                if (updateIndex !== -1) {
                    this.events[updateIndex] = normalized;
                    this.notify('updated', normalized);
                }
                break;

            case 'DELETE':
                this.events = this.events.filter(e => e.id !== normalized.id);
                this.notify('deleted', normalized);
                break;
        }

        logger.debug('Timeline updated from server:', eventType);
    }

    /**
     * Get timeline statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const stats = {
            total: this.events.length,
            byType: {},
            byMove: {},
            byTeam: {}
        };

        this.events.forEach(event => {
            // By type
            const eventType = getEventType(event) || 'UNKNOWN';
            stats.byType[eventType] = (stats.byType[eventType] || 0) + 1;

            // By move
            stats.byMove[event.move] = (stats.byMove[event.move] || 0) + 1;

            // By team
            if (event.team) {
                stats.byTeam[event.team] = (stats.byTeam[event.team] || 0) + 1;
            }
        });

        return stats;
    }

    /**
     * Group events by move
     * @returns {Object} Events grouped by move
     */
    groupByMove() {
        const grouped = {};

        this.events.forEach(event => {
            const move = event.move || 1;
            if (!grouped[move]) {
                grouped[move] = [];
            }
            grouped[move].push(event);
        });

        return grouped;
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
        this.events = [];
        this.filters = {
            move: null,
            eventType: null,
            team: null
        };
        this.initialized = false;
        this.sessionId = null;
        this.notify('reset', []);
        logger.info('Timeline store reset');
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
export const timelineStore = new TimelineStore();

export default timelineStore;
