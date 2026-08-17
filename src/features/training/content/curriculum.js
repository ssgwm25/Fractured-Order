import {
    TRAINING_FIXTURE_CATALOG,
    getTrainingFixtureById
} from './fixtures.js';
import {
    TRAINING_CONTENT_ROLES,
    TRAINING_CONTENT_TEAMS,
    TRAINING_CURRICULUM_VERSION,
    TRAINING_STAGE_IDS,
    deepFreezeTrainingContent,
    validateTrainingCurriculum
} from './schema.js';

const FALLBACK_TARGET = Object.freeze({ selector: 'main', label: 'Main role workspace' });

const ROLE_TARGETS = Object.freeze({
    scribe: Object.freeze({
        orient: '.sidebar-session',
        show: '.header-game-state',
        guide: '[data-section="actions"]',
        practice: '#newActionBtn',
        respond: '[data-section="responses"]',
        retrieve: '#actionsSection',
        reflect: '.sidebar-session'
    }),
    facilitator: Object.freeze({
        orient: '.sidebar-session',
        show: '.scribe-view-switch',
        guide: '#teamActionReviewViewBtn',
        practice: '#rfiViewBtn',
        respond: '#communicationsViewBtn',
        retrieve: '#presentBtn',
        reflect: '.sidebar-session'
    }),
    notetaker: Object.freeze({
        orient: '.sidebar-session',
        show: '.header-game-state',
        guide: '[data-section="capture"]',
        practice: '[data-section="dynamics"]',
        respond: '[data-section="inbox"]',
        retrieve: '[data-section="timeline"]',
        reflect: '.sidebar-session'
    })
});

const TEAM_CONTENT = Object.freeze({
    blue: Object.freeze({
        label: 'Blue',
        artifactName: 'structured Blue Action',
        practiceVerb: 'draft and forward a coordinated export-control action',
        acronymPrimer: 'People\'s Republic of China (PRC) is written out here before the fixture uses the acronym.'
    }),
    red: Object.freeze({
        label: 'Red',
        artifactName: 'Move Response',
        practiceVerb: 'draft a response with a concrete mechanism and pressure point',
        acronymPrimer: 'People\'s Republic of China (PRC) is written out here before the fixture uses the acronym.'
    }),
    green: Object.freeze({
        label: 'Green',
        artifactName: 'multi-partner proposal',
        practiceVerb: 'draft a proposal with partner, sector, and supply-chain choices',
        acronymPrimer: 'European Union (EU) is written out here before the fixture uses the acronym.'
    }),
    industry: Object.freeze({
        label: 'Industry',
        artifactName: 'Industry proposal',
        practiceVerb: 'draft a proposal with industry, country, and activity fields',
        acronymPrimer: 'United States (US) Industry and Republic of Korea (ROK) are written out here before the fixture uses those acronyms.'
    })
});

const ROLE_CONTENT = Object.freeze({
    scribe: Object.freeze({
        title: 'Scribe',
        objective: 'Create the team-specific orientation and move artifact, then hand it to the Facilitator without claiming final submission authority.',
        moduleCopy: 'You will capture the team decision in the shared action workflow and make the handoff clear.',
        moduleNarration: 'As Scribe, you\'ll turn the team\'s discussion into a clear, complete record — then hand it to the Facilitator.'
    }),
    facilitator: Object.freeze({
        title: 'Facilitator',
        objective: 'Review and project team work, manage Requests for Information (RFIs) and communications, and make the final submission to simulated White Cell.',
        moduleCopy: 'You will move between review, deck, Request for Information (RFI), communication, and submission workspaces.',
        moduleNarration: 'As Facilitator, you\'ll check the team record, coordinate support, and own the final handoff — to White Cell.'
    }),
    notetaker: Object.freeze({
        title: 'Notetaker',
        objective: 'Create seat-scoped observations and dynamics notes while reviewing team actions, inbox updates, and the official timeline without editing them.',
        moduleCopy: 'You will preserve reasoning and context without becoming an action author or approver.',
        moduleNarration: 'As Notetaker, you\'ll capture how the team reached a decision — while keeping your notes separate from official artifacts.'
    })
});

function stepId(role, team, stage) {
    return `training.v1.${role}.${team}.${stage}`;
}

function moduleId(role, team) {
    return `training.v1.${role}.${team}`;
}

