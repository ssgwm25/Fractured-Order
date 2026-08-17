import {
    BLUE_ACTION_SCRIBE_HANDOFF,
    serializeBlueActionDetails
} from '../../actions/blueActionDetails.js';
import {
    MOVE_RESPONSE_ACTION_MECHANISM,
    serializeMoveResponseDetails
} from '../../actions/moveResponseDetails.js';
import {
    PROPOSAL_ACTION_MECHANISM,
    PROPOSAL_SCRIBE_HANDOFF,
    serializeProposalDetails
} from '../../actions/proposalDetails.js';
import {
    STRATEGIC_ORIENTATION_ACTION_MECHANISM,
    STRATEGIC_ORIENTATION_ARTIFACT_TYPES,
    STRATEGIC_ORIENTATION_PERIOD,
    STRATEGIC_ORIENTATION_SCRIBE_HANDOFF,
    serializeStrategicOrientationDetails
} from '../../actions/strategicOrientationDetails.js';
import { buildWhiteCellRecipientMetadata } from '../../communications/targeting.js';
import {
    annotateObservationTimelineEntries,
    mergeParticipantScopedNotetakerSection
} from '../../notetaker/storage.js';
import { normalizeDurableNotification } from '../../../components/ui/DurableNotification.js';
import { buildDefaultScribeDeckPath } from '../../scribe/deckConfig.js';
import {
    TRAINING_CONTENT_ROLES,
    TRAINING_CONTENT_TEAMS,
    TRAINING_CURRICULUM_VERSION,
    TRAINING_FIXTURE_ID_PREFIX,
    TRAINING_VISIBLE_FIXTURE_PREFIX,
    deepFreezeTrainingContent,
    validateTrainingFixtureCatalog
} from './schema.js';

const SESSION_ID = `${TRAINING_FIXTURE_ID_PREFIX}session`;
const FIXED_TIMESTAMPS = Object.freeze({
    orientation: '2026-01-15T12:00:00.000Z',
    artifact: '2026-01-15T12:05:00.000Z',
    response: '2026-01-15T12:10:00.000Z',
    followUp: '2026-01-15T12:15:00.000Z'
});

const TEAM_LABELS = Object.freeze({
    blue: 'Blue',
    red: 'Red',
    green: 'Green',
    industry: 'Industry'
});

function fixtureId(...parts) {
    return `${TRAINING_FIXTURE_ID_PREFIX}${parts.join(':')}`;
}

function fixtureLabel(label) {
    return `${TRAINING_VISIBLE_FIXTURE_PREFIX} — ${label}`;
}

function buildOrientationFixture(team, details) {
    return {
        id: fixtureId('orientation', team),
        session_id: SESSION_ID,
        team,
        move: 1,
        phase: 1,
        goal: fixtureLabel(`${TEAM_LABELS[team]} Strategic Orientation`),
        mechanism: STRATEGIC_ORIENTATION_ACTION_MECHANISM,
        sector: '',
        exposure_type: STRATEGIC_ORIENTATION_PERIOD,
        priority: 'HIGH',
        targets: [],
        expected_outcomes: fixtureLabel(`${TEAM_LABELS[team]} orientation and forecast recorded for practice`),
        ally_contingencies: serializeStrategicOrientationDetails({
            artifactType: STRATEGIC_ORIENTATION_ARTIFACT_TYPES.ORIENTATION_AND_FORECAST,
            team,
            ...details,
            scribeHandoff: STRATEGIC_ORIENTATION_SCRIBE_HANDOFF.FORWARDED
        }),
        status: 'draft',
        workflow_state: 'submitted_to_facilitator',
        revision_number: 1,
        created_at: FIXED_TIMESTAMPS.orientation,
        updated_at: FIXED_TIMESTAMPS.orientation
    };
}

