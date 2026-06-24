import { CONFIG } from '../../core/config.js';
import {
    formatBlueActionSelection,
    getActionSequenceNumber,
    getBlueActionViewModel,
    parseBlueActionDetails
} from '../actions/blueActionDetails.js';
import {
    PROPOSAL_ACTION_MECHANISM,
    getProposalViewModel,
    parseProposalDetails
} from '../actions/proposalDetails.js';
import {
    MOVE_RESPONSE_ACTION_MECHANISM,
    getMoveResponseViewModel,
    parseMoveResponseDetails
} from '../actions/moveResponseDetails.js';
import {
    arrayToCsv,
    exportSessionActionsCsv,
    exportSessionParticipantsCsv,
    exportSessionRequestsCsv,
    exportSessionTimelineCsv
} from './exportCsv.js';
import { SSG_LOGO_DATA_URI } from './reportAssets.js';

const SIMULATION_NAME = 'Fractured Order';

export const RESEARCH_EXPORT_SCHEMA_VERSION = '1.3.0';
export const RESEARCH_EXPORT_FORMAT_REVISION = 4;

const HASHED_EVENT_FIELDS = [
    'event_id',
    'event_uuid',
    'session_id',
    'event_ts_utc',
    'server_received_utc',
    'client_ts_utc',
    'actor_pseudonym',
    'actor_role',
    'actor_team',
    'actor_seat_index',
    'event_type',
    'entity_type',
    'entity_id',
    'move_number',
    'action_sequence',
    'correlation_id',
    'causal_event_id',
    'before_state',
    'after_state',
    'payload',
    'phase',
    'elapsed_session_s',
    'elapsed_actor_prev_s',
    'prev_event_hash'
];

const ROLE_TO_TEAM = Object.freeze({
    game_master: 'gamemaster',
    whitecell_lead: 'whitecell',
    whitecell_support: 'whitecell'
});

const RESEARCH_EXPORT_COLUMNS = Object.freeze({
    event_log: [
        'event_id',
        'event_uuid',
        'session_id',
        'event_ts_utc',
        'server_received_utc',
        'client_ts_utc',
        'actor_pseudonym',
        'actor_role',
        'actor_team',
        'actor_seat_index',
        'event_type',
        'entity_type',
        'entity_id',
        'move_number',
        'action_sequence',
        'correlation_id',
        'causal_event_id',
        'before_state',
        'after_state',
        'payload',
        'phase',
        'elapsed_session_s',
        'elapsed_actor_prev_s',
        'prev_event_hash',
        'event_hash'
    ],
    participants: [
        'participant_pseudonym',
        'session_id',
        'auth_uid_hash',
        'team',
        'role',
        'seat_index',
        'first_seen_utc',
        'last_seen_utc',
        'active_duration_s',
        'rejoin_count'
    ],
    notes: [
        'note_id',
        'session_id',
        'author_pseudonym',
        'author_role',
        'author_team',
        'author_seat_index',
        'scope',
        'visibility',
        'move_number',
        'linked_entity_type',
        'linked_entity_id',
        'content_text',
        'content_length_chars',
        'created_utc',
        'last_edited_utc',
        'edit_count',
        'current_version'
    ],
    note_revisions: [
        'note_id',
        'version',
        'author_pseudonym',
        'content_text',
        'content_length_chars',
        'edited_utc',
        'supersedes_version'
    ],
    drafts_revisions: [
        'draft_id',
        'session_id',
        'author_pseudonym',
        'author_role',
        'author_team',
        'author_seat_index',
        'artifact_type',
        'artifact_id',
        'revision_number',
        'revision_cycle_id',
        'status',
        'move_number',
        'action_sequence',
        'wizard_page_reached',
        'content_snapshot',
        'content_diff_from_prev',
        'created_utc',
        'submitted_utc',
        'time_to_submit_s'
    ],
    state_transitions: [
        'transition_id',
        'session_id',
        'entity_type',
        'entity_id',
        'from_state',
        'to_state',
        'transition_utc',
        'actor_pseudonym',
        'actor_role',
        'actor_team',
        'recipient_team',
        'move_number',
        'dwell_in_from_s',
        'triggering_event_id'
    ],
    action_content: [
        'action_id',
        'session_id',
        'author_pseudonym',
        'author_role',
        'author_team',
        'move_number',
        'action_sequence',
        'title',
        'action_type',
        'intent_text',
        'targets',
        'instruments',
        'resources_committed',
        'full_content',
        'submitted_utc',
        'final_status'
    ],
    proposal_content: [
        'proposal_id',
        'session_id',
        'author_pseudonym',
        'author_role',
        'author_team',
        'move_number',
        'title',
        'intended_recipient_team',
        'proposal_text',
        'requested_action',
        'rationale',
        'full_content',
        'submitted_utc',
        'review_decision',
        'review_reason',
        'reviewer_pseudonym',
        'reviewed_utc',
        'forwarded_to_team',
        'final_recipient_state'
    ],
    adjudication_content: [
        'adjudication_id',
        'session_id',
        'target_entity_type',
        'target_entity_id',
        'adjudicator_pseudonym',
        'adjudicator_role',
        'move_number',
        'ruling',
        'reasoning',
        'effects',
        'adjudicated_utc'
    ],
    move_response_content: [
        'move_response_id',
        'session_id',
        'author_pseudonym',
        'author_role',
        'author_team',
        'move_number',
        'responding_to_entity_type',
        'responding_to_entity_id',
        'posture',
        'response_text',
        'rationale',
        'full_content',
        'submitted_utc',
        'review_state'
    ],
    rfi_content: [
        'rfi_id',
        'session_id',
        'requester_pseudonym',
        'requester_role',
        'requester_team',
        'move_number',
        'question_text',
        'raised_utc',
        'answer_text',
        'answered_by_pseudonym',
        'answered_utc',
        'status'
    ],
    interaction_edges: [
        'edge_id',
        'session_id',
        'source_pseudonym',
        'source_role',
        'source_team',
        'target_pseudonym',
        'target_team',
        'channel',
        'direction',
        'communication_type',
        'entity_id',
        'move_number',
        'occurred_utc',
        'latency_s'
    ],
    data_quality_events: [
        'dq_event_id',
        'session_id',
        'participant_pseudonym',
        'role',
        'team',
        'seat_index',
        'event_type',
        'occurred_utc',
        'gap_seconds',
        'detail'
    ],
    derived_participant_metrics: [
        'session_id',
        'participant_pseudonym',
        'role',
        'team',
        'seat_index',
        'events_count',
        'notes_count',
        'note_edits_count',
        'drafts_count',
        'submissions_count',
        'mean_time_to_submit_s',
        'mean_response_latency_s',
        'active_duration_s',
        'disconnect_count',
        'first_event_offset_s',
        'last_event_offset_s'
    ],
    derived_session_metrics: [
        'session_id',
        'capture_mode',
        'session_duration_s',
        'moves_count',
        'participants_active',
        'total_events',
        'actions_submitted',
        'actions_adjudicated',
        'proposals_submitted',
        'proposals_forwarded',
        'rfis_raised',
        'communications_sent',
        'mean_proposal_response_latency_s'
    ],
    decision_lineage: [
        'lineage_id',
        'session_id',
        'root_entity_type',
        'root_entity_id',
        'move_number',
        'source_team',
        'current_state',
        'created_utc',
        'submitted_utc',
        'reviewed_utc',
        'related_rfi_ids',
        'related_communication_ids',
        'related_response_ids',
        'related_event_ids',
        'evidence_summary'
    ],
    cross_session_index: [
        'session_id',
        'session_name',
        'capture_mode',
        'generated_at_utc',
        'session_duration_s',
        'moves_count',
        'participants_active',
        'total_events',
        'actions_submitted',
        'actions_adjudicated',
        'proposals_submitted',
        'proposals_forwarded',
        'rfis_raised',
        'communications_sent',
        'mean_proposal_response_latency_s',
        'data_quality_readiness',
        'event_log_checksum',
        'report_ref'
    ],
    outcome_taxonomy: [
        'taxonomy_id',
        'session_id',
        'entity_type',
        'entity_id',
        'move_number',
        'source_team',
        'dimension',
        'signal',
        'keyword_hits',
        'adjudication_ruling',
        'evidence_source',
        'evidence_excerpt'
    ],
    training_rubric: [
        'rubric_id',
        'session_id',
        'participant_pseudonym',
        'role',
        'team',
        'dimension',
        'evidence_value',
        'threshold',
        'status',
        'evidence_refs'
    ],
    network_metrics: [
        'metric_id',
        'session_id',
        'source_team',
        'target_team',
        'metric_name',
        'metric_value',
        'unit',
        'evidence_edge_ids'
    ],
    turning_points: [
        'turning_point_id',
        'session_id',
        'occurred_utc',
        'move_number',
        'turning_point_type',
        'entity_type',
        'entity_id',
        'team',
        'evidence_summary',
        'evidence_refs'
    ]
});

function inferTeamFromRole(role = '', explicitTeam = null) {
    if (explicitTeam) {
        return String(explicitTeam || '').trim().toLowerCase() || null;
    }

    const normalizedRole = String(role || '').trim().toLowerCase();
    if (!normalizedRole) {
        return null;
    }

    if (ROLE_TO_TEAM[normalizedRole]) {
        return ROLE_TO_TEAM[normalizedRole];
    }

    const prefixedTeam = normalizedRole.match(/^(blue|red|green)_/i)?.[1];
    return prefixedTeam || null;
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}

function asUtcIso(value) {
    if (!value) {
        return null;
    }

    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime())
        ? null
        : timestamp.toISOString();
}

function escapeHtml(value = '') {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeCaptureMode(mode = 'standard') {
    return String(mode || '').trim().toLowerCase() === 'research'
        ? 'research'
        : 'standard';
}

function buildIsoTimestampFragment(value = new Date().toISOString()) {
    return String(value)
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z')
        .replace(/\.\d+Z$/, 'Z');
}

function secondsBetween(start, end) {
    const startMs = start ? new Date(start).getTime() : Number.NaN;
    const endMs = end ? new Date(end).getTime() : Number.NaN;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return null;
    }

    return Math.max(0, Number(((endMs - startMs) / 1000).toFixed(3)));
}

function summarizeStructuredNote(data = {}) {
    const labelMap = {
        emergingLeaders: 'Emerging leaders',
        decisionStyle: 'Decision style',
        frictionLevel: 'Friction level',
        frictionSources: 'Friction sources',
        consensusLevel: 'Consensus level',
        dynamicsSummary: 'Dynamics summary',
        allianceNotes: 'Alliance notes',
        externalPressures: 'External pressures'
    };

    return Object.entries(safeObject(data))
        .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
        .map(([key, value]) => `${labelMap[key] || key}: ${String(value).trim()}`)
        .join('\n');
}

function encodeText(content = '') {
    return new TextEncoder().encode(String(content));
}

