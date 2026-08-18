import {
    TRAINING_FIXTURE_CATALOG,
    getTrainingFixtureById
} from './fixtures.js';
import {
    TRAINING_ACTION_IDS_BY_ROLE,
    TRAINING_CONTENT_ROLES,
    TRAINING_CONTENT_TEAMS,
    TRAINING_CURRICULUM_VERSION,
    deepFreezeTrainingContent,
    validateTrainingCurriculum
} from './schema.js';

const TEAM_CONTENT = Object.freeze({
    blue: Object.freeze({ label: 'Blue', artifactName: 'Blue Action' }),
    red: Object.freeze({ label: 'Red', artifactName: 'Red Action' }),
    green: Object.freeze({ label: 'Green', artifactName: 'Green Proposal' }),
    industry: Object.freeze({ label: 'Industry', artifactName: 'Industry Proposal' })
});

const ROLE_CONTENT = Object.freeze({
    scribe: Object.freeze({
        title: 'Scribe',
        summary: 'Use the native Scribe controls to author, forward, revise, and verify the team record.'
    }),
    facilitator: Object.freeze({
        title: 'Facilitator',
        summary: 'Use the native Facilitator controls to review, project, coordinate, submit, and verify team work.'
    }),
    notetaker: Object.freeze({
        title: 'Notetaker',
        summary: 'Use the native Notetaker controls to preserve reasoning without editing official records.'
    })
});

const SCRIBE_FORM_TARGETS = Object.freeze({
    blue: Object.freeze({
        saveDraft: '[data-blue-action-nav="saveDraft"]',
        forward: '[data-blue-action-nav="submit"]'
    }),
    red: Object.freeze({
        saveDraft: '[data-blue-action-nav="saveDraft"]',
        forward: '[data-blue-action-nav="submit"]'
    }),
    green: Object.freeze({
        saveDraft: '[data-proposal-nav="saveDraft"]',
        forward: '[data-proposal-nav="forward"]'
    }),
    industry: Object.freeze({
        saveDraft: '[data-proposal-nav="saveDraft"]',
        forward: '[data-proposal-nav="forward"]'
    })
});

const ROLE_TARGETS = Object.freeze({
    scribe: Object.freeze({
        completeOrientation: '#strategicOrientationBtn',
        reviewWorkedArtifact: '.toggle-action-card-btn',
        createDraft: '#newActionBtn',
        reviseReturnedArtifact: '.edit-action-btn',
        verifyHandoff: '[data-section="timeline"]'
    }),
    facilitator: Object.freeze({
        reviewForwardedArtifact: '#teamActionReviewViewBtn',
        projectArtifact: '#presentBtn',
        createReviseRfi: '[data-facilitator-new-rfi]',
        readAndCommunicate: '[data-facilitator-new-communication]',
        submitArtifact: '[data-scribe-action-submit]',
        verifyReceipt: '#facilitatorWorkspacePanel'
    }),
    notetaker: Object.freeze({
        saveObservation: '#captureForm button[type="submit"]',
        captureMomentAndQuote: 'input[name="captureType"][value="MOMENT"]',
        saveDynamicsAndAlliances: 'button[form="dynamicsForm"]',
        respondToInbox: '[data-section="inbox"]',
        reviewActionAndTimeline: '[data-section="actions"]',
        verifyExplanatoryRecord: '#dynamicsSummary'
    })
});

function stepId(role, team, actionId) {
    return `training.v2.${role}.${team}.${actionId}`;
}

function moduleId(role, team) {
    return `training.v2.${role}.${team}`;
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
    actionId,
    actionTitle,
    instruction,
    targetSelector,
    expectedTrainingEvent,
    successMessage,
    recoveryHint,
    openAction,
    narrationScript,
    targetType = 'control',
    fixtureRefs = []
}) {
    return {
        id: stepId(role, team, actionId),
        actionId,
        semanticRole: role,
        supportedTeams: [team],
        actionTitle,
        instruction,
        targetSelector,
        targetType,
        expectedTrainingEvent,
        successMessage,
        ...(recoveryHint ? { recoveryHint } : {}),
        ...(openAction ? { openAction } : {}),
        ...(narrationScript ? { narrationScript } : {}),
        fixtureRefs
    };
}