const strategicOrientations = {
    blue: buildOrientationFixture('blue', {
        ownOrientation: 'pressure',
        forecastTargets: [{ key: 'red', orientation: 'stabilization' }],
        forecastActionDescription: 'Red is likely to preserve market access while limiting escalation.',
        forecastSummary: 'Forecast: Red will choose Stabilization.'
    }),
    red: buildOrientationFixture('red', {
        ownOrientation: 'reframe',
        orientationRationale: 'Red will reorganize economic relationships for longer-term leverage.',
        forecastTargets: [
            { key: 'blue', orientation: 'pressure' },
            { key: 'green_asian_pacific', orientation: 'reframe' },
            { key: 'green_europe', orientation: 'stabilization' }
        ],
        forecastSummary: 'Forecasts: Blue applies pressure while Green partners split between reframing and stabilization.'
    }),
    green: buildOrientationFixture('green', {
        ownOrientation: 'stabilization',
        forecastTargets: [{ key: 'blue', orientation: 'pressure' }],
        strategyDescription: 'Green will protect regional stability while diversifying strategic exposure.',
        forecastSummary: 'Forecast: Blue will choose Pressure.'
    }),
    industry: buildOrientationFixture('industry', {
        ownOrientation: 'reframe',
        forecastTargets: [{ key: 'blue', orientation: 'stabilization' }],
        strategyDescription: 'Industry will shift capital toward resilient partner networks and production capacity.',
        forecastSummary: 'Forecast: Blue will choose Stabilization.'
    })
};