async function sha256Hex(content = '') {
    const subtleCrypto = globalThis.crypto?.subtle;
    if (!subtleCrypto) {
        throw new Error('Web Crypto is required to generate the research export checksums.');
    }

    const digest = await subtleCrypto.digest('SHA-256', encodeText(content));
    return [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
}

async function enrichEventLogWithHashes(events = []) {
    const enrichedEvents = [];
    let previousHash = '';

    for (let index = 0; index < events.length; index += 1) {
        const currentEvent = {
            ...events[index],
            event_id: index + 1,
            prev_event_hash: previousHash || null
        };
        const hashPayload = HASHED_EVENT_FIELDS.map((field) => {
            const value = currentEvent[field];
            return `${field}:${value === undefined ? '' : JSON.stringify(value)}`;
        }).join('|');
        const eventHash = await sha256Hex(hashPayload);

        currentEvent.event_hash = eventHash;
        enrichedEvents.push(currentEvent);
        previousHash = eventHash;
    }

    return enrichedEvents;
}

function nextSyntheticId(prefix, counterRef) {
    counterRef.count += 1;
    return `${prefix}-${String(counterRef.count).padStart(4, '0')}`;
}

function buildSeatIndexes(participants = []) {
    const counters = new Map();

    return participants.map((participant) => {
        const role = String(participant?.role || '').trim().toLowerCase();
        const roleKey = role || `unknown:${participant?.id || participant?.client_id || counters.size}`;
        const nextSeatIndex = (counters.get(roleKey) || 0) + 1;
        counters.set(roleKey, nextSeatIndex);

        return {
            participant,
            seatIndex: participant?.seat_index ?? nextSeatIndex
        };
    });
}

function buildParticipantRegistry(bundle = {}) {
    const researchParticipants = safeArray(bundle.researchParticipants);
    if (researchParticipants.length) {
        const rows = researchParticipants.map((participant) => ({
            ...participant,
            session_id: participant.session_id || bundle.session?.id || null,
            first_seen_utc: asUtcIso(participant.first_seen_utc),
            last_seen_utc: asUtcIso(participant.last_seen_utc)
        }));
        const registry = new Map();

        rows.forEach((participant) => {
            const key = `${participant.role || ''}:${participant.seat_index ?? ''}`;
            registry.set(key, participant.participant_pseudonym);
        });

        return {
            rows,
            registry,
            clientIdToPseudonym: new Map(),
            participantIdToPseudonym: new Map(),
            participantKeyToPseudonym: new Map()
        };
    }

    const seatIndexes = buildSeatIndexes(safeArray(bundle.participants));
    const rows = seatIndexes.map(({ participant, seatIndex }, index) => {
        const role = participant?.role || null;
        const team = inferTeamFromRole(role, participant?.team);
        const joinedAt = asUtcIso(participant?.joined_at || participant?.created_at || bundle.session?.created_at);
        const lastSeenAt = asUtcIso(
            participant?.heartbeat_at
            || participant?.last_seen
            || participant?.disconnected_at
            || participant?.updated_at
            || joinedAt
        );

        return {
            participant_pseudonym: `participant-${String(index + 1).padStart(3, '0')}`,
            session_id: bundle.session?.id || null,
            auth_uid_hash: participant?.client_id ? `client:${participant.client_id}` : `seat:${participant?.id || index + 1}`,
            team,
            role,
            seat_index: seatIndex,
            first_seen_utc: joinedAt,
            last_seen_utc: lastSeenAt,
            active_duration_s: secondsBetween(joinedAt, participant?.disconnected_at || lastSeenAt),
            rejoin_count: 0
        };
    });

    const registry = new Map();
    const clientIdToPseudonym = new Map();
    const participantIdToPseudonym = new Map();
    const participantKeyToPseudonym = new Map();

    seatIndexes.forEach(({ participant, seatIndex }, index) => {
        const pseudonym = rows[index].participant_pseudonym;
        const role = participant?.role || null;
        registry.set(`${role || ''}:${seatIndex ?? ''}`, pseudonym);
        if (participant?.client_id) {
            clientIdToPseudonym.set(participant.client_id, pseudonym);
        }
        if (participant?.id) {
            participantIdToPseudonym.set(participant.id, pseudonym);
            participantKeyToPseudonym.set(participant.id, pseudonym);
        }
        if (participant?.participantSessionId) {
            participantKeyToPseudonym.set(participant.participantSessionId, pseudonym);
        }
    });

    return {
        rows,
        registry,
        clientIdToPseudonym,
        participantIdToPseudonym,
        participantKeyToPseudonym
    };
}

function resolvePseudonym(participantRegistry, {
    clientId = null,
    participantId = null,
    participantKey = null,
    role = null,
    seatIndex = null
} = {}) {
    if (clientId && participantRegistry.clientIdToPseudonym.has(clientId)) {
        return participantRegistry.clientIdToPseudonym.get(clientId);
    }
    if (participantId && participantRegistry.participantIdToPseudonym.has(participantId)) {
        return participantRegistry.participantIdToPseudonym.get(participantId);
    }
    if (participantKey && participantRegistry.participantKeyToPseudonym.has(participantKey)) {
        return participantRegistry.participantKeyToPseudonym.get(participantKey);
    }
    if ((role || seatIndex !== null) && participantRegistry.registry.has(`${role || ''}:${seatIndex ?? ''}`)) {
        return participantRegistry.registry.get(`${role || ''}:${seatIndex ?? ''}`);
    }
    return null;
}

function buildSyntheticEventLog(bundle = {}, participantRegistry) {
    const events = [];
    const counterRef = { count: 0 };
    const sessionId = bundle.session?.id || null;

    safeArray(bundle.participants).forEach((participant) => {
        const actorRole = participant?.role || null;
        const actorTeam = inferTeamFromRole(actorRole, participant?.team);
        const seatIndex = participant?.seat_index ?? null;
        const actorPseudonym = resolvePseudonym(participantRegistry, {
            clientId: participant?.client_id,
            participantId: participant?.id,
            role: actorRole,
            seatIndex
        });

        if (participant?.joined_at) {
            events.push({
                event_uuid: nextSyntheticId('event', counterRef),
                session_id: sessionId,
                event_ts_utc: asUtcIso(participant.joined_at),
                server_received_utc: asUtcIso(participant.joined_at),
                client_ts_utc: asUtcIso(participant.joined_at),
                actor_pseudonym: actorPseudonym,
                actor_role: actorRole,
                actor_team: actorTeam,
                actor_seat_index: seatIndex,
                event_type: 'SEAT_CLAIMED',
                entity_type: 'seat',
                entity_id: participant?.id || null,
                move_number: null,
                action_sequence: null,
                correlation_id: null,
                causal_event_id: null,
                before_state: null,
                after_state: {
                    is_active: true
                },
                payload: {
                    display_name: participant?.display_name || null
                },
                phase: null,
                elapsed_session_s: null,
                elapsed_actor_prev_s: null
            });
        }

        if (participant?.disconnected_at) {
            events.push({
                event_uuid: nextSyntheticId('event', counterRef),
                session_id: sessionId,
                event_ts_utc: asUtcIso(participant.disconnected_at),
                server_received_utc: asUtcIso(participant.disconnected_at),
                client_ts_utc: asUtcIso(participant.disconnected_at),
                actor_pseudonym: actorPseudonym,
                actor_role: actorRole,
                actor_team: actorTeam,
                actor_seat_index: seatIndex,
                event_type: 'PARTICIPANT_DISCONNECTED',
                entity_type: 'seat',
                entity_id: participant?.id || null,
                move_number: null,
                action_sequence: null,
                correlation_id: null,
                causal_event_id: null,
                before_state: {
                    is_active: true
                },
                after_state: {
                    is_active: false
                },
                payload: {},
                phase: null,
                elapsed_session_s: null,
                elapsed_actor_prev_s: null
            });
        }
    });

    safeArray(bundle.actions).forEach((action) => {
        const isProposal = isProposalAction(action);
        const isMoveResponse = isMoveResponseAction(action);
        const actionSequence = !isProposal && !isMoveResponse
            ? getActionSequenceNumber(bundle.actions, action)
            : null;
        const actorPseudonym = resolvePseudonym(participantRegistry, {
            clientId: action?.client_id,
            role: action?.team ? `${action.team}_facilitator` : null
        });
        const actorRole = action?.team ? `${action.team}_facilitator` : null;
        const actorTeam = inferTeamFromRole(actorRole, action?.team);
        const createdTimestamp = asUtcIso(action?.created_at);
        const submittedTimestamp = asUtcIso(action?.submitted_at || action?.created_at);

        if (isProposal) {
            events.push({
                event_uuid: nextSyntheticId('event', counterRef),
                session_id: sessionId,
                event_ts_utc: createdTimestamp,
                server_received_utc: createdTimestamp,
                client_ts_utc: createdTimestamp,
                actor_pseudonym: actorPseudonym,
                actor_role: actorRole,
                actor_team: actorTeam,
                actor_seat_index: null,
                event_type: 'PROPOSAL_CREATED',
                entity_type: 'proposal',
                entity_id: action?.id || null,
                move_number: action?.move ?? null,
                action_sequence: null,
                correlation_id: action?.id || null,
                causal_event_id: null,
                before_state: null,
                after_state: {
                    status: action?.status || 'draft'
                },
                payload: {
                    title: action?.goal || null
                },
                phase: action?.phase ?? null,
                elapsed_session_s: null,
                elapsed_actor_prev_s: null
            });
        } else if (isMoveResponse) {
            events.push({
                event_uuid: nextSyntheticId('event', counterRef),
                session_id: sessionId,
                event_ts_utc: submittedTimestamp,
                server_received_utc: submittedTimestamp,
                client_ts_utc: submittedTimestamp,
                actor_pseudonym: actorPseudonym,
                actor_role: actorRole,
                actor_team: actorTeam,
                actor_seat_index: null,
                event_type: 'MOVE_RESPONSE_SUBMITTED',
                entity_type: 'move_response',
                entity_id: action?.id || null,
                move_number: action?.move ?? null,
                action_sequence: null,
                correlation_id: action?.id || null,
                causal_event_id: null,
                before_state: {
                    status: 'draft'
                },
                after_state: {
                    status: action?.status || 'submitted'
                },
                payload: {
                    title: action?.goal || null
                },
                phase: action?.phase ?? null,
                elapsed_session_s: null,
                elapsed_actor_prev_s: null
            });
        } else if (action?.status === 'draft') {
            events.push({
                event_uuid: nextSyntheticId('event', counterRef),
                session_id: sessionId,
                event_ts_utc: createdTimestamp,
                server_received_utc: createdTimestamp,
                client_ts_utc: createdTimestamp,
                actor_pseudonym: actorPseudonym,
                actor_role: actorRole,
                actor_team: actorTeam,
                actor_seat_index: null,
                event_type: 'ACTION_DRAFT_SAVED',
                entity_type: 'action',
                entity_id: action?.id || null,
                move_number: action?.move ?? null,
                action_sequence: actionSequence,
                correlation_id: action?.id || null,
                causal_event_id: null,
                before_state: null,
                after_state: {
                    status: 'draft'
                },
                payload: {
                    title: action?.goal || null
                },
                phase: action?.phase ?? null,
                elapsed_session_s: null,
                elapsed_actor_prev_s: null
            });
        }

        if (action?.submitted_at) {
            events.push({
                event_uuid: nextSyntheticId('event', counterRef),
                session_id: sessionId,
                event_ts_utc: submittedTimestamp,
                server_received_utc: submittedTimestamp,
                client_ts_utc: submittedTimestamp,
                actor_pseudonym: actorPseudonym,
                actor_role: actorRole,
                actor_team: actorTeam,
                actor_seat_index: null,
                event_type: isProposal ? 'PROPOSAL_SUBMITTED' : 'ACTION_SUBMITTED',
                entity_type: isProposal ? 'proposal' : 'action',
                entity_id: action?.id || null,
                move_number: action?.move ?? null,
                action_sequence: actionSequence,
                correlation_id: action?.id || null,
                causal_event_id: null,
                before_state: {
                    status: 'draft'
                },
                after_state: {
                    status: action?.status || 'submitted'
                },
                payload: {
                    title: action?.goal || null
                },
                phase: action?.phase ?? null,
                elapsed_session_s: null,
                elapsed_actor_prev_s: null
            });
        }

        if (action?.adjudicated_at) {
            events.push({
                event_uuid: nextSyntheticId('event', counterRef),
                session_id: sessionId,
                event_ts_utc: asUtcIso(action.adjudicated_at),
                server_received_utc: asUtcIso(action.adjudicated_at),
                client_ts_utc: asUtcIso(action.adjudicated_at),
                actor_pseudonym: 'whitecell-operator',
                actor_role: 'whitecell_lead',
                actor_team: 'whitecell',
                actor_seat_index: 1,
                event_type: isProposal
                    ? (
                        action?.outcome === 'forwarded'
                            ? 'PROPOSAL_FORWARDED'
                            : action?.outcome === 'changes_requested'
                                ? 'PROPOSAL_CHANGES_REQUESTED'
                                : 'PROPOSAL_REJECTED'
                    )
                    : 'ACTION_ADJUDICATED',
                entity_type: isProposal ? 'proposal' : 'action',
                entity_id: action?.id || null,
                move_number: action?.move ?? null,
                action_sequence: actionSequence,
                correlation_id: action?.id || null,
                causal_event_id: null,
                before_state: {
                    status: 'submitted'
                },
                after_state: {
                    status: action?.status || 'adjudicated',
                    outcome: action?.outcome || null
                },
                payload: {
                    outcome: action?.outcome || null,
                    adjudication_notes: action?.adjudication_notes || null
                },
                phase: action?.phase ?? null,
                elapsed_session_s: null,
                elapsed_actor_prev_s: null
            });
        }
    });

    safeArray(bundle.requests).forEach((request) => {
        const actorRole = request?.team ? `${request.team}_facilitator` : null;
        const actorTeam = inferTeamFromRole(actorRole, request?.team);
        const actorPseudonym = resolvePseudonym(participantRegistry, {
            clientId: request?.client_id,
            role: actorRole
        });
        const raisedTimestamp = asUtcIso(request?.created_at);

        events.push({
            event_uuid: nextSyntheticId('event', counterRef),
            session_id: sessionId,
            event_ts_utc: raisedTimestamp,
            server_received_utc: raisedTimestamp,
            client_ts_utc: raisedTimestamp,
            actor_pseudonym: actorPseudonym,
            actor_role: actorRole,
            actor_team: actorTeam,
            actor_seat_index: null,
            event_type: 'RFI_RAISED',
            entity_type: 'rfi',
            entity_id: request?.id || null,
            move_number: request?.move ?? null,
            action_sequence: null,
            correlation_id: request?.id || null,
            causal_event_id: null,
            before_state: null,
            after_state: {
                status: request?.status || 'pending'
            },
            payload: {
                question_text: request?.query || null
            },
            phase: request?.phase ?? null,
            elapsed_session_s: null,
            elapsed_actor_prev_s: null
        });

        if (request?.responded_at || request?.answered_at) {
            const answeredTimestamp = asUtcIso(request.responded_at || request.answered_at);
            events.push({
                event_uuid: nextSyntheticId('event', counterRef),
                session_id: sessionId,
                event_ts_utc: answeredTimestamp,
                server_received_utc: answeredTimestamp,
                client_ts_utc: answeredTimestamp,
                actor_pseudonym: 'whitecell-operator',
                actor_role: 'whitecell_lead',
                actor_team: 'whitecell',
                actor_seat_index: 1,
                event_type: 'RFI_ANSWERED',
                entity_type: 'rfi',
                entity_id: request?.id || null,
                move_number: request?.move ?? null,
                action_sequence: null,
                correlation_id: request?.id || null,
                causal_event_id: null,
                before_state: {
                    status: 'pending'
                },
                after_state: {
                    status: 'answered'
                },
                payload: {
                    answer_text: request?.response || null
                },
                phase: request?.phase ?? null,
                elapsed_session_s: null,
                elapsed_actor_prev_s: null
            });
        }
    });

    safeArray(bundle.communications).forEach((communication) => {
        const metadata = safeObject(communication?.metadata);
        const eventType = communication?.type === 'PROPOSAL_FORWARDED'
            ? 'PROPOSAL_FORWARDED'
            : communication?.type === 'PROPOSAL_RESPONSE'
                ? 'PROPOSAL_RESPONDED'
                : 'COMMUNICATION_SENT';

        events.push({
            event_uuid: nextSyntheticId('event', counterRef),
            session_id: sessionId,
            event_ts_utc: asUtcIso(communication?.created_at),
            server_received_utc: asUtcIso(communication?.created_at),
            client_ts_utc: asUtcIso(communication?.created_at),
            actor_pseudonym: communication?.from_role === 'white_cell'
                ? 'whitecell-operator'
                : null,
            actor_role: communication?.from_role || null,
            actor_team: inferTeamFromRole(communication?.from_role),
            actor_seat_index: null,
            event_type: eventType,
            entity_type: 'communication',
            entity_id: communication?.id || null,
            move_number: communication?.move ?? null,
            action_sequence: null,
            correlation_id: metadata.source_proposal_id || communication?.id || null,
            causal_event_id: null,
            before_state: null,
            after_state: {
                type: communication?.type || null
            },
            payload: {
                to_role: communication?.to_role || null,
                content: communication?.content || null,
                metadata
            },
            phase: communication?.phase ?? null,
            elapsed_session_s: null,
            elapsed_actor_prev_s: null
        });
    });

    safeArray(bundle.notetakerData).forEach((record) => {
        safeArray(record?.observation_timeline).forEach((entry) => {
            events.push({
                event_uuid: nextSyntheticId('event', counterRef),
                session_id: sessionId,
                event_ts_utc: asUtcIso(entry?.timestamp),
                server_received_utc: asUtcIso(entry?.timestamp),
                client_ts_utc: asUtcIso(entry?.timestamp),
                actor_pseudonym: resolvePseudonym(participantRegistry, {
                    participantKey: entry?.participant_key,
                    participantId: entry?.participant_id,
                    clientId: entry?.client_id
                }),
                actor_role: entry?.team ? `${entry.team}_notetaker` : null,
                actor_team: entry?.team || null,
                actor_seat_index: null,
                event_type: 'NOTE_CREATED',
                entity_type: 'note',
                entity_id: entry?.id || null,
                move_number: record?.move ?? null,
                action_sequence: null,
                correlation_id: record?.id || null,
                causal_event_id: null,
                before_state: null,
                after_state: {
                    type: entry?.type || null
                },
                payload: {
                    content: entry?.content || null
                },
                phase: entry?.phase ?? record?.phase ?? null,
                elapsed_session_s: null,
                elapsed_actor_prev_s: null
            });
        });
    });

    return events
        .filter((event) => event.event_ts_utc)
        .sort((left, right) => {
            const leftTime = new Date(left.event_ts_utc).getTime();
            const rightTime = new Date(right.event_ts_utc).getTime();
            if (leftTime !== rightTime) {
                return leftTime - rightTime;
            }
            return String(left.event_uuid || '').localeCompare(String(right.event_uuid || ''));
        });
}

function isProposalAction(action = {}) {
    return action?.mechanism === PROPOSAL_ACTION_MECHANISM || Boolean(parseProposalDetails(action?.ally_contingencies));
}

function isMoveResponseAction(action = {}) {
    return action?.mechanism === MOVE_RESPONSE_ACTION_MECHANISM || Boolean(parseMoveResponseDetails(action?.ally_contingencies));
}

function findForwardedProposalCommunication(communications = [], proposalId) {
    return safeArray(communications)
        .filter((communication) => communication?.type === 'PROPOSAL_FORWARDED')
        .find((communication) => safeObject(communication?.metadata).source_proposal_id === proposalId) || null;
}

function findProposalResponseCommunication(communications = [], proposalId) {
    return safeArray(communications)
        .filter((communication) => communication?.type === 'PROPOSAL_RESPONSE')
        .find((communication) => safeObject(communication?.metadata).source_proposal_id === proposalId) || null;
}

function buildNotesTables(bundle = {}, participantRegistry) {
    const explicitNotes = safeArray(bundle.researchNotes);
    const explicitNoteRevisions = safeArray(bundle.researchNoteRevisions);
    if (explicitNotes.length || explicitNoteRevisions.length) {
        return {
            notes: explicitNotes,
            noteRevisions: explicitNoteRevisions
        };
    }

    const notes = [];
    const noteRevisions = [];
    const counterRef = { count: 0 };

    safeArray(bundle.notetakerData).forEach((record) => {
        const team = record?.team || null;
        const sections = [
            {
                name: 'dynamics_analysis',
                scope: 'seat_scoped',
                visibility: 'team',
                content: safeObject(record?.dynamics_analysis)?.team_entries || {}
            },
            {
                name: 'external_factors',
                scope: 'seat_scoped',
                visibility: 'team',
                content: safeObject(record?.external_factors)?.team_entries || {}
            }
        ];

        sections.forEach((section) => {
            Object.entries(section.content).forEach(([sectionTeamId, teamEntry]) => {
                const participantEntries = safeObject(teamEntry)?.participant_entries || {};
                Object.entries(participantEntries).forEach(([participantKey, participantEntry]) => {
                    const contentText = summarizeStructuredNote(participantEntry?.data);
                    if (!contentText) {
                        return;
                    }

                    const noteId = nextSyntheticId(`note-${section.name}`, counterRef);
                    const role = sectionTeamId ? `${sectionTeamId}_notetaker` : (team ? `${team}_notetaker` : null);
                    const authorPseudonym = resolvePseudonym(participantRegistry, {
                        participantKey,
                        participantId: participantEntry?.participant_id,
                        clientId: participantEntry?.client_id,
                        role
                    });
                    const noteRow = {
                        note_id: noteId,
                        session_id: bundle.session?.id || null,
                        author_pseudonym: authorPseudonym || 'notetaker',
                        author_role: role,
                        author_team: sectionTeamId || team || null,
                        author_seat_index: null,
                        scope: section.scope,
                        visibility: section.visibility,
                        move_number: record?.move ?? null,
                        linked_entity_type: null,
                        linked_entity_id: null,
                        content_text: contentText,
                        content_length_chars: contentText.length,
                        created_utc: asUtcIso(participantEntry?.updated_at || record?.created_at || record?.updated_at),
                        last_edited_utc: asUtcIso(participantEntry?.updated_at || record?.updated_at),
                        edit_count: 0,
                        current_version: 1
                    };

                    notes.push(noteRow);
                    noteRevisions.push({
                        note_id: noteId,
                        version: 1,
                        author_pseudonym: noteRow.author_pseudonym,
                        content_text: contentText,
                        content_length_chars: contentText.length,
                        edited_utc: noteRow.last_edited_utc,
                        supersedes_version: null
                    });
                });
            });
        });

        safeArray(record?.observation_timeline).forEach((entry) => {
            const contentText = String(entry?.content || '').trim();
            if (!contentText) {
                return;
            }

            const noteId = entry?.id || nextSyntheticId('note-observation', counterRef);
            const role = entry?.team ? `${entry.team}_notetaker` : (team ? `${team}_notetaker` : null);
            const authorPseudonym = resolvePseudonym(participantRegistry, {
                participantKey: entry?.participant_key,
                participantId: entry?.participant_id,
                clientId: entry?.client_id,
                role
            });
            const noteRow = {
                note_id: noteId,
                session_id: bundle.session?.id || null,
                author_pseudonym: authorPseudonym || 'notetaker',
                author_role: role,
                author_team: entry?.team || team || null,
                author_seat_index: null,
                scope: 'shared_capture',
                visibility: 'team',
                move_number: record?.move ?? null,
                linked_entity_type: null,
                linked_entity_id: null,
                content_text: contentText,
                content_length_chars: contentText.length,
                created_utc: asUtcIso(entry?.timestamp),
                last_edited_utc: asUtcIso(entry?.timestamp),
                edit_count: 0,
                current_version: 1
            };

            notes.push(noteRow);
            noteRevisions.push({
                note_id: noteId,
                version: 1,
                author_pseudonym: noteRow.author_pseudonym,
                content_text: contentText,
                content_length_chars: contentText.length,
                edited_utc: noteRow.last_edited_utc,
                supersedes_version: null
            });
        });
    });

    return { notes, noteRevisions };
}

function buildDraftRevisions(bundle = {}, participantRegistry) {
    const explicitDrafts = safeArray(bundle.researchDraftRevisions);
    if (explicitDrafts.length) {
        return explicitDrafts;
    }

    return safeArray(bundle.actions)
        .filter((action) => !isMoveResponseAction(action))
        .map((action) => {
            const isProposal = isProposalAction(action);
            const authorRole = action?.team ? `${action.team}_facilitator` : null;
            const authorTeam = inferTeamFromRole(authorRole, action?.team);
            const authorPseudonym = resolvePseudonym(participantRegistry, {
                clientId: action?.client_id,
                role: authorRole
            }) || `${authorTeam || 'team'}-lead`;
            const blueView = parseBlueActionDetails(action?.ally_contingencies)
                ? getBlueActionViewModel(action)
                : null;

            return {
                draft_id: `${action.id}-revision-1`,
                session_id: bundle.session?.id || null,
                author_pseudonym: authorPseudonym,
                author_role: authorRole,
                author_team: authorTeam,
                author_seat_index: null,
                artifact_type: isProposal ? 'proposal' : 'action',
                artifact_id: action?.id || null,
                revision_number: 1,
                revision_cycle_id: action?.id || null,
                status: action?.status === 'draft' ? 'draft_saved' : 'submitted',
                move_number: action?.move ?? null,
                action_sequence: isProposal ? null : getActionSequenceNumber(bundle.actions, action),
                wizard_page_reached: blueView ? 3 : null,
                content_snapshot: {
                    mechanism: action?.mechanism || null,
                    sector: action?.sector || null,
                    exposure_type: action?.exposure_type || null,
                    targets: safeArray(action?.targets),
                    goal: action?.goal || null,
                    expected_outcomes: action?.expected_outcomes || null,
                    ally_contingencies: action?.ally_contingencies || null
                },
                content_diff_from_prev: null,
                created_utc: asUtcIso(action?.created_at),
                submitted_utc: asUtcIso(action?.submitted_at),
                time_to_submit_s: secondsBetween(action?.created_at, action?.submitted_at)
            };
        });
}

function buildActionContent(bundle = {}, participantRegistry) {
    const explicitRows = safeArray(bundle.researchActionContent);
    if (explicitRows.length) {
        return explicitRows;
    }

    return safeArray(bundle.actions)
        .filter((action) => !isProposalAction(action) && !isMoveResponseAction(action))
        .map((action) => {
            const viewModel = getBlueActionViewModel(action);
            const authorRole = action?.team ? `${action.team}_facilitator` : null;
            const authorTeam = inferTeamFromRole(authorRole, action?.team);

            return {
                action_id: action?.id || null,
                session_id: bundle.session?.id || null,
                author_pseudonym: resolvePseudonym(participantRegistry, {
                    clientId: action?.client_id,
                    role: authorRole
                }) || `${authorTeam || 'blue'}-lead`,
                author_role: authorRole,
                author_team: authorTeam,
                move_number: action?.move ?? null,
                action_sequence: getActionSequenceNumber(bundle.actions, action),
                title: viewModel.title,
                action_type: formatBlueActionSelection(viewModel.levers, viewModel.lever || action?.mechanism || null),
                intent_text: viewModel.objective || action?.goal || null,
                targets: safeArray(action?.targets),
                instruments: viewModel.instrumentOfPower ? [viewModel.instrumentOfPower] : [],
                resources_committed: viewModel.coordinated || [],
                full_content: {
                    goal: action?.goal || null,
                    sector: action?.sector || null,
                    exposure_type: action?.exposure_type || null,
                    expected_outcomes: action?.expected_outcomes || null,
                    targets: safeArray(action?.targets),
                    details: viewModel
                },
                submitted_utc: asUtcIso(action?.submitted_at),
                final_status: action?.status || null
            };
        });
}

function buildProposalContent(bundle = {}, participantRegistry) {
    const explicitRows = safeArray(bundle.researchProposalContent);
    if (explicitRows.length) {
        return explicitRows;
    }

    return safeArray(bundle.actions)
        .filter((action) => isProposalAction(action))
        .map((action) => {
            const viewModel = getProposalViewModel(action);
            const forwardedCommunication = findForwardedProposalCommunication(bundle.communications, action?.id);
            const responseCommunication = findProposalResponseCommunication(bundle.communications, action?.id);
            const forwardedMetadata = safeObject(forwardedCommunication?.metadata);
            const finalRecipientState = safeObject(forwardedMetadata?.proposal_recipient_state).status
                || safeObject(responseCommunication?.metadata).proposal_recipient_state?.status
                || null;
            const authorRole = action?.team ? `${action.team}_facilitator` : null;
            const authorTeam = inferTeamFromRole(authorRole, action?.team);

            return {
                proposal_id: action?.id || null,
                session_id: bundle.session?.id || null,
                author_pseudonym: resolvePseudonym(participantRegistry, {
                    clientId: action?.client_id,
                    role: authorRole
                }) || `${authorTeam || 'green'}-lead`,
                author_role: authorRole,
                author_team: authorTeam,
                move_number: action?.move ?? null,
                title: viewModel.title,
                intended_recipient_team: viewModel.recipientTeam || null,
                proposal_text: viewModel.objective || null,
                requested_action: viewModel.expectedOutcomes || null,
                rationale: viewModel.timingAndConditions || null,
                full_content: {
                    goal: action?.goal || null,
                    expected_outcomes: action?.expected_outcomes || null,
                    proposal_details: viewModel
                },
                submitted_utc: asUtcIso(action?.submitted_at),
                review_decision: action?.outcome || null,
                review_reason: action?.adjudication_notes || null,
                reviewer_pseudonym: action?.adjudicated_at ? 'whitecell-operator' : null,
                reviewed_utc: asUtcIso(action?.adjudicated_at),
                forwarded_to_team: forwardedMetadata.recipient_team || viewModel.recipientTeam || null,
                final_recipient_state: finalRecipientState || null
            };
        });
}

function buildAdjudicationContent(bundle = {}) {
    const explicitRows = safeArray(bundle.researchAdjudicationContent);
    if (explicitRows.length) {
        return explicitRows;
    }

    return safeArray(bundle.actions)
        .filter((action) => action?.adjudicated_at)
        .map((action) => ({
            adjudication_id: `${action.id}-adjudication`,
            session_id: bundle.session?.id || null,
            target_entity_type: isMoveResponseAction(action) ? 'move_response' : 'action',
            target_entity_id: action?.id || null,
            adjudicator_pseudonym: 'whitecell-operator',
            adjudicator_role: 'whitecell_lead',
            move_number: action?.move ?? null,
            ruling: action?.outcome || null,
            reasoning: action?.adjudication_notes || null,
            effects: safeObject(action?.adjudication),
            adjudicated_utc: asUtcIso(action?.adjudicated_at)
        }));
}

function buildMoveResponseContent(bundle = {}, participantRegistry) {
    const explicitRows = safeArray(bundle.researchMoveResponseContent);
    if (explicitRows.length) {
        return explicitRows;
    }

    return safeArray(bundle.actions)
        .filter((action) => isMoveResponseAction(action))
        .map((action) => {
            const viewModel = getMoveResponseViewModel(action);
            const authorRole = action?.team ? `${action.team}_facilitator` : null;
            const authorTeam = inferTeamFromRole(authorRole, action?.team);

            return {
                move_response_id: action?.id || null,
                session_id: bundle.session?.id || null,
                author_pseudonym: resolvePseudonym(participantRegistry, {
                    clientId: action?.client_id,
                    role: authorRole
                }) || `${authorTeam || 'red'}-lead`,
                author_role: authorRole,
                author_team: authorTeam,
                move_number: action?.move ?? null,
                responding_to_entity_type: 'move',
                responding_to_entity_id: null,
                posture: viewModel.responseStrategy || null,
                response_text: viewModel.keyActions || viewModel.expectedEffect || null,
                rationale: viewModel.strategicAssessment || null,
                full_content: {
                    goal: action?.goal || null,
                    expected_outcomes: action?.expected_outcomes || null,
                    details: viewModel
                },
                submitted_utc: asUtcIso(action?.submitted_at),
                review_state: action?.status || null
            };
        });
}

function buildRfiContent(bundle = {}, participantRegistry) {
    const explicitRows = safeArray(bundle.researchRfiContent);
    if (explicitRows.length) {
        return explicitRows;
    }

    return safeArray(bundle.requests).map((request) => {
        const requesterRole = request?.team ? `${request.team}_facilitator` : null;
        const requesterTeam = inferTeamFromRole(requesterRole, request?.team);

        return {
            rfi_id: request?.id || null,
            session_id: bundle.session?.id || null,
            requester_pseudonym: resolvePseudonym(participantRegistry, {
                clientId: request?.client_id,
                role: requesterRole
            }) || `${requesterTeam || 'team'}-lead`,
            requester_role: requesterRole,
            requester_team: requesterTeam,
            move_number: request?.move ?? null,
            question_text: request?.query || null,
            raised_utc: asUtcIso(request?.created_at),
            answer_text: request?.response || null,
            answered_by_pseudonym: request?.response ? 'whitecell-operator' : null,
            answered_utc: asUtcIso(request?.responded_at || request?.answered_at),
            status: request?.status || 'pending'
        };
    });
}

function buildStateTransitions(bundle = {}, actionContent, proposalContent, moveResponseContent, rfiContent) {
    const explicitRows = safeArray(bundle.researchStateTransitions);
    if (explicitRows.length) {
        return explicitRows;
    }

    const transitions = [];

    actionContent.forEach((action) => {
        const createdAt = safeArray(bundle.actions).find((candidate) => candidate?.id === action.action_id)?.created_at;
        transitions.push({
            transition_id: `${action.action_id}-draft`,
            session_id: action.session_id,
            entity_type: 'action',
            entity_id: action.action_id,
            from_state: null,
            to_state: 'draft',
            transition_utc: asUtcIso(createdAt),
            actor_pseudonym: action.author_pseudonym,
            actor_role: action.author_role,
            actor_team: action.author_team,
            recipient_team: null,
            move_number: action.move_number,
            dwell_in_from_s: null,
            triggering_event_id: null
        });
        if (action.submitted_utc) {
            transitions.push({
                transition_id: `${action.action_id}-submitted`,
                session_id: action.session_id,
                entity_type: 'action',
                entity_id: action.action_id,
                from_state: 'draft',
                to_state: 'submitted',
                transition_utc: action.submitted_utc,
                actor_pseudonym: action.author_pseudonym,
                actor_role: action.author_role,
                actor_team: action.author_team,
                recipient_team: null,
                move_number: action.move_number,
                dwell_in_from_s: secondsBetween(createdAt, action.submitted_utc),
                triggering_event_id: null
            });
        }
        if (action.final_status === 'adjudicated') {
            const sourceAction = safeArray(bundle.actions).find((candidate) => candidate?.id === action.action_id);
            transitions.push({
                transition_id: `${action.action_id}-adjudicated`,
                session_id: action.session_id,
                entity_type: 'action',
                entity_id: action.action_id,
                from_state: 'submitted',
                to_state: 'adjudicated',
                transition_utc: asUtcIso(sourceAction?.adjudicated_at),
                actor_pseudonym: 'whitecell-operator',
                actor_role: 'whitecell_lead',
                actor_team: 'whitecell',
                recipient_team: null,
                move_number: action.move_number,
                dwell_in_from_s: secondsBetween(action.submitted_utc, sourceAction?.adjudicated_at),
                triggering_event_id: null
            });
        }
    });

    proposalContent.forEach((proposal) => {
        const sourceProposal = safeArray(bundle.actions).find((candidate) => candidate?.id === proposal.proposal_id);
        transitions.push({
            transition_id: `${proposal.proposal_id}-created`,
            session_id: proposal.session_id,
            entity_type: 'proposal',
            entity_id: proposal.proposal_id,
            from_state: null,
            to_state: 'created',
            transition_utc: asUtcIso(sourceProposal?.created_at),
            actor_pseudonym: proposal.author_pseudonym,
            actor_role: proposal.author_role,
            actor_team: proposal.author_team,
            recipient_team: null,
            move_number: proposal.move_number,
            dwell_in_from_s: null,
            triggering_event_id: null
        });
        if (proposal.submitted_utc) {
            transitions.push({
                transition_id: `${proposal.proposal_id}-submitted`,
                session_id: proposal.session_id,
                entity_type: 'proposal',
                entity_id: proposal.proposal_id,
                from_state: 'created',
                to_state: 'submitted',
                transition_utc: proposal.submitted_utc,
                actor_pseudonym: proposal.author_pseudonym,
                actor_role: proposal.author_role,
                actor_team: proposal.author_team,
                recipient_team: proposal.intended_recipient_team,
                move_number: proposal.move_number,
                dwell_in_from_s: secondsBetween(sourceProposal?.created_at, proposal.submitted_utc),
                triggering_event_id: null
            });
        }

        const reviewState = proposal.review_decision === 'forwarded'
            ? 'forwarded'
            : proposal.review_decision === 'changes_requested'
                ? 'changes_requested'
                : proposal.review_decision === 'rejected'
                    ? 'rejected'
                    : null;
        if (reviewState && proposal.reviewed_utc) {
            transitions.push({
                transition_id: `${proposal.proposal_id}-${reviewState}`,
                session_id: proposal.session_id,
                entity_type: 'proposal',
                entity_id: proposal.proposal_id,
                from_state: 'submitted',
                to_state: reviewState,
                transition_utc: proposal.reviewed_utc,
                actor_pseudonym: proposal.reviewer_pseudonym,
                actor_role: 'whitecell_lead',
                actor_team: 'whitecell',
                recipient_team: proposal.forwarded_to_team,
                move_number: proposal.move_number,
                dwell_in_from_s: secondsBetween(proposal.submitted_utc, proposal.reviewed_utc),
                triggering_event_id: null
            });
        }

        if (proposal.final_recipient_state) {
            const forwardedCommunication = findForwardedProposalCommunication(bundle.communications, proposal.proposal_id);
            const recipientTimestamp = safeObject(forwardedCommunication?.metadata).proposal_recipient_state?.actioned_at
                || findProposalResponseCommunication(bundle.communications, proposal.proposal_id)?.created_at
                || null;
            transitions.push({
                transition_id: `${proposal.proposal_id}-${proposal.final_recipient_state}`,
                session_id: proposal.session_id,
                entity_type: 'proposal',
                entity_id: proposal.proposal_id,
                from_state: 'forwarded',
                to_state: proposal.final_recipient_state,
                transition_utc: asUtcIso(recipientTimestamp),
                actor_pseudonym: null,
                actor_role: null,
                actor_team: proposal.forwarded_to_team,
                recipient_team: proposal.forwarded_to_team,
                move_number: proposal.move_number,
                dwell_in_from_s: secondsBetween(proposal.reviewed_utc, recipientTimestamp),
                triggering_event_id: null
            });
        }
    });

    moveResponseContent.forEach((response) => {
        const sourceAction = safeArray(bundle.actions).find((candidate) => candidate?.id === response.move_response_id);
        transitions.push({
            transition_id: `${response.move_response_id}-submitted`,
            session_id: response.session_id,
            entity_type: 'move_response',
            entity_id: response.move_response_id,
            from_state: null,
            to_state: 'submitted',
            transition_utc: response.submitted_utc || asUtcIso(sourceAction?.created_at),
            actor_pseudonym: response.author_pseudonym,
            actor_role: response.author_role,
            actor_team: response.author_team,
            recipient_team: null,
            move_number: response.move_number,
            dwell_in_from_s: null,
            triggering_event_id: null
        });
        if (response.review_state === 'adjudicated' && sourceAction?.adjudicated_at) {
            transitions.push({
                transition_id: `${response.move_response_id}-reviewed`,
                session_id: response.session_id,
                entity_type: 'move_response',
                entity_id: response.move_response_id,
                from_state: 'submitted',
                to_state: 'reviewed',
                transition_utc: asUtcIso(sourceAction.adjudicated_at),
                actor_pseudonym: 'whitecell-operator',
                actor_role: 'whitecell_lead',
                actor_team: 'whitecell',
                recipient_team: null,
                move_number: response.move_number,
                dwell_in_from_s: secondsBetween(response.submitted_utc, sourceAction.adjudicated_at),
                triggering_event_id: null
            });
        }
    });

    rfiContent.forEach((rfi) => {
        transitions.push({
            transition_id: `${rfi.rfi_id}-pending`,
            session_id: rfi.session_id,
            entity_type: 'rfi',
            entity_id: rfi.rfi_id,
            from_state: null,
            to_state: 'pending',
            transition_utc: rfi.raised_utc,
            actor_pseudonym: rfi.requester_pseudonym,
            actor_role: rfi.requester_role,
            actor_team: rfi.requester_team,
            recipient_team: 'whitecell',
            move_number: rfi.move_number,
            dwell_in_from_s: null,
            triggering_event_id: null
        });
        if (rfi.answered_utc) {
            transitions.push({
                transition_id: `${rfi.rfi_id}-answered`,
                session_id: rfi.session_id,
                entity_type: 'rfi',
                entity_id: rfi.rfi_id,
                from_state: 'pending',
                to_state: 'answered',
                transition_utc: rfi.answered_utc,
                actor_pseudonym: rfi.answered_by_pseudonym,
                actor_role: 'whitecell_lead',
                actor_team: 'whitecell',
                recipient_team: rfi.requester_team,
                move_number: rfi.move_number,
                dwell_in_from_s: secondsBetween(rfi.raised_utc, rfi.answered_utc),
                triggering_event_id: null
            });
        }
    });

    return transitions.filter((transition) => transition.transition_utc);
}

function buildInteractionEdges(bundle = {}, proposalContent, rfiContent) {
    const explicitRows = safeArray(bundle.researchInteractionEdges);
    if (explicitRows.length) {
        return explicitRows;
    }

    const proposalById = new Map(proposalContent.map((proposal) => [proposal.proposal_id, proposal]));

    const communicationEdges = safeArray(bundle.communications).map((communication) => {
        const metadata = safeObject(communication?.metadata);
        const sourceProposal = proposalById.get(metadata.source_proposal_id);
        const channel = communication?.type === 'PROPOSAL_FORWARDED'
            ? 'proposal_forward'
            : communication?.type === 'PROPOSAL_RESPONSE'
                ? 'proposal_response'
                : 'communication';
        const sourceTeam = communication?.from_role === 'white_cell'
            ? 'whitecell'
            : inferTeamFromRole(communication?.from_role);
        const targetTeam = metadata.recipient_team
            || inferTeamFromRole(communication?.to_role, communication?.to_role)
            || communication?.to_role
            || null;
        const direction = sourceTeam === 'whitecell' && targetTeam && targetTeam !== 'whitecell'
            ? 'operator_to_team'
            : targetTeam === 'whitecell'
                ? 'team_to_operator'
                : sourceTeam && targetTeam && sourceTeam !== targetTeam
                    ? 'team_to_team'
                    : 'intra_team';
        const occurredUtc = asUtcIso(communication?.created_at);
        const latencyBase = sourceProposal?.reviewed_utc
            || findForwardedProposalCommunication(bundle.communications, metadata.source_proposal_id)?.created_at
            || null;

        return {
            edge_id: communication?.id || `edge-${channel}`,
            session_id: bundle.session?.id || null,
            source_pseudonym: communication?.from_role === 'white_cell' ? 'whitecell-operator' : null,
            source_role: communication?.from_role || null,
            source_team: sourceTeam,
            target_pseudonym: null,
            target_team: targetTeam,
            channel,
            direction,
            communication_type: communication?.type || null,
            entity_id: communication?.id || null,
            move_number: communication?.move ?? null,
            occurred_utc: occurredUtc,
            latency_s: channel === 'proposal_response'
                ? secondsBetween(latencyBase, occurredUtc)
                : null
        };
    });

    const rfiEdges = rfiContent
        .filter((rfi) => rfi.answered_utc)
        .map((rfi) => ({
            edge_id: `${rfi.rfi_id}-rfi`,
            session_id: rfi.session_id,
            source_pseudonym: 'whitecell-operator',
            source_role: 'whitecell_lead',
            source_team: 'whitecell',
            target_pseudonym: rfi.requester_pseudonym,
            target_team: rfi.requester_team,
            channel: 'rfi',
            direction: 'operator_to_team',
            communication_type: 'RFI_ANSWERED',
            entity_id: rfi.rfi_id,
            move_number: rfi.move_number,
            occurred_utc: rfi.answered_utc,
            latency_s: secondsBetween(rfi.raised_utc, rfi.answered_utc)
        }));

    return [...communicationEdges, ...rfiEdges].filter((edge) => edge.occurred_utc);
}

function buildDataQualityEvents(bundle = {}, participantRegistry) {
    const explicitRows = safeArray(bundle.researchDataQualityEvents);
    if (explicitRows.length) {
        return explicitRows;
    }

    const rows = [];

    safeArray(bundle.participants).forEach((participant) => {
        if (!participant?.disconnected_at) {
            return;
        }

        rows.push({
            dq_event_id: `${participant.id || participant.client_id}-disconnect`,
            session_id: bundle.session?.id || null,
            participant_pseudonym: resolvePseudonym(participantRegistry, {
                clientId: participant?.client_id,
                participantId: participant?.id,
                role: participant?.role,
                seatIndex: participant?.seat_index
            }),
            role: participant?.role || null,
            team: inferTeamFromRole(participant?.role, participant?.team),
            seat_index: participant?.seat_index ?? null,
            event_type: 'disconnect',
            occurred_utc: asUtcIso(participant.disconnected_at),
            gap_seconds: secondsBetween(participant?.heartbeat_at || participant?.last_seen || participant?.joined_at, participant?.disconnected_at),
            detail: {
                last_seen: asUtcIso(participant?.last_seen || participant?.heartbeat_at)
            }
        });
    });

    return rows;
}

function buildDerivedParticipantMetrics({
    participantRows,
    notes,
    noteRevisions,
    draftRevisions,
    eventLog,
    interactionEdges
}) {
    const noteCountByPseudonym = new Map();
    const noteEditCountByPseudonym = new Map();
    const draftCountByPseudonym = new Map();
    const submissionCountByPseudonym = new Map();
    const responseLatenciesByTargetTeam = new Map();
    const eventRowsByPseudonym = new Map();
    const disconnectCountByPseudonym = new Map();

    notes.forEach((note) => {
        const key = note.author_pseudonym || 'unknown';
        noteCountByPseudonym.set(key, (noteCountByPseudonym.get(key) || 0) + 1);
    });

    noteRevisions.forEach((revision) => {
        const key = revision.author_pseudonym || 'unknown';
        noteEditCountByPseudonym.set(key, (noteEditCountByPseudonym.get(key) || 0) + 1);
    });

    draftRevisions.forEach((draft) => {
        const key = draft.author_pseudonym || 'unknown';
        draftCountByPseudonym.set(key, (draftCountByPseudonym.get(key) || 0) + 1);
        if (draft.submitted_utc) {
            submissionCountByPseudonym.set(key, (submissionCountByPseudonym.get(key) || 0) + 1);
        }
    });

    eventLog.forEach((event) => {
        const key = event.actor_pseudonym || 'unknown';
        if (!eventRowsByPseudonym.has(key)) {
            eventRowsByPseudonym.set(key, []);
        }
        eventRowsByPseudonym.get(key).push(event);
        if (event.event_type === 'PARTICIPANT_DISCONNECTED') {
            disconnectCountByPseudonym.set(key, (disconnectCountByPseudonym.get(key) || 0) + 1);
        }
    });

    interactionEdges.forEach((edge) => {
        if (!edge.target_team || edge.latency_s === null || edge.latency_s === undefined) {
            return;
        }
        if (!responseLatenciesByTargetTeam.has(edge.target_team)) {
            responseLatenciesByTargetTeam.set(edge.target_team, []);
        }
        responseLatenciesByTargetTeam.get(edge.target_team).push(edge.latency_s);
    });

    const sessionStart = eventLog[0]?.event_ts_utc || null;

    return participantRows.map((participant) => {
        const participantEvents = eventRowsByPseudonym.get(participant.participant_pseudonym) || [];
        const eventTimestamps = participantEvents.map((event) => event.event_ts_utc).filter(Boolean);
        const matchingLatencies = responseLatenciesByTargetTeam.get(participant.team) || [];
        const meanTimeToSubmitValues = draftRevisions
            .filter((draft) => draft.author_pseudonym === participant.participant_pseudonym)
            .map((draft) => draft.time_to_submit_s)
            .filter((value) => value !== null && value !== undefined);

        return {
            session_id: participant.session_id,
            participant_pseudonym: participant.participant_pseudonym,
            role: participant.role,
            team: participant.team,
            seat_index: participant.seat_index,
            events_count: participantEvents.length,
            notes_count: noteCountByPseudonym.get(participant.participant_pseudonym) || 0,
            note_edits_count: Math.max(
                0,
                (noteEditCountByPseudonym.get(participant.participant_pseudonym) || 0)
                - (noteCountByPseudonym.get(participant.participant_pseudonym) || 0)
            ),
            drafts_count: draftCountByPseudonym.get(participant.participant_pseudonym) || 0,
            submissions_count: submissionCountByPseudonym.get(participant.participant_pseudonym) || 0,
            mean_time_to_submit_s: meanTimeToSubmitValues.length
                ? Number((meanTimeToSubmitValues.reduce((sum, value) => sum + value, 0) / meanTimeToSubmitValues.length).toFixed(3))
                : null,
            mean_response_latency_s: matchingLatencies.length
                ? Number((matchingLatencies.reduce((sum, value) => sum + value, 0) / matchingLatencies.length).toFixed(3))
                : null,
            active_duration_s: participant.active_duration_s ?? null,
            disconnect_count: disconnectCountByPseudonym.get(participant.participant_pseudonym) || 0,
            first_event_offset_s: eventTimestamps.length ? secondsBetween(sessionStart, eventTimestamps[0]) : null,
            last_event_offset_s: eventTimestamps.length ? secondsBetween(sessionStart, eventTimestamps[eventTimestamps.length - 1]) : null
        };
    });
}

function buildDerivedSessionMetrics({
    sessionId,
    captureMode,
    participantRows,
    eventLog,
    actionContent,
    proposalContent,
    rfiContent,
    interactionEdges
}) {
    const sessionStart = eventLog[0]?.event_ts_utc || null;
    const sessionEnd = eventLog[eventLog.length - 1]?.event_ts_utc || sessionStart;
    const proposalLatencies = interactionEdges
        .map((edge) => edge.latency_s)
        .filter((value) => value !== null && value !== undefined);

    return [
        {
            session_id: sessionId,
            capture_mode: captureMode,
            session_duration_s: secondsBetween(sessionStart, sessionEnd),
            moves_count: Math.max(
                0,
                ...safeArray(actionContent).map((row) => row.move_number || 0),
                ...safeArray(proposalContent).map((row) => row.move_number || 0),
                ...safeArray(rfiContent).map((row) => row.move_number || 0)
            ),
            participants_active: participantRows.length,
            total_events: eventLog.length,
            actions_submitted: actionContent.filter((row) => row.submitted_utc).length,
            actions_adjudicated: actionContent.filter((row) => row.final_status === 'adjudicated').length,
            proposals_submitted: proposalContent.filter((row) => row.submitted_utc).length,
            proposals_forwarded: proposalContent.filter((row) => row.review_decision === 'forwarded').length,
            rfis_raised: rfiContent.length,
            communications_sent: interactionEdges.filter((edge) => edge.channel === 'communication').length,
            mean_proposal_response_latency_s: proposalLatencies.length
                ? Number((proposalLatencies.reduce((sum, value) => sum + value, 0) / proposalLatencies.length).toFixed(3))
                : null
        }
    ];
}

function countByValue(rows = [], selector) {
    return safeArray(rows).reduce((counts, row) => {
        const rawValue = typeof selector === 'function' ? selector(row) : row?.[selector];
        const key = String(rawValue || 'unknown').trim().toLowerCase() || 'unknown';
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
}

function uniqueSortedValues(rows = [], selector) {
    return [...new Set(
        safeArray(rows)
            .map((row) => (typeof selector === 'function' ? selector(row) : row?.[selector]))
            .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
            .map((value) => String(value).trim().toLowerCase())
    )].sort((left, right) => left.localeCompare(right));
}

function buildResearchTableCoverage({
    bundle,
    eventLog,
    participantRows,
    notes,
    noteRevisions,
    draftRevisions,
    stateTransitions,
    actionContent,
    proposalContent,
    adjudicationContent,
    moveResponseContent,
    rfiContent,
    interactionEdges,
    dataQualityEvents,
    derivedParticipantMetrics,
    derivedSessionMetrics,
    decisionLineage,
    outcomeTaxonomy,
    trainingRubric,
    networkMetrics,
    turningPoints
}) {
    const rowsByTable = {
        event_log: eventLog,
        participants: participantRows,
        notes,
        note_revisions: noteRevisions,
        drafts_revisions: draftRevisions,
        state_transitions: stateTransitions,
        action_content: actionContent,
        proposal_content: proposalContent,
        adjudication_content: adjudicationContent,
        move_response_content: moveResponseContent,
        rfi_content: rfiContent,
        interaction_edges: interactionEdges,
        data_quality_events: dataQualityEvents,
        derived_participant_metrics: derivedParticipantMetrics,
        derived_session_metrics: derivedSessionMetrics,
        decision_lineage: decisionLineage,
        outcome_taxonomy: outcomeTaxonomy,
        training_rubric: trainingRubric,
        network_metrics: networkMetrics,
        turning_points: turningPoints
    };
    const explicitResearchRows = {
        event_log: safeArray(bundle.researchAuditEventLog).length,
        participants: safeArray(bundle.researchParticipants).length,
        notes: safeArray(bundle.researchNotes).length,
        note_revisions: safeArray(bundle.researchNoteRevisions).length,
        drafts_revisions: safeArray(bundle.researchDraftRevisions).length,
        state_transitions: safeArray(bundle.researchStateTransitions).length,
        action_content: safeArray(bundle.researchActionContent).length,
        proposal_content: safeArray(bundle.researchProposalContent).length,
        adjudication_content: safeArray(bundle.researchAdjudicationContent).length,
        move_response_content: safeArray(bundle.researchMoveResponseContent).length,
        rfi_content: safeArray(bundle.researchRfiContent).length,
        interaction_edges: safeArray(bundle.researchInteractionEdges).length,
        data_quality_events: safeArray(bundle.researchDataQualityEvents).length,
        derived_participant_metrics: safeArray(bundle.researchDerivedParticipantMetrics).length,
        derived_session_metrics: safeArray(bundle.researchDerivedSessionMetrics).length
    };
    const derivedTables = new Set([
        'event_log',
        'participants',
        'notes',
        'note_revisions',
        'drafts_revisions',
        'state_transitions',
        'action_content',
        'proposal_content',
        'adjudication_content',
        'move_response_content',
        'rfi_content',
        'interaction_edges',
        'data_quality_events',
        'derived_participant_metrics',
        'derived_session_metrics',
        'decision_lineage',
        'outcome_taxonomy',
        'training_rubric',
        'network_metrics',
        'turning_points'
    ]);
    const criticalTables = new Set(['event_log', 'participants', 'action_content', 'decision_lineage', 'data_quality_events']);

    return Object.entries(rowsByTable).map(([tableName, rows]) => {
        const rowCount = safeArray(rows).length;
        const explicitCount = explicitResearchRows[tableName] || 0;
        const source = explicitCount
            ? 'research_table'
            : (derivedTables.has(tableName) ? 'derived_at_export' : 'not_available');

        return {
            table_name: tableName,
            rows: rowCount,
            source,
            status: rowCount ? 'present' : 'empty',
            critical: criticalTables.has(tableName)
        };
    });
}

function resolveReadinessStatus(limitations = [], eventLog = []) {
    if (!safeArray(eventLog).length) {
        return 'not_recommended';
    }

    return limitations.length ? 'limited' : 'ready';
}

function buildDataQualitySummary({
    bundle,
    manifest,
    eventLog,
    participantRows,
    notes,
    noteRevisions,
    draftRevisions,
    stateTransitions,
    actionContent,
    proposalContent,
    adjudicationContent,
    moveResponseContent,
    rfiContent,
    interactionEdges,
    dataQualityEvents,
    derivedParticipantMetrics,
    derivedSessionMetrics,
    decisionLineage,
    outcomeTaxonomy,
    trainingRubric,
    networkMetrics,
    turningPoints,
    includeNotesAppendix
}) {
    const tableCoverage = buildResearchTableCoverage({
        bundle,
        eventLog,
        participantRows,
        notes,
        noteRevisions,
        draftRevisions,
        stateTransitions,
        actionContent,
        proposalContent,
        adjudicationContent,
        moveResponseContent,
        rfiContent,
        interactionEdges,
        dataQualityEvents,
        derivedParticipantMetrics,
        derivedSessionMetrics,
        decisionLineage,
        outcomeTaxonomy,
        trainingRubric,
        networkMetrics,
        turningPoints
    });
    const limitations = [];
    const fallbackUsage = tableCoverage
        .filter((entry) => entry.source === 'derived_at_export')
        .map((entry) => entry.table_name);

    if (manifest.capture_mode !== 'research') {
        limitations.push('Capture mode is not research; use qualitative findings cautiously.');
    }
    if (!safeArray(bundle.researchAuditEventLog).length) {
        limitations.push('Event log was derived from legacy session tables instead of the append-only research audit spine.');
    }
    if (!participantRows.length) {
        limitations.push('No participant rows were available, so role and seat engagement analysis is incomplete.');
    }
    if (safeArray(dataQualityEvents).length) {
        limitations.push('Data quality events were observed; review gaps before quantitative comparison.');
    }
    if (!safeArray(decisionLineage).length) {
        limitations.push('No decision lineage rows were available for trace-based analysis.');
    }

    const readinessStatus = resolveReadinessStatus(limitations, eventLog);
    const gapValues = safeArray(dataQualityEvents)
        .map((event) => Number(event.gap_seconds))
        .filter((value) => Number.isFinite(value));

    return {
        schema_version: RESEARCH_EXPORT_SCHEMA_VERSION,
        generated_at_utc: manifest.generated_at_utc,
        session_id: manifest.session_id,
        capture_mode: manifest.capture_mode,
        quantitative_comparison_readiness: {
            status: readinessStatus,
            limitations,
            recommended_uses: readinessStatus === 'not_recommended'
                ? ['Qualitative after-action review only']
                : [
                    'single-session reconstruction',
                    'training debrief',
                    readinessStatus === 'ready' ? 'cross-session quantitative comparison' : 'limited cross-session comparison with caveats'
                ],
            unsupported_uses: [
                'identity re-identification',
                'causal attribution without facilitator review',
                'performance ranking without rubric calibration'
            ]
        },
        coverage: {
            table_coverage: tableCoverage,
            teams_observed: uniqueSortedValues([
                ...participantRows,
                ...actionContent.map((row) => ({ team: row.author_team })),
                ...proposalContent.map((row) => ({ team: row.author_team })),
                ...moveResponseContent.map((row) => ({ team: row.author_team })),
                ...rfiContent.map((row) => ({ team: row.requester_team }))
            ], 'team'),
            moves_observed: uniqueSortedValues([
                ...actionContent,
                ...proposalContent,
                ...moveResponseContent,
                ...rfiContent,
                ...eventLog
            ], (row) => row.move_number).map((value) => Number(value)).filter((value) => Number.isFinite(value)),
            fallback_usage: fallbackUsage
        },
        data_quality_events: {
            total: safeArray(dataQualityEvents).length,
            by_type: countByValue(dataQualityEvents, 'event_type'),
            max_gap_seconds: gapValues.length ? Math.max(...gapValues) : null,
            events_ref: 'data_quality_events.csv'
        },
        privacy: {
            participant_identity: 'pseudonymized',
            identity_map_exported: false,
            notes_appendix_included: Boolean(includeNotesAppendix)
        },
        integrity: {
            event_log_chain: manifest.event_log_chain,
            checksums_ref: 'checksums.sha256',
            manifest_ref: 'manifest.json',
            codebook_ref: manifest.codebook_ref
        }
    };
}

function idsForRows(rows = [], fieldName = 'id') {
    return uniqueSortedValues(rows, fieldName);
}

function uniqueSortedList(values = []) {
    return [...new Set(
        safeArray(values)
            .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
            .map((value) => String(value).trim())
    )].sort((left, right) => left.localeCompare(right));
}

function buildRelatedEventIds(eventLog = [], entityId = null) {
    if (!entityId) {
        return [];
    }

    return safeArray(eventLog)
        .filter((event) => (
            event?.entity_id === entityId
            || event?.correlation_id === entityId
        ))
        .map((event) => event.event_id)
        .filter((eventId) => eventId !== null && eventId !== undefined);
}

function buildDecisionLineage({
    sessionId,
    actionContent,
    proposalContent,
    adjudicationContent,
    moveResponseContent,
    rfiContent,
    interactionEdges,
    communications,
    eventLog
}) {
    const adjudicationByTargetId = new Map(
        safeArray(adjudicationContent).map((entry) => [entry.target_entity_id, entry])
    );
    const edgesByEntityId = new Map();
    safeArray(interactionEdges).forEach((edge) => {
        if (!edge?.entity_id) {
            return;
        }
        if (!edgesByEntityId.has(edge.entity_id)) {
            edgesByEntityId.set(edge.entity_id, []);
        }
        edgesByEntityId.get(edge.entity_id).push(edge);
    });

    const rows = [];
    const addRow = (row) => {
        rows.push({
            lineage_id: `${row.root_entity_type}-${row.root_entity_id || rows.length + 1}`,
            session_id: sessionId,
            related_rfi_ids: [],
            related_communication_ids: [],
            related_response_ids: [],
            related_event_ids: [],
            ...row
        });
    };

    safeArray(actionContent).forEach((action) => {
        const adjudication = adjudicationByTargetId.get(action.action_id);
        const relatedRfis = safeArray(rfiContent).filter((rfi) => (
            rfi.move_number === action.move_number
            && rfi.requester_team === action.author_team
        ));

        addRow({
            root_entity_type: 'action',
            root_entity_id: action.action_id,
            move_number: action.move_number,
            source_team: action.author_team,
            current_state: action.final_status || adjudication?.ruling || 'submitted',
            created_utc: null,
            submitted_utc: action.submitted_utc,
            reviewed_utc: adjudication?.adjudicated_utc || null,
            related_rfi_ids: idsForRows(relatedRfis, 'rfi_id'),
            related_event_ids: buildRelatedEventIds(eventLog, action.action_id),
            evidence_summary: [
                action.title || 'Action',
                action.action_type ? `instrument=${action.action_type}` : '',
                adjudication?.ruling ? `ruling=${adjudication.ruling}` : ''
            ].filter(Boolean).join('; ')
        });
    });

    safeArray(proposalContent).forEach((proposal) => {
        const proposalEdges = edgesByEntityId.get(proposal.proposal_id) || [];
        const proposalCommunications = safeArray(communications).filter((communication) => (
            safeObject(communication?.metadata).source_proposal_id === proposal.proposal_id
        ));

        addRow({
            root_entity_type: 'proposal',
            root_entity_id: proposal.proposal_id,
            move_number: proposal.move_number,
            source_team: proposal.author_team,
            current_state: proposal.final_recipient_state || proposal.review_decision || 'submitted',
            created_utc: null,
            submitted_utc: proposal.submitted_utc,
            reviewed_utc: proposal.reviewed_utc,
            related_communication_ids: uniqueSortedList([
                ...idsForRows(proposalEdges, 'edge_id'),
                ...idsForRows(proposalCommunications, 'id')
            ]),
            related_event_ids: buildRelatedEventIds(eventLog, proposal.proposal_id),
            evidence_summary: [
                proposal.title || 'Proposal',
                proposal.intended_recipient_team ? `intended_recipient=${proposal.intended_recipient_team}` : '',
                proposal.forwarded_to_team ? `forwarded_to=${proposal.forwarded_to_team}` : '',
                proposal.final_recipient_state ? `recipient_state=${proposal.final_recipient_state}` : ''
            ].filter(Boolean).join('; ')
        });
    });

    safeArray(moveResponseContent).forEach((response) => {
        addRow({
            root_entity_type: 'move_response',
            root_entity_id: response.move_response_id,
            move_number: response.move_number,
            source_team: response.author_team,
            current_state: response.review_state || 'submitted',
            created_utc: null,
            submitted_utc: response.submitted_utc,
            reviewed_utc: null,
            related_event_ids: buildRelatedEventIds(eventLog, response.move_response_id),
            evidence_summary: [
                safeObject(response.full_content).goal || 'Move response',
                response.posture ? `posture=${response.posture}` : '',
                response.responding_to_entity_type ? `responding_to=${response.responding_to_entity_type}` : ''
            ].filter(Boolean).join('; ')
        });
    });

    safeArray(rfiContent).forEach((rfi) => {
        const rfiEdges = edgesByEntityId.get(rfi.rfi_id) || [];
        const rfiCommunications = safeArray(communications).filter((communication) => (
            communication?.linked_request_id === rfi.rfi_id
            || safeObject(communication?.metadata).linked_request_id === rfi.rfi_id
        ));

        addRow({
            root_entity_type: 'rfi',
            root_entity_id: rfi.rfi_id,
            move_number: rfi.move_number,
            source_team: rfi.requester_team,
            current_state: rfi.status || 'raised',
            created_utc: rfi.raised_utc,
            submitted_utc: rfi.raised_utc,
            reviewed_utc: rfi.answered_utc,
            related_communication_ids: uniqueSortedList([
                ...idsForRows(rfiEdges, 'edge_id'),
                ...idsForRows(rfiCommunications, 'id')
            ]),
            related_event_ids: buildRelatedEventIds(eventLog, rfi.rfi_id),
            evidence_summary: [
                'RFI',
                rfi.question_text ? `question=${rfi.question_text}` : '',
                rfi.answer_text ? 'answered=true' : 'answered=false'
            ].filter(Boolean).join('; ')
        });
    });

    return rows.sort((left, right) => (
        (left.move_number || 0) - (right.move_number || 0)
        || String(left.root_entity_type || '').localeCompare(String(right.root_entity_type || ''))
        || String(left.root_entity_id || '').localeCompare(String(right.root_entity_id || ''))
    ));
}

function buildScenarioContext(bundle = {}, {
    manifest,
    actionContent,
    proposalContent,
    moveResponseContent,
    rfiContent,
    interactionEdges
}) {
    const communications = safeArray(bundle.communications);
    const scenarioMessages = communications.filter((communication) => (
        ['INJECT', 'ANNOUNCEMENT', 'GUIDANCE', 'WHITE_CELL_UPDATE'].includes(String(communication?.type || '').toUpperCase())
    ));
    const deckAssignments = communications
        .filter((communication) => safeObject(communication?.metadata).source === 'scribe_deck_assignment')
        .map((communication) => ({
            communication_id: communication.id || null,
            team: safeObject(communication.metadata).team || safeObject(communication.metadata).recipient_team || communication.to_role || null,
            deck_source: safeObject(communication.metadata).deck_source || null,
            deck_path: safeObject(communication.metadata).deck_path || null,
            deck_label: safeObject(communication.metadata).deck_label || null,
            occurred_utc: asUtcIso(communication.created_at)
        }));

    return {
        schema_version: RESEARCH_EXPORT_SCHEMA_VERSION,
        generated_at_utc: manifest.generated_at_utc,
        simulation_name: SIMULATION_NAME,
        session: {
            id: bundle.session?.id || null,
            name: bundle.session?.name || null,
            code: bundle.session?.metadata?.session_code || null,
            description: bundle.session?.metadata?.description || null,
            status: bundle.session?.status || null,
            created_utc: asUtcIso(bundle.session?.created_at),
            updated_utc: asUtcIso(bundle.session?.updated_at)
        },
        runtime: {
            capture_mode: manifest.capture_mode,
            software_build_hash: manifest.software_build_hash || null,
            app_version: CONFIG.VERSION,
            game_state: bundle.gameState || null
        },
        exercise_structure: {
            declared_loop: ['orient', 'deliberate', 'act', 'adjudicate'],
            observed_moves: uniqueSortedValues([
                ...actionContent,
                ...proposalContent,
                ...moveResponseContent,
                ...rfiContent
            ], (row) => row.move_number).map((value) => Number(value)).filter((value) => Number.isFinite(value)),
            observed_teams: uniqueSortedValues([
                ...actionContent.map((row) => ({ team: row.author_team })),
                ...proposalContent.map((row) => ({ team: row.author_team })),
                ...moveResponseContent.map((row) => ({ team: row.author_team })),
                ...rfiContent.map((row) => ({ team: row.requester_team })),
                ...interactionEdges.map((row) => ({ team: row.source_team })),
                ...interactionEdges.map((row) => ({ team: row.target_team }))
            ], 'team')
        },
        scenario_messages: scenarioMessages.map((communication) => ({
            communication_id: communication.id || null,
            type: communication.type || null,
            to_role: communication.to_role || null,
            move_number: communication.move ?? null,
            phase: communication.phase ?? null,
            occurred_utc: asUtcIso(communication.created_at),
            content_excerpt: String(communication.content || '').slice(0, 500)
        })),
        deck_assignments: deckAssignments,
        observed_objectives: {
            actions: actionContent.map((action) => ({
                action_id: action.action_id,
                move_number: action.move_number,
                team: action.author_team,
                title: action.title,
                intent_text: action.intent_text
            })),
            proposals: proposalContent.map((proposal) => ({
                proposal_id: proposal.proposal_id,
                move_number: proposal.move_number,
                team: proposal.author_team,
                title: proposal.title,
                objective: proposal.proposal_text,
                intended_recipient_team: proposal.intended_recipient_team
            })),
            move_responses: moveResponseContent.map((response) => ({
                move_response_id: response.move_response_id,
                move_number: response.move_number,
                team: response.author_team,
                posture: response.posture,
                response_text: response.response_text
            }))
        },
        limitations: [
            'Scenario context is reconstructed from session metadata, runtime state, communications, and submitted artifacts.',
            'Static facilitator deck contents are not embedded unless they were recorded as session metadata or communications.'
        ]
    };
}

const OUTCOME_TAXONOMY_DIMENSIONS = Object.freeze({
    escalation_risk: ['escalat', 'retaliat', 'coerc', 'crisis', 'conflict', 'pressure', 'reprisal'],
    alliance_cohesion: ['ally', 'alliance', 'coalition', 'partner', 'coordination', 'alignment', 'cohesion'],
    implementation_feasibility: ['feasib', 'implement', 'enforce', 'capacity', 'timeline', 'constraint', 'reporting'],
    economic_pressure: ['sanction', 'export', 'investment', 'market', 'supply', 'cost', 'tariff', 'trade'],
    legitimacy_reputation: ['legitim', 'reputation', 'public', 'narrative', 'legal', 'norm', 'credibility'],
    operational_delay: ['delay', 'slow', 'disrupt', 'queue', 'backlog', 'window', 'pace'],
    resilience_impact: ['resilien', 'redundan', 'reroute', 'substitut', 'diversif', 'buffer', 'stockpile']
});

function normalizeTaxonomyEvidence(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function buildOutcomeTaxonomy({
    sessionId,
    actionContent,
    proposalContent,
    moveResponseContent,
    adjudicationContent
}) {
    const actionById = new Map(safeArray(actionContent).map((row) => [row.action_id, row]));
    const proposalById = new Map(safeArray(proposalContent).map((row) => [row.proposal_id, row]));
    const responseById = new Map(safeArray(moveResponseContent).map((row) => [row.move_response_id, row]));
    const rows = [];

    safeArray(adjudicationContent).forEach((adjudication) => {
        const sourceArtifact = actionById.get(adjudication.target_entity_id)
            || proposalById.get(adjudication.target_entity_id)
            || responseById.get(adjudication.target_entity_id)
            || {};
        const evidenceParts = [
            adjudication.ruling,
            adjudication.reasoning,
            formatReportValue(adjudication.effects, ''),
            sourceArtifact.intent_text,
            sourceArtifact.proposal_text,
            sourceArtifact.response_text,
            formatReportValue(sourceArtifact.full_content, '')
        ].filter(Boolean);
        const evidenceText = normalizeTaxonomyEvidence(evidenceParts.join(' '));
        let observedDimensions = 0;

        Object.entries(OUTCOME_TAXONOMY_DIMENSIONS).forEach(([dimension, keywords]) => {
            const hits = keywords.filter((keyword) => evidenceText.includes(keyword));
            if (!hits.length) {
                return;
            }

            observedDimensions += 1;
            rows.push({
                taxonomy_id: `${adjudication.adjudication_id || adjudication.target_entity_id}-${dimension}`,
                session_id: sessionId,
                entity_type: adjudication.target_entity_type || null,
                entity_id: adjudication.target_entity_id || null,
                move_number: adjudication.move_number ?? sourceArtifact.move_number ?? null,
                source_team: sourceArtifact.author_team || null,
                dimension,
                signal: 'mentioned',
                keyword_hits: hits,
                adjudication_ruling: adjudication.ruling || null,
                evidence_source: 'adjudication_content',
                evidence_excerpt: evidenceParts.join(' ').slice(0, 500)
            });
        });

        if (!observedDimensions) {
            rows.push({
                taxonomy_id: `${adjudication.adjudication_id || adjudication.target_entity_id}-general_outcome`,
                session_id: sessionId,
                entity_type: adjudication.target_entity_type || null,
                entity_id: adjudication.target_entity_id || null,
                move_number: adjudication.move_number ?? sourceArtifact.move_number ?? null,
                source_team: sourceArtifact.author_team || null,
                dimension: 'general_outcome',
                signal: 'recorded',
                keyword_hits: [],
                adjudication_ruling: adjudication.ruling || null,
                evidence_source: 'adjudication_content',
                evidence_excerpt: evidenceParts.join(' ').slice(0, 500)
            });
        }
    });

    return rows;
}

function buildTrainingRubric({
    sessionId,
    derivedParticipantMetrics,
    rfiContent,
    eventLog
}) {
    const rfiCountByTeam = countByValue(rfiContent, 'requester_team');
    const eventIdsByPseudonym = new Map();

    safeArray(eventLog).forEach((event) => {
        const key = event.actor_pseudonym || 'unknown';
        if (!eventIdsByPseudonym.has(key)) {
            eventIdsByPseudonym.set(key, []);
        }
        if (event.event_id !== null && event.event_id !== undefined) {
            eventIdsByPseudonym.get(key).push(event.event_id);
        }
    });

    const rows = [];
    const addRubricRow = (participant, dimension, evidenceValue, threshold, status, evidenceRefs = []) => {
        rows.push({
            rubric_id: `${participant.participant_pseudonym}-${dimension}`,
            session_id: sessionId,
            participant_pseudonym: participant.participant_pseudonym,
            role: participant.role,
            team: participant.team,
            dimension,
            evidence_value: evidenceValue,
            threshold,
            status,
            evidence_refs: evidenceRefs
        });
    };

    safeArray(derivedParticipantMetrics).forEach((participant) => {
        const eventRefs = eventIdsByPseudonym.get(participant.participant_pseudonym) || [];
        const teamRfiCount = rfiCountByTeam[String(participant.team || 'unknown').toLowerCase()] || 0;

        addRubricRow(
            participant,
            'participation_activity',
            participant.events_count || 0,
            'events_count >= 1',
            (participant.events_count || 0) >= 1 ? 'evidence_present' : 'not_observed',
            eventRefs
        );
        addRubricRow(
            participant,
            'submission_follow_through',
            participant.submissions_count || 0,
            'submissions_count >= 1',
            (participant.submissions_count || 0) >= 1 ? 'evidence_present' : 'not_observed',
            eventRefs
        );
        addRubricRow(
            participant,
            'draft_iteration',
            participant.drafts_count || 0,
            'drafts_count > submissions_count',
            (participant.drafts_count || 0) > (participant.submissions_count || 0) ? 'evidence_present' : 'not_observed',
            eventRefs
        );
        addRubricRow(
            participant,
            'rfi_usage_by_team',
            teamRfiCount,
            'team_rfi_count >= 1',
            teamRfiCount >= 1 ? 'evidence_present' : 'not_observed',
            idsForRows(rfiContent.filter((rfi) => rfi.requester_team === participant.team), 'rfi_id')
        );
        addRubricRow(
            participant,
            'continuity',
            participant.disconnect_count || 0,
            'disconnect_count == 0',
            (participant.disconnect_count || 0) === 0 ? 'clear' : 'attention_needed',
            eventRefs
        );
        addRubricRow(
            participant,
            'response_latency_observed',
            participant.mean_response_latency_s ?? null,
            'mean_response_latency_s captured',
            participant.mean_response_latency_s === null || participant.mean_response_latency_s === undefined
                ? 'not_observed'
                : 'evidence_present',
            eventRefs
        );
    });

    return rows;
}

function average(values = []) {
    const numericValues = safeArray(values)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));

    return numericValues.length
        ? Number((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length).toFixed(3))
        : null;
}

function buildNetworkMetrics({
    sessionId,
    interactionEdges
}) {
    const pairGroups = new Map();
    const teamGroups = new Map();
    const rows = [];

    safeArray(interactionEdges).forEach((edge) => {
        const source = edge.source_team || 'unknown';
        const target = edge.target_team || 'unknown';
        const pairKey = `${source}->${target}`;

        if (!pairGroups.has(pairKey)) {
            pairGroups.set(pairKey, []);
        }
        pairGroups.get(pairKey).push(edge);

        if (!teamGroups.has(source)) {
            teamGroups.set(source, { outbound: [], inbound: [] });
        }
        if (!teamGroups.has(target)) {
            teamGroups.set(target, { outbound: [], inbound: [] });
        }
        teamGroups.get(source).outbound.push(edge);
        teamGroups.get(target).inbound.push(edge);
    });

    pairGroups.forEach((edges, pairKey) => {
        const [source, target] = pairKey.split('->');
        const edgeIds = idsForRows(edges, 'edge_id');
        rows.push({
            metric_id: `${source}-${target}-edge_count`,
            session_id: sessionId,
            source_team: source,
            target_team: target,
            metric_name: 'edge_count',
            metric_value: edges.length,
            unit: 'count',
            evidence_edge_ids: edgeIds
        });
        rows.push({
            metric_id: `${source}-${target}-mean_latency_s`,
            session_id: sessionId,
            source_team: source,
            target_team: target,
            metric_name: 'mean_latency_s',
            metric_value: average(edges.map((edge) => edge.latency_s)),
            unit: 'seconds',
            evidence_edge_ids: edgeIds
        });
    });

    teamGroups.forEach((group, team) => {
        rows.push({
            metric_id: `${team}-outbound_edges`,
            session_id: sessionId,
            source_team: team,
            target_team: null,
            metric_name: 'outbound_edges',
            metric_value: group.outbound.length,
            unit: 'count',
            evidence_edge_ids: idsForRows(group.outbound, 'edge_id')
        });
        rows.push({
            metric_id: `${team}-inbound_edges`,
            session_id: sessionId,
            source_team: null,
            target_team: team,
            metric_name: 'inbound_edges',
            metric_value: group.inbound.length,
            unit: 'count',
            evidence_edge_ids: idsForRows(group.inbound, 'edge_id')
        });
    });

    pairGroups.forEach((edges, pairKey) => {
        const [source, target] = pairKey.split('->');
        const reverseKey = `${target}->${source}`;
        if (!pairGroups.has(reverseKey) || source.localeCompare(target) > 0) {
            return;
        }

        rows.push({
            metric_id: `${source}-${target}-reciprocity`,
            session_id: sessionId,
            source_team: source,
            target_team: target,
            metric_name: 'reciprocal_pair_observed',
            metric_value: 1,
            unit: 'boolean',
            evidence_edge_ids: uniqueSortedList([
                ...idsForRows(edges, 'edge_id'),
                ...idsForRows(pairGroups.get(reverseKey), 'edge_id')
            ])
        });
    });

    return rows.sort((left, right) => left.metric_id.localeCompare(right.metric_id));
}

function earliestByTimestamp(rows = [], timestampField) {
    return safeArray(rows)
        .filter((row) => row?.[timestampField])
        .slice()
        .sort((left, right) => new Date(left[timestampField]).getTime() - new Date(right[timestampField]).getTime())[0] || null;
}

function buildTurningPoints({
    sessionId,
    eventLog,
    proposalContent,
    rfiContent,
    interactionEdges,
    dataQualityEvents,
    decisionLineage
}) {
    const rows = [];
    const addTurningPoint = (turningPoint) => {
        if (!turningPoint) {
            return;
        }
        rows.push({
            session_id: sessionId,
            ...turningPoint
        });
    };
    const firstForwardedProposal = earliestByTimestamp(
        safeArray(proposalContent).filter((proposal) => proposal.forwarded_to_team),
        'reviewed_utc'
    );
    const firstRfi = earliestByTimestamp(rfiContent, 'raised_utc');
    const firstDataQualityEvent = earliestByTimestamp(dataQualityEvents, 'occurred_utc');
    const longestLatencyRfi = safeArray(rfiContent)
        .filter((rfi) => rfi.raised_utc && rfi.answered_utc)
        .map((rfi) => ({
            rfi,
            latency: secondsBetween(rfi.raised_utc, rfi.answered_utc)
        }))
        .sort((left, right) => (right.latency || 0) - (left.latency || 0))[0] || null;
    const moveEventCounts = new Map();

    safeArray(eventLog).forEach((event) => {
        const moveNumber = event.move_number ?? 'unassigned';
        moveEventCounts.set(moveNumber, (moveEventCounts.get(moveNumber) || 0) + 1);
    });
    const highestActivityMove = [...moveEventCounts.entries()]
        .filter(([moveNumber]) => moveNumber !== 'unassigned')
        .sort((left, right) => right[1] - left[1] || Number(left[0]) - Number(right[0]))[0] || null;
    const proposalNotAdvanced = safeArray(proposalContent).find((proposal) => (
        proposal.review_decision
        && proposal.review_decision !== 'forwarded'
    ));

    if (firstForwardedProposal) {
        addTurningPoint({
            turning_point_id: `first_forwarded_proposal-${firstForwardedProposal.proposal_id}`,
            occurred_utc: firstForwardedProposal.reviewed_utc,
            move_number: firstForwardedProposal.move_number,
            turning_point_type: 'first_forwarded_proposal',
            entity_type: 'proposal',
            entity_id: firstForwardedProposal.proposal_id,
            team: firstForwardedProposal.author_team,
            evidence_summary: `First forwarded proposal from ${firstForwardedProposal.author_team || 'unknown'} to ${firstForwardedProposal.forwarded_to_team || 'unknown'}.`,
            evidence_refs: [firstForwardedProposal.proposal_id]
        });
    }
    if (firstRfi) {
        addTurningPoint({
            turning_point_id: `first_rfi-${firstRfi.rfi_id}`,
            occurred_utc: firstRfi.raised_utc,
            move_number: firstRfi.move_number,
            turning_point_type: 'first_rfi',
            entity_type: 'rfi',
            entity_id: firstRfi.rfi_id,
            team: firstRfi.requester_team,
            evidence_summary: 'First request for information raised.',
            evidence_refs: [firstRfi.rfi_id]
        });
    }
    if (firstDataQualityEvent) {
        addTurningPoint({
            turning_point_id: `first_data_quality_event-${firstDataQualityEvent.dq_event_id}`,
            occurred_utc: firstDataQualityEvent.occurred_utc,
            move_number: null,
            turning_point_type: 'first_data_quality_event',
            entity_type: 'data_quality_event',
            entity_id: firstDataQualityEvent.dq_event_id,
            team: firstDataQualityEvent.team,
            evidence_summary: `First data quality event: ${firstDataQualityEvent.event_type || 'unknown'}.`,
            evidence_refs: [firstDataQualityEvent.dq_event_id]
        });
    }
    if (longestLatencyRfi?.rfi) {
        addTurningPoint({
            turning_point_id: `longest_rfi_latency-${longestLatencyRfi.rfi.rfi_id}`,
            occurred_utc: longestLatencyRfi.rfi.answered_utc,
            move_number: longestLatencyRfi.rfi.move_number,
            turning_point_type: 'longest_rfi_latency',
            entity_type: 'rfi',
            entity_id: longestLatencyRfi.rfi.rfi_id,
            team: longestLatencyRfi.rfi.requester_team,
            evidence_summary: `Longest observed RFI answer latency: ${longestLatencyRfi.latency} seconds.`,
            evidence_refs: [longestLatencyRfi.rfi.rfi_id]
        });
    }
    if (highestActivityMove) {
        addTurningPoint({
            turning_point_id: `highest_activity_move-${highestActivityMove[0]}`,
            occurred_utc: null,
            move_number: Number(highestActivityMove[0]),
            turning_point_type: 'highest_activity_move',
            entity_type: 'move',
            entity_id: `move-${highestActivityMove[0]}`,
            team: null,
            evidence_summary: `Move ${highestActivityMove[0]} had the highest logged event density (${highestActivityMove[1]} events).`,
            evidence_refs: safeArray(eventLog)
                .filter((event) => event.move_number === Number(highestActivityMove[0]))
                .map((event) => event.event_id)
        });
    }
    if (proposalNotAdvanced) {
        addTurningPoint({
            turning_point_id: `proposal_not_forwarded-${proposalNotAdvanced.proposal_id}`,
            occurred_utc: proposalNotAdvanced.reviewed_utc,
            move_number: proposalNotAdvanced.move_number,
            turning_point_type: 'proposal_not_forwarded',
            entity_type: 'proposal',
            entity_id: proposalNotAdvanced.proposal_id,
            team: proposalNotAdvanced.author_team,
            evidence_summary: `Proposal review decision was ${proposalNotAdvanced.review_decision}.`,
            evidence_refs: [proposalNotAdvanced.proposal_id]
        });
    }

    const crossTeamEdges = safeArray(interactionEdges).filter((edge) => (
        edge.source_team
        && edge.target_team
        && edge.source_team !== edge.target_team
    ));
    const firstCrossTeamEdge = earliestByTimestamp(crossTeamEdges, 'occurred_utc');
    if (firstCrossTeamEdge) {
        addTurningPoint({
            turning_point_id: `first_cross_team_edge-${firstCrossTeamEdge.edge_id}`,
            occurred_utc: firstCrossTeamEdge.occurred_utc,
            move_number: firstCrossTeamEdge.move_number,
            turning_point_type: 'first_cross_team_interaction',
            entity_type: 'interaction_edge',
            entity_id: firstCrossTeamEdge.edge_id,
            team: firstCrossTeamEdge.source_team,
            evidence_summary: `First cross-team interaction from ${firstCrossTeamEdge.source_team} to ${firstCrossTeamEdge.target_team}.`,
            evidence_refs: [firstCrossTeamEdge.edge_id]
        });
    }

    return rows.sort((left, right) => {
        const leftMs = left.occurred_utc ? new Date(left.occurred_utc).getTime() : Number.POSITIVE_INFINITY;
        const rightMs = right.occurred_utc ? new Date(right.occurred_utc).getTime() : Number.POSITIVE_INFINITY;
        return leftMs - rightMs
            || (left.move_number || 0) - (right.move_number || 0)
            || left.turning_point_id.localeCompare(right.turning_point_id);
    });
}

function renderPersonaHtml({
    title,
    subtitle,
    manifest,
    sections
}) {
    return `
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
        body { margin: 0; background: #f6f8fb; color: #1f2933; font-family: Arial, sans-serif; }
        main { max-width: 980px; margin: 0 auto; padding: 40px 28px; background: #fff; min-height: 100vh; }
        h1 { margin: 0 0 8px; font-size: 30px; }
        h2 { margin-top: 32px; border-top: 1px solid #d9dee5; padding-top: 18px; font-size: 20px; }
        p { line-height: 1.55; }
        .muted { color: #52606d; }
        .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin: 20px 0; }
        .meta div { border: 1px solid #d9dee5; border-radius: 6px; padding: 10px; background: #f7f9fb; }
        .meta dt { font-size: 11px; text-transform: uppercase; color: #52606d; }
        .meta dd { margin: 4px 0 0; font-weight: 700; }
        .report-summary-grid, .report-meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
        .report-summary-card, .report-meta-item { border: 1px solid #d9dee5; border-radius: 6px; padding: 10px; background: #f7f9fb; }
        .report-summary-label, .report-meta-item dt { margin: 0; font-size: 11px; text-transform: uppercase; color: #52606d; }
        .report-summary-value, .report-meta-item dd { margin: 4px 0 0; font-weight: 700; }
        .report-summary-detail { margin: 4px 0 0; color: #52606d; font-size: 12px; }
        .report-table-wrap { overflow-x: auto; }
        .report-empty { color: #52606d; font-style: italic; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        th, td { border-bottom: 1px solid #d9dee5; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #eef2f6; font-size: 11px; text-transform: uppercase; }
        @media print { body { background: #fff; } main { padding: 0; max-width: none; } }
    </style>
</head>
<body>
    <main>
        <h1>${escapeHtml(title)}</h1>
        <p class="muted">${escapeHtml(subtitle)}</p>
        <dl class="meta">
            <div><dt>Session</dt><dd>${escapeHtml(manifest.session_id || 'N/A')}</dd></div>
            <div><dt>Generated UTC</dt><dd>${escapeHtml(formatReportTimestamp(manifest.generated_at_utc))}</dd></div>
            <div><dt>Capture Mode</dt><dd>${escapeHtml(manifest.capture_mode || 'unknown')}</dd></div>
            <div><dt>Schema</dt><dd>${escapeHtml(manifest.schema_version || 'unknown')}</dd></div>
        </dl>
        ${safeArray(sections).map((section) => `
            <section>
                <h2>${escapeHtml(section.title || '')}</h2>
                ${section.html || ''}
            </section>
        `).join('')}
    </main>
</body>
</html>
    `.trim();
}

function buildPersonaReports(dataset = {}) {
    const manifest = safeObject(dataset.manifest);
    const sessionMetrics = safeArray(dataset.derivedSessionMetrics)[0] || {};
    const dataQualityReadiness = safeObject(dataset.dataQualitySummary?.quantitative_comparison_readiness);
    const lineageRows = safeArray(dataset.decisionLineage).slice(0, 30).map((row) => [
        row.root_entity_type,
        row.root_entity_id,
        row.move_number,
        row.source_team,
        row.current_state,
        row.evidence_summary
    ]);
    const actionRows = safeArray(dataset.actionContent).map((action) => [
        action.move_number,
        action.author_team,
        action.action_type,
        formatReportValue(action.targets, ''),
        action.final_status,
        action.intent_text
    ]);
    const proposalRows = safeArray(dataset.proposalContent).map((proposal) => [
        proposal.move_number,
        proposal.author_team,
        proposal.intended_recipient_team,
        proposal.review_decision,
        proposal.final_recipient_state,
        proposal.rationale
    ]);
    const participantRows = safeArray(dataset.derivedParticipantMetrics).map((participant) => [
        participant.participant_pseudonym,
        participant.role,
        participant.team,
        participant.events_count,
        participant.submissions_count,
        formatReportDuration(participant.mean_time_to_submit_s),
        participant.disconnect_count
    ]);
    const rowCountRows = Object.entries(safeObject(manifest.row_counts))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [humanizeReportLabel(key), String(value)]);
    const qualityRows = safeArray(dataset.dataQualitySummary?.coverage?.table_coverage).map((entry) => [
        entry.table_name,
        entry.rows,
        entry.source,
        entry.status,
        entry.critical ? 'yes' : 'no'
    ]);
    const outcomeRows = safeArray(dataset.outcomeTaxonomy).slice(0, 30).map((row) => [
        row.dimension,
        row.signal,
        row.entity_type,
        row.entity_id,
        row.source_team,
        formatReportValue(row.keyword_hits, '')
    ]);
    const rubricRows = safeArray(dataset.trainingRubric).slice(0, 40).map((row) => [
        row.participant_pseudonym,
        row.team,
        row.dimension,
        formatReportValue(row.evidence_value, ''),
        row.status
    ]);
    const networkRows = safeArray(dataset.networkMetrics).slice(0, 30).map((row) => [
        row.metric_name,
        row.source_team,
        row.target_team,
        formatReportValue(row.metric_value, ''),
        row.unit
    ]);
    const turningRows = safeArray(dataset.turningPoints).map((row) => [
        row.turning_point_type,
        row.move_number,
        row.team,
        row.evidence_summary
    ]);
    const commonSummaryCards = renderReportSummaryCards([
        { label: 'Events', value: sessionMetrics.total_events ?? 0 },
        { label: 'Participants', value: sessionMetrics.participants_active ?? 0 },
        { label: 'Moves', value: sessionMetrics.moves_count ?? 0 },
        { label: 'Actions', value: sessionMetrics.actions_submitted ?? 0 },
        { label: 'Proposals', value: sessionMetrics.proposals_submitted ?? 0 },
        { label: 'RFIs', value: sessionMetrics.rfis_raised ?? 0 }
    ]);

    return [
        {
            path: 'reports/policy_brief.html',
            content: renderPersonaHtml({
                title: 'Policy Brief',
                subtitle: 'Policy-relevant instruments, partner routing, constraints, and review outcomes.',
                manifest,
                sections: [
                    { title: 'Session Indicators', html: commonSummaryCards },
                    { title: 'Outcome Taxonomy Signals', html: renderReportTable(['Dimension', 'Signal', 'Entity Type', 'Entity ID', 'Team', 'Keyword Hits'], outcomeRows) },
                    { title: 'Policy Instruments And Targets', html: renderReportTable(['Move', 'Team', 'Instrument', 'Targets', 'Status', 'Intent'], actionRows) },
                    { title: 'Partner Alignment Proposals', html: renderReportTable(['Move', 'Source', 'Intended Recipient', 'Review', 'Recipient State', 'Rationale'], proposalRows) },
                    { title: 'Evidence Trace', html: renderReportTable(['Type', 'Entity ID', 'Move', 'Team', 'State', 'Evidence'], lineageRows) }
                ]
            }),
            mimeType: 'text/html'
        },
        {
            path: 'reports/strategic_leader_brief.html',
            content: renderPersonaHtml({
                title: 'Strategic Leader Brief',
                subtitle: 'High-level view of tempo, decision flow, team interaction, and unresolved signals.',
                manifest,
                sections: [
                    { title: 'Executive Indicators', html: commonSummaryCards },
                    { title: 'Turning Points', html: renderReportTable(['Type', 'Move', 'Team', 'Evidence'], turningRows) },
                    { title: 'Decision Lineage Highlights', html: renderReportTable(['Type', 'Entity ID', 'Move', 'Team', 'State', 'Evidence'], lineageRows) },
                    { title: 'Network Metrics', html: renderReportTable(['Metric', 'Source Team', 'Target Team', 'Value', 'Unit'], networkRows) },
                    { title: 'Interaction Matrix', html: renderInteractionMatrix(dataset.interactionEdges) },
                    { title: 'Data Quality Readiness', html: renderReportMetaGrid([
                        { label: 'Status', value: dataQualityReadiness.status },
                        { label: 'Limitations', value: dataQualityReadiness.limitations }
                    ]) }
                ]
            }),
            mimeType: 'text/html'
        },
        {
            path: 'reports/training_evaluator_report.html',
            content: renderPersonaHtml({
                title: 'Training Evaluator Report',
                subtitle: 'Participant engagement, submission behavior, timing, and data-quality caveats for after-action review.',
                manifest,
                sections: [
                    { title: 'Training Indicators', html: commonSummaryCards },
                    { title: 'Rubric Evidence', html: renderReportTable(['Participant', 'Team', 'Dimension', 'Evidence Value', 'Status'], rubricRows) },
                    { title: 'Participant Metrics', html: renderReportTable(['Pseudonym', 'Role', 'Team', 'Events', 'Submissions', 'Mean Submit Time', 'Disconnects'], participantRows) },
                    { title: 'Decision Evidence', html: renderReportTable(['Type', 'Entity ID', 'Move', 'Team', 'State', 'Evidence'], lineageRows) },
                    { title: 'Data Quality Coverage', html: renderReportTable(['Table', 'Rows', 'Source', 'Status', 'Critical'], qualityRows) }
                ]
            }),
            mimeType: 'text/html'
        },
        {
            path: 'reports/analyst_report.html',
            content: renderPersonaHtml({
                title: 'Analyst Report',
                subtitle: 'Machine-readable table inventory, methodology caveats, and reproducibility pointers.',
                manifest,
                sections: [
                    { title: 'Manifest', html: renderReportMetaGrid([
                        { label: 'Schema Version', value: manifest.schema_version },
                        { label: 'Format Revision', value: manifest.export_format_revision },
                        { label: 'Export Version', value: manifest.export_version },
                        { label: 'Event Chain', value: safeObject(manifest.event_log_chain).session_checksum },
                        { label: 'Codebook', value: manifest.codebook_ref },
                        { label: 'Checksums', value: 'checksums.sha256' }
                    ]) },
                    { title: 'Row Counts', html: renderReportTable(['Projection', 'Rows'], rowCountRows) },
                    { title: 'Coverage And Sources', html: renderReportTable(['Table', 'Rows', 'Source', 'Status', 'Critical'], qualityRows) },
                    { title: 'Derived Utility Tables', html: renderReportTable(['Table', 'Rows', 'Source', 'Status', 'Critical'], qualityRows.filter((row) => ['Outcome Taxonomy', 'Training Rubric', 'Network Metrics', 'Turning Points'].includes(humanizeReportLabel(row[0])))) },
                    { title: 'Decision Lineage Sample', html: renderReportTable(['Type', 'Entity ID', 'Move', 'Team', 'State', 'Evidence'], lineageRows) }
                ]
            }),
            mimeType: 'text/html'
        }
    ];
}

function buildCodebookRows() {
    return Object.entries(RESEARCH_EXPORT_COLUMNS).flatMap(([tableName, columns]) => {
        return columns.map((columnName) => ({
            table_name: tableName,
            column_name: columnName,
            data_type: /_utc$/.test(columnName)
                ? 'timestamp_utc'
                : /(_count|_number|_index|_sequence)$/.test(columnName)
                    ? 'integer'
                    : /(duration|latency|seconds|_s)$/.test(columnName)
                        ? 'number'
                        : /(_state|_role|_team|_type|_status)$/.test(columnName)
                            ? 'string'
                            : ['payload', 'before_state', 'after_state', 'full_content', 'targets', 'instruments', 'resources_committed', 'effects', 'detail', 'content_snapshot', 'content_diff_from_prev', 'keyword_hits', 'evidence_refs', 'evidence_edge_ids', 'related_rfi_ids', 'related_communication_ids', 'related_response_ids', 'related_event_ids'].includes(columnName)
                                ? 'json'
                                : 'string',
            units: /(duration|latency|seconds|_s)$/.test(columnName)
                ? 'seconds'
                : /_count$/.test(columnName)
                    ? 'count'
                    : /length_chars$/.test(columnName)
                        ? 'characters'
                        : null,
            allowed_values: null,
            nullable: !['session_id', 'participant_pseudonym', 'author_pseudonym', 'event_type', 'entity_type', 'to_state', 'occurred_utc'].includes(columnName),
            is_derived: ['derived_participant_metrics', 'derived_session_metrics', 'decision_lineage', 'cross_session_index', 'outcome_taxonomy', 'training_rubric', 'network_metrics', 'turning_points'].includes(tableName),
            derivation: ['derived_participant_metrics', 'derived_session_metrics', 'decision_lineage', 'cross_session_index', 'outcome_taxonomy', 'training_rubric', 'network_metrics', 'turning_points'].includes(tableName)
                ? 'Computed client-side at export time from canonical event and content tables.'
                : null,
            pii_class: /content_text|proposal_text|question_text|answer_text|response_text|reasoning|rationale|intent_text|requested_action|evidence_summary|evidence_excerpt/.test(columnName)
                ? 'pseudonymous'
                : 'none',
            description: `Research export field ${columnName.replace(/_/g, ' ')} for ${tableName.replace(/_/g, ' ')}.`
        }));
    });
}

function renderReportTable(headers = [], rows = []) {
    if (!rows.length) {
        return '<p class="report-empty">No records were captured for this section.</p>';
    }

    return `
        <div class="report-table-wrap">
            <table class="report-table">
                <thead>
                    <tr>
                        ${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row) => `
                        <tr>
                            ${row.map((value) => `<td>${escapeHtml(value ?? '')}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderInteractionMatrix(interactionEdges = []) {
    const counts = new Map();

    interactionEdges.forEach((edge) => {
        const source = edge.source_team || 'unknown';
        const target = edge.target_team || 'unknown';
        const key = `${source}->${target}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    });

    const rows = [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, count]) => {
            const [source, target] = key.split('->');
            return [source, target, String(count)];
        });

    return renderReportTable(['Source', 'Target', 'Count'], rows);
}

