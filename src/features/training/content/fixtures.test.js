import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { getBlueActionViewModel } from '../../actions/blueActionDetails.js';
import { getMoveResponseViewModel } from '../../actions/moveResponseDetails.js';
import { getProposalViewModel } from '../../actions/proposalDetails.js';
import {
    STRATEGIC_ORIENTATION_OPTIONS,
    getStrategicOrientationTeamProfile,
    parseStrategicOrientationDetails
} from '../../actions/strategicOrientationDetails.js';
import {
    PROPOSAL_RECIPIENT_STATUSES,
    getProposalThreadForRecipient,
    getProposalThreadStatus
} from '../../actions/proposalRecipientState.js';
import { readParticipantScopedNotetakerSection } from '../../notetaker/storage.js';
import {
    TRAINING_FIXTURE_CATALOG,
    buildTrainingFixtureCatalog,
    getTrainingFixtureById,
    getTrainingProfileFixtureBundle
} from './fixtures.js';
import {
    TRAINING_FIXTURE_ID_PREFIX,
    TRAINING_FIXTURE_LIMITS,
    TRAINING_VISIBLE_FIXTURE_PREFIX
} from './schema.js';

function readPath(value, path) {
    return path.split('.').reduce((current, key) => current?.[key], value);
}

function collectArrays(value, arrays = []) {
    if (Array.isArray(value)) {
        arrays.push(value);
        value.forEach((entry) => collectArrays(entry, arrays));
    } else if (value && typeof value === 'object') {
        Object.values(value).forEach((entry) => collectArrays(entry, arrays));
    }
    return arrays;
}