const artifacts = {
    blue: {
        id: fixtureId('artifact', 'blue-action'),
        session_id: SESSION_ID,
        team: 'blue',
        move: 1,
        phase: 1,
        goal: fixtureLabel('Coordinate allied semiconductor export controls'),
        mechanism: 'Economic',
        sector: 'Biotechnology',
        exposure_type: 'Advanced Manufacturing',
        priority: 'NORMAL',
        targets: ['PRC', 'Japan'],
        expected_outcomes: fixtureLabel('Reduce strategic supply-chain exposure while preserving allied coordination'),
        ally_contingencies: serializeBlueActionDetails({
            objective: 'Coordinate an allied response to upstream semiconductor dependencies.',
            instruments: ['Economic', 'Diplomacy'],
            levers: ['Export Controls', 'Investment Screening'],
            sectors: ['Biotechnology', 'Telecommunications'],
            supplyChainFocusDecision: 'Yes',
            supplyChainActionAngles: ['Build resilience for Blue'],
            supplyChainAreas: ['Refinement', 'Advanced Manufacturing'],
            implementation: 'Legislative',
            legislativeOptions: ['Existing legislation/policy'],
            scribeHandoff: BLUE_ACTION_SCRIBE_HANDOFF.FORWARDED,
            coordinatedDecision: 'Yes',
            coordinated: ['Legislative'],
            informedEngagedDecision: 'Yes',
            informed: ['Allies'],
            notificationTeams: ['Green', 'Industry'],
            notificationNote: 'Share the licensing timeline after simulated White Cell acceptance.'
        }),
        status: 'draft',
        workflow_state: 'submitted_to_facilitator',
        revision_number: 1,
        created_at: FIXED_TIMESTAMPS.artifact,
        updated_at: FIXED_TIMESTAMPS.artifact
    },
    red: {
        id: fixtureId('artifact', 'red-move-response'),
        session_id: SESSION_ID,
        team: 'red',
        move: 1,
        phase: 1,
        goal: fixtureLabel('Counter allied semiconductor controls'),
        mechanism: MOVE_RESPONSE_ACTION_MECHANISM,
        sector: '',
        exposure_type: null,
        priority: 'NORMAL',
        targets: [],
        expected_outcomes: fixtureLabel('Preserve market access and increase the political cost of allied coordination'),
        ally_contingencies: serializeMoveResponseDetails({
            strategicAssessment: 'Blue is aligning export controls across allied production networks.',
            responseStrategy: 'Combine targeted market incentives with diplomatic pressure.',
            keyActions: 'Offer substitute demand and accelerate domestic component qualification.',
            targetsAndPressurePoints: 'Allied manufacturers exposed to short-term revenue loss.',
            deliveryChannel: 'Commercial outreach supported by diplomatic messaging.'
        }),
        status: 'draft',
        workflow_state: 'draft',
        revision_number: 1,
        created_at: FIXED_TIMESTAMPS.artifact,
        updated_at: FIXED_TIMESTAMPS.artifact
    },
    green: {
        id: fixtureId('artifact', 'green-proposal'),
        session_id: SESSION_ID,
        team: 'green',
        move: 1,
        phase: 1,
        goal: fixtureLabel('Build a resilient biotechnology partnership'),
        mechanism: PROPOSAL_ACTION_MECHANISM,
        sector: 'Biotechnology',
        exposure_type: null,
        priority: 'NORMAL',
        targets: [],
        expected_outcomes: fixtureLabel('Create shared biotechnology capacity without forcing bloc alignment'),
        ally_contingencies: serializeProposalDetails({
            originators: ['EU', 'Japan'],
            objective: 'Coordinate resilient biotechnology inputs and shared production capacity.',
            intendedPartners: 'Blue Team and Red Team',
            timingAndConditions: 'Begin in Move 1 with a review before Move 2.',
            recipientTeams: ['blue', 'red'],
            focusSectors: ['Biotechnology'],
            supplyChainFocusDecision: 'Yes',
            supplyChainAreas: ['Extraction', 'Advanced Manufacturing'],
            scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED
        }),
        status: 'draft',
        workflow_state: 'submitted_to_facilitator',
        revision_number: 1,
        created_at: FIXED_TIMESTAMPS.artifact,
        updated_at: FIXED_TIMESTAMPS.artifact
    },
    industry: {
        id: fixtureId('artifact', 'industry-proposal'),
        session_id: SESSION_ID,
        team: 'industry',
        move: 1,
        phase: 1,
        goal: fixtureLabel('Expand trusted advanced-manufacturing capacity'),
        mechanism: PROPOSAL_ACTION_MECHANISM,
        sector: 'Advanced Manufacturing',
        exposure_type: null,
        priority: 'NORMAL',
        targets: [],
        expected_outcomes: fixtureLabel('Secure co-investment and predictable demand for trusted capacity'),
        ally_contingencies: serializeProposalDetails({
            originators: ['US Industry'],
            objective: 'Stand up a joint advanced-manufacturing capacity programme.',
            intendedPartners: 'Blue Team',
            timingAndConditions: 'Commit financing in Move 1 and review delivery milestones in Move 2.',
            recipientTeams: ['blue'],
            focusSectors: ['Advanced Manufacturing'],
            supplyChainFocusDecision: 'Yes',
            supplyChainAreas: ['Refinement', 'Advanced Manufacturing'],
            industryFocus: 'Advanced semiconductor manufacturing equipment',
            countryFocus: 'Japan and ROK',
            proposedActivity: 'Create a co-investment facility with shared offtake commitments.',
            scribeHandoff: PROPOSAL_SCRIBE_HANDOFF.FORWARDED
        }),
        status: 'draft',
        workflow_state: 'submitted_to_facilitator',
        revision_number: 1,
        created_at: FIXED_TIMESTAMPS.artifact,
        updated_at: FIXED_TIMESTAMPS.artifact
    }
};

const handoffs = TRAINING_CONTENT_TEAMS.map((team) => ({
    id: fixtureId('handoff', team),
    artifact_id: artifacts[team].id,
    team,
    from_role: `${team}_facilitator`,
    to_role: `${team}_scribe`,
    workflow_state: 'submitted_to_facilitator',
    visibleLabel: fixtureLabel(`${TEAM_LABELS[team]} Scribe handoff received by Facilitator`),
    created_at: FIXED_TIMESTAMPS.response
}));

const whiteCellReturns = TRAINING_CONTENT_TEAMS.map((team) => ({
    id: fixtureId('white-cell-return', team),
    artifact_id: artifacts[team].id,
    team,
    workflow_state: 'returned_to_team',
    revision_number: 1,
    review_notes: 'Clarify the timing, intended partner, and observable outcome before resubmission.',
    reviewed_by_role: 'whitecell_lead',
    reviewed_at: FIXED_TIMESTAMPS.response,
    visibleLabel: fixtureLabel(`${TEAM_LABELS[team]} artifact returned for revision`)
}));