function fixtureRefsFor(team) {
    const counterparts = TRAINING_FIXTURE_CATALOG.counterparts;
    return {
        orientation: TRAINING_FIXTURE_CATALOG.strategicOrientations[team].id,
        artifact: TRAINING_FIXTURE_CATALOG.artifacts[team].id,
        handoff: counterparts.handoffs.find((fixture) => fixture.team === team).id,
        whiteCellReturn: counterparts.whiteCellReturns.find((fixture) => fixture.team === team).id,
        rfi: counterparts.rfis.find((fixture) => fixture.team === team).id,
        rfiAnswer: counterparts.rfiAnswers.find((fixture) => fixture.team === team).id,
        communication: counterparts.communications.find((fixture) => fixture.to_role === `${team}_scribe`).id,
        inject: counterparts.injects.find((fixture) => fixture.to_role === team).id,
        notification: counterparts.notifications.find((fixture) => fixture.id.endsWith(`:${team}`)).id,
        deckState: counterparts.deckStates.find((fixture) => fixture.team === team).id,
        notetakerRecord: counterparts.notetakerRecords.find((fixture) => fixture.team === team).id
    };
}

function makeStep({
    role,
    team,
    stage,
    learningObjective,
    coachCopy,
    narrationScript,
    interactionType,
    masteryPredicate,
    hint,
    correctFeedback,
    retryFeedback,
    fixtureRefs = [],
    simulatedResponse = null
}) {
    return {
        id: stepId(role, team, stage),
        stage,
        semanticRole: role,
        supportedTeams: [team],
        learningObjective,
        coachCopy,
        narrationScript,
        targetSelector: ROLE_TARGETS[role][stage],
        accessibleFallbackTarget: { ...FALLBACK_TARGET },
        interactionType,
        masteryPredicate,
        hint,
        correctFeedback,
        retryFeedback,
        fixtureRefs,
        simulatedResponse
    };
}

