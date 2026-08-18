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
import {
    TRAINING_ACTION_IDS_BY_ROLE,
    TRAINING_COPY_LIMITS
} from './schema.js';

const ROUTE_SURFACE_BY_SEMANTIC_ROLE = Object.freeze({
    scribe: 'facilitator',
    facilitator: 'scribe',
    notetaker: 'notetaker'
});
const CONTROLLER_BY_SEMANTIC_ROLE = Object.freeze({
    scribe: 'facilitator.js',
    facilitator: 'scribe.js',
    notetaker: 'notetaker.js'
});
const GENERIC_STAGE_LABELS = [
    'Orient', 'Show', 'Guide', 'Practice', 'Respond', 'Retrieve', 'Reflect',
    'See it', 'Follow along', 'Try it', 'Check understanding', 'Reflect and finish'
];

function readRoleSurface(team, semanticRole) {
    const routeSurface = ROUTE_SURFACE_BY_SEMANTIC_ROLE[semanticRole];
    const html = readFileSync(fileURLToPath(new URL(
        `../../../../teams/${team}/${routeSurface}.html`,
        import.meta.url
    )), 'utf8');
    const controller = readFileSync(fileURLToPath(new URL(
        `../../../roles/${CONTROLLER_BY_SEMANTIC_ROLE[semanticRole]}`,
        import.meta.url
    )), 'utf8');
    return `${html}\n${controller}`;
}

function simpleSelectorExists(source, selector) {
    if (source.includes(selector)) return true;
    if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return source.includes(`id="${id}"`) || source.includes(`getElementById('${id}')`);
    }
    if (selector.startsWith('.')) {
        const className = selector.slice(1);
        return source.includes(className);
    }

    const tag = selector.match(/^[a-z]+/i)?.[0] || null;
    if (tag && !new RegExp(`<${tag}\\b`, 'i').test(source)) return false;
    const attributes = [...selector.matchAll(/\[([a-z0-9_-]+)(?:="([^"]*)")?\]/gi)];
    return attributes.every(([, name, value]) => {
        if (value === undefined) return source.includes(name);
        return source.includes(`${name}="${value}"`)
            || source.includes(`${name} = '${value}'`)
            || source.includes(`${name} = "${value}"`);
    });
}

function selectorExists(source, selector) {
    return selector.split(/\s+/).every((part) => simpleSelectorExists(source, part));
}

describe('native walkthrough curriculum', () => {
    it('enumerates exactly the 12 executable participant profiles on incompatible version 2.0', () => {
        const expected = SHIPPED_ROLE_PROFILES
            .filter((profile) => profile.team && ['scribe', 'facilitator', 'notetaker'].includes(profile.role))
            .map((profile) => profile.id)
            .sort();
        const actual = getTrainingCurriculumProfiles()
            .map((module) => `${module.supportedTeams[0]}.${module.semanticRole}`)
            .sort();

        expect(actual).toEqual(expected);
        expect(actual).toHaveLength(12);
        expect(TRAINING_CURRICULUM.version).toBe('2.0');
        expect(getTrainingModule('scribe', 'blue')?.id).toBe('training.v2.scribe.blue');
        expect(getTrainingStep('facilitator', 'red', 'create-revise-rfi')?.id)
            .toBe('training.v2.facilitator.red.create-revise-rfi');
    });

    it.each(getTrainingCurriculumProfiles().map((module) => [
        `${module.supportedTeams[0]}.${module.semanticRole}`,
        module
    ]))('%s declares six ordered native actions with one event each', (_profileId, module) => {
        expect(module.steps.map((step) => step.actionId))
            .toEqual(TRAINING_ACTION_IDS_BY_ROLE[module.semanticRole]);
        expect(module.steps).toHaveLength(6);

        const titles = new Set();
        const events = new Set();
        module.steps.forEach((step) => {
            expect(step).toEqual(expect.objectContaining({
                semanticRole: module.semanticRole,
                supportedTeams: module.supportedTeams,
                actionTitle: expect.any(String),
                instruction: expect.any(String),
                targetSelector: expect.any(String),
                expectedTrainingEvent: expect.any(String),
                successMessage: expect.any(String)
            }));
            expect(step).not.toHaveProperty('stage');
            expect(step).not.toHaveProperty('masteryPredicate');
            expect(step).not.toHaveProperty('interactionType');
            expect(step).not.toHaveProperty('coachCopy');
            expect(GENERIC_STAGE_LABELS).not.toContain(step.actionTitle);
            expect(titles.has(step.actionTitle)).toBe(false);
            expect(events.has(step.expectedTrainingEvent)).toBe(false);
            titles.add(step.actionTitle);
            events.add(step.expectedTrainingEvent);
        });
    });

    it('bounds visible copy to one action heading and one supporting sentence', () => {
        getTrainingCurriculumProfiles().forEach((module) => {
            module.steps.forEach((step) => {
                expect(step.actionTitle.length).toBeLessThanOrEqual(TRAINING_COPY_LIMITS.actionTitle);
                expect(step.actionTitle).not.toMatch(/[.!?]$/);
                expect(step.instruction.length).toBeLessThanOrEqual(TRAINING_COPY_LIMITS.instruction);
                expect(step.instruction.trim()).not.toMatch(/[.!?]\s+\S/);
                expect(step.successMessage.length).toBeLessThanOrEqual(TRAINING_COPY_LIMITS.successMessage);
                expect(step.recoveryHint?.length || 0).toBeLessThanOrEqual(TRAINING_COPY_LIMITS.recoveryHint);
                if (step.narrationScript) {
                    expect(step.narrationScript.length).toBeLessThanOrEqual(TRAINING_COPY_LIMITS.narrationScript);
                    expect(step.narrationScript.trim()).not.toMatch(/[.!?]\s+\S/);
                }
            });
        });
    });

    it('uses exact native targets and permits broad targets only for read-only receipts', () => {
        getTrainingCurriculumProfiles().forEach((module) => {
            const source = readRoleSurface(module.supportedTeams[0], module.semanticRole);
            module.steps.forEach((step) => {
                expect(selectorExists(source, step.targetSelector), `${step.id} target`).toBe(true);
                expect(step.targetSelector).not.toContain(',');
                expect(['main', 'body', '#main-content']).not.toContain(step.targetSelector);
                if (step.targetType === 'read_only_receipt') {
                    expect(step.actionId).toMatch(/^verify-/);
                } else {
                    expect(step.targetType).toBe('control');
                }
            });
        });
    });

    it('keeps acknowledgement, workspace-tour, proxy, and quiz mastery out of the active contract', () => {
        const serialized = JSON.stringify(TRAINING_CURRICULUM);
        expect(serialized).not.toContain('acknowledgement');
        expect(serialized).not.toContain('viewed_fixture');
        expect(serialized).not.toContain('guided_event');
        expect(serialized).not.toContain('correctOptionId');
        expect(serialized).not.toContain('masteryPredicate');
        expect(serialized).not.toContain('workspaces.restored');
    });

    it('does not silently resolve unsupported profiles or retired action IDs', () => {
        expect(getTrainingModule('operator', 'blue')).toBeNull();
        expect(getTrainingStep('notetaker', 'blue', 'orient')).toBeNull();
        expect(getTrainingStep('scribe', 'blue', 'retrieve')).toBeNull();
    });
});