function buildScribeSteps(team) {
    const { label, artifactName } = TEAM_CONTENT[team];
    const fixtures = fixtureRefsFor(team);
    const formTargets = SCRIBE_FORM_TARGETS[team];
    return [
        makeStep({
            role: 'scribe', team, actionId: 'complete-orientation',
            actionTitle: 'Complete Strategic Orientation',
            instruction: `Complete every required ${label} orientation and forecast field, then forward the record.`,
            targetSelector: ROLE_TARGETS.scribe.completeOrientation,
            expectedTrainingEvent: 'scribe.orientation.forwarded',
            successMessage: 'Strategic Orientation reached the Facilitator.',
            recoveryHint: 'Resolve the highlighted required field before forwarding.',
            openAction: 'scribe.open.orientation',
            narrationScript: 'The orientation records the assumptions and forecast behind the team decision.',
            fixtureRefs: [fixtures.orientation, fixtures.handoff]
        }),
        makeStep({
            role: 'scribe', team, actionId: 'review-worked-artifact',
            actionTitle: `Open the worked ${artifactName}`,
            instruction: 'Open the training fixture and review its complete field set.',
            targetSelector: ROLE_TARGETS.scribe.reviewWorkedArtifact,
            expectedTrainingEvent: 'scribe.artifact.example_opened',
            successMessage: `The worked ${artifactName} is open.`,
            recoveryHint: 'Use the Action details control on the training fixture.',
            openAction: 'scribe.open.worked_artifact',
            narrationScript: 'The worked fixture uses the same team-specific taxonomy as the native form.',
            fixtureRefs: [fixtures.artifact]
        }),
        makeStep({
            role: 'scribe', team, actionId: 'create-draft',
            actionTitle: `Create a ${artifactName} draft`,
            instruction: 'Complete the native form and save one valid draft.',
            targetSelector: ROLE_TARGETS.scribe.createDraft,
            expectedTrainingEvent: 'scribe.artifact.draft_saved',
            successMessage: `The ${artifactName} draft is saved.`,
            recoveryHint: 'Correct any native validation error and save the same draft.',
            openAction: 'scribe.open.new_artifact',
            narrationScript: 'A saved draft remains editable and has not crossed the role boundary.',
            fixtureRefs: [fixtures.artifact]
        }),
        makeStep({
            role: 'scribe', team, actionId: 'forward-artifact',
            actionTitle: 'Forward to Facilitator',
            instruction: `Use the native handoff control on the saved ${artifactName}.`,
            targetSelector: formTargets.forward,
            expectedTrainingEvent: 'scribe.artifact.forwarded',
            successMessage: `The ${artifactName} is now with the Facilitator.`,
            recoveryHint: 'Reopen the saved draft and resolve any remaining validation error.',
            openAction: 'scribe.open.current_draft',
            narrationScript: 'Forwarding changes ownership without giving the Scribe final submission authority.',
            fixtureRefs: [fixtures.artifact, fixtures.handoff]
        }),
        makeStep({
            role: 'scribe', team, actionId: 'revise-returned-artifact',
            actionTitle: `Revise the returned ${artifactName}`,
            instruction: 'Open the returned record, address its note, and forward the same record again.',
            targetSelector: ROLE_TARGETS.scribe.reviseReturnedArtifact,
            expectedTrainingEvent: 'scribe.artifact.revision_forwarded',
            successMessage: 'The corrected revision preserved the original record identity.',
            recoveryHint: 'Edit the returned record instead of creating a new one.',
            openAction: 'scribe.open.returned_artifact',
            narrationScript: 'Revision history stays intact when the returned record is corrected in place.',
            fixtureRefs: [fixtures.whiteCellReturn, fixtures.handoff]
        }),
        makeStep({
            role: 'scribe', team, actionId: 'verify-handoff',
            actionTitle: 'Verify the handoff',
            instruction: 'Open Timeline and confirm the forwarded state has a matching receipt event.',
            targetSelector: ROLE_TARGETS.scribe.verifyHandoff,
            targetType: 'read_only_receipt',
            expectedTrainingEvent: 'scribe.handoff.verified',
            successMessage: 'The lifecycle state and timeline receipt confirm the handoff.',
            recoveryHint: 'Return to Actions if the forwarded lifecycle state is not visible.',
            openAction: 'scribe.open.timeline',
            narrationScript: 'The lifecycle state and chronological receipt provide independent handoff evidence.',
            fixtureRefs: [fixtures.handoff]
        })
    ];
}