const rfis = TRAINING_CONTENT_TEAMS.map((team) => ({
    id: fixtureId('rfi', team),
    session_id: SESSION_ID,
    team,
    move: 1,
    phase: 1,
    query: `${TRAINING_VISIBLE_FIXTURE_PREFIX}: What implementation constraints should the team account for this move?`,
    categories: ['Implementation Timeline', 'Political Feasibility'],
    status: 'pending',
    workflow_state: 'returned_to_team',
    revision_number: 2,
    prior_workflow_state: 'submitted_to_white_cell',
    review_notes: 'Name one measurable checkpoint and the decision window that requires clarification.',
    reviewed_by_role: 'whitecell_lead',
    reviewed_at: FIXED_TIMESTAMPS.response,
    created_at: FIXED_TIMESTAMPS.artifact,
    updated_at: FIXED_TIMESTAMPS.response
}));

const rfiAnswers = TRAINING_CONTENT_TEAMS.map((team) => ({
    id: fixtureId('rfi-answer', team),
    request_id: rfis.find((rfi) => rfi.team === team).id,
    team,
    status: 'answered',
    workflow_state: 'completed',
    response: `${TRAINING_VISIBLE_FIXTURE_PREFIX}: Use the current move window and state one measurable implementation checkpoint.`,
    responded_by: 'white_cell',
    responded_at: FIXED_TIMESTAMPS.response,
    visibleLabel: fixtureLabel(`${TEAM_LABELS[team]} RFI answered by simulated White Cell`)
}));

const whiteCellApprovals = ['green', 'industry'].map((team) => ({
    id: fixtureId('white-cell-approval', team),
    artifact_id: artifacts[team].id,
    recipient_team: team === 'green' ? 'blue' : 'red',
    status: 'approved_forwarded',
    reviewed_by_role: 'whitecell_lead',
    reviewed_at: FIXED_TIMESTAMPS.response,
    visibleLabel: fixtureLabel(`${TEAM_LABELS[team]} proposal approved and forwarded`)
}));

const communications = TRAINING_CONTENT_TEAMS.map((team) => ({
    id: fixtureId('communication', team),
    session_id: SESSION_ID,
    type: 'GUIDANCE',
    from_role: 'whitecell_lead',
    to_role: `${team}_scribe`,
    team: 'white_cell',
    title: fixtureLabel(`${TEAM_LABELS[team]} implementation guidance`),
    content: `${TRAINING_VISIBLE_FIXTURE_PREFIX}: Tie the next decision to a measurable Move 1 outcome.`,
    metadata: buildWhiteCellRecipientMetadata(`${team}_scribe`, {
        content_kind: 'DIRECT_COMMUNICATION'
    }),
    created_at: FIXED_TIMESTAMPS.response
}));

const injects = TRAINING_CONTENT_TEAMS.map((team) => ({
    id: fixtureId('inject', team),
    session_id: SESSION_ID,
    type: 'INJECT',
    from_role: 'whitecell_lead',
    to_role: team,
    team: 'white_cell',
    title: fixtureLabel(`${TEAM_LABELS[team]} supply disruption inject`),
    content: `${TRAINING_VISIBLE_FIXTURE_PREFIX}: A key supplier announces a six-week delivery delay.`,
    metadata: buildWhiteCellRecipientMetadata(team, { content_kind: 'SCENARIO_INJECT' }),
    created_at: FIXED_TIMESTAMPS.response
}));

const notifications = TRAINING_CONTENT_TEAMS.map((team) => normalizeDurableNotification({
    id: fixtureId('notification', team),
    family: 'artifact-return',
    source: 'White Cell',
    artifact: fixtureLabel(`${TEAM_LABELS[team]} artifact requires attention`),
    requiredAction: 'Open the training fixture, review the return note, and revise it.',
    destinationLabel: 'Open training fixture',
    destination: {
        surface: 'facilitator',
        recordId: artifacts[team].id,
        slideKey: fixtureId('slide', team, 'artifact')
    },
    createdAt: FIXED_TIMESTAMPS.response,
    type: 'warning'
}));