function hasReportValue(value) {
    if (Array.isArray(value)) {
        return value.some((entry) => hasReportValue(entry));
    }

    if (value && typeof value === 'object') {
        return Object.values(value).some((entry) => hasReportValue(entry));
    }

    return value !== null && value !== undefined && String(value).trim() !== '';
}

function humanizeReportLabel(value = '') {
    const normalized = String(value ?? '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) {
        return '';
    }

    return normalized
        .split(' ')
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ')
        .replace(/\bRfi\b/g, 'RFI')
        .replace(/\bUtc\b/g, 'UTC')
        .replace(/\bId\b/g, 'ID')
        .replace(/\bKpi\b/g, 'KPI');
}

function formatReportTimestamp(value, fallback = 'N/A') {
    const isoValue = asUtcIso(value);
    return isoValue
        ? isoValue.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC').replace(/Z$/, ' UTC')
        : fallback;
}

function formatReportDuration(value, fallback = 'N/A') {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return String(value);
    }

    const totalSeconds = Math.max(0, Math.round(Number(numericValue.toFixed(3))));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [
        hours ? `${hours}h` : '',
        minutes ? `${minutes}m` : '',
        seconds || (!hours && !minutes) ? `${seconds}s` : ''
    ].filter(Boolean);

    return parts.join(' ');
}