function buildScribeSteps(team) {
    const teamContent = TEAM_CONTENT[team];
    const fixtures = fixtureRefsFor(team);
    return [
        makeStep({
            role: 'scribe', team, stage: 'orient',
            learningObjective: 'Explain that the Scribe captures structured team decisions and hands them to the Facilitator.',
            coachCopy: `You are the ${teamContent.label} Scribe. Turn the room's decision into a clear record; the Facilitator owns final submission.`,
            narrationScript: `Your job is simple: capture ${teamContent.label} decisions accurately, check every required field, and pass the record to the Facilitator.`,
            interactionType: 'read',
            masteryPredicate: { kind: 'acknowledgement', eventKey: stepId('scribe', team, 'orient') },
            hint: 'Focus on who authors the record and who submits it.',
            correctFeedback: 'Right—the Scribe authors and forwards; the Facilitator submits.',
            retryFeedback: 'Try again: creating the record and final submission belong to different roles.'
        }),
        makeStep({
            role: 'scribe', team, stage: 'show',
            learningObjective: 'Recognize the team-specific Strategic Orientation fields and the current move context.',
            coachCopy: `First, inspect the ${teamContent.label} Strategic Orientation fixture and its team-specific forecast fields.`,
            narrationScript: `Start with Strategic Orientation — the team's north star. This fixture uses the current choices and the exact narrative fields ${teamContent.label} needs.`,
            interactionType: 'observe',
            masteryPredicate: { kind: 'viewed_fixture', fixtureId: fixtures.orientation },
            hint: 'Check the move header and the orientation summary together.',
            correctFeedback: 'You found the orientation and its required forecast evidence.',
            retryFeedback: 'Open the orientation summary and identify both the team choice and forecast.',
            fixtureRefs: [fixtures.orientation]
        }),
        makeStep({
            role: 'scribe', team, stage: 'guide',
            learningObjective: `Identify the required fields in the ${teamContent.artifactName}.`,
            coachCopy: `Now follow a worked ${teamContent.artifactName}. Notice how each choice supports one objective.`,
            narrationScript: `This example uses the same shape as the live shared-action workflow, so what you practice here will feel familiar later.`,
            interactionType: 'guided_action',
            masteryPredicate: { kind: 'guided_event', eventKey: stepId('scribe', team, 'guide') },
            hint: 'Connect the objective, mechanism, target, and expected outcome.',
            correctFeedback: 'Good—the artifact fields tell one coherent strategic story.',
            retryFeedback: 'Review the fields again and find the link between action and expected outcome.',
            fixtureRefs: [fixtures.artifact]
        }),
        makeStep({
            role: 'scribe', team, stage: 'practice',
            learningObjective: `Complete and forward a valid ${teamContent.artifactName}.`,
            coachCopy: `Your turn: ${teamContent.practiceVerb}, then forward it to the Facilitator.`,
            narrationScript: `Complete the required fields. If validation flags something, fix it — then use the Scribe-to-Facilitator handoff.`,
            interactionType: 'practice_action',
            masteryPredicate: { kind: 'training_command', command: `scribe.${team}.artifact-forwarded` },
            hint: 'A concrete expected outcome makes the artifact easier to review.',
            correctFeedback: 'The artifact is complete and the simulated Facilitator received it.',
            retryFeedback: 'Keep the draft open and resolve the highlighted required field before forwarding.',
            fixtureRefs: [fixtures.artifact, fixtures.handoff],
            simulatedResponse: fixtures.handoff
        }),
        makeStep({
            role: 'scribe', team, stage: 'respond',
            learningObjective: 'Use a return note to revise the same training artifact without treating it as adjudication.',
            coachCopy: 'Simulated White Cell returned the fixture. Read the note, revise the same record, and hand it back to the Facilitator.',
            narrationScript: 'This return is for practice — it is not an adjudication. Revise the same record so its identity stays intact.',
            interactionType: 'simulated_response',
            masteryPredicate: { kind: 'training_command', command: `scribe.${team}.returned-artifact-revised` },
            hint: 'Address the timing and observable outcome in the return note.',
            correctFeedback: 'Your revision answers the note and preserves the handoff chain.',
            retryFeedback: 'Revise the existing fixture instead of starting an unrelated artifact.',
            fixtureRefs: [fixtures.whiteCellReturn],
            simulatedResponse: fixtures.whiteCellReturn
        }),
        makeStep({
            role: 'scribe', team, stage: 'retrieve',
            learningObjective: 'Distinguish Draft, Forward to Facilitator, and Submit to White Cell.',
            coachCopy: 'What should a Scribe do after every required field is complete?',
            narrationScript: 'Choose the action that keeps the role boundary clear. Remember, the Scribe hands off; the Facilitator submits.',
            interactionType: 'retrieval_check',
            masteryPredicate: { kind: 'choice', correctOptionId: 'forward-to-facilitator' },
            hint: 'The Facilitator owns the final White Cell submission.',
            correctFeedback: 'Correct: forward the complete artifact to the Facilitator.',
            retryFeedback: 'Not yet. The Scribe does not make the final White Cell submission.'
        }),
        makeStep({
            role: 'scribe', team, stage: 'reflect',
            learningObjective: 'Locate the handoff and timeline evidence that confirms the work landed.',
            coachCopy: 'Finish by checking the artifact state and timeline entry that confirm the Facilitator received your work.',
            narrationScript: 'In a live session, check that the handoff landed. Don\'t assume one button press finished the workflow.',
            interactionType: 'reflection',
            masteryPredicate: { kind: 'acknowledgement', eventKey: stepId('scribe', team, 'reflect') },
            hint: 'Look for both lifecycle state and chronological evidence.',
            correctFeedback: 'You can now verify that authored work reached its next owner.',
            retryFeedback: 'Check the artifact lifecycle and timeline before finishing.',
            fixtureRefs: [fixtures.handoff]
        })
    ];
}