function buildFacilitatorSteps(team) {
    const { artifactName } = TEAM_CONTENT[team];
    const fixtures = fixtureRefsFor(team);
    return [
        makeStep({
            role: 'facilitator', team, actionId: 'review-forwarded-artifact',
            actionTitle: `Review the forwarded ${artifactName}`,
            instruction: 'Open Team Action Review and confirm the Scribe handoff state.',
            targetSelector: ROLE_TARGETS.facilitator.reviewForwardedArtifact,
            expectedTrainingEvent: 'facilitator.artifact.reviewed',
            successMessage: `The forwarded ${artifactName} is ready for Facilitator work.`,
            recoveryHint: 'Select the forwarded training fixture in Team Action Review.',
            openAction: 'facilitator.open.action_review',
            narrationScript: 'Review begins from the Scribe-owned record and its forwarded lifecycle state.',
            fixtureRefs: [fixtures.artifact, fixtures.handoff]
        }),
        makeStep({
            role: 'facilitator', team, actionId: 'project-artifact',
            actionTitle: `Project the ${artifactName}`,
            instruction: 'Use Present, then exit presentation after the artifact is visible.',
            targetSelector: ROLE_TARGETS.facilitator.projectArtifact,
            expectedTrainingEvent: 'facilitator.artifact.projected',
            successMessage: 'Presentation ended and focus returned to the walkthrough.',
            recoveryHint: 'Exit Present before continuing.',
            openAction: 'facilitator.open.reviewed_artifact',
            narrationScript: 'Projection supports room review but does not submit the artifact.',
            fixtureRefs: [fixtures.artifact, fixtures.deckState]
        }),
        makeStep({
            role: 'facilitator', team, actionId: 'create-revise-rfi',
            actionTitle: 'Create and revise an RFI',
            instruction: 'Submit one Request for Information, correct its return, and resubmit the same record.',
            targetSelector: ROLE_TARGETS.facilitator.createReviseRfi,
            expectedTrainingEvent: 'facilitator.rfi.resubmitted',
            successMessage: 'The corrected RFI kept its original record identity.',
            recoveryHint: 'Reopen the returned RFI instead of creating another request.',
            openAction: 'facilitator.open.rfis',
            narrationScript: 'A clarification return continues the same Request for Information revision chain.',
            fixtureRefs: [fixtures.rfi, fixtures.rfiAnswer]
        }),
        makeStep({
            role: 'facilitator', team, actionId: 'read-and-communicate',
            actionTitle: 'Read the answer and communicate',
            instruction: 'Read the RFI answer, then send one direct message from Communications.',
            targetSelector: ROLE_TARGETS.facilitator.readAndCommunicate,
            expectedTrainingEvent: 'facilitator.communication.sent',
            successMessage: 'The RFI answer stayed with its record and the direct message was sent.',
            recoveryHint: 'Open the answered RFI before composing the direct message.',
            openAction: 'facilitator.open.communications',
            narrationScript: 'RFI answers and direct messages remain separate, traceable communication records.',
            fixtureRefs: [fixtures.rfiAnswer, fixtures.communication, fixtures.notification]
        }),
        makeStep({
            role: 'facilitator', team, actionId: 'submit-artifact',
            actionTitle: `Submit the ${artifactName}`,
            instruction: 'Use the native final-submission control after every prerequisite is satisfied.',
            targetSelector: ROLE_TARGETS.facilitator.submitArtifact,
            expectedTrainingEvent: 'facilitator.artifact.submitted',
            successMessage: `The ${artifactName} reached the simulated White Cell fixture.`,
            recoveryHint: 'Return to Team Action Review and resolve the unmet prerequisite.',
            openAction: 'facilitator.open.submission',
            narrationScript: 'Final submission belongs to the Facilitator and follows review and projection.',
            fixtureRefs: [fixtures.artifact]
        }),
        makeStep({
            role: 'facilitator', team, actionId: 'verify-receipt',
            actionTitle: 'Verify the submission receipt',
            instruction: 'Confirm the submitted lifecycle state and its matching receipt or timeline entry.',
            targetSelector: ROLE_TARGETS.facilitator.verifyReceipt,
            targetType: 'read_only_receipt',
            expectedTrainingEvent: 'facilitator.receipt.verified',
            successMessage: 'The lifecycle state and receipt confirm final submission.',
            recoveryHint: 'Refresh the training fixture if the receipt is not yet visible.',
            openAction: 'facilitator.open.receipt',
            narrationScript: 'A receipt verifies delivery independently from the submission control.',
            fixtureRefs: [fixtures.artifact]
        })
    ];
}

