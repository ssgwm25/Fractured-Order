/**
 * JSDoc Type Definitions
 * Type definitions for the ESG Simulation Platform
 */

/**
 * @typedef {Object} Session
 * @property {string} id - UUID of the session
 * @property {string} name - Display name of the session
 * @property {string} status - Session status (active, paused, completed, archived)
 * @property {Object} metadata - Additional session metadata
 * @property {string} created_at - ISO timestamp of creation
 * @property {string} updated_at - ISO timestamp of last update
 */

/**
 * @typedef {Object} GameState
 * @property {string} id - UUID of the game state record
 * @property {string} session_id - Associated session UUID
 * @property {number} move - Current move (1-3)
 * @property {number} phase - Current phase (1-5)
 * @property {number} timer_seconds - Remaining timer seconds
 * @property {boolean} timer_running - Whether timer is currently running
 * @property {string|null} timer_last_update - ISO timestamp of last timer update
 * @property {string} updated_at - ISO timestamp of last update
 */

/**
 * @typedef {Object} Participant
 * @property {string} id - UUID of the participant
 * @property {string} client_id - Unique client identifier
 * @property {string} name - Display name
 * @property {string} role - User role
 * @property {string} created_at - ISO timestamp of creation
 */

/**
 * @typedef {Object} SessionParticipant
 * @property {string} id - UUID of the record
 * @property {string} session_id - Associated session UUID
 * @property {string} participant_id - Associated participant UUID
 * @property {string} role - Role in this session
 * @property {boolean} is_active - Whether currently active
 * @property {string} heartbeat_at - ISO timestamp of last heartbeat
 * @property {string} joined_at - ISO timestamp when joined
 * @property {string|null} left_at - ISO timestamp when left (if applicable)
 */

/**
 * @typedef {Object} Action
 * @property {string} id - UUID of the action
 * @property {string} session_id - Associated session UUID
 * @property {string} client_id - Creator's client ID
 * @property {number} move - Move number when created
 * @property {number} phase - Phase number when created
 * @property {string} mechanism - Economic mechanism type
 * @property {string} sector - Target sector
 * @property {string[]} targets - Target countries/entities
 * @property {string} goal - Action goal description
 * @property {string} expected_outcomes - Expected outcomes description
 * @property {string} ally_contingencies - Ally contingency plans
 * @property {string} status - Action status (draft, submitted, adjudicated, abandoned)
 * @property {Object|null} adjudication - Adjudication details
 * @property {string|null} submitted_at - ISO timestamp when submitted
 * @property {string|null} adjudicated_at - ISO timestamp when adjudicated
 * @property {boolean} is_deleted - Soft delete flag
 * @property {string} created_at - ISO timestamp of creation
 * @property {string} updated_at - ISO timestamp of last update
 */

/**
 * @typedef {Object} Adjudication
 * @property {string} outcome - Outcome type (SUCCESS, PARTIAL_SUCCESS, FAIL, BACKFIRE)
 * @property {string} reasoning - Adjudicator's reasoning
 * @property {string} consequences - Described consequences
 * @property {string} adjudicator_id - Client ID of adjudicator
 * @property {string} adjudicated_at - ISO timestamp of adjudication
 */

/**
 * @typedef {Object} Request
 * @property {string} id - UUID of the request
 * @property {string} session_id - Associated session UUID
 * @property {string} client_id - Creator's client ID
 * @property {number} move - Move number when created
 * @property {number} phase - Phase number when created
 * @property {string} priority - Priority level (NORMAL, HIGH, URGENT)
 * @property {string[]} categories - RFI categories
 * @property {string} query - The actual question/request
 * @property {string} context - Additional context
 * @property {string} status - Request status (pending, answered, withdrawn)
 * @property {string|null} answered_at - ISO timestamp when answered
 * @property {number|null} response_time_seconds - Time to response in seconds
 * @property {string} created_at - ISO timestamp of creation
 */

/**
 * @typedef {Object} Communication
 * @property {string} id - UUID of the communication
 * @property {string} session_id - Associated session UUID
 * @property {string|null} linked_request_id - Linked RFI UUID (if response)
 * @property {string} type - Communication type
 * @property {string} from_role - Sender's role
 * @property {string} to_role - Recipient's role (or 'all')
 * @property {string} content - Message content
 * @property {Object|null} metadata - Additional metadata
 * @property {string} created_at - ISO timestamp of creation
 */

/**
 * @typedef {Object} TimelineEvent
 * @property {string} id - UUID of the event
 * @property {string} session_id - Associated session UUID
 * @property {string} team - Team identifier
 * @property {string} type - Event type
 * @property {string} content - Event content/description
 * @property {Object|null} metadata - Additional metadata
 * @property {number} move - Move number when created
 * @property {number} phase - Phase number when created
 * @property {string} client_id - Creator's client ID
 * @property {string} created_at - ISO timestamp of creation
 */

/**
 * @typedef {Object} NotetakerData
 * @property {string} id - UUID of the record
 * @property {string} session_id - Associated session UUID
 * @property {number} move - Move number
 * @property {Object} dynamics_analysis - Team dynamics data
 * @property {Object} external_factors - External factors data
 * @property {string} client_id - Notetaker's client ID
 * @property {string} created_at - ISO timestamp of creation
 * @property {string} updated_at - ISO timestamp of last update
 */

/**
 * @typedef {Object} DynamicsAnalysis
 * @property {Object} leadership - Leadership observations
 * @property {Object} friction - Friction metrics
 * @property {Object} consensus - Consensus tracking
 * @property {string[]} key_quotes - Notable quotes
 * @property {string} summary - Summary of dynamics
 */

/**
 * @typedef {Object} SessionValidation
 * @property {boolean} valid - Whether session is valid
 * @property {string|null} sessionId - Current session ID
 * @property {string|null} clientId - Current client ID
 * @property {string|null} role - Current role
 * @property {string[]} issues - List of validation issues
 */

/**
 * @typedef {Object} RoleConfig
 * @property {string} password - Role password
 * @property {string} displayName - Display name for the role
 * @property {string[]} permissions - List of permissions
 * @property {number} maxPerSession - Maximum users per session
 */

/**
 * @typedef {Object} ExportData
 * @property {Object} metadata - Export metadata
 * @property {Session} session - Session data
 * @property {GameState} gameState - Game state data
 * @property {Action[]} actions - All actions
 * @property {Request[]} requests - All RFIs
 * @property {Communication[]} communications - All communications
 * @property {TimelineEvent[]} timeline - All timeline events
 * @property {NotetakerData[]} notetakerData - All notetaker data
 * @property {SessionParticipant[]} participants - All participants
 */

/**
 * @typedef {Object} ToastOptions
 * @property {string} message - Toast message
 * @property {'info'|'success'|'error'|'warning'} type - Toast type
 * @property {number} duration - Duration in milliseconds
 */

/**
 * @typedef {Object} ModalButton
 * @property {string} label - Button label
 * @property {Function} onClick - Click handler
 * @property {boolean} primary - Whether this is the primary action
 */

/**
 * @typedef {Object} ModalOptions
 * @property {string} title - Modal title
 * @property {string} content - Modal content (HTML string)
 * @property {ModalButton[]} buttons - Modal buttons
 */

export {};