function buildFacilitatorSteps(team) {
    const teamContent = TEAM_CONTENT[team];
    const fixtures = fixtureRefsFor(team);
    return [
        makeStep({
            role: 'facilitator', team, stage: 'orient',
            learningObjective: 'Explain that the Facilitator reviews, projects, coordinates support, and owns final submission.',
            coachCopy: `You are the ${teamContent.label} Facilitator. You turn the Scribe's record into a reviewable, room-ready submission.`,
            narrationScript: 'Review the team record, use the support workspaces, and submit only when the artifact is genuinely ready.',
            interactionType: 'read',
            masteryPredicate: { kind: 'acknowledgement', eventKey: stepId('facilitator', team, 'orient') },
            hint: 'Focus on review, support, presentation, and final submission.',
            correctFeedback: 'Right—the Facilitator owns the final handoff to White Cell.',
            retryFeedback: 'Try again: this role reviews and submits rather than authoring every team decision.'
        }),
        makeStep({
            role: 'facilitator', team, stage: 'show',
            learningObjective: 'Recognize the five Facilitator workspaces and their distinct purposes.',
            coachCopy: 'Scan Team Action Review, Deck, RFIs, Communications, and Notifications before opening the artifact.',
            narrationScript: 'Each workspace answers one question: what changed, what should we project, what should we ask, what should we message, and what needs attention now?',
            interactionType: 'observe',
            masteryPredicate: { kind: 'viewed_fixture', fixtureId: fixtures.deckState },
            hint: 'Use the workspace tabs rather than browser navigation.',
            correctFeedback: 'You identified the workspace map.',
            retryFeedback: 'Review the tab row and name the purpose of each workspace.',
            fixtureRefs: [fixtures.deckState]
        }),
        makeStep({
            role: 'facilitator', team, stage: 'guide',
            learningObjective: `Review the forwarded ${teamContent.artifactName} and its lifecycle state.`,
            coachCopy: `Open the forwarded ${teamContent.artifactName}. Check its objective, required fields, and Scribe handoff.`,
            narrationScript: 'A forwarded artifact is ready for your review — not automatically ready for White Cell.',
            interactionType: 'guided_action',
            masteryPredicate: { kind: 'guided_event', eventKey: stepId('facilitator', team, 'guide') },
            hint: 'Confirm the artifact state before considering submission.',
            correctFeedback: 'You verified both content and lifecycle state.',
            retryFeedback: 'Reopen Team Action Review and locate the handoff state.',
            fixtureRefs: [fixtures.artifact, fixtures.handoff]
        }),
        makeStep({
            role: 'facilitator', team, stage: 'practice',
            learningObjective: 'Create and revise a Request for Information through the current RFI workflow.',
            coachCopy: 'Create a Request for Information (RFI), then revise the same request after a clarification return.',
            narrationScript: 'An R F I — a Request for Information — asks White Cell for a ruling, clarification, or scenario detail. When you revise it, keep the same record.',
            interactionType: 'practice_action',
            masteryPredicate: { kind: 'training_command', command: `facilitator.${team}.rfi-resubmitted` },
            hint: 'Ask one specific question and select at least one category.',
            correctFeedback: 'The RFI was clarified and resubmitted as the same record.',
            retryFeedback: 'Revise the returned RFI instead of creating a second request.',
            fixtureRefs: [fixtures.rfi]
        }),
        makeStep({
            role: 'facilitator', team, stage: 'respond',
            learningObjective: 'Read the simulated RFI answer and distinguish direct communication from an action notification.',
            coachCopy: 'Read the simulated answer, then open the direct White Cell message without confusing it with an action notification.',
            narrationScript: 'Keep the channels straight. Answers stay with the R F I, direct messages live in Communications, and alerts point you to the right record.',
            interactionType: 'simulated_response',
            masteryPredicate: { kind: 'training_command', command: `facilitator.${team}.response-classified` },
            hint: 'Use the record destination and message family.',
            correctFeedback: 'You classified the answer, message, and alert correctly.',
            retryFeedback: 'Check whether the item is an RFI answer, a direct message, or a notification pointer.',
            fixtureRefs: [fixtures.rfiAnswer, fixtures.communication, fixtures.notification],
            simulatedResponse: fixtures.rfiAnswer
        }),
        makeStep({
            role: 'facilitator', team, stage: 'retrieve',
            learningObjective: 'Identify final submission, RFIs, communications, and projection as Facilitator capabilities.',
            coachCopy: 'Which role owns final submission, direct White Cell communication, RFIs, and projection?',
            narrationScript: 'Before you finish, recall the role boundary: who reviews, communicates, projects, and makes the final submission?',
            interactionType: 'retrieval_check',
            masteryPredicate: { kind: 'choice', correctOptionId: 'facilitator' },
            hint: 'Think about the role using this support deck.',
            correctFeedback: 'Correct: these are Facilitator capabilities.',
            retryFeedback: 'Review the workspace map and try again.'
        }),
        makeStep({
            role: 'facilitator', team, stage: 'reflect',
            learningObjective: 'Verify final submission through lifecycle and timeline feedback.',
            coachCopy: 'Finish by identifying where you would confirm the artifact reached White Cell.',
            narrationScript: 'Use lifecycle and timeline evidence to verify submission. Projection — or one button press — does not prove it landed.',
            interactionType: 'reflection',
            masteryPredicate: { kind: 'acknowledgement', eventKey: stepId('facilitator', team, 'reflect') },
            hint: 'Projection and submission are separate actions.',
            correctFeedback: 'You know how to verify the final handoff.',
            retryFeedback: 'Look for submitted lifecycle state and the matching timeline event.',
            fixtureRefs: [fixtures.artifact]
        })
    ];
}