function buildNotetakerSteps(team) {
    const fixtures = fixtureRefsFor(team);
    return [
        makeStep({
            role: 'notetaker', team, actionId: 'save-observation',
            actionTitle: 'Save an observation',
            instruction: 'Record the team decision and the reasoning behind it in Quick Capture.',
            targetSelector: ROLE_TARGETS.notetaker.saveObservation,
            expectedTrainingEvent: 'notetaker.observation.saved',
            successMessage: 'The observation was appended to the training record.',
            recoveryHint: 'Add both the decision and its reasoning before saving.',
            openAction: 'notetaker.open.capture',
            narrationScript: 'An observation preserves why the team reached its decision.',
            fixtureRefs: [fixtures.notetakerRecord]
        }),
        makeStep({
            role: 'notetaker', team, actionId: 'capture-moment-and-quote',
            actionTitle: 'Capture a key moment and quote',
            instruction: 'Append one Key Moment and one Quote as separate capture types.',
            targetSelector: ROLE_TARGETS.notetaker.captureMomentAndQuote,
            expectedTrainingEvent: 'notetaker.capture.pair_saved',
            successMessage: 'The key moment and quote remain distinct entries.',
            recoveryHint: 'Switch the capture type before saving the second entry.',
            openAction: 'notetaker.open.capture',
            narrationScript: 'Separate capture types preserve turning points and exact words without conflating them.',
            fixtureRefs: [fixtures.notetakerRecord]
        }),
        makeStep({
            role: 'notetaker', team, actionId: 'save-dynamics-and-alliances',
            actionTitle: 'Save dynamics and alliance notes',
            instruction: 'Save the move-scoped dynamics and alliance forms for the active seat.',
            targetSelector: ROLE_TARGETS.notetaker.saveDynamicsAndAlliances,
            expectedTrainingEvent: 'notetaker.seat_notes.saved',
            successMessage: 'The active seat changed and the comparison seat remained untouched.',
            recoveryHint: 'Resolve the unsaved or offline state before retrying the same seat.',
            openAction: 'notetaker.open.dynamics',
            narrationScript: 'Move notes belong to one Notetaker seat and cannot overwrite another seat.',
            fixtureRefs: [fixtures.notetakerRecord]
        }),
        makeStep({
            role: 'notetaker', team, actionId: 'respond-to-inbox',
            actionTitle: 'Respond to the inbox update',
            instruction: 'Open the inbox item and save one observation about its effect on team reasoning.',
            targetSelector: ROLE_TARGETS.notetaker.respondToInbox,
            expectedTrainingEvent: 'notetaker.inbox.followup_saved',
            successMessage: 'The inbox item is read and its reasoning impact is recorded.',
            recoveryHint: 'Keep the official action unchanged while recording the team response.',
            openAction: 'notetaker.open.inbox',
            narrationScript: 'The inbox update changes what the team considers without changing the official action.',
            fixtureRefs: [fixtures.inject, fixtures.communication]
        }),
        makeStep({
            role: 'notetaker', team, actionId: 'review-action-and-timeline',
            actionTitle: 'Review the action and timeline',
            instruction: 'Open both read-only surfaces and confirm neither exposes an edit control.',
            targetSelector: ROLE_TARGETS.notetaker.reviewActionAndTimeline,
            expectedTrainingEvent: 'notetaker.readonly.reviewed',
            successMessage: 'The official action and timeline remained read-only.',
            recoveryHint: 'Use Team Actions first, then Session Timeline.',
            openAction: 'notetaker.open.actions',
            narrationScript: 'Official records provide context while remaining outside Notetaker edit authority.',
            fixtureRefs: [fixtures.artifact]
        }),
        makeStep({
            role: 'notetaker', team, actionId: 'verify-explanatory-record',
            actionTitle: 'Verify the explanatory record',
            instruction: 'Locate the saved seat note and any shared timeline snapshot created from it.',
            targetSelector: ROLE_TARGETS.notetaker.verifyExplanatoryRecord,
            targetType: 'read_only_receipt',
            expectedTrainingEvent: 'notetaker.record.verified',
            successMessage: 'The explanatory note is traceable without becoming an official action.',
            recoveryHint: 'Return to the active seat record if the saved note is missing.',
            openAction: 'notetaker.open.explanatory_record',
            narrationScript: 'The explanatory record preserves reasoning while the official action remains unchanged.',
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
        title: `${teamContent.label} ${roleContent.title}`,
        summary: roleContent.summary,
        narrationScript: roleContent.summary,
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
    actionOrderByRole: Object.fromEntries(Object.entries(TRAINING_ACTION_IDS_BY_ROLE).map(([role, actionIds]) => [role, [...actionIds]])),
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
    });
});

export const TRAINING_CURRICULUM = deepFreezeTrainingContent(curriculum);

export function getTrainingModule(semanticRole, team) {
    return TRAINING_CURRICULUM.profiles?.[semanticRole]?.[team] || null;
}

export function getTrainingStep(semanticRole, team, actionId) {
    return getTrainingModule(semanticRole, team)?.steps.find((step) => step.actionId === actionId) || null;
}

export function getTrainingCurriculumProfiles() {
    return TRAINING_CONTENT_ROLES.flatMap((semanticRole) => (
        TRAINING_CONTENT_TEAMS.map((team) => getTrainingModule(semanticRole, team))
    ));
}

export { ROLE_TARGETS as TRAINING_ROLE_TARGET_SELECTORS };