function formatReportValue(value, fallback = 'N/A') {
    if (!hasReportValue(value)) {
        return fallback;
    }

    if (Array.isArray(value)) {
        return value
            .filter((entry) => hasReportValue(entry))
            .map((entry) => formatReportValue(entry, ''))
            .filter(Boolean)
            .join(', ');
    }

    if (value && typeof value === 'object') {
        return Object.entries(value)
            .filter(([, entry]) => hasReportValue(entry))
            .map(([key, entry]) => `${humanizeReportLabel(key)}: ${formatReportValue(entry, '')}`)
            .join('; ');
    }

    if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
    }

    return String(value);
}

function renderReportBadge(badge) {
    const descriptor = typeof badge === 'string'
        ? { label: badge, tone: 'default' }
        : {
            label: badge?.label,
            tone: badge?.tone || 'default'
        };

    if (!hasReportValue(descriptor.label)) {
        return '';
    }

    return `<span class="report-badge report-badge--${escapeHtml(descriptor.tone)}">${escapeHtml(formatReportValue(descriptor.label, ''))}</span>`;
}

function renderReportBadgeGroup(badges = []) {
    const renderedBadges = safeArray(badges)
        .map((badge) => renderReportBadge(badge))
        .filter(Boolean)
        .join('');

    return renderedBadges
        ? `<div class="report-badge-list">${renderedBadges}</div>`
        : '';
}