function buildNotetakerSteps(team) {
    const teamContent = TEAM_CONTENT[team];
    const fixtures = fixtureRefsFor(team);
    return [
        makeStep({
            role: 'notetaker', team, stage: 'orient',
            learningObjective: 'Explain that Notetaker records are explanatory, seat-scoped, and separate from official artifacts.',
            coachCopy: `You are the ${teamContent.label} Notetaker. Capture how the team reasons without editing its official decisions.`,
            narrationScript: 'Your notes preserve the why behind a decision. They do not author, approve, or submit the team\'s action.',
            interactionType: 'read',
            masteryPredicate: { kind: 'acknowledgement', eventKey: stepId('notetaker', team, 'orient') },
            hint: 'Separate explanatory notes from official artifacts.',
            correctFeedback: 'Right—Notetaker evidence adds context without changing the decision.',
            retryFeedback: 'Try again: this role observes and records rather than approves.'
        }),
        makeStep({
            role: 'notetaker', team, stage: 'show',
            learningObjective: 'Use move, phase, and timer context to scope an observation.',
            coachCopy: 'Read the current move, phase, and timer before reviewing the example observation.',
            narrationScript: 'Context makes a note useful later. Capture when the reasoning happened — and which decision it informed.',
            interactionType: 'observe',
            masteryPredicate: { kind: 'viewed_fixture', fixtureId: fixtures.notetakerRecord },
            hint: 'Start with the active move and phase.',
            correctFeedback: 'You anchored the observation to the exercise window.',
            retryFeedback: 'Check the header context before interpreting the note.',
            fixtureRefs: [fixtures.notetakerRecord]
        }),
        makeStep({
            role: 'notetaker', team, stage: 'guide',
            learningObjective: 'Distinguish an observation, key moment, and quote.',
            coachCopy: 'Compare the worked observation, key moment, and quote. Each preserves a different kind of evidence.',
            narrationScript: 'Use the right kind of evidence: an observation explains reasoning, a key moment marks a turn, and a quote preserves exact words.',
            interactionType: 'guided_action',
            masteryPredicate: { kind: 'guided_event', eventKey: stepId('notetaker', team, 'guide') },
            hint: 'Ask whether the entry explains, marks, or quotes.',
            correctFeedback: 'You separated the three capture types.',
            retryFeedback: 'Review what each capture type preserves.',
            fixtureRefs: [fixtures.notetakerRecord]
        }),
        makeStep({
            role: 'notetaker', team, stage: 'practice',
            learningObjective: 'Save seat-scoped dynamics and alliance notes without overwriting another Notetaker.',
            coachCopy: 'Record one dynamics insight and one alliance shift for this move, then verify the second-seat fixture is unchanged.',
            narrationScript: 'Your move notes belong to your Notetaker seat. A manual save can publish a structured timeline snapshot — without replacing another seat\'s work.',
            interactionType: 'practice_action',
            masteryPredicate: { kind: 'training_command', command: `notetaker.${team}.seat-notes-saved` },
            hint: 'Describe reasoning and evidence, not only the outcome.',
            correctFeedback: 'Your seat-scoped notes were saved without changing the comparison fixture.',
            retryFeedback: 'Add both a dynamics observation and an alliance change before saving.',
            fixtureRefs: [fixtures.notetakerRecord]
        }),
        makeStep({
            role: 'notetaker', team, stage: 'respond',
            learningObjective: 'Use a simulated White Cell inject to decide what should be observed next.',
            coachCopy: 'Open the simulated inbox inject and identify which team reasoning should now be captured.',
            narrationScript: 'This inject changes the scenario. Capture how the team interprets it — but do not edit the official action.',
            interactionType: 'simulated_response',
            masteryPredicate: { kind: 'training_command', command: `notetaker.${team}.inject-observation-added` },
            hint: 'Capture the effect on reasoning, not a speculative adjudication.',
            correctFeedback: 'You connected the inject to observable team reasoning.',
            retryFeedback: 'Describe how the inject changed deliberation without changing the action itself.',
            fixtureRefs: [fixtures.inject, fixtures.communication],
            simulatedResponse: fixtures.inject
        }),
        makeStep({
            role: 'notetaker', team, stage: 'retrieve',
            learningObjective: 'Distinguish the official timeline from the Notetaker explanatory record.',
            coachCopy: 'Which record explains team reasoning without becoming the official event log?',
            narrationScript: 'Choose the Notetaker record for the explanation. Then confirm that the official timeline stays read-only.',
            interactionType: 'retrieval_check',
            masteryPredicate: { kind: 'choice', correctOptionId: 'notetaker-record' },
            hint: 'The timeline records what happened; your notes explain how the team got there.',
            correctFeedback: 'Correct: Notetaker notes explain; the timeline remains official and read-only.',
            retryFeedback: 'Compare explanatory notes with chronological official events.'
        }),
        makeStep({
            role: 'notetaker', team, stage: 'reflect',
            learningObjective: 'Identify where to verify saved seat notes, shared captures, action review, and timeline context.',
            coachCopy: 'Finish by tracing one note from your seat record to its optional shared timeline snapshot.',
            narrationScript: 'Finish with the ownership map: what stays with your seat, what is shared, and which official surfaces stay read-only.',
            interactionType: 'reflection',
            masteryPredicate: { kind: 'acknowledgement', eventKey: stepId('notetaker', team, 'reflect') },
            hint: 'Seat notes, quick captures, and timeline entries have different ownership.',
            correctFeedback: 'You can now preserve context without crossing the Notetaker boundary.',
            retryFeedback: 'Review the ownership of notes, captures, actions, and timeline entries.',
            fixtureRefs: [fixtures.notetakerRecord]
        })
    ];
}