const ACTION_NOTIFICATION_SOURCE_TEAMS = Object.freeze({
    blue: 'green',
    red: 'industry',
    green: 'blue',
    industry: 'red'
});

const actionNotifications = TRAINING_CONTENT_TEAMS.map((team) => {
    const sourceTeam = ACTION_NOTIFICATION_SOURCE_TEAMS[team];
    return {
        id: fixtureId('action-notification', team),
        session_id: SESSION_ID,
        type: 'ACTION_NOTIFICATION',
        from_role: 'whitecell_lead',
        to_role: team,
        team: 'white_cell',
        title: fixtureLabel(`${TEAM_LABELS[sourceTeam]} team action shared for awareness`),
        content: `${TRAINING_VISIBLE_FIXTURE_PREFIX}: This update is informational and does not require a response.`,
        metadata: buildWhiteCellRecipientMetadata(team, {
            content_kind: 'ACTION_NOTIFICATION',
            source_team: sourceTeam,
            shared_action_id: fixtureId('shared-action', sourceTeam, team),
            action_snapshot: {
                id: fixtureId('action-snapshot', sourceTeam, team),
                title: fixtureLabel(`${TEAM_LABELS[sourceTeam]} coordination update`),
                objective: 'Share a team action for situational awareness only.'
            }
        }),
        created_at: FIXED_TIMESTAMPS.followUp
    };
});

function buildProposalThread(team, recipientTeam) {
    const sourceProposal = artifacts[team];
    const threadId = fixtureId('proposal-thread', team, recipientTeam);
    const rootId = fixtureId('proposal-message', team, recipientTeam, '0');
    const responseId = fixtureId('proposal-message', team, recipientTeam, '1');
    return [
        {
            id: rootId,
            session_id: SESSION_ID,
            type: 'PROPOSAL_FORWARDED',
            from_role: 'whitecell_lead',
            to_role: `${recipientTeam}_scribe`,
            team: 'white_cell',
            title: fixtureLabel(`${TEAM_LABELS[team]} proposal forwarded to ${TEAM_LABELS[recipientTeam]}`),
            content: `${TRAINING_VISIBLE_FIXTURE_PREFIX}: Review the proposed capacity partnership.`,
            created_at: FIXED_TIMESTAMPS.response,
            metadata: {
                thread_id: threadId,
                recipient_team: recipientTeam,
                round_number: 0,
                parent_message_id: null,
                source_proposal_id: sourceProposal.id,
                source_revision: 1,
                source_team: team,
                sender_team: 'white_cell',
                sender_role: 'whitecell_lead',
                sent_at: FIXED_TIMESTAMPS.response,
                message_type: 'proposal_forwarded',
                recipient_scope: 'role',
                recipient_role: `${recipientTeam}_scribe`,
                proposal: {
                    title: sourceProposal.goal,
                    objective: sourceProposal.expected_outcomes,
                    originators: [TEAM_LABELS[team]],
                    focusSectors: [sourceProposal.sector],
                    timingAndConditions: 'Review during Move 1 and record one measurable checkpoint.',
                    expectedOutcomes: sourceProposal.expected_outcomes
                },
                client_message_id: fixtureId('client-message', team, recipientTeam, '0')
            }
        },
        {
            id: responseId,
            session_id: SESSION_ID,
            type: 'PROPOSAL_RESPONSE',
            from_role: `${recipientTeam}_scribe`,
            to_role: 'white_cell',
            team: recipientTeam,
            title: fixtureLabel(`${TEAM_LABELS[recipientTeam]} negotiation response`),
            content: `${TRAINING_VISIBLE_FIXTURE_PREFIX}: Add a six-month review checkpoint before acceptance.`,
            created_at: FIXED_TIMESTAMPS.followUp,
            metadata: {
                thread_id: threadId,
                recipient_team: recipientTeam,
                round_number: 1,
                parent_message_id: rootId,
                source_proposal_id: sourceProposal.id,
                source_revision: 1,
                source_team: team,
                sender_team: recipientTeam,
                sender_role: `${recipientTeam}_scribe`,
                sent_at: FIXED_TIMESTAMPS.followUp,
                message_type: 'negotiation_message',
                facilitator_decision: 'negotiate',
                client_message_id: fixtureId('client-message', team, recipientTeam, '1')
            }
        }
    ];
}