function renderReportMetaGrid(items = []) {
    const visibleItems = safeArray(items).filter((item) => hasReportValue(item?.value) || hasReportValue(item?.html));
    if (!visibleItems.length) {
        return '';
    }

    return `
        <dl class="report-meta-grid">
            ${visibleItems.map((item) => `
                <div class="report-meta-item">
                    <dt>${escapeHtml(item.label || '')}</dt>
                    <dd>${item.html || escapeHtml(formatReportValue(item.value, ''))}</dd>
                </div>
            `).join('')}
        </dl>
    `;
}

function renderReportSummaryCards(cards = []) {
    const visibleCards = safeArray(cards).filter((card) => hasReportValue(card?.value) || hasReportValue(card?.valueHtml));
    if (!visibleCards.length) {
        return '';
    }

    return `
        <div class="report-summary-grid">
            ${visibleCards.map((card) => `
                <article class="report-summary-card">
                    <p class="report-summary-label">${escapeHtml(card.label || '')}</p>
                    <p class="report-summary-value">${card.valueHtml || escapeHtml(formatReportValue(card.value, ''))}</p>
                    ${hasReportValue(card.detail)
                        ? `<p class="report-summary-detail">${escapeHtml(formatReportValue(card.detail, ''))}</p>`
                        : ''}
                </article>
            `).join('')}
        </div>
    `;
}

function renderReportSectionBlock(title, html) {
    if (!html) {
        return '';
    }

    return `
        <div class="report-block">
            <h3 class="report-block-title">${escapeHtml(title || '')}</h3>
            ${html}
        </div>
    `;
}