const STEP_BUILDERS = Object.freeze({
    scribe: buildScribeSteps,
    facilitator: buildFacilitatorSteps,
    notetaker: buildNotetakerSteps
});

function buildModule(role, team) {
    const roleContent = ROLE_CONTENT[role];
    const teamContent = TEAM_CONTENT[team];
    const steps = STEP_BUILDERS[role](team);
    return {
        id: moduleId(role, team),
        semanticRole: role,
        supportedTeams: [team],
        learningObjective: roleContent.objective,
        coachCopy: `${teamContent.label} ${roleContent.title}: ${roleContent.moduleCopy} ${teamContent.acronymPrimer}`,
        narrationScript: roleContent.moduleNarration,
        targetSelector: 'main',
        accessibleFallbackTarget: { selector: 'body', label: `${teamContent.label} ${roleContent.title} role page` },
        interactionType: 'module',
        masteryPredicate: { kind: 'all_steps', stepIds: steps.map((step) => step.id) },
        hint: 'Complete the stages in order and use the feedback when a mastery check needs another attempt.',
        correctFeedback: `${teamContent.label} ${roleContent.title} path complete.`,
        retryFeedback: 'Return to the first incomplete mastery stage.',
        simulatedResponse: null,
        fixtureRefs: [...new Set(steps.flatMap((step) => step.fixtureRefs))],
        steps
    };
}

const profiles = Object.fromEntries(TRAINING_CONTENT_ROLES.map((role) => [
    role,
    Object.fromEntries(TRAINING_CONTENT_TEAMS.map((team) => [team, buildModule(role, team)]))
]));

const curriculum = {
    version: TRAINING_CURRICULUM_VERSION,
    stageOrder: [...TRAINING_STAGE_IDS],
    profiles
};

validateTrainingCurriculum(curriculum);
Object.values(curriculum.profiles).forEach((roleProfiles) => {
    Object.values(roleProfiles).forEach((module) => {
        module.fixtureRefs.forEach((fixtureId) => {
            if (!getTrainingFixtureById(fixtureId)) {
                throw new TypeError(`Invalid training content: ${module.id} references missing fixture ${fixtureId}.`);
            }
        });
        module.steps.forEach((step) => {
            if (step.simulatedResponse && !getTrainingFixtureById(step.simulatedResponse)) {
                throw new TypeError(`Invalid training content: ${step.id} references missing simulated response.`);
            }
        });
    });
});

export const TRAINING_CURRICULUM = deepFreezeTrainingContent(curriculum);

export function getTrainingModule(semanticRole, team) {
    return TRAINING_CURRICULUM.profiles?.[semanticRole]?.[team] || null;
}

export function getTrainingStep(semanticRole, team, stage) {
    return getTrainingModule(semanticRole, team)?.steps.find((step) => step.stage === stage) || null;
}

export function getTrainingCurriculumProfiles() {
    return TRAINING_CONTENT_ROLES.flatMap((semanticRole) => (
        TRAINING_CONTENT_TEAMS.map((team) => getTrainingModule(semanticRole, team))
    ));
}

export { ROLE_TARGETS as TRAINING_ROLE_TARGET_SELECTORS };