const proposalThreads = [
    ...buildProposalThread('green', 'blue'),
    ...buildProposalThread('industry', 'red')
];

const deckStates = TRAINING_CONTENT_TEAMS.map((team) => ({
    id: fixtureId('deck-state', team),
    team,
    deckPath: buildDefaultScribeDeckPath(team),
    deckLabel: fixtureLabel(`${TEAM_LABELS[team]} Facilitator support deck`),
    section: 'actions',
    slideKey: fixtureId('slide', team, 'artifact'),
    presentationMode: false,
    updated_at: FIXED_TIMESTAMPS.response
}));

const timelineEntries = TRAINING_CONTENT_TEAMS.flatMap((team) => ([
    {
        id: fixtureId('timeline', team, 'handoff'),
        session_id: SESSION_ID,
        type: 'ACTION_SUBMITTED',
        content: `${TRAINING_VISIBLE_FIXTURE_PREFIX}: ${TEAM_LABELS[team]} Scribe forwarded an artifact to the Facilitator.`,
        team,
        move: 1,
        phase: 1,
        created_at: FIXED_TIMESTAMPS.response,
        metadata: { artifact_id: artifacts[team].id, source: 'training_fixture' }
    },
    {
        id: fixtureId('timeline', team, 'inject'),
        session_id: SESSION_ID,
        type: 'INJECT',
        content: `${TRAINING_VISIBLE_FIXTURE_PREFIX}: Simulated White Cell issued a supply disruption inject.`,
        team: 'white_cell',
        move: 1,
        phase: 1,
        created_at: FIXED_TIMESTAMPS.followUp,
        metadata: buildWhiteCellRecipientMetadata(team, { source: 'training_fixture' })
    }
]));

function buildNotetakerRecord(team) {
    const participantKey = fixtureId('notetaker-seat', team, 'a');
    const dynamics = mergeParticipantScopedNotetakerSection({}, {
        emergingLeaders: 'The policy lead summarizes disagreement before proposing a decision.',
        decisionStyle: 'consensus',
        frictionLevel: '4',
        frictionSources: 'Timing and partner coordination.',
        consensusLevel: '7',
        dynamicsSummary: 'The team reaches agreement after separating objectives from implementation.'
    }, {
        teamId: team,
        timestamp: FIXED_TIMESTAMPS.response,
        participantKey,
        participantId: participantKey,
        clientId: fixtureId('notetaker-client', team, 'a'),
        participantLabel: fixtureLabel(`${TEAM_LABELS[team]} Notetaker A`)
    });
    const alliance = mergeParticipantScopedNotetakerSection({}, {
        allianceFormation: 'A temporary implementation coalition is forming.',
        allianceStrength: '6',
        allianceTensions: 'Partners disagree about review timing.',
        externalPressures: 'Supplier delays increase pressure for an interim measure.',
        thirdPartyActions: 'A non-player supplier offers limited substitute capacity.',
        geopoliticalContext: 'Partners want resilience without irreversible bloc alignment.'
    }, {
        teamId: team,
        timestamp: FIXED_TIMESTAMPS.response,
        participantKey,
        participantId: participantKey,
        clientId: fixtureId('notetaker-client', team, 'a'),
        participantLabel: fixtureLabel(`${TEAM_LABELS[team]} Notetaker A`)
    });

    return {
        id: fixtureId('notetaker-record', team),
        session_id: SESSION_ID,
        team,
        move: 1,
        phase: 1,
        participantKey,
        dynamics_analysis: dynamics,
        external_factors: alliance,
        observation_timeline: annotateObservationTimelineEntries([
            {
                id: fixtureId('observation', team, 'moment'),
                type: 'MOMENT',
                content: `${TRAINING_VISIBLE_FIXTURE_PREFIX}: The team linked its decision to a measurable checkpoint.`
            },
            {
                id: fixtureId('observation', team, 'quote'),
                type: 'QUOTE',
                content: `${TRAINING_VISIBLE_FIXTURE_PREFIX}: “We need a reversible first step.”`
            }
        ], {
            teamId: team,
            timestamp: FIXED_TIMESTAMPS.response,
            participantKey,
            participantId: participantKey,
            clientId: fixtureId('notetaker-client', team, 'a'),
            participantLabel: fixtureLabel(`${TEAM_LABELS[team]} Notetaker A`)
        }),
        updated_at: FIXED_TIMESTAMPS.response
    };
}

