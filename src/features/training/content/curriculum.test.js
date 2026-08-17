import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SHIPPED_ROLE_PROFILES } from '../../../../tests/contracts/roleCapabilityMatrix.js';
import {
    TRAINING_CURRICULUM,
    getTrainingCurriculumProfiles,
    getTrainingModule,
    getTrainingStep
} from './curriculum.js';
import { TRAINING_STAGE_IDS } from './schema.js';
import { FACILITATOR_TRAINING_SELECTOR_CONTRACT } from '../FacilitatorTrainingCoach.js';

const ROUTE_SURFACE_BY_SEMANTIC_ROLE = Object.freeze({
    scribe: 'facilitator',
    facilitator: 'scribe',
    notetaker: 'notetaker'
});

function readRoleSurface(team, semanticRole) {
    const routeSurface = ROUTE_SURFACE_BY_SEMANTIC_ROLE[semanticRole];
    return readFileSync(fileURLToPath(new URL(
        `../../../../teams/${team}/${routeSurface}.html`,
        import.meta.url
    )), 'utf8');
}

function selectorExists(html, selector) {
    if (selector === 'main') return /<main\b/.test(html);
    if (selector === 'body') return /<body\b/.test(html);
    if (selector.startsWith('#')) return html.includes(`id="${selector.slice(1)}"`);
    if (selector.startsWith('.')) {
        const className = selector.slice(1);
        return [...html.matchAll(/class="([^"]*)"/g)]
            .some((match) => match[1].split(/\s+/).includes(className));
    }
    return html.includes(selector.replaceAll('\\"', '"'));
}

describe('versioned training curriculum', () => {
    it('enumerates exactly the 12 executable participant profiles', () => {
        const expected = SHIPPED_ROLE_PROFILES
            .filter((profile) => profile.team && ['scribe', 'facilitator', 'notetaker'].includes(profile.role))
            .map((profile) => profile.id)
            .sort();
        const actual = getTrainingCurriculumProfiles()
            .map((module) => `${module.supportedTeams[0]}.${module.semanticRole}`)
            .sort();

        expect(actual).toEqual(expected);
        expect(actual).toHaveLength(12);
        expect(TRAINING_CURRICULUM.version).toBe('1.0');
    });

    it.each(getTrainingCurriculumProfiles().map((module) => [
        `${module.supportedTeams[0]}.${module.semanticRole}`,
        module
    ]))('%s has all seven ordered, reusable instructional stages', (_profileId, module) => {
        expect(module.steps.map((step) => step.stage)).toEqual(TRAINING_STAGE_IDS);
        expect(module.masteryPredicate).toEqual({
            kind: 'all_steps',
            stepIds: module.steps.map((step) => step.id)
        });
        module.steps.forEach((step) => {
            expect(step).toEqual(expect.objectContaining({
                semanticRole: module.semanticRole,
                supportedTeams: module.supportedTeams,
                learningObjective: expect.any(String),
                coachCopy: expect.any(String),
                narrationScript: expect.any(String),
                targetSelector: expect.any(String),
                interactionType: expect.any(String),
                masteryPredicate: expect.any(Object),
                hint: expect.any(String),
                correctFeedback: expect.any(String),
                retryFeedback: expect.any(String)
            }));
        });
    });

    it('resolves semantic role/team modules and stable stage IDs', () => {
        expect(getTrainingModule('scribe', 'blue')?.id).toBe('training.v1.scribe.blue');
        expect(getTrainingStep('facilitator', 'red', 'practice')?.id)
            .toBe('training.v1.facilitator.red.practice');
        expect(getTrainingModule('operator', 'blue')).toBeNull();
        expect(getTrainingStep('notetaker', 'blue', 'unknown')).toBeNull();
    });

    it('spells out Request for Information before using RFI in each Facilitator path', () => {
        for (const team of ['blue', 'red', 'green', 'industry']) {
            const module = getTrainingModule('facilitator', team);
            const practice = getTrainingStep('facilitator', team, 'practice');
            expect(module.coachCopy).toContain('Request for Information (RFI)');
            expect(practice.coachCopy).toContain('Request for Information (RFI)');
        }
    });

    it('introduces team-specific acronyms before fixture-driven instruction', () => {
        expect(getTrainingModule('scribe', 'blue').coachCopy).toContain("People's Republic of China (PRC)");
        expect(getTrainingModule('scribe', 'green').coachCopy).toContain('European Union (EU)');
        expect(getTrainingModule('scribe', 'industry').coachCopy).toContain('Republic of Korea (ROK)');
    });

    it('pins every target selector to its built role surface or an accessible fallback', () => {
        getTrainingCurriculumProfiles().forEach((module) => {
            const team = module.supportedTeams[0];
            const html = readRoleSurface(team, module.semanticRole);
            expect(selectorExists(html, module.targetSelector), `${module.id} target`).toBe(true);
            expect(
                selectorExists(html, module.accessibleFallbackTarget.selector),
                `${module.id} fallback`
            ).toBe(true);

            module.steps.forEach((step) => {
                const targetExists = selectorExists(html, step.targetSelector);
                const fallbackExists = selectorExists(html, step.accessibleFallbackTarget.selector);
                expect(targetExists || fallbackExists, `${step.id} selector contract`).toBe(true);
                expect(fallbackExists, `${step.id} accessible fallback`).toBe(true);
            });
        });
    });

    it.each(['blue', 'red', 'green', 'industry'])(
        'pins every %s Facilitator navigation and Present highlight target',
        (team) => {
            const html = readRoleSurface(team, 'facilitator');
            expect(FACILITATOR_TRAINING_SELECTOR_CONTRACT).toEqual({
                actions: '#teamActionReviewViewBtn',
                deck: '#deckViewBtn',
                rfis: '#rfiViewBtn',
                communications: '#communicationsViewBtn',
                notifications: '#notificationsViewBtn',
                present: '#presentBtn',
                workspace: '#facilitatorWorkspacePanel'
            });
            Object.values(FACILITATOR_TRAINING_SELECTOR_CONTRACT).forEach((selector) => {
                expect(selectorExists(html, selector), `${team} ${selector}`).toBe(true);
            });
        }
    );
});
