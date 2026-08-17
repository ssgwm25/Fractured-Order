import { describe, expect, it } from 'vitest';

import {
    createTrainingContextFromBootstrap,
    getSemanticRoleForPublicSurface,
    getTrainingRole,
    getTrainingRoleRoute,
    isAllowedTrainingRolePage,
    isTrainingEntryCode,
    normalizeTrainingEntryCode
} from './trainingContext.js';

function bootstrap(overrides = {}) {
    return {
        attempt_id: 'attempt-1',
        curriculum_version: '1.0',
        profile_id: 'blue.scribe',
        semantic_role: 'scribe',
        team: 'blue',
        status: 'in_progress',
        experience_plugin_id: 'ssg-training',
        session_classification: 'training_template',
        is_protected: true,
        ...overrides
    };
}

describe('training context contract', () => {
    it('normalizes code entry but keeps the server RPC exact-code contract separate', () => {
        expect(normalizeTrainingEntryCode(' training2026 ')).toBe('TRAINING2026');
        expect(isTrainingEntryCode('training2026')).toBe(true);
        expect(isTrainingEntryCode('TRAINING2027')).toBe(false);
    });

    it('resolves semantic roles across the legacy route inversion', () => {
        expect(getSemanticRoleForPublicSurface('facilitator')).toBe('scribe');
        expect(getTrainingRole('blue', 'scribe')).toBe('blue_facilitator');
        expect(getTrainingRoleRoute('blue', 'scribe', { basePath: '/' }))
            .toBe('/teams/blue/facilitator.html');
        expect(getTrainingRoleRoute('blue', 'scribe', { basePath: '/Fractured-Order/' }))
            .toBe('/Fractured-Order/teams/blue/facilitator.html');

        expect(getSemanticRoleForPublicSurface('scribe')).toBe('facilitator');
        expect(getTrainingRole('red', 'facilitator')).toBe('red_scribe');
        expect(getTrainingRoleRoute('red', 'facilitator', { basePath: '/' }))
            .toBe('/teams/red/scribe.html');

        expect(getSemanticRoleForPublicSurface('notetaker')).toBe('notetaker');
        expect(getTrainingRole('industry', 'notetaker')).toBe('industry_notetaker');
    });

    it('pins all 12 team and semantic-role routes', () => {
        for (const team of ['blue', 'red', 'green', 'industry']) {
            for (const role of ['scribe', 'facilitator', 'notetaker']) {
                const context = createTrainingContextFromBootstrap(bootstrap({
                    attempt_id: `attempt-${team}-${role}`,
                    profile_id: `${team}.${role}`,
                    semantic_role: role,
                    team
                }));

                expect(context).toMatchObject({ team, semanticRole: role, trainingMode: true });
                expect(isAllowedTrainingRolePage(context, { team, semanticRole: role })).toBe(true);
            }
        }
    });

    it('rejects client-forged flags and unsupported route profiles', () => {
        expect(createTrainingContextFromBootstrap({ training_mode: true })).toBeNull();
        expect(createTrainingContextFromBootstrap(bootstrap({ is_protected: false }))).toBeNull();
        expect(createTrainingContextFromBootstrap(bootstrap({ semantic_role: 'whitecell' }))).toBeNull();
        expect(createTrainingContextFromBootstrap(bootstrap({ profile_id: 'blue.facilitator' }))).toBeNull();
        expect(getTrainingRole('blue', 'viewer')).toBeNull();
        expect(getTrainingRole('blue', 'whitecell')).toBeNull();
        expect(getTrainingRole('sme', 'scribe')).toBeNull();
    });
});
