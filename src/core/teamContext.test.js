import { describe, expect, it } from 'vitest';

import {
    OPERATOR_SURFACES,
    PUBLIC_ROLE_SURFACES,
    ROLE_SURFACES,
    WHITE_CELL_OPERATOR_ROLES,
    buildTeamRole,
    buildWhiteCellOperatorRole,
    getRoleDisplayName,
    getRoleRoute,
    isOperatorSurface,
    isPublicRoleSurface,
    resolveTeamContext
} from './teamContext.js';

describe('teamContext', () => {
    it('builds team-scoped roles and routes for shipped teams', () => {
        expect(buildTeamRole('blue', ROLE_SURFACES.FACILITATOR)).toBe('blue_facilitator');
        expect(buildTeamRole('blue', ROLE_SURFACES.SCRIBE)).toBe('blue_scribe');
        expect(buildTeamRole('red', ROLE_SURFACES.NOTETAKER)).toBe('red_notetaker');
        expect(buildTeamRole('industry', ROLE_SURFACES.FACILITATOR)).toBe('industry_facilitator');
        expect(buildTeamRole('industry', ROLE_SURFACES.SCRIBE)).toBe('industry_scribe');
        expect(buildTeamRole('industry', ROLE_SURFACES.NOTETAKER)).toBe('industry_notetaker');
        expect(buildTeamRole('green', ROLE_SURFACES.WHITECELL)).toBe('whitecell_lead');
        expect(buildWhiteCellOperatorRole('green', WHITE_CELL_OPERATOR_ROLES.SUPPORT)).toBe('whitecell_support');

        expect(getRoleRoute('red_facilitator', { basePath: '/repo-slug/' })).toBe('/repo-slug/teams/red/facilitator.html');
        expect(getRoleRoute('blue_scribe', { basePath: '/repo-slug/' })).toBe('/repo-slug/teams/blue/scribe.html');
        expect(getRoleRoute('industry_notetaker', { basePath: '/repo-slug/' })).toBe('/repo-slug/teams/industry/notetaker.html');
        expect(getRoleRoute('whitecell_support', { basePath: '/repo-slug/' })).toBe('/repo-slug/whitecell.html');
        expect(getRoleRoute('viewer', { observerTeamId: 'industry', basePath: '/repo-slug/' })).toBe('/repo-slug/teams/industry/facilitator.html?mode=observer');
    });

    it('resolves team context from page markup and formats role labels', () => {
        const documentRef = {
            body: {
                dataset: {
                    team: 'green'
                }
            }
        };

        const context = resolveTeamContext({
            documentRef,
            locationRef: { pathname: '/repo-slug/teams/blue/facilitator.html' },
            basePath: '/repo-slug/'
        });

        expect(context.teamId).toBe('green');
        expect(context.facilitatorRole).toBe('green_facilitator');
        expect(context.scribeRole).toBe('green_scribe');
        expect(context.notetakerRoute).toBe('/repo-slug/teams/green/notetaker.html');
        expect(context.scribeRoute).toBe('/repo-slug/teams/green/scribe.html');
        expect(getRoleDisplayName('green_notetaker')).toBe('Green Team Notetaker');
        expect(getRoleDisplayName('green_scribe')).toBe('Green Team Scribe');
        expect(getRoleDisplayName('industry_facilitator')).toBe('Industry Team Facilitator');
        expect(getRoleDisplayName('industry_scribe')).toBe('Industry Team Scribe');
        expect(getRoleDisplayName('industry_notetaker')).toBe('Industry Team Notetaker');
        expect(getRoleDisplayName('green_whitecell_support')).toBe('White Cell Support');
        expect(getRoleDisplayName('viewer', { observerTeamId: 'industry' })).toBe('Industry Team Observer');
    });

    it('defines explicit public and operator surface boundaries', () => {
        expect(PUBLIC_ROLE_SURFACES).toEqual([
            ROLE_SURFACES.FACILITATOR,
            ROLE_SURFACES.SCRIBE,
            ROLE_SURFACES.NOTETAKER
        ]);

        expect(isPublicRoleSurface(ROLE_SURFACES.WHITECELL)).toBe(false);
        expect(isPublicRoleSurface(ROLE_SURFACES.VIEWER)).toBe(false);
        expect(isPublicRoleSurface(ROLE_SURFACES.SCRIBE)).toBe(true);
        expect(isOperatorSurface(OPERATOR_SURFACES.GAME_MASTER)).toBe(true);
        expect(isOperatorSurface(OPERATOR_SURFACES.WHITE_CELL)).toBe(true);
    });
});