describe('deterministic training fixture catalog', () => {
    it.each(['blue', 'red', 'green', 'industry'])('uses the exact %s Strategic Orientation contract', (team) => {
        const action = TRAINING_FIXTURE_CATALOG.strategicOrientations[team];
        const details = parseStrategicOrientationDetails(action.ally_contingencies);
        const profile = getStrategicOrientationTeamProfile(team);

        expect(action.goal).toMatch(/^TRAINING FIXTURE/);
        expect(details).toMatchObject({
            team,
            artifactType: 'orientation_and_forecast',
            scribeHandoff: 'Forwarded'
        });
        expect(details.ownOrientation).toEqual(expect.objectContaining({
            id: expect.stringMatching(new RegExp(Object.keys(STRATEGIC_ORIENTATION_OPTIONS).join('|')))
        }));
        const ownOption = STRATEGIC_ORIENTATION_OPTIONS[details.ownOrientation.id];
        expect(details.ownOrientation).toEqual({
            id: ownOption.id,
            label: ownOption.name,
            tag: ownOption.tag
        });
        details.forecastTargets.forEach((forecast) => {
            const forecastOption = STRATEGIC_ORIENTATION_OPTIONS[forecast.orientation];
            expect(forecast.selection).toEqual({
                id: forecastOption.id,
                label: forecastOption.name,
                tag: forecastOption.tag
            });
        });
        profile.requiredFields.forEach((requiredField) => {
            if (requiredField.startsWith('forecastTargets.')) {
                const target = requiredField.split('.')[1];
                expect(details.forecastTargets.some((forecast) => forecast.key === target)).toBe(true);
            } else if (requiredField === 'ownOrientation') {
                expect(details.ownOrientation).toBeTruthy();
            } else {
                expect(readPath(details, requiredField)).toBeTruthy();
            }
        });
    });

    it('expresses Blue and Red artifacts through their current domain helpers', () => {
        const blue = getBlueActionViewModel(TRAINING_FIXTURE_CATALOG.artifacts.blue);
        expect(blue).toMatchObject({
            hasBlueActionDetails: true,
            scribeHandoff: 'Forwarded',
            instruments: ['Economic', 'Diplomacy'],
            notificationTeams: ['Green', 'Industry']
        });

        const red = getMoveResponseViewModel(TRAINING_FIXTURE_CATALOG.artifacts.red);
        expect(red).toMatchObject({
            hasMoveResponseDetails: true,
            strategicAssessment: expect.any(String),
            responseStrategy: expect.any(String),
            keyActions: expect.any(String),
            targetsAndPressurePoints: expect.any(String),
            deliveryChannel: expect.any(String),
            expectedEffect: expect.stringMatching(/^TRAINING FIXTURE/)
        });
        expect(TRAINING_FIXTURE_CATALOG.artifacts.red.ally_contingencies)
            .not.toContain('Scribe Handoff');
    });

    it('keeps Green and Industry proposal requirements distinct', () => {
        const green = getProposalViewModel(TRAINING_FIXTURE_CATALOG.artifacts.green);
        const industry = getProposalViewModel(TRAINING_FIXTURE_CATALOG.artifacts.industry);

        expect(green).toMatchObject({
            hasProposalDetails: true,
            originators: ['EU', 'Japan'],
            recipientTeams: ['blue', 'red'],
            focusSectors: ['Biotechnology'],
            industryFocus: '',
            countryFocus: '',
            proposedActivity: ''
        });
        expect(industry).toMatchObject({
            hasProposalDetails: true,
            originators: ['US Industry'],
            recipientTeams: ['blue'],
            industryFocus: 'Advanced semiconductor manufacturing equipment',
            countryFocus: 'Japan and ROK',
            proposedActivity: 'Create a co-investment facility with shared offtake commitments.'
        });
    });

    it('uses current proposal-thread, notification, RFI, deck, timeline, and Notetaker shapes', () => {
        const counterparts = TRAINING_FIXTURE_CATALOG.counterparts;
        const threads = TRAINING_FIXTURE_CATALOG.counterparts.proposalThreads;
        const greenBlue = getProposalThreadForRecipient(
            threads,
            TRAINING_FIXTURE_CATALOG.artifacts.green.id,
            'blue'
        );
        expect(greenBlue).toHaveLength(2);
        expect(getProposalThreadStatus(greenBlue)).toBe(PROPOSAL_RECIPIENT_STATUSES.NEGOTIATION_UNDERWAY);

        expect(counterparts.handoffs).toHaveLength(4);
        expect(counterparts.whiteCellReturns).toHaveLength(4);
        expect(counterparts.whiteCellApprovals).toEqual(expect.arrayContaining([
            expect.objectContaining({
                artifact_id: TRAINING_FIXTURE_CATALOG.artifacts.green.id,
                recipient_team: 'blue',
                status: 'approved_forwarded'
            }),
            expect.objectContaining({
                artifact_id: TRAINING_FIXTURE_CATALOG.artifacts.industry.id,
                recipient_team: 'red',
                status: 'approved_forwarded'
            })
        ]));
        expect(counterparts.communications).toEqual(expect.arrayContaining([
            expect.objectContaining({
                to_role: 'blue_scribe',
                metadata: expect.objectContaining({
                    recipient_scope: 'role',
                    recipient_team: 'blue',
                    recipient_role: 'blue_scribe'
                })
            })
        ]));
        expect(counterparts.injects).toEqual(expect.arrayContaining([
            expect.objectContaining({
                to_role: 'blue',
                metadata: expect.objectContaining({
                    recipient_scope: 'team',
                    recipient_team: 'blue'
                })
            })
        ]));

        const bundle = getTrainingProfileFixtureBundle('blue', 'notetaker');
        expect(bundle.notification).toMatchObject({ family: 'artifact-return', type: 'warning' });
        expect(bundle.actionNotification).toMatchObject({
            type: 'ACTION_NOTIFICATION',
            from_role: 'whitecell_lead',
            metadata: {
                recipient_scope: 'team',
                recipient_team: 'blue'
            }
        });
        expect(bundle.proposalThreads).toHaveLength(2);
        expect(bundle.proposalThreads.every((message) => (
            message.metadata.recipient_team === 'blue'
        ))).toBe(true);
        expect(bundle.rfi).toMatchObject({
            status: 'pending',
            workflow_state: 'returned_to_team',
            revision_number: 2,
            prior_workflow_state: 'submitted_to_white_cell',
            review_notes: expect.any(String),
            reviewed_by_role: 'whitecell_lead'
        });
        expect(bundle.rfiAnswer).toMatchObject({ status: 'answered', workflow_state: 'completed' });
        expect(bundle.deckState.deckPath).toBe('decks/blue/fractured-order-facilitator-deck.html');
        expect(bundle.timelineEntries).toHaveLength(2);
        expect(readParticipantScopedNotetakerSection(
            bundle.notetakerRecord.dynamics_analysis,
            {},
            { teamId: 'blue', participantKey: bundle.notetakerRecord.participantKey }
        )).toMatchObject({ decisionStyle: 'consensus', frictionLevel: '4', consensusLevel: '7' });
        expect(bundle.secondNotetakerRecord.id).not.toBe(bundle.notetakerRecord.id);
        expect(bundle.secondNotetakerRecord.participantKey).not.toBe(bundle.notetakerRecord.participantKey);
        expect(readParticipantScopedNotetakerSection(
            bundle.secondNotetakerRecord.dynamics_analysis,
            {},
            { teamId: 'blue', participantKey: bundle.secondNotetakerRecord.participantKey }
        )).toMatchObject({
            decisionStyle: 'expert_deference',
            frictionLevel: '3',
            consensusLevel: '6'
        });
        expect(getTrainingProfileFixtureBundle('blue', 'operator')).toBeNull();
        expect(getTrainingProfileFixtureBundle('white_cell', 'notetaker')).toBeNull();
    });

    it('exposes proposal practice only to the exact recipient team', () => {
        const blue = getTrainingProfileFixtureBundle('blue', 'facilitator');
        const red = getTrainingProfileFixtureBundle('red', 'facilitator');
        const green = getTrainingProfileFixtureBundle('green', 'facilitator');
        const industry = getTrainingProfileFixtureBundle('industry', 'facilitator');

        expect(blue.proposalThreads.map((entry) => entry.metadata.thread_id))
            .toEqual(['training-fixture:proposal-thread:green:blue', 'training-fixture:proposal-thread:green:blue']);
        expect(red.proposalThreads.map((entry) => entry.metadata.thread_id))
            .toEqual(['training-fixture:proposal-thread:industry:red', 'training-fixture:proposal-thread:industry:red']);
        expect(green.proposalThreads).toEqual([]);
        expect(industry.proposalThreads).toEqual([]);
    });

    it('is bounded, visibly namespaced, immutable, and identical across repeated builds', () => {
        const first = buildTrainingFixtureCatalog();
        const second = buildTrainingFixtureCatalog();

        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
        expect(Object.isFrozen(first)).toBe(true);
        collectArrays(first).forEach((collection) => {
            expect(collection.length).toBeLessThanOrEqual(TRAINING_FIXTURE_LIMITS.maxCollectionItems);
        });
        expect(first.artifacts.blue.id).toMatch(new RegExp(`^${TRAINING_FIXTURE_ID_PREFIX}`));
        expect(first.artifacts.blue.goal).toMatch(new RegExp(`^${TRAINING_VISIBLE_FIXTURE_PREFIX}`));
        expect(getTrainingFixtureById(first.artifacts.blue.id)).toBe(TRAINING_FIXTURE_CATALOG.artifacts.blue);
        expect(getTrainingFixtureById('live-artifact-id')).toBeNull();
    });

    it('contains no runtime randomness, current timestamps, network calls, or AI generation', () => {
        const source = readFileSync(fileURLToPath(new URL('./fixtures.js', import.meta.url)), 'utf8');
        expect(source).not.toMatch(/Math\.random|crypto\.random|randomUUID/);
        expect(source).not.toMatch(/Date\.now|new Date\s*\(/);
        expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
        expect(source).not.toMatch(/generateText|generateContent|chat\.completions|responses\.create/);
    });
});