function renderReportEntityCard({
    eyebrow = '',
    title = '',
    summary = '',
    badges = [],
    metadata = [],
    sections = []
} = {}) {
    const renderedMetadata = renderReportMetaGrid(metadata);
    const renderedSections = safeArray(sections)
        .filter((section) => section?.html)
        .map((section) => `
            <div class="report-entity-section">
                <h4 class="report-entity-section-title">${escapeHtml(section.title || '')}</h4>
                ${section.html}
            </div>
        `)
        .join('');

    return `
        <article class="report-entity-card">
            <div class="report-entity-header">
                <div class="report-entity-headings">
                    ${eyebrow ? `<p class="report-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
                    <h3 class="report-entity-title">${escapeHtml(title || 'Untitled')}</h3>
                    ${summary ? `<p class="report-entity-summary">${escapeHtml(summary)}</p>` : ''}
                </div>
                ${renderReportBadgeGroup(badges)}
            </div>
            ${renderedMetadata}
            ${renderedSections}
        </article>
    `;
}

function renderReportEntityCollection(cards = [], emptyMessage = 'No records were captured for this section.') {
    if (!safeArray(cards).length) {
        return `<p class="report-empty">${escapeHtml(emptyMessage)}</p>`;
    }

    return `
        <div class="report-entity-stack">
            ${cards.join('')}
        </div>
    `;
}

function renderReportContentsList(items = []) {
    const visibleItems = safeArray(items).filter((item) => hasReportValue(item?.title));
    if (!visibleItems.length) {
        return '';
    }

    return `
        <ol class="report-contents-list">
            ${visibleItems.map((item, index) => `
                <li class="report-contents-item">
                    <div class="report-contents-row">
                        <span class="report-contents-index">${index + 1}.</span>
                        <span class="report-contents-title">${escapeHtml(item.title || '')}</span>
                    </div>
                    ${item.description
                        ? `<p class="report-contents-description">${escapeHtml(item.description)}</p>`
                        : ''}
                </li>
            `).join('')}
        </ol>
    `;
}

function formatActorLabel(actor = {}) {
    return [
        actor.actor_pseudonym,
        actor.actor_role,
        actor.actor_team
    ].filter((entry) => hasReportValue(entry)).join(' / ');
}

function formatEntityLabel(entity = {}) {
    return [
        entity.entity_type,
        entity.entity_id
    ].filter((entry) => hasReportValue(entry)).join(' / ');
}

function formatStateDelta(beforeState, afterState) {
    const beforeLabel = hasReportValue(beforeState) ? formatReportValue(beforeState, '') : '';
    const afterLabel = hasReportValue(afterState) ? formatReportValue(afterState, '') : '';

    if (beforeLabel && afterLabel) {
        return `${beforeLabel} -> ${afterLabel}`;
    }

    return afterLabel || beforeLabel || 'N/A';
}

export function buildResearchReportHtml(dataset, {
    includeNotesAppendix = false
} = {}) {
    const sessionMetrics = dataset.derivedSessionMetrics[0] || {};
    const manifest = safeObject(dataset.manifest);
    const sessionConfigSnapshot = safeObject(manifest.session_config_snapshot);
    const gameState = safeObject(sessionConfigSnapshot.game_state);
    const sessionMetadata = safeObject(dataset.session?.metadata);
    const adjudicationByTargetId = new Map(
        safeArray(dataset.adjudicationContent).map((entry) => [entry.target_entity_id, entry])
    );
    const eventTypeCounts = safeArray(dataset.eventLog).reduce((counts, event) => {
        const eventType = event?.event_type || 'unknown';
        counts.set(eventType, (counts.get(eventType) || 0) + 1);
        return counts;
    }, new Map());
    const rowCountRows = Object.entries(safeObject(manifest.row_counts))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [humanizeReportLabel(key), String(value)]);
    const participantRosterRows = safeArray(dataset.participants).map((participant) => [
        participant.participant_pseudonym || '',
        participant.role || '',
        participant.team || '',
        participant.seat_index === null || participant.seat_index === undefined ? '' : String(participant.seat_index),
        formatReportTimestamp(participant.first_seen_utc),
        formatReportTimestamp(participant.last_seen_utc),
        formatReportDuration(participant.active_duration_s),
        participant.rejoin_count === null || participant.rejoin_count === undefined ? '' : String(participant.rejoin_count)
    ]);
    const participantMetricRows = dataset.derivedParticipantMetrics.map((participant) => [
        participant.participant_pseudonym || '',
        participant.role || '',
        participant.team || '',
        String(participant.events_count || 0),
        String(participant.notes_count || 0),
        String(participant.note_edits_count || 0),
        String(participant.drafts_count || 0),
        String(participant.submissions_count || 0),
        formatReportDuration(participant.mean_time_to_submit_s),
        formatReportDuration(participant.mean_response_latency_s),
        formatReportDuration(participant.active_duration_s),
        String(participant.disconnect_count || 0)
    ]);
    const dataQualityRows = dataset.dataQualityEvents.map((event) => [
        event.team || 'unknown',
        event.event_type || 'event',
        formatReportTimestamp(event.occurred_utc),
        formatReportDuration(event.gap_seconds),
        formatReportValue(event.detail)
    ]);
    const transitionRows = dataset.stateTransitions
        .slice()
        .sort((left, right) => new Date(left.transition_utc).getTime() - new Date(right.transition_utc).getTime())
        .map((transition) => [
            formatReportTimestamp(transition.transition_utc),
            transition.entity_type || '',
            transition.entity_id || '',
            transition.from_state || '',
            transition.to_state || '',
            transition.actor_role || '',
            transition.recipient_team || '',
            transition.move_number === null || transition.move_number === undefined ? '' : String(transition.move_number),
            formatReportDuration(transition.dwell_in_from_s)
        ]);
    const eventLogRows = safeArray(dataset.eventLog)
        .slice()
        .sort((left, right) => new Date(left.event_ts_utc).getTime() - new Date(right.event_ts_utc).getTime())
        .map((event) => [
            formatReportTimestamp(event.event_ts_utc),
            formatActorLabel(event),
            event.event_type || '',
            formatEntityLabel(event),
            event.move_number === null || event.move_number === undefined ? '' : String(event.move_number),
            formatStateDelta(event.before_state, event.after_state),
            formatReportValue(event.payload)
        ]);
    const draftRevisionRows = safeArray(dataset.draftRevisions).map((draft) => [
        draft.author_pseudonym || '',
        draft.artifact_type || '',
        draft.artifact_id || '',
        draft.move_number === null || draft.move_number === undefined ? '' : String(draft.move_number),
        draft.action_sequence === null || draft.action_sequence === undefined ? '' : String(draft.action_sequence),
        draft.revision_number === null || draft.revision_number === undefined ? '' : String(draft.revision_number),
        draft.status || '',
        draft.wizard_page_reached === null || draft.wizard_page_reached === undefined ? '' : String(draft.wizard_page_reached),
        formatReportTimestamp(draft.created_utc),
        formatReportTimestamp(draft.submitted_utc),
        formatReportDuration(draft.time_to_submit_s),
        formatReportValue(draft.content_snapshot)
    ]);
    const communicationRows = safeArray(dataset.interactionEdges).map((edge) => [
        edge.communication_type || edge.channel || '',
        edge.source_team || '',
        edge.target_team || '',
        edge.direction || '',
        edge.move_number === null || edge.move_number === undefined ? '' : String(edge.move_number),
        formatReportTimestamp(edge.occurred_utc),
        formatReportDuration(edge.latency_s)
    ]);
    const notesSummaryRows = dataset.notes.map((note) => [
        note.author_pseudonym || '',
        note.author_role || '',
        note.author_team || '',
        note.scope || '',
        note.visibility || '',
        note.move_number === null || note.move_number === undefined ? '' : String(note.move_number),
        formatReportTimestamp(note.created_utc),
        String(note.content_length_chars || 0),
        String(note.edit_count || 0)
    ]);
    const notesRows = dataset.notes.map((note) => [
        note.author_pseudonym || '',
        note.author_role || '',
        note.author_team || '',
        formatReportTimestamp(note.created_utc),
        note.content_text || ''
    ]);
    const decisionLineageRows = safeArray(dataset.decisionLineage).map((lineage) => [
        lineage.root_entity_type || '',
        lineage.root_entity_id || '',
        lineage.move_number === null || lineage.move_number === undefined ? '' : String(lineage.move_number),
        lineage.source_team || '',
        lineage.current_state || '',
        formatReportTimestamp(lineage.submitted_utc || lineage.created_utc),
        formatReportTimestamp(lineage.reviewed_utc),
        formatReportValue(lineage.related_event_ids, ''),
        lineage.evidence_summary || ''
    ]);
    const dataQualitySummary = safeObject(dataset.dataQualitySummary);
    const readinessSummary = safeObject(dataQualitySummary.quantitative_comparison_readiness);
    const tableCoverageRows = safeArray(safeObject(dataQualitySummary.coverage).table_coverage).map((entry) => [
        entry.table_name || '',
        String(entry.rows ?? 0),
        entry.source || '',
        entry.status || '',
        entry.critical ? 'Yes' : 'No'
    ]);
    const scenarioContext = safeObject(dataset.scenarioContext);
    const scenarioRuntime = safeObject(scenarioContext.runtime);
    const scenarioExerciseStructure = safeObject(scenarioContext.exercise_structure);
    const scenarioMessageRows = safeArray(scenarioContext.scenario_messages).map((message) => [
        message.type || '',
        message.to_role || '',
        message.move_number === null || message.move_number === undefined ? '' : String(message.move_number),
        formatReportTimestamp(message.occurred_utc),
        message.content_excerpt || ''
    ]);
    const outcomeTaxonomyRows = safeArray(dataset.outcomeTaxonomy).slice(0, 80).map((row) => [
        row.dimension || '',
        row.signal || '',
        row.entity_type || '',
        row.entity_id || '',
        row.move_number === null || row.move_number === undefined ? '' : String(row.move_number),
        row.source_team || '',
        formatReportValue(row.keyword_hits, ''),
        row.evidence_excerpt || ''
    ]);
    const trainingRubricRows = safeArray(dataset.trainingRubric).slice(0, 80).map((row) => [
        row.participant_pseudonym || '',
        row.role || '',
        row.team || '',
        row.dimension || '',
        formatReportValue(row.evidence_value, ''),
        row.threshold || '',
        row.status || ''
    ]);
    const networkMetricRows = safeArray(dataset.networkMetrics).slice(0, 80).map((row) => [
        row.metric_name || '',
        row.source_team || '',
        row.target_team || '',
        formatReportValue(row.metric_value, ''),
        row.unit || '',
        formatReportValue(row.evidence_edge_ids, '')
    ]);
    const turningPointRows = safeArray(dataset.turningPoints).map((row) => [
        row.turning_point_type || '',
        formatReportTimestamp(row.occurred_utc),
        row.move_number === null || row.move_number === undefined ? '' : String(row.move_number),
        row.entity_type || '',
        row.entity_id || '',
        row.team || '',
        row.evidence_summary || ''
    ]);
    const actionCards = dataset.actionContent.map((action) => {
        const adjudication = adjudicationByTargetId.get(action.action_id);
        const details = safeObject(safeObject(action.full_content).details);

        return renderReportEntityCard({
            eyebrow: `Move ${action.move_number ?? 'N/A'}${action.action_sequence ? ` - Action ${action.action_sequence}` : ''}`,
            title: action.title || 'Untitled action',
            summary: action.intent_text || safeObject(action.full_content).goal || '',
            badges: [
                { label: action.author_team || 'team', tone: 'accent' },
                { label: action.final_status || 'pending', tone: 'success' },
                { label: action.action_type || 'unspecified', tone: 'muted' }
            ],
            metadata: [
                { label: 'Author', value: `${action.author_pseudonym || 'N/A'} / ${action.author_role || 'unknown'}` },
                { label: 'Submitted', value: formatReportTimestamp(action.submitted_utc) },
                { label: 'Targets', value: action.targets },
                { label: 'Instrument Of Power', value: action.instruments },
                { label: 'Resources Committed', value: action.resources_committed }
            ],
            sections: [
                {
                    title: 'Action Detail',
                    html: renderReportMetaGrid([
                        { label: 'Goal', value: safeObject(action.full_content).goal },
                        { label: 'Sector', value: safeObject(action.full_content).sector },
                        { label: 'Supply Chain Focus', value: safeObject(action.full_content).exposure_type },
                        { label: 'Expected Outcomes', value: safeObject(action.full_content).expected_outcomes },
                        { label: 'Levers', value: details.levers },
                        { label: 'Sectors', value: details.sectors },
                        { label: 'Implementation', value: details.implementation },
                        { label: 'Legislative Options', value: details.legislativeOptions },
                        { label: 'Focus Countries', value: details.focusCountries },
                        { label: 'Enforcement Timeline', value: details.enforcementTimeline },
                        { label: 'Coordinated With', value: details.coordinated },
                        { label: 'Informed Parties', value: details.informed }
                    ])
                },
                adjudication
                    ? {
                        title: 'Adjudication',
                        html: renderReportMetaGrid([
                            { label: 'Ruling', value: adjudication.ruling },
                            { label: 'Reasoning', value: adjudication.reasoning },
                            { label: 'Adjudicated UTC', value: formatReportTimestamp(adjudication.adjudicated_utc) },
                            { label: 'Effects', value: adjudication.effects }
                        ])
                    }
                    : null
            ].filter(Boolean)
        });
    });
    const proposalCards = dataset.proposalContent.map((proposal) => {
        const details = safeObject(safeObject(proposal.full_content).proposal_details);

        return renderReportEntityCard({
            eyebrow: `Move ${proposal.move_number ?? 'N/A'} - Proposal`,
            title: proposal.title || 'Untitled proposal',
            summary: proposal.proposal_text || safeObject(proposal.full_content).goal || '',
            badges: [
                { label: proposal.author_team || 'team', tone: 'accent' },
                { label: proposal.review_decision || 'pending review', tone: 'success' },
                { label: proposal.final_recipient_state || proposal.intended_recipient_team || 'awaiting recipient', tone: 'muted' }
            ],
            metadata: [
                { label: 'Author', value: `${proposal.author_pseudonym || 'N/A'} / ${proposal.author_role || 'unknown'}` },
                { label: 'Intended Recipient', value: proposal.intended_recipient_team },
                { label: 'Forwarded To', value: proposal.forwarded_to_team },
                { label: 'Submitted', value: formatReportTimestamp(proposal.submitted_utc) },
                { label: 'Reviewed', value: formatReportTimestamp(proposal.reviewed_utc) }
            ],
            sections: [
                {
                    title: 'Proposal Detail',
                    html: renderReportMetaGrid([
                        { label: 'Objective', value: proposal.proposal_text },
                        { label: 'Requested Action', value: proposal.requested_action },
                        { label: 'Rationale', value: proposal.rationale },
                        { label: 'Originators', value: details.originators },
                        { label: 'Category', value: details.category },
                        { label: 'Intended Partners', value: details.intendedPartners },
                        { label: 'Focus Sector', value: details.focusSector || safeObject(proposal.full_content).focusSector },
                        { label: 'Delivery', value: details.delivery },
                        { label: 'Timing And Conditions', value: details.timingAndConditions },
                        { label: 'Expected Outcomes', value: safeObject(proposal.full_content).expected_outcomes }
                    ])
                },
                {
                    title: 'Review Outcome',
                    html: renderReportMetaGrid([
                        { label: 'Review Decision', value: proposal.review_decision },
                        { label: 'Review Reason', value: proposal.review_reason },
                        { label: 'Reviewer', value: proposal.reviewer_pseudonym },
                        { label: 'Final Recipient State', value: proposal.final_recipient_state }
                    ])
                }
            ]
        });
    });
    const moveResponseCards = dataset.moveResponseContent.map((response) => {
        const details = safeObject(safeObject(response.full_content).details);

        return renderReportEntityCard({
            eyebrow: `Move ${response.move_number ?? 'N/A'} - Move response`,
            title: safeObject(response.full_content).goal || 'Untitled response',
            summary: response.response_text || '',
            badges: [
                { label: response.author_team || 'team', tone: 'accent' },
                { label: response.review_state || 'submitted', tone: 'success' },
                { label: response.posture || 'posture not set', tone: 'muted' }
            ],
            metadata: [
                { label: 'Author', value: `${response.author_pseudonym || 'N/A'} / ${response.author_role || 'unknown'}` },
                { label: 'Submitted', value: formatReportTimestamp(response.submitted_utc) },
                { label: 'Responding To', value: response.responding_to_entity_type }
            ],
            sections: [
                {
                    title: 'Response Detail',
                    html: renderReportMetaGrid([
                        { label: 'Strategic Assessment', value: response.rationale || details.strategicAssessment },
                        { label: 'Response Strategy', value: response.posture || details.responseStrategy },
                        { label: 'Key Actions', value: response.response_text || details.keyActions },
                        { label: 'Targets And Pressure Points', value: details.targetsAndPressurePoints },
                        { label: 'Delivery Channel', value: details.deliveryChannel },
                        { label: 'Expected Effect', value: safeObject(response.full_content).expected_outcomes }
                    ])
                }
            ]
        });
    });
    const rfiCards = dataset.rfiContent.map((rfi) => renderReportEntityCard({
        eyebrow: `Move ${rfi.move_number ?? 'N/A'} - RFI`,
        title: rfi.requester_team ? `${humanizeReportLabel(rfi.requester_team)} team request` : 'Request for information',
        summary: rfi.question_text || '',
        badges: [
            { label: rfi.requester_team || 'team', tone: 'accent' },
            { label: rfi.status || 'pending', tone: 'success' }
        ],
        metadata: [
            { label: 'Requester', value: `${rfi.requester_pseudonym || 'N/A'} / ${rfi.requester_role || 'unknown'}` },
            { label: 'Raised UTC', value: formatReportTimestamp(rfi.raised_utc) },
            { label: 'Answered UTC', value: formatReportTimestamp(rfi.answered_utc) }
        ],
        sections: [
            {
                title: 'Exchange',
                html: renderReportMetaGrid([
                    { label: 'Question', value: rfi.question_text },
                    { label: 'Answer', value: rfi.answer_text },
                    { label: 'Answered By', value: rfi.answered_by_pseudonym }
                ])
            }
        ]
    }));
    const topEventCards = [...eventTypeCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 6)
        .map(([eventType, count]) => ({
            label: humanizeReportLabel(eventType),
            value: count,
            detail: 'events'
        }));
    const sessionDisplayName = dataset.session?.name || dataset.session?.id || 'Session report';
    const EVENT_LOG_DISPLAY_LIMIT = 200;
    const totalEventLogRows = eventLogRows.length;
    const eventLogTruncated = totalEventLogRows > EVENT_LOG_DISPLAY_LIMIT;
    const displayedEventLogRows = eventLogTruncated
        ? eventLogRows.slice(0, EVENT_LOG_DISPLAY_LIMIT)
        : eventLogRows;
    const teamActivityOrder = ['blue', 'red', 'green', 'whitecell', 'gamemaster'];
    const teamActivityMap = new Map();
    const ensureTeamActivity = (team) => {
        const key = String(team || '').trim().toLowerCase() || 'unassigned';
        if (!teamActivityMap.has(key)) {
            teamActivityMap.set(key, {
                team: key,
                participants: 0,
                actions: 0,
                proposals: 0,
                responses: 0,
                rfis: 0,
                notes: 0
            });
        }
        return teamActivityMap.get(key);
    };
    safeArray(dataset.participants).forEach((participant) => { ensureTeamActivity(participant.team).participants += 1; });
    safeArray(dataset.actionContent).forEach((action) => { ensureTeamActivity(action.author_team).actions += 1; });
    safeArray(dataset.proposalContent).forEach((proposal) => { ensureTeamActivity(proposal.author_team).proposals += 1; });
    safeArray(dataset.moveResponseContent).forEach((response) => { ensureTeamActivity(response.author_team).responses += 1; });
    safeArray(dataset.rfiContent).forEach((rfi) => { ensureTeamActivity(rfi.requester_team).rfis += 1; });
    safeArray(dataset.notes).forEach((note) => { ensureTeamActivity(note.author_team).notes += 1; });
    const teamActivityRows = [...teamActivityMap.values()]
        .sort((left, right) => {
            const leftRank = teamActivityOrder.indexOf(left.team);
            const rightRank = teamActivityOrder.indexOf(right.team);
            return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank)
                || left.team.localeCompare(right.team);
        })
        .map((row) => [
            humanizeReportLabel(row.team),
            String(row.participants),
            String(row.actions),
            String(row.proposals),
            String(row.responses),
            String(row.rfis),
            String(row.notes)
        ]);
    const executiveSummaryText = `This post-game analysis reconstructs ${sessionDisplayName}${manifest.capture_mode ? `, captured in ${humanizeReportLabel(manifest.capture_mode)} mode` : ''}. The session spans ${formatReportDuration(sessionMetrics.session_duration_s, 'an unrecorded duration')} across ${formatReportValue(sessionMetrics.moves_count ?? 0, '0')} move(s), with ${formatReportValue(sessionMetrics.participants_active ?? 0, '0')} active participant seat(s) generating ${formatReportValue(sessionMetrics.total_events ?? 0, '0')} logged events. Teams submitted ${formatReportValue(sessionMetrics.actions_submitted ?? 0, '0')} action(s) (${formatReportValue(sessionMetrics.actions_adjudicated ?? 0, '0')} adjudicated) and ${formatReportValue(sessionMetrics.proposals_submitted ?? 0, '0')} proposal(s) (${formatReportValue(sessionMetrics.proposals_forwarded ?? 0, '0')} forwarded), and raised ${formatReportValue(sessionMetrics.rfis_raised ?? 0, '0')} request(s) for information.`;
    const contentsItems = [
        {
            title: 'Executive Summary',
            description: 'Narrative overview of session scale with headline indicators and per-team activity.'
        },
        {
            title: 'Session Snapshot',
            description: 'Session identity, runtime state, declared configuration, and archive-level metrics.'
        },
        {
            title: 'Participants And Seat Activity',
            description: 'De-identified participant roster, seat timing, and derived engagement metrics.'
        },
        {
            title: 'Event Log Chronology',
            description: 'Ordered event stream with actor, entity, move, state change, and payload summary.'
        },
        {
            title: 'State Transition Ledger',
            description: 'Lifecycle transitions reconstructed for actions, proposals, responses, and RFIs.'
        },
        {
            title: 'Decision Lineage',
            description: 'Trace rows linking submitted artifacts to review, communications, RFIs, and event evidence.'
        },
        {
            title: 'Research Utility Layers',
            description: 'Derived outcome taxonomy, training rubric evidence, network metrics, and turning-point flags.'
        },
        {
            title: 'Draft And Submission History',
            description: 'Draft revision path, wizard progress, and time-to-submit evidence.'
        },
        {
            title: 'Actions And Adjudications',
            description: 'Detailed Blue-team action records paired with White Cell rulings and effects.'
        },
        {
            title: 'Proposals: Content And Review',
            description: 'Green-team proposal records, routing intent, review rationale, and recipient outcomes.'
        },
        {
            title: 'Move Responses',
            description: 'Red-team move-response records, posture, rationale, and submitted detail.'
        },
        {
            title: 'Requests For Information',
            description: 'Question-and-answer exchanges between team facilitators and White Cell.'
        },
        {
            title: 'Communications And Interaction Summary',
            description: 'Cross-team communication flows, response latency, and interaction counts.'
        },
        {
            title: 'Notes And Observation Capture',
            description: 'Structured note summary plus optional appendix of note content.'
        },
        {
            title: 'Data Quality And Export Integrity',
            description: 'Observed disconnects/gaps and the integrity fields used to verify the export.'
        }
    ];

    return `
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(sessionDisplayName)} — Post-Game Analysis Report</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&family=Inter:wght@400;500;600;700;800&display=swap">
    <style>
        @page {
            size: A4;
            margin: 20mm 18mm 18mm;
            @top-left {
                content: "Fractured Order";
                font-family: "Inter", "Segoe UI", Arial, sans-serif;
                font-size: 8pt;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                color: #97a0ac;
            }
            @top-right {
                content: "Post-Game Analysis Report";
                font-family: "Inter", "Segoe UI", Arial, sans-serif;
                font-size: 8pt;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                color: #97a0ac;
            }
            @bottom-left {
                content: "";
            }
            @bottom-center {
                content: "";
            }
            @bottom-right {
                content: "";
            }
        }

        @page :first {
            @top-left { content: ""; }
            @top-right { content: ""; }
        }

        :root {
            --report-ink: #1f2933;
            --report-muted: #52606d;
            --report-rule: #d9dee5;
            --report-rule-strong: #9aa5b1;
            --report-accent: #243b53;
            --report-surface: #f7f9fb;
            --report-surface-strong: #eef2f6;
            --report-success: #1f6f4a;
        }

        * {
            box-sizing: border-box;
        }

        html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: var(--report-ink);
            font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            line-height: 1.5;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
        }

        body {
            padding: 24px;
        }

        .no-print {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 14px;
            border: 1px solid var(--report-accent);
            border-radius: 0;
            background: #ffffff;
            color: var(--report-accent);
            cursor: pointer;
            font: inherit;
            font-weight: 600;
        }

        .report-root {
            max-width: 980px;
            margin: 0 auto;
            background: #ffffff;
        }

        .report-cover {
            padding: 0 0 18px;
            border-bottom: 2px solid var(--report-accent);
        }

        .report-section {
            margin-top: 26px;
            padding-top: 4px;
        }

        .report-title {
            margin: 8px 0 10px;
            font-size: 34px;
            line-height: 1.1;
            font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            font-weight: 700;
        }

        .report-subtitle,
        .report-muted,
        .report-empty {
            color: var(--report-muted);
        }

        .report-subtitle {
            margin: 0;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--report-accent);
        }

        .report-cover-grid,
        .report-meta-grid {
            display: grid;
            gap: 16px;
        }

        .report-cover-grid {
            grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
            align-items: end;
            gap: 24px;
        }

        .report-summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
        }

        .report-summary-card,
        .report-meta-item,
        .report-outline,
        .report-block,
        .report-entity-card {
            border-radius: 0;
        }

        .report-summary-card {
            padding: 14px 14px 12px;
            border: 1px solid var(--report-rule);
            background: #ffffff;
        }

        .report-summary-label {
            margin: 0;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: var(--report-muted);
        }

        .report-summary-value {
            margin: 8px 0 4px;
            font-size: 22px;
            line-height: 1.15;
            font-weight: 700;
        }

        .report-summary-detail {
            margin: 0;
            font-size: 12px;
            color: var(--report-muted);
        }

        .report-outline {
            padding: 16px 18px;
            border: 1px solid var(--report-rule);
            background: #ffffff;
        }

        .report-outline .report-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .report-outline-title {
            margin: 0 0 10px;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--report-accent);
        }

        .report-contents-list {
            margin: 0;
            padding-left: 18px;
            display: grid;
            gap: 8px;
            font-size: 13px;
        }

        .report-contents-item {
            margin: 0;
        }

        .report-contents-row {
            display: flex;
            gap: 8px;
            align-items: baseline;
        }

        .report-contents-index {
            min-width: 18px;
            font-weight: 700;
            color: var(--report-accent);
        }

        .report-contents-title {
            font-weight: 600;
        }

        .report-contents-description {
            margin: 4px 0 0 26px;
            font-size: 12px;
            color: var(--report-muted);
        }

        .report-badge-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .report-badge {
            display: inline-flex;
            align-items: center;
            padding: 3px 8px;
            border-radius: 0;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            border: 1px solid var(--report-rule);
            background: #ffffff;
            color: var(--report-accent);
        }

        .report-badge--accent {
            color: var(--report-accent);
        }

        .report-badge--success {
            color: var(--report-success);
        }

        .report-badge--muted {
            color: var(--report-muted);
        }

        .report-section-title {
            margin: 0;
            font-size: 24px;
            font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            font-weight: 700;
        }

        .report-section-intro {
            margin: 8px 0 0;
            font-size: 13px;
            color: var(--report-muted);
        }

        .report-section-header {
            margin-bottom: 16px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--report-rule-strong);
        }

        .report-meta-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .report-meta-item {
            padding: 12px 14px;
            background: #ffffff;
            border: 1px solid var(--report-rule);
        }

        .report-meta-item dt {
            margin: 0 0 6px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--report-muted);
        }

        .report-meta-item dd {
            margin: 0;
            font-size: 13px;
            white-space: pre-wrap;
        }

        .report-block {
            margin-top: 18px;
            padding: 16px;
            background: #ffffff;
            border: 1px solid var(--report-rule);
        }

        .report-block-title,
        .report-entity-section-title {
            margin: 0 0 12px;
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--report-accent);
        }

        .report-entity-stack {
            display: grid;
            gap: 18px;
        }

        .report-entity-card {
            padding: 18px;
            border: 1px solid var(--report-rule);
            background: #ffffff;
        }

        .report-entity-header {
            display: block;
            margin-bottom: 14px;
        }

        .report-eyebrow {
            margin: 0 0 6px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--report-muted);
        }

        .report-entity-title {
            margin: 0;
            font-size: 20px;
            line-height: 1.2;
            font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            font-weight: 700;
        }

        .report-entity-summary {
            margin: 8px 0 0;
            color: var(--report-muted);
            font-size: 13px;
        }

        .report-entity-section + .report-entity-section {
            margin-top: 16px;
        }

        .report-table-wrap {
            border: 1px solid var(--report-rule);
            overflow: hidden;
        }

        .report-table {
            width: 100%;
            border-collapse: collapse;
            background: #ffffff;
            table-layout: fixed;
        }

        .report-table th,
        .report-table td {
            border: 1px solid var(--report-rule);
            padding: 8px 10px;
            vertical-align: top;
            text-align: left;
            font-size: 12px;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
        }

        .report-table th {
            background: var(--report-surface-strong);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--report-accent);
        }

        .report-table tbody tr:nth-child(even) td {
            background: var(--report-surface);
        }

        @media screen and (max-width: 820px) {
            .report-cover-grid,
            .report-summary-grid,
            .report-meta-grid {
                grid-template-columns: 1fr;
            }

            body {
                padding: 16px;
            }
        }

        /* ============================================================
           Professional document layer (overrides the base rules above)
           ============================================================ */
        :root {
            --report-ink: #1b2430;
            --report-muted: #5b6573;
            --report-faint: #97a0ac;
            --report-rule: #e2e6ea;
            --report-rule-strong: #c5ccd4;
            --report-accent: #16314f;
            --report-accent-soft: #3f628a;
            --report-surface: #f6f8fa;
            --report-surface-strong: #edf1f5;
            --report-success: #1f6f4a;
        }

        html, body {
            font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            color: var(--report-ink);
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility;
        }

        body {
            background: #eef0f3;
            padding: 32px 16px;
        }

        .report-root {
            max-width: 820px;
            margin: 0 auto;
            background: #ffffff;
        }

        @media screen {
            .report-root {
                padding: 56px 60px 72px;
                box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 18px 48px rgba(16, 24, 40, 0.10);
            }
        }

        /* Floating print / save control (screen only) */
        .no-print {
            position: fixed;
            top: 20px;
            right: 24px;
            z-index: 50;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            border: 1px solid var(--report-accent);
            border-radius: 7px;
            background: var(--report-accent);
            color: #ffffff;
            padding: 10px 16px;
            font: inherit;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 8px 22px rgba(16, 49, 79, 0.28);
        }

        /* Section auto-numbering */
        #report-source { counter-reset: report-section; }
        .report-section { counter-increment: report-section; }
        .report-section > .report-section-header::before {
            content: "Section " counter(report-section, decimal-leading-zero);
            display: block;
            margin-bottom: 6px;
            font-size: 9px;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            font-weight: 700;
            color: var(--report-accent-soft);
        }

        /* Cover */
        .report-cover {
            position: relative;
            padding: 6px 0 30px;
            border-bottom: 2px solid var(--report-accent);
        }
        .report-cover-logos {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            padding-bottom: 22px;
            margin-bottom: 26px;
            border-bottom: 1px solid var(--report-rule);
        }
        .report-logo { width: auto; max-width: 48%; display: block; }
        .report-logo--ssg { height: 120px; }
        .report-page-count-grid {
            margin-top: 10px;
            max-width: 240px;
        }
        .report-total-pages::after {
            content: counter(pages);
        }
        .report-print-footer {
            display: none;
        }
        .report-print-footer-page::after {
            content: counter(page);
        }
        .report-print-footer-dot {
            color: #bd5a39;
        }
        .report-simulation {
            margin: 0 0 4px;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: var(--report-accent);
        }
        .report-cover-grid { align-items: start; gap: 28px; }
        .report-classification {
            margin: 0 0 16px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: #9b3b2f;
        }
        .report-title {
            font-size: 38px;
            line-height: 1.07;
            letter-spacing: -0.022em;
            font-weight: 800;
            margin: 6px 0 14px;
            color: var(--report-ink);
        }
        .report-subtitle { font-size: 11px; letter-spacing: 0.18em; }
        .report-muted { color: var(--report-muted); }
        .report-cover > div > .report-muted { max-width: 56ch; font-size: 13.5px; }

        /* Section headers */
        .report-section + .report-section,
        .report-toc { margin-top: 40px; }
        .report-section-header {
            margin-bottom: 18px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--report-rule-strong);
        }
        .report-section-title {
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.012em;
            color: var(--report-accent);
        }
        .report-section-intro {
            margin-top: 8px;
            font-size: 12.5px;
            line-height: 1.55;
            max-width: 80ch;
        }

        /* Table of contents */
        .report-contents-list {
            padding-left: 0;
            list-style: none;
            gap: 0;
            font-size: 14px;
        }
        .report-contents-item {
            padding: 13px 2px;
            border-bottom: 1px solid var(--report-rule);
        }
        .report-contents-item:first-child { border-top: 1px solid var(--report-rule); }
        .report-contents-index {
            min-width: 30px;
            font-variant-numeric: tabular-nums;
            color: var(--report-accent);
            font-weight: 700;
        }
        .report-contents-title { font-weight: 600; font-size: 14px; color: var(--report-ink); }
        .report-contents-description { margin: 5px 0 0 38px; font-size: 12px; }

        /* Narrative + notices */
        .report-lede { font-size: 14.5px; line-height: 1.62; margin: 0 0 22px; color: var(--report-ink); }
        .report-note {
            margin: 16px 0;
            padding: 11px 15px;
            border-left: 3px solid var(--report-accent-soft);
            background: var(--report-surface);
            font-size: 12px;
            color: var(--report-muted);
        }

        /* Summary cards */
        .report-summary-grid { gap: 14px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        .report-summary-card {
            padding: 16px;
            border: 1px solid var(--report-rule);
            border-radius: 8px;
            background: #ffffff;
        }
        .report-summary-label { font-size: 10px; letter-spacing: 0.07em; color: var(--report-faint); }
        .report-summary-value {
            font-size: 24px;
            line-height: 1.15;
            font-weight: 700;
            letter-spacing: -0.015em;
            font-variant-numeric: tabular-nums;
            overflow-wrap: anywhere;
            color: var(--report-accent);
        }
        .report-summary-detail { font-size: 11.5px; }

        /* Cover outline aside */
        .report-outline {
            border: 1px solid var(--report-rule);
            border-radius: 10px;
            background: var(--report-surface);
            padding: 18px 20px;
        }
        .report-outline-title { color: var(--report-accent); }
        .report-outline .report-meta-grid { grid-template-columns: 1fr; }

        /* Definition / metadata grid */
        .report-meta-grid { gap: 0; border-top: 1px solid var(--report-rule); }
        .report-meta-item {
            border: none;
            border-bottom: 1px solid var(--report-rule);
            padding: 11px 16px 11px 0;
            background: transparent;
        }
        .report-meta-item dt { font-size: 10px; letter-spacing: 0.07em; color: var(--report-faint); }
        .report-meta-item dd { font-size: 13px; color: var(--report-ink); line-height: 1.5; }

        /* Content blocks */
        .report-block {
            border: 1px solid var(--report-rule);
            border-radius: 10px;
            padding: 18px 20px;
            margin-top: 20px;
        }
        .report-block-title, .report-entity-section-title {
            font-size: 11px;
            letter-spacing: 0.08em;
            color: var(--report-accent-soft);
            margin-bottom: 14px;
        }

        /* Entity cards */
        .report-entity-stack { gap: 20px; }
        .report-entity-card {
            border: 1px solid var(--report-rule);
            border-radius: 10px;
            padding: 22px;
            background: #ffffff;
        }
        .report-entity-header {
            border-bottom: 1px solid var(--report-rule);
            padding-bottom: 14px;
            margin-bottom: 16px;
        }
        .report-eyebrow { color: var(--report-accent-soft); }
        .report-entity-title { font-size: 18px; font-weight: 700; letter-spacing: -0.012em; color: var(--report-ink); }
        .report-entity-summary { font-size: 13px; line-height: 1.55; }

        /* Badges */
        .report-badge {
            border-radius: 999px;
            padding: 4px 11px;
            font-size: 9.5px;
            border: 1px solid var(--report-rule-strong);
            background: var(--report-surface);
        }
        .report-badge--accent { color: var(--report-accent); border-color: #c2d2e4; background: #eef3f9; }
        .report-badge--success { color: var(--report-success); border-color: #bfe0cd; background: #eef7f2; }
        .report-badge--muted { color: var(--report-muted); }

        /* Tables */
        .report-table-wrap { border: 1px solid var(--report-rule); border-radius: 10px; }
        .report-table th, .report-table td { border: none; border-bottom: 1px solid var(--report-rule); }
        .report-table th {
            background: var(--report-surface-strong);
            color: var(--report-accent);
            font-size: 10px;
            letter-spacing: 0.06em;
            border-bottom: 1px solid var(--report-rule-strong);
        }
        .report-table td { font-size: 11.5px; font-variant-numeric: tabular-nums; }
        .report-table tbody tr:last-child td { border-bottom: none; }
        .report-table tbody tr:nth-child(even) td { background: var(--report-surface); }

        .report-empty {
            padding: 16px;
            border: 1px dashed var(--report-rule-strong);
            border-radius: 8px;
            background: var(--report-surface);
            font-size: 13px;
            text-align: center;
            color: var(--report-muted);
        }

        /* ============================================================
           Print reset — declared last so it wins the cascade for A4
           ============================================================ */
        @media print {
            html, body {
                margin: 0;
                padding: 0;
                background: #ffffff;
            }

            .report-root {
                max-width: none;
                margin: 0;
                padding: 0;
                box-shadow: none;
            }

            .no-print {
                display: none !important;
            }

            .report-print-footer {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
                align-items: center;
                column-gap: 16px;
                position: fixed;
                left: 18mm;
                right: 18mm;
                bottom: 8mm;
                z-index: 999;
            }

            .report-print-footer-session,
            .report-print-footer-page {
                font-family: "Inter", "Segoe UI", Arial, sans-serif;
                font-size: 8pt;
                line-height: 1;
                color: #97a0ac;
            }

            .report-print-footer-session {
                justify-self: start;
                min-width: 0;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .report-print-footer-page {
                justify-self: center;
            }

            .report-print-footer-wordmark {
                justify-self: end;
                font-family: "Source Serif 4", ui-serif, Georgia, serif;
                font-weight: 500;
                font-size: 0.9375rem;
                line-height: 1;
                letter-spacing: -0.025em;
                color: #1d1d1f;
            }

            /* Start each major part on a fresh page */
            .report-toc,
            .report-section {
                break-before: page;
                page-break-before: always;
            }

            /* Keep self-contained blocks together, but NEVER trap a long
               table inside an unbreakable, clipping wrapper. */
            .report-summary-card,
            .report-meta-item,
            .report-block,
            .report-entity-card,
            .report-outline {
                break-inside: avoid;
                page-break-inside: avoid;
            }

            .report-table-wrap {
                overflow: visible;
                border-radius: 0;
                break-inside: auto;
                page-break-inside: auto;
            }

            .report-table thead { display: table-header-group; }
            .report-table tr {
                break-inside: avoid;
                page-break-inside: avoid;
            }

            /* Preserve fills/colors when printing */
            * {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <button type="button" class="no-print" onclick="window.print()">Print / Save as PDF</button>
    <div class="report-print-footer" aria-hidden="true">
        <span class="report-print-footer-session">${escapeHtml(sessionDisplayName)}</span>
        <span class="report-print-footer-page"></span>
        <span class="report-print-footer-wordmark">Plenum<span class="report-print-footer-dot">.</span></span>
    </div>
    <div class="report-root" id="report-source">
        <section class="report-cover">
            <div class="report-cover-logos">
                <img class="report-logo report-logo--ssg" src="${SSG_LOGO_DATA_URI}" alt="W&M Statecraft Simulations Group">
            </div>
            <p class="report-classification">Confidential · For Authorized Post-Game Review</p>
            <p class="report-simulation">${escapeHtml(SIMULATION_NAME)}</p>
            <p class="report-subtitle">Post-Game Analysis Report</p>
            <h1 class="report-title">${escapeHtml(sessionDisplayName)}</h1>
            <p class="report-muted">A structured reconstruction of session activity, decisions, communications, and data-integrity evidence prepared for post-session review.</p>
            <div style="margin-top: 18px;">
                ${renderReportMetaGrid([
                    { label: 'Session ID', value: dataset.session?.id || '' },
                    { label: 'Generated UTC', value: formatReportTimestamp(manifest.generated_at_utc) },
                    { label: 'Capture Mode', value: manifest.capture_mode || 'unknown' },
                    { label: 'Prepared By', value: manifest.generated_by_pseudonym }
                ])}
                <dl class="report-meta-grid report-page-count-grid" aria-label="Report page count">
                    <div class="report-meta-item">
                        <dt>Report Pages</dt>
                        <dd><span class="report-total-pages"></span></dd>
                    </div>
                </dl>
            </div>
            <h2 class="report-outline-title" style="margin-top: 24px;">Document Summary</h2>
            <div style="margin-top: 10px;">
                ${renderReportMetaGrid([
                    { label: 'Events Captured', value: sessionMetrics.total_events ?? 0 },
                    { label: 'Active Participants', value: sessionMetrics.participants_active ?? 0 },
                    { label: 'Moves Captured', value: sessionMetrics.moves_count ?? 0 },
                    { label: 'Session Duration', value: formatReportDuration(sessionMetrics.session_duration_s) },
                    { label: 'Mean Proposal Latency', value: formatReportDuration(sessionMetrics.mean_proposal_response_latency_s) },
                    { label: 'Actions Submitted', value: sessionMetrics.actions_submitted ?? 0 },
                    { label: 'Proposals Submitted', value: sessionMetrics.proposals_submitted ?? 0 },
                    { label: 'RFIs Raised', value: sessionMetrics.rfis_raised ?? 0 },
                    { label: 'Communications', value: sessionMetrics.communications_sent ?? 0 },
                    { label: 'Current Move', value: gameState.move },
                    { label: 'Current Phase', value: gameState.phase },
                    { label: 'Generated By', value: manifest.generated_by_pseudonym },
                    { label: 'Session Description', value: sessionMetadata.description }
                ])}
            </div>
        </section>

        <section class="report-toc">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Table Of Contents</h2>
                    <p class="report-section-intro">The report is organized into ${contentsItems.length} numbered sections. Each begins on a new page so findings can be referenced and printed independently.</p>
                </div>
            </div>
            ${renderReportContentsList(contentsItems)}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Executive Summary</h2>
                    <p class="report-section-intro">A narrative overview of session scale and the headline indicators that frame the detailed evidence in the sections that follow.</p>
                </div>
            </div>
            <p class="report-lede">${escapeHtml(executiveSummaryText)}</p>
            ${renderReportSummaryCards([
                { label: 'Events Logged', value: sessionMetrics.total_events ?? 0, detail: 'captured in export' },
                { label: 'Active Participants', value: sessionMetrics.participants_active ?? 0, detail: 'seats engaged' },
                { label: 'Moves Captured', value: sessionMetrics.moves_count ?? 0, detail: 'max move observed' },
                { label: 'Session Duration', value: formatReportDuration(sessionMetrics.session_duration_s), detail: 'event-log span' },
                { label: 'Actions Submitted', value: sessionMetrics.actions_submitted ?? 0, detail: `${sessionMetrics.actions_adjudicated ?? 0} adjudicated` },
                { label: 'Proposals Submitted', value: sessionMetrics.proposals_submitted ?? 0, detail: `${sessionMetrics.proposals_forwarded ?? 0} forwarded` },
                { label: 'RFIs Raised', value: sessionMetrics.rfis_raised ?? 0, detail: 'team requests' },
                { label: 'Mean Proposal Latency', value: formatReportDuration(sessionMetrics.mean_proposal_response_latency_s), detail: 'review response time' }
            ])}
            ${renderReportSectionBlock('Activity By Team', renderReportTable(
                ['Team', 'Participants', 'Actions', 'Proposals', 'Responses', 'RFIs', 'Notes'],
                teamActivityRows
            ))}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Session Snapshot</h2>
                    <p class="report-section-intro">Session identity, runtime state, declared configuration, and archive-level metrics used for post-game analysis.</p>
                </div>
            </div>
            ${renderReportMetaGrid([
                { label: 'Session Name', value: sessionConfigSnapshot.session_name || dataset.session?.name },
                { label: 'Session Code', value: sessionConfigSnapshot.session_code || sessionMetadata.session_code },
                { label: 'Session Status', value: dataset.session?.status },
                { label: 'Session Description', value: sessionMetadata.description },
                { label: 'Created UTC', value: formatReportTimestamp(dataset.session?.created_at) },
                { label: 'Updated UTC', value: formatReportTimestamp(dataset.session?.updated_at) },
                { label: 'Current Move', value: gameState.move },
                { label: 'Current Phase', value: gameState.phase },
                { label: 'Timer Seconds', value: formatReportDuration(gameState.timer_seconds) },
                { label: 'Timer Running', value: gameState.timer_running },
                { label: 'Manifest Generated UTC', value: formatReportTimestamp(manifest.generated_at_utc) },
                { label: 'Generated By', value: manifest.generated_by_pseudonym }
            ])}
            ${renderReportSectionBlock('Archive Summary', renderReportSummaryCards([
                { label: 'Moves Captured', value: sessionMetrics.moves_count ?? 0, detail: 'max move observed' },
                { label: 'Actions Submitted', value: sessionMetrics.actions_submitted ?? 0, detail: `${sessionMetrics.actions_adjudicated ?? 0} adjudicated` },
                { label: 'Proposals Submitted', value: sessionMetrics.proposals_submitted ?? 0, detail: `${sessionMetrics.proposals_forwarded ?? 0} forwarded` },
                { label: 'RFIs Raised', value: sessionMetrics.rfis_raised ?? 0, detail: 'team requests' },
                { label: 'Communications', value: sessionMetrics.communications_sent ?? 0, detail: 'interaction edges' },
                { label: 'Schema Version', value: manifest.schema_version || 'unknown', detail: `format rev ${manifest.export_format_revision || 'n/a'}` }
            ]))}
            ${renderReportSectionBlock('Scenario Context', renderReportMetaGrid([
                { label: 'Simulation', value: scenarioContext.simulation_name },
                { label: 'App Version', value: scenarioRuntime.app_version },
                { label: 'Software Build Hash', value: scenarioRuntime.software_build_hash },
                { label: 'Observed Teams', value: scenarioExerciseStructure.observed_teams },
                { label: 'Observed Moves', value: scenarioExerciseStructure.observed_moves },
                { label: 'Context File', value: manifest.scenario_context_ref }
            ]))}
            ${renderReportSectionBlock('Scenario Messages', renderReportTable(
                ['Type', 'Recipient', 'Move', 'Occurred UTC', 'Excerpt'],
                scenarioMessageRows
            ))}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Participants And Seat Activity</h2>
                    <p class="report-section-intro">De-identified roster data paired with the derived engagement metrics used in the research export.</p>
                </div>
            </div>
            ${renderReportSectionBlock('Participant Roster', renderReportTable(
                ['Pseudonym', 'Role', 'Team', 'Seat', 'First Seen UTC', 'Last Seen UTC', 'Active Duration', 'Rejoins'],
                participantRosterRows
            ))}
            ${renderReportSectionBlock('Derived Participant Metrics', renderReportTable(
                ['Pseudonym', 'Role', 'Team', 'Events', 'Notes', 'Note Edits', 'Drafts', 'Submissions', 'Mean Submit Time', 'Mean Response Latency', 'Active Duration', 'Disconnects'],
                participantMetricRows
            ))}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Event Log Chronology</h2>
                    <p class="report-section-intro">Full event-level chronology of the session, including payload summaries and before/after state changes.</p>
                </div>
            </div>
            ${renderReportSectionBlock('Top Event Types', renderReportSummaryCards(topEventCards))}
            ${eventLogTruncated
                ? `<p class="report-note">Showing the first ${EVENT_LOG_DISPLAY_LIMIT} of ${totalEventLogRows} logged events for print readability. The complete, ordered event stream is preserved in event_log.csv and event_log.jsonl.</p>`
                : ''}
            ${renderReportSectionBlock('Event Log', renderReportTable(
                ['Occurred UTC', 'Actor', 'Event Type', 'Entity', 'Move', 'State Change', 'Payload Summary'],
                displayedEventLogRows
            ))}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">State Transition Ledger</h2>
                    <p class="report-section-intro">Lifecycle transitions reconstructed from the export projections for actions, proposals, move responses, and RFIs.</p>
                </div>
            </div>
            ${renderReportTable(
                ['Transition UTC', 'Entity Type', 'Entity ID', 'From State', 'To State', 'Actor Role', 'Recipient Team', 'Move', 'Dwell'],
                transitionRows
            )}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Decision Lineage</h2>
                    <p class="report-section-intro">Derived trace rows linking submitted artifacts to review outcomes, related communications, RFIs, and event evidence. These rows support navigation and audit, not automatic causal attribution.</p>
                </div>
            </div>
            ${renderReportTable(
                ['Type', 'Entity ID', 'Move', 'Source Team', 'Current State', 'Submitted UTC', 'Reviewed UTC', 'Event IDs', 'Evidence Summary'],
                decisionLineageRows
            )}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Research Utility Layers</h2>
                    <p class="report-section-intro">Deterministic interpretation layers for outcome taxonomy, evaluator evidence, network structure, and turning-point review. These outputs are rule-based indexes over captured evidence, not probabilistic scores.</p>
                </div>
            </div>
            ${renderReportSectionBlock('Outcome Taxonomy Signals', renderReportTable(
                ['Dimension', 'Signal', 'Entity Type', 'Entity ID', 'Move', 'Team', 'Keyword Hits', 'Evidence Excerpt'],
                outcomeTaxonomyRows
            ))}
            ${renderReportSectionBlock('Training Rubric Evidence', renderReportTable(
                ['Participant', 'Role', 'Team', 'Dimension', 'Evidence Value', 'Threshold', 'Status'],
                trainingRubricRows
            ))}
            ${renderReportSectionBlock('Network Metrics', renderReportTable(
                ['Metric', 'Source Team', 'Target Team', 'Value', 'Unit', 'Edge IDs'],
                networkMetricRows
            ))}
            ${renderReportSectionBlock('Turning Points', renderReportTable(
                ['Type', 'Occurred UTC', 'Move', 'Entity Type', 'Entity ID', 'Team', 'Evidence Summary'],
                turningPointRows
            ))}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Draft And Submission History</h2>
                    <p class="report-section-intro">Draft projection data showing saved revisions, wizard progress, and submission timing.</p>
                </div>
            </div>
            ${renderReportTable(
                ['Author', 'Artifact Type', 'Artifact ID', 'Move', 'Sequence', 'Revision', 'Status', 'Wizard Page', 'Created UTC', 'Submitted UTC', 'Time To Submit', 'Snapshot Summary'],
                draftRevisionRows
            )}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Actions And Adjudications</h2>
                    <p class="report-section-intro">Detailed Blue-team strategic action records paired with White Cell rulings and adjudication effects.</p>
                </div>
            </div>
            ${renderReportEntityCollection(actionCards, 'No Blue-team action records were captured for this export.')}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Proposals: Content And Review</h2>
                    <p class="report-section-intro">Green-team proposal records, routing intent, review rationale, and recipient-state outcomes.</p>
                </div>
            </div>
            ${renderReportEntityCollection(proposalCards, 'No proposal records were captured for this export.')}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Move Responses</h2>
                    <p class="report-section-intro">Red-team move-response records, posture, rationale, and submitted response detail.</p>
                </div>
            </div>
            ${renderReportEntityCollection(moveResponseCards, 'No move-response records were captured for this export.')}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Requests For Information</h2>
                    <p class="report-section-intro">Question-and-answer exchanges between team facilitators and White Cell.</p>
                </div>
            </div>
            ${renderReportEntityCollection(rfiCards, 'No RFI records were captured for this export.')}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Communications And Interaction Summary</h2>
                    <p class="report-section-intro">Cross-team exchanges and operator communications derived from the interaction-edge projection.</p>
                </div>
            </div>
            ${renderReportSectionBlock('Interaction Matrix', renderInteractionMatrix(dataset.interactionEdges))}
            ${renderReportSectionBlock('Communication Edge Detail', renderReportTable(
                ['Type', 'Source Team', 'Target Team', 'Direction', 'Move', 'Occurred UTC', 'Latency'],
                communicationRows
            ))}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Notes And Observation Capture</h2>
                    <p class="report-section-intro">Summary of captured notetaker records and optional appendix content when enabled at export time.</p>
                </div>
            </div>
            ${renderReportSectionBlock('Note Summary', renderReportTable(
                ['Author', 'Role', 'Team', 'Scope', 'Visibility', 'Move', 'Created UTC', 'Length (chars)', 'Edits'],
                notesSummaryRows
            ))}
            ${renderReportSectionBlock(
                'Notes Appendix',
                includeNotesAppendix
                    ? renderReportTable(['Author', 'Role', 'Team', 'Created UTC', 'Content'], notesRows)
                    : '<p class="report-muted">Notes appendix withheld at report-generation time. The machine-readable notes remain in notes.csv and notes.json.</p>'
            )}
        </section>

        <section class="report-section">
            <div class="report-section-header">
                <div>
                    <h2 class="report-section-title">Data Quality And Export Integrity</h2>
                    <p class="report-section-intro">Observed disconnect/gap signals plus the integrity fields needed to verify the archive payload.</p>
                </div>
            </div>
            ${renderReportSectionBlock('Research Readiness', renderReportMetaGrid([
                { label: 'Comparison Readiness', value: readinessSummary.status },
                { label: 'Recommended Uses', value: readinessSummary.recommended_uses },
                { label: 'Limitations', value: readinessSummary.limitations },
                { label: 'Notes Appendix Included', value: safeObject(dataQualitySummary.privacy).notes_appendix_included }
            ]))}
            ${renderReportSectionBlock('Table Coverage', renderReportTable(
                ['Table', 'Rows', 'Source', 'Status', 'Critical'],
                tableCoverageRows
            ))}
            ${renderReportSectionBlock('Data Quality Events', renderReportTable(
                ['Team', 'Event Type', 'Occurred UTC', 'Gap', 'Detail'],
                dataQualityRows
            ))}
            ${renderReportSectionBlock('Manifest Integrity', renderReportMetaGrid([
                { label: 'Schema Version', value: manifest.schema_version },
                { label: 'Export Format Revision', value: manifest.export_format_revision },
                { label: 'Export Version', value: manifest.export_version },
                { label: 'Software Build Hash', value: manifest.software_build_hash || 'unknown' },
                { label: 'Generated At UTC', value: formatReportTimestamp(manifest.generated_at_utc) },
                { label: 'Generated By Pseudonym', value: manifest.generated_by_pseudonym },
                { label: 'Session Checksum', value: safeObject(manifest.event_log_chain).session_checksum },
                { label: 'First Event Hash', value: safeObject(manifest.event_log_chain).first_event_hash },
                { label: 'Last Event Hash', value: safeObject(manifest.event_log_chain).last_event_hash },
                { label: 'Codebook Reference', value: manifest.codebook_ref },
                { label: 'Report Reference', value: manifest.report_ref }
            ]))}
            ${renderReportSectionBlock('Manifest Row Counts', renderReportTable(['Projection', 'Rows'], rowCountRows))}
        </section>
    </div>
</body>
</html>
    `.trim();
}

function buildLegacyFiles(bundle = {}, generatedAtUtc) {
    const sessionMetadataPayload = {
        exportedAt: generatedAtUtc,
        version: CONFIG.VERSION,
        session: bundle.session || null
    };

    return [
        {
            path: 'legacy/session_metadata.json',
            content: JSON.stringify(sessionMetadataPayload, null, 2),
            mimeType: 'application/json'
        },
        {
            path: 'legacy/game_state.json',
            content: JSON.stringify(bundle.gameState || null, null, 2),
            mimeType: 'application/json'
        },
        {
            path: 'legacy/actions.csv',
            content: exportSessionActionsCsv(safeArray(bundle.actions)),
            mimeType: 'text/csv'
        },
        {
            path: 'legacy/rfis.csv',
            content: exportSessionRequestsCsv(safeArray(bundle.requests)),
            mimeType: 'text/csv'
        },
        {
            path: 'legacy/timeline.csv',
            content: exportSessionTimelineCsv(safeArray(bundle.timeline)),
            mimeType: 'text/csv'
        },
        {
            path: 'legacy/participants.csv',
            content: exportSessionParticipantsCsv(safeArray(bundle.participants)),
            mimeType: 'text/csv'
        }
    ];
}

function toJsonFileContent(value) {
    return JSON.stringify(value, null, 2);
}

function toJsonLines(rows = []) {
    return rows.map((row) => JSON.stringify(row)).join('\n');
}

async function buildEventLogChain(events = []) {
    const firstEventHash = events[0]?.event_hash || '';
    const lastEventHash = events[events.length - 1]?.event_hash || '';
    const sessionChecksum = await sha256Hex(events.map((event) => event.event_hash || '').join('\n'));

    return {
        first_event_hash: firstEventHash,
        last_event_hash: lastEventHash,
        session_checksum: sessionChecksum
    };
}

function buildFileDefinitions({
    manifest,
    codebook,
    reportHtml,
    personaReports,
    dataQualitySummary,
    decisionLineage,
    scenarioContext,
    outcomeTaxonomy,
    trainingRubric,
    networkMetrics,
    turningPoints,
    eventLog,
    participantRows,
    notes,
    noteRevisions,
    draftRevisions,
    stateTransitions,
    actionContent,
    proposalContent,
    adjudicationContent,
    moveResponseContent,
    rfiContent,
    interactionEdges,
    dataQualityEvents,
    derivedParticipantMetrics,
    derivedSessionMetrics,
    legacyFiles
}) {
    return [
        {
            path: 'manifest.json',
            content: toJsonFileContent(manifest),
            mimeType: 'application/json'
        },
        {
            path: 'codebook.json',
            content: toJsonFileContent(codebook),
            mimeType: 'application/json'
        },
        {
            path: 'report.html',
            content: reportHtml,
            mimeType: 'text/html'
        },
        ...safeArray(personaReports),
        {
            path: 'data_quality_summary.json',
            content: toJsonFileContent(dataQualitySummary),
            mimeType: 'application/json'
        },
        {
            path: 'decision_lineage.csv',
            content: arrayToCsv(decisionLineage, RESEARCH_EXPORT_COLUMNS.decision_lineage),
            mimeType: 'text/csv'
        },
        {
            path: 'decision_lineage.json',
            content: toJsonFileContent(decisionLineage),
            mimeType: 'application/json'
        },
        {
            path: 'scenario_context.json',
            content: toJsonFileContent(scenarioContext),
            mimeType: 'application/json'
        },
        {
            path: 'outcome_taxonomy.csv',
            content: arrayToCsv(outcomeTaxonomy, RESEARCH_EXPORT_COLUMNS.outcome_taxonomy),
            mimeType: 'text/csv'
        },
        {
            path: 'outcome_taxonomy.json',
            content: toJsonFileContent(outcomeTaxonomy),
            mimeType: 'application/json'
        },
        {
            path: 'training_rubric.csv',
            content: arrayToCsv(trainingRubric, RESEARCH_EXPORT_COLUMNS.training_rubric),
            mimeType: 'text/csv'
        },
        {
            path: 'training_rubric.json',
            content: toJsonFileContent(trainingRubric),
            mimeType: 'application/json'
        },
        {
            path: 'network_metrics.csv',
            content: arrayToCsv(networkMetrics, RESEARCH_EXPORT_COLUMNS.network_metrics),
            mimeType: 'text/csv'
        },
        {
            path: 'network_metrics.json',
            content: toJsonFileContent(networkMetrics),
            mimeType: 'application/json'
        },
        {
            path: 'turning_points.csv',
            content: arrayToCsv(turningPoints, RESEARCH_EXPORT_COLUMNS.turning_points),
            mimeType: 'text/csv'
        },
        {
            path: 'turning_points.json',
            content: toJsonFileContent(turningPoints),
            mimeType: 'application/json'
        },
        {
            path: 'event_log.jsonl',
            content: toJsonLines(eventLog),
            mimeType: 'application/x-ndjson'
        },
        {
            path: 'event_log.csv',
            content: arrayToCsv(eventLog, RESEARCH_EXPORT_COLUMNS.event_log),
            mimeType: 'text/csv'
        },
        {
            path: 'participants.csv',
            content: arrayToCsv(participantRows, RESEARCH_EXPORT_COLUMNS.participants),
            mimeType: 'text/csv'
        },
        {
            path: 'participants.json',
            content: toJsonFileContent(participantRows),
            mimeType: 'application/json'
        },
        {
            path: 'notes.csv',
            content: arrayToCsv(notes, RESEARCH_EXPORT_COLUMNS.notes),
            mimeType: 'text/csv'
        },
        {
            path: 'notes.json',
            content: toJsonFileContent(notes),
            mimeType: 'application/json'
        },
        {
            path: 'note_revisions.csv',
            content: arrayToCsv(noteRevisions, RESEARCH_EXPORT_COLUMNS.note_revisions),
            mimeType: 'text/csv'
        },
        {
            path: 'note_revisions.json',
            content: toJsonFileContent(noteRevisions),
            mimeType: 'application/json'
        },
        {
            path: 'drafts_revisions.csv',
            content: arrayToCsv(draftRevisions, RESEARCH_EXPORT_COLUMNS.drafts_revisions),
            mimeType: 'text/csv'
        },
        {
            path: 'drafts_revisions.json',
            content: toJsonFileContent(draftRevisions),
            mimeType: 'application/json'
        },
        {
            path: 'state_transitions.csv',
            content: arrayToCsv(stateTransitions, RESEARCH_EXPORT_COLUMNS.state_transitions),
            mimeType: 'text/csv'
        },
        {
            path: 'state_transitions.json',
            content: toJsonFileContent(stateTransitions),
            mimeType: 'application/json'
        },
        {
            path: 'action_content.csv',
            content: arrayToCsv(actionContent, RESEARCH_EXPORT_COLUMNS.action_content),
            mimeType: 'text/csv'
        },
        {
            path: 'action_content.json',
            content: toJsonFileContent(actionContent),
            mimeType: 'application/json'
        },
        {
            path: 'proposal_content.csv',
            content: arrayToCsv(proposalContent, RESEARCH_EXPORT_COLUMNS.proposal_content),
            mimeType: 'text/csv'
        },
        {
            path: 'proposal_content.json',
            content: toJsonFileContent(proposalContent),
            mimeType: 'application/json'
        },
        {
            path: 'adjudication_content.csv',
            content: arrayToCsv(adjudicationContent, RESEARCH_EXPORT_COLUMNS.adjudication_content),
            mimeType: 'text/csv'
        },
        {
            path: 'adjudication_content.json',
            content: toJsonFileContent(adjudicationContent),
            mimeType: 'application/json'
        },
        {
            path: 'move_response_content.csv',
            content: arrayToCsv(moveResponseContent, RESEARCH_EXPORT_COLUMNS.move_response_content),
            mimeType: 'text/csv'
        },
        {
            path: 'move_response_content.json',
            content: toJsonFileContent(moveResponseContent),
            mimeType: 'application/json'
        },
        {
            path: 'rfi_content.csv',
            content: arrayToCsv(rfiContent, RESEARCH_EXPORT_COLUMNS.rfi_content),
            mimeType: 'text/csv'
        },
        {
            path: 'rfi_content.json',
            content: toJsonFileContent(rfiContent),
            mimeType: 'application/json'
        },
        {
            path: 'interaction_edges.csv',
            content: arrayToCsv(interactionEdges, RESEARCH_EXPORT_COLUMNS.interaction_edges),
            mimeType: 'text/csv'
        },
        {
            path: 'interaction_edges.json',
            content: toJsonFileContent(interactionEdges),
            mimeType: 'application/json'
        },
        {
            path: 'data_quality_events.csv',
            content: arrayToCsv(dataQualityEvents, RESEARCH_EXPORT_COLUMNS.data_quality_events),
            mimeType: 'text/csv'
        },
        {
            path: 'data_quality_events.json',
            content: toJsonFileContent(dataQualityEvents),
            mimeType: 'application/json'
        },
        {
            path: 'derived_participant_metrics.csv',
            content: arrayToCsv(derivedParticipantMetrics, RESEARCH_EXPORT_COLUMNS.derived_participant_metrics),
            mimeType: 'text/csv'
        },
        {
            path: 'derived_session_metrics.csv',
            content: arrayToCsv(derivedSessionMetrics, RESEARCH_EXPORT_COLUMNS.derived_session_metrics),
            mimeType: 'text/csv'
        },
        ...legacyFiles
    ];
}

async function buildChecksumsFile(fileDefinitions = []) {
    const checksumLines = [];

    for (const fileDefinition of fileDefinitions) {
        const hash = await sha256Hex(fileDefinition.content);
        checksumLines.push(`${hash}  ${fileDefinition.path}`);
    }

    return {
        path: 'checksums.sha256',
        content: checksumLines.join('\n'),
        mimeType: 'text/plain'
    };
}

export async function buildResearchExportBundle(bundle = {}, {
    generatedAtUtc = new Date().toISOString(),
    generatedByPseudonym = 'game_master_operator',
    captureMode = bundle.captureMode || 'research',
    exportVersion = 1,
    includeNotesAppendix = false,
    softwareBuildHash = bundle.softwareBuildHash || CONFIG.VERSION
} = {}) {
    const normalizedCaptureMode = normalizeCaptureMode(captureMode);
    const participantRegistry = buildParticipantRegistry(bundle);
    participantRegistry.rows = await Promise.all(
        participantRegistry.rows.map(async (participant) => ({
            ...participant,
            auth_uid_hash: await sha256Hex(participant.auth_uid_hash || `${participant.participant_pseudonym}:${participant.session_id || ''}`)
        }))
    );
    const rawEventLog = safeArray(bundle.researchAuditEventLog).length
        ? safeArray(bundle.researchAuditEventLog).map((event) => ({
            ...event,
            event_ts_utc: asUtcIso(event.event_ts_utc),
            server_received_utc: asUtcIso(event.server_received_utc),
            client_ts_utc: asUtcIso(event.client_ts_utc)
        }))
        : buildSyntheticEventLog(bundle, participantRegistry);
    const eventLog = await enrichEventLogWithHashes(
        rawEventLog
            .slice()
            .sort((left, right) => new Date(left.event_ts_utc).getTime() - new Date(right.event_ts_utc).getTime())
    );
    const eventLogChain = await buildEventLogChain(eventLog);
    const { notes, noteRevisions } = buildNotesTables(bundle, participantRegistry);
    const draftRevisions = buildDraftRevisions(bundle, participantRegistry);
    const actionContent = buildActionContent(bundle, participantRegistry);
    const proposalContent = buildProposalContent(bundle, participantRegistry);
    const adjudicationContent = buildAdjudicationContent(bundle);
    const moveResponseContent = buildMoveResponseContent(bundle, participantRegistry);
    const rfiContent = buildRfiContent(bundle, participantRegistry);
    const stateTransitions = buildStateTransitions(
        bundle,
        actionContent,
        proposalContent,
        moveResponseContent,
        rfiContent
    );
    const interactionEdges = buildInteractionEdges(bundle, proposalContent, rfiContent);
    const dataQualityEvents = buildDataQualityEvents(bundle, participantRegistry);
    const derivedParticipantMetrics = safeArray(bundle.researchDerivedParticipantMetrics).length
        ? safeArray(bundle.researchDerivedParticipantMetrics)
        : buildDerivedParticipantMetrics({
            participantRows: participantRegistry.rows,
            notes,
            noteRevisions,
            draftRevisions,
            eventLog,
            interactionEdges
        });
    const derivedSessionMetrics = safeArray(bundle.researchDerivedSessionMetrics).length
        ? safeArray(bundle.researchDerivedSessionMetrics)
        : buildDerivedSessionMetrics({
            sessionId: bundle.session?.id || null,
            captureMode: normalizedCaptureMode,
            participantRows: participantRegistry.rows,
            eventLog,
            actionContent,
            proposalContent,
            rfiContent,
            interactionEdges
        });
    const decisionLineage = buildDecisionLineage({
        sessionId: bundle.session?.id || null,
        actionContent,
        proposalContent,
        adjudicationContent,
        moveResponseContent,
        rfiContent,
        interactionEdges,
        communications: bundle.communications,
        eventLog
    });
    const outcomeTaxonomy = buildOutcomeTaxonomy({
        sessionId: bundle.session?.id || null,
        actionContent,
        proposalContent,
        moveResponseContent,
        adjudicationContent
    });
    const trainingRubric = buildTrainingRubric({
        sessionId: bundle.session?.id || null,
        derivedParticipantMetrics,
        rfiContent,
        eventLog
    });
    const networkMetrics = buildNetworkMetrics({
        sessionId: bundle.session?.id || null,
        interactionEdges
    });
    const turningPoints = buildTurningPoints({
        sessionId: bundle.session?.id || null,
        eventLog,
        proposalContent,
        rfiContent,
        interactionEdges,
        dataQualityEvents,
        decisionLineage
    });
    const rowCounts = {
        event_log: eventLog.length,
        participants: participantRegistry.rows.length,
        notes: notes.length,
        note_revisions: noteRevisions.length,
        drafts_revisions: draftRevisions.length,
        state_transitions: stateTransitions.length,
        action_content: actionContent.length,
        proposal_content: proposalContent.length,
        adjudication_content: adjudicationContent.length,
        move_response_content: moveResponseContent.length,
        rfi_content: rfiContent.length,
        interaction_edges: interactionEdges.length,
        data_quality_events: dataQualityEvents.length,
        decision_lineage: decisionLineage.length,
        outcome_taxonomy: outcomeTaxonomy.length,
        training_rubric: trainingRubric.length,
        network_metrics: networkMetrics.length,
        turning_points: turningPoints.length
    };
    const manifest = {
        schema_version: RESEARCH_EXPORT_SCHEMA_VERSION,
        export_format_revision: RESEARCH_EXPORT_FORMAT_REVISION,
        export_version: exportVersion,
        software_build_hash: softwareBuildHash || 'unknown',
        generated_at_utc: asUtcIso(generatedAtUtc),
        generated_by_pseudonym: generatedByPseudonym,
        timezone_declared: 'UTC',
        session_id: bundle.session?.id || null,
        capture_mode: normalizedCaptureMode,
        session_config_snapshot: {
            session_name: bundle.session?.name || null,
            session_code: bundle.session?.metadata?.session_code || null,
            game_state: bundle.gameState || null
        },
        row_counts: rowCounts,
        event_log_chain: eventLogChain,
        codebook_ref: 'codebook.json',
        report_ref: 'report.html',
        persona_report_refs: {
            policy_brief: 'reports/policy_brief.html',
            strategic_leader_brief: 'reports/strategic_leader_brief.html',
            training_evaluator_report: 'reports/training_evaluator_report.html',
            analyst_report: 'reports/analyst_report.html'
        },
        data_quality_summary_ref: 'data_quality_summary.json',
        decision_lineage_ref: 'decision_lineage.csv',
        scenario_context_ref: 'scenario_context.json',
        outcome_taxonomy_ref: 'outcome_taxonomy.csv',
        training_rubric_ref: 'training_rubric.csv',
        network_metrics_ref: 'network_metrics.csv',
        turning_points_ref: 'turning_points.csv'
    };
    const scenarioContext = buildScenarioContext(bundle, {
        manifest,
        actionContent,
        proposalContent,
        moveResponseContent,
        rfiContent,
        interactionEdges
    });
    const dataQualitySummary = buildDataQualitySummary({
        bundle,
        manifest,
        eventLog,
        participantRows: participantRegistry.rows,
        notes,
        noteRevisions,
        draftRevisions,
        stateTransitions,
        actionContent,
        proposalContent,
        adjudicationContent,
        moveResponseContent,
        rfiContent,
        interactionEdges,
        dataQualityEvents,
        derivedParticipantMetrics,
        derivedSessionMetrics,
        decisionLineage,
        outcomeTaxonomy,
        trainingRubric,
        networkMetrics,
        turningPoints,
        includeNotesAppendix
    });
    const codebook = safeArray(bundle.researchCodebook).length
        ? {
            schema_version: RESEARCH_EXPORT_SCHEMA_VERSION,
            generated_at_utc: manifest.generated_at_utc,
            tables: safeArray(bundle.researchCodebook)
        }
        : {
            schema_version: RESEARCH_EXPORT_SCHEMA_VERSION,
            generated_at_utc: manifest.generated_at_utc,
            tables: buildCodebookRows()
        };
    const dataset = {
        session: bundle.session || null,
        manifest,
        codebook,
        eventLog,
        participants: participantRegistry.rows,
        notes,
        noteRevisions,
        draftRevisions,
        stateTransitions,
        actionContent,
        proposalContent,
        adjudicationContent,
        moveResponseContent,
        rfiContent,
        interactionEdges,
        dataQualityEvents,
        dataQualitySummary,
        decisionLineage,
        scenarioContext,
        outcomeTaxonomy,
        trainingRubric,
        networkMetrics,
        turningPoints,
        derivedParticipantMetrics,
        derivedSessionMetrics
    };
    const reportHtml = buildResearchReportHtml(dataset, {
        includeNotesAppendix
    });
    const personaReports = buildPersonaReports(dataset);
    const legacyFiles = buildLegacyFiles(bundle, manifest.generated_at_utc);
    const fileDefinitions = buildFileDefinitions({
        manifest,
        codebook,
        reportHtml,
        personaReports,
        dataQualitySummary,
        decisionLineage,
        scenarioContext,
        outcomeTaxonomy,
        trainingRubric,
        networkMetrics,
        turningPoints,
        eventLog,
        participantRows: participantRegistry.rows,
        notes,
        noteRevisions,
        draftRevisions,
        stateTransitions,
        actionContent,
        proposalContent,
        adjudicationContent,
        moveResponseContent,
        rfiContent,
        interactionEdges,
        dataQualityEvents,
        derivedParticipantMetrics,
        derivedSessionMetrics,
        legacyFiles
    });
    const checksumsFile = await buildChecksumsFile(fileDefinitions);
    const rootFolderName = `research_export_${bundle.session?.id || 'session'}_${buildIsoTimestampFragment(manifest.generated_at_utc)}`;

    return {
        ...dataset,
        reportHtml,
        personaReports,
        rootFolderName,
        files: [...fileDefinitions, checksumsFile]
    };
}

function buildCrossSessionIndexRows(sessionExports = []) {
    return safeArray(sessionExports).map((sessionExport) => {
        const manifest = safeObject(sessionExport.manifest);
        const metrics = safeArray(sessionExport.derivedSessionMetrics)[0] || {};
        const readiness = safeObject(sessionExport.dataQualitySummary?.quantitative_comparison_readiness);
        const eventLogChain = safeObject(manifest.event_log_chain);

        return {
            session_id: manifest.session_id || sessionExport.session?.id || null,
            session_name: sessionExport.session?.name || safeObject(manifest.session_config_snapshot).session_name || null,
            capture_mode: manifest.capture_mode || null,
            generated_at_utc: manifest.generated_at_utc || null,
            session_duration_s: metrics.session_duration_s ?? null,
            moves_count: metrics.moves_count ?? 0,
            participants_active: metrics.participants_active ?? 0,
            total_events: metrics.total_events ?? 0,
            actions_submitted: metrics.actions_submitted ?? 0,
            actions_adjudicated: metrics.actions_adjudicated ?? 0,
            proposals_submitted: metrics.proposals_submitted ?? 0,
            proposals_forwarded: metrics.proposals_forwarded ?? 0,
            rfis_raised: metrics.rfis_raised ?? 0,
            communications_sent: metrics.communications_sent ?? 0,
            mean_proposal_response_latency_s: metrics.mean_proposal_response_latency_s ?? null,
            data_quality_readiness: readiness.status || 'unknown',
            event_log_checksum: eventLogChain.session_checksum || null,
            report_ref: `sessions/${sessionExport.rootFolderName}/${manifest.report_ref || 'report.html'}`
        };
    });
}

export async function buildCrossSessionResearchExportBundle(sessionBundles = [], {
    generatedAtUtc = new Date().toISOString(),
    generatedByPseudonym = 'game_master_operator',
    exportVersion = 1,
    includeNotesAppendix = false,
    softwareBuildHash = CONFIG.VERSION
} = {}) {
    const generatedAtIso = asUtcIso(generatedAtUtc);
    const sessionExports = [];

    for (const sessionBundle of safeArray(sessionBundles)) {
        if (sessionBundle?.manifest && Array.isArray(sessionBundle?.files)) {
            sessionExports.push(sessionBundle);
        } else {
            sessionExports.push(await buildResearchExportBundle(sessionBundle, {
                generatedAtUtc: generatedAtIso,
                generatedByPseudonym,
                exportVersion,
                includeNotesAppendix,
                softwareBuildHash
            }));
        }
    }

    const sessionIndex = buildCrossSessionIndexRows(sessionExports);
    const dataQualityIndex = sessionExports.map((sessionExport) => ({
        session_id: sessionExport.manifest?.session_id || sessionExport.session?.id || null,
        readiness: sessionExport.dataQualitySummary?.quantitative_comparison_readiness || null,
        coverage: sessionExport.dataQualitySummary?.coverage || null,
        integrity: sessionExport.dataQualitySummary?.integrity || null
    }));
    const manifest = {
        schema_version: RESEARCH_EXPORT_SCHEMA_VERSION,
        export_format_revision: RESEARCH_EXPORT_FORMAT_REVISION,
        export_version: exportVersion,
        software_build_hash: softwareBuildHash || 'unknown',
        generated_at_utc: generatedAtIso,
        generated_by_pseudonym: generatedByPseudonym,
        timezone_declared: 'UTC',
        sessions_count: sessionExports.length,
        session_ids: sessionIndex.map((row) => row.session_id).filter(Boolean),
        index_ref: 'cross_session_index.csv',
        data_quality_ref: 'cross_session_data_quality.json',
        included_bundle_roots: sessionExports.map((sessionExport) => `sessions/${sessionExport.rootFolderName}`)
    };
    const sessionFiles = sessionExports.flatMap((sessionExport) => {
        const folder = `sessions/${sessionExport.rootFolderName}`;
        return safeArray(sessionExport.files).map((file) => ({
            ...file,
            path: `${folder}/${file.path}`
        }));
    });
    const fileDefinitions = [
        {
            path: 'cross_session_manifest.json',
            content: toJsonFileContent(manifest),
            mimeType: 'application/json'
        },
        {
            path: 'cross_session_index.csv',
            content: arrayToCsv(sessionIndex, RESEARCH_EXPORT_COLUMNS.cross_session_index),
            mimeType: 'text/csv'
        },
        {
            path: 'cross_session_index.json',
            content: toJsonFileContent(sessionIndex),
            mimeType: 'application/json'
        },
        {
            path: 'cross_session_data_quality.json',
            content: toJsonFileContent(dataQualityIndex),
            mimeType: 'application/json'
        },
        ...sessionFiles
    ];
    const checksumsFile = await buildChecksumsFile(fileDefinitions);
    const rootFolderName = `research_cross_session_${buildIsoTimestampFragment(generatedAtIso)}`;

    return {
        manifest,
        sessionIndex,
        dataQualityIndex,
        sessionExports,
        rootFolderName,
        files: [...fileDefinitions, checksumsFile]
    };
}

let crcTable = null;

function getCrcTable() {
    if (crcTable) {
        return crcTable;
    }

    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let current = index;
        for (let bit = 0; bit < 8; bit += 1) {
            current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
        }
        crcTable[index] = current >>> 0;
    }
    return crcTable;
}

function crc32(bytes) {
    const table = getCrcTable();
    let crc = 0xffffffff;

    for (let index = 0; index < bytes.length; index += 1) {
        crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
    view.setUint32(offset, value, true);
}

function concatUint8Arrays(chunks = []) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;

    chunks.forEach((chunk) => {
        output.set(chunk, offset);
        offset += chunk.length;
    });

    return output;
}

export async function createResearchExportArchiveBlob(researchExportBundle) {
    const files = safeArray(researchExportBundle?.files);
    const rootFolderName = researchExportBundle?.rootFolderName || 'research_export';
    const localFileParts = [];
    const centralDirectoryParts = [];
    let offset = 0;

    files.forEach((fileDefinition) => {
        const filename = `${rootFolderName}/${fileDefinition.path}`;
        const filenameBytes = encodeText(filename);
        const contentBytes = encodeText(fileDefinition.content || '');
        const fileCrc32 = crc32(contentBytes);

        const localHeader = new Uint8Array(30 + filenameBytes.length);
        const localHeaderView = new DataView(localHeader.buffer);
        writeUint32(localHeaderView, 0, 0x04034b50);
        writeUint16(localHeaderView, 4, 20);
        writeUint16(localHeaderView, 6, 0);
        writeUint16(localHeaderView, 8, 0);
        writeUint16(localHeaderView, 10, 0);
        writeUint16(localHeaderView, 12, 0);
        writeUint32(localHeaderView, 14, fileCrc32);
        writeUint32(localHeaderView, 18, contentBytes.length);
        writeUint32(localHeaderView, 22, contentBytes.length);
        writeUint16(localHeaderView, 26, filenameBytes.length);
        writeUint16(localHeaderView, 28, 0);
        localHeader.set(filenameBytes, 30);

        const centralHeader = new Uint8Array(46 + filenameBytes.length);
        const centralHeaderView = new DataView(centralHeader.buffer);
        writeUint32(centralHeaderView, 0, 0x02014b50);
        writeUint16(centralHeaderView, 4, 20);
        writeUint16(centralHeaderView, 6, 20);
        writeUint16(centralHeaderView, 8, 0);
        writeUint16(centralHeaderView, 10, 0);
        writeUint16(centralHeaderView, 12, 0);
        writeUint16(centralHeaderView, 14, 0);
        writeUint32(centralHeaderView, 16, fileCrc32);
        writeUint32(centralHeaderView, 20, contentBytes.length);
        writeUint32(centralHeaderView, 24, contentBytes.length);
        writeUint16(centralHeaderView, 28, filenameBytes.length);
        writeUint16(centralHeaderView, 30, 0);
        writeUint16(centralHeaderView, 32, 0);
        writeUint16(centralHeaderView, 34, 0);
        writeUint16(centralHeaderView, 36, 0);
        writeUint32(centralHeaderView, 38, 0);
        writeUint32(centralHeaderView, 42, offset);
        centralHeader.set(filenameBytes, 46);

        localFileParts.push(localHeader, contentBytes);
        centralDirectoryParts.push(centralHeader);
        offset += localHeader.length + contentBytes.length;
    });

    const centralDirectory = concatUint8Arrays(centralDirectoryParts);
    const endOfCentralDirectory = new Uint8Array(22);
    const endView = new DataView(endOfCentralDirectory.buffer);
    writeUint32(endView, 0, 0x06054b50);
    writeUint16(endView, 4, 0);
    writeUint16(endView, 6, 0);
    writeUint16(endView, 8, files.length);
    writeUint16(endView, 10, files.length);
    writeUint32(endView, 12, centralDirectory.length);
    writeUint32(endView, 16, offset);
    writeUint16(endView, 20, 0);

    return new Blob(
        [...localFileParts, centralDirectory, endOfCentralDirectory],
        { type: 'application/zip' }
    );
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export async function downloadResearchExportArchive(researchExportBundle, filename = null) {
    const archiveBlob = await createResearchExportArchiveBlob(researchExportBundle);
    const resolvedFilename = filename || `${researchExportBundle.rootFolderName}.zip`;
    downloadBlob(archiveBlob, resolvedFilename);
    return archiveBlob;
}

export async function openResearchPrintWindow(reportHtml, {
    title = 'Research Report'
} = {}) {
    if (typeof window === 'undefined') {
        throw new Error('Printing is only available in the browser.');
    }

    const htmlBlob = new Blob([reportHtml], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(htmlBlob);
    const printWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');

    if (!printWindow) {
        URL.revokeObjectURL(blobUrl);
        throw new Error('The browser blocked the report window.');
    }

    try {
        printWindow.document.title = title;
    } catch (_error) {
        // Ignore cross-window title failures for blob URLs.
    }

    const finalizePrint = () => {
        try {
            printWindow.focus?.();
            printWindow.print?.();
        } finally {
            window.setTimeout(() => {
                URL.revokeObjectURL(blobUrl);
            }, 60000);
        }
    };

    try {
        printWindow.addEventListener('load', finalizePrint, { once: true });
    } catch (_error) {
        window.setTimeout(finalizePrint, 300);
    }

    return blobUrl;
}