const catalogDefinition = {
    version: TRAINING_CURRICULUM_VERSION,
    strategicOrientations,
    artifacts,
    counterparts: {
        handoffs,
        whiteCellReturns,
        whiteCellApprovals,
        rfis,
        rfiAnswers,
        communications,
        injects,
        notifications,
        actionNotifications,
        proposalThreads,
        deckStates,
        timelineEntries,
        notetakerRecords: TRAINING_CONTENT_TEAMS.map(buildNotetakerRecord)
    }
};

function cloneDeterministicValue(value) {
    if (Array.isArray(value)) return value.map(cloneDeterministicValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, cloneDeterministicValue(entry)])
    );
}

export function buildTrainingFixtureCatalog() {
    return deepFreezeTrainingContent(
        validateTrainingFixtureCatalog(cloneDeterministicValue(catalogDefinition))
    );
}

export const TRAINING_FIXTURE_CATALOG = buildTrainingFixtureCatalog();

function collectFixturesById(value, index = new Map()) {
    if (!value || typeof value !== 'object') return index;
    if (!Array.isArray(value) && typeof value.id === 'string') {
        index.set(value.id, value);
    }
    Object.values(value).forEach((entry) => collectFixturesById(entry, index));
    return index;
}

const FIXTURE_INDEX = collectFixturesById(TRAINING_FIXTURE_CATALOG);

export function getTrainingFixtureById(id) {
    return FIXTURE_INDEX.get(id) || null;
}

export function getTrainingProfileFixtureBundle(team, semanticRole) {
    if (!TRAINING_CONTENT_TEAMS.includes(team) || !TRAINING_CONTENT_ROLES.includes(semanticRole)) return null;
    const counterparts = TRAINING_FIXTURE_CATALOG.counterparts;
    return Object.freeze({
        team,
        semanticRole,
        strategicOrientation: TRAINING_FIXTURE_CATALOG.strategicOrientations[team],
        artifact: TRAINING_FIXTURE_CATALOG.artifacts[team],
        handoff: counterparts.handoffs.find((fixture) => fixture.team === team) || null,
        whiteCellReturn: counterparts.whiteCellReturns.find((fixture) => fixture.team === team) || null,
        rfi: counterparts.rfis.find((fixture) => fixture.team === team) || null,
        rfiAnswer: counterparts.rfiAnswers.find((fixture) => fixture.team === team) || null,
        communication: counterparts.communications.find((fixture) => fixture.to_role === `${team}_scribe`) || null,
        inject: counterparts.injects.find((fixture) => fixture.to_role === team) || null,
        notification: counterparts.notifications.find((fixture) => fixture.id.endsWith(`:${team}`)) || null,
        actionNotification: counterparts.actionNotifications.find((fixture) => (
            fixture.metadata?.recipient_team === team
        )) || null,
        proposalThreads: Object.freeze(counterparts.proposalThreads.filter((fixture) => (
            fixture.metadata?.recipient_team === team
        ))),
        deckState: counterparts.deckStates.find((fixture) => fixture.team === team) || null,
        timelineEntries: Object.freeze(counterparts.timelineEntries.filter((fixture) => (
            fixture.team === team || fixture.metadata?.recipient_team === team
        ))),
        notetakerRecord: counterparts.notetakerRecords.find((fixture) => fixture.team === team) || null
    });
}

export { FIXED_TIMESTAMPS, SESSION_ID as TRAINING_FIXTURE_SESSION_ID };
