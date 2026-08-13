import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
    PUBLIC_ROLE_SURFACES,
    ROLE_SURFACES,
    SME_ROLES,
    TEAM_OPTIONS,
    getSemanticRoleSurface
} from '../../src/core/teamContext.js';
import {
    NON_ENTRY_ROLE_STATES,
    ROLE_CAPABILITIES,
    ROLE_MATRIX_TEAMS,
    SHIPPED_ROLE_PROFILES
} from '../contracts/roleCapabilityMatrix.js';

function readRepositoryFile(relativePath) {
    return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

describe('auditable role capability matrix', () => {
    it('enumerates every shipped team role and every landing-page operator or SME role', () => {
        const semanticPublicRoles = PUBLIC_ROLE_SURFACES
            .map((surface) => getSemanticRoleSurface(surface))
            .sort();
        expect(semanticPublicRoles).toEqual([
            ROLE_SURFACES.FACILITATOR,
            ROLE_SURFACES.NOTETAKER,
            ROLE_SURFACES.SCRIBE
        ].sort());

        expect([...ROLE_MATRIX_TEAMS]).toEqual(TEAM_OPTIONS.map((team) => team.id));

        const expectedProfiles = [
            ...TEAM_OPTIONS.flatMap((team) => semanticPublicRoles.map((role) => `${team.id}.${role}`)),
            'operator.game_master',
            'operator.white_cell_lead',
            ...Object.values(SME_ROLES).map((role) => `sme.${role}`)
        ].sort();

        expect(SHIPPED_ROLE_PROFILES.map((profile) => profile.id).sort()).toEqual(expectedProfiles);

        const landingHtml = readRepositoryFile('index.html');
        [
            'operatorGameMasterBtn',
            'operatorWhiteCellLeadBtn',
            'smeEconBtn',
            'smeNiEscalationBtn',
            'smeDiplomacyInfoBtn',
            'smeTsjBtn',
            'smeVerbaBtn'
        ].forEach((id) => expect(landingHtml).toContain(`id="${id}"`));
    });

    it('gives every shipped role executable browser entry evidence and behavioral capability evidence', () => {
        const capabilityIds = new Set(Object.keys(ROLE_CAPABILITIES));

        SHIPPED_ROLE_PROFILES.forEach((profile) => {
            expect(profile.capabilityIds.length, `${profile.id} has no capabilities`).toBeGreaterThan(1);
            profile.capabilityIds.forEach((capabilityId) => {
                expect(capabilityIds.has(capabilityId), `${profile.id} references unknown ${capabilityId}`).toBe(true);
            });

            const profileEvidence = profile.capabilityIds.flatMap((capabilityId) => (
                ROLE_CAPABILITIES[capabilityId].evidence
            ));
            expect(
                profileEvidence.some((entry) => entry.layer === 'e2e'),
                `${profile.id} has no browser-level evidence`
            ).toBe(true);
        });

        const referencedCapabilities = new Set(
            SHIPPED_ROLE_PROFILES.flatMap((profile) => profile.capabilityIds)
        );
        expect([...referencedCapabilities].sort()).toEqual([...capabilityIds].sort());
    });

    it('fails closed when evidence files or named test anchors disappear', () => {
        Object.entries(ROLE_CAPABILITIES).forEach(([capabilityId, capability]) => {
            expect(capability.label, `${capabilityId} is missing a label`).toBeTruthy();
            expect(capability.evidence.length, `${capabilityId} has no evidence`).toBeGreaterThan(0);

            capability.evidence.forEach((entry) => {
                expect(['unit', 'integration', 'e2e']).toContain(entry.layer);
                const source = readRepositoryFile(entry.file);
                expect(
                    source,
                    `${capabilityId} evidence file ${entry.file} is empty`
                ).not.toBe('');
                expect(
                    source.includes(entry.anchor),
                    `${capabilityId} lost evidence anchor "${entry.anchor}" in ${entry.file}`
                ).toBe(true);
            });
        });
    });

    it('documents non-entry compatibility roles instead of counting them as tested user procedures', () => {
        expect(NON_ENTRY_ROLE_STATES.map((entry) => entry.id).sort()).toEqual([
            'viewer',
            'whitecell_support'
        ]);

        const landingHtml = readRepositoryFile('index.html');
        expect(landingHtml).not.toContain('data-role-surface="viewer"');
        expect(landingHtml).not.toContain('operatorWhiteCellSupportBtn');
        NON_ENTRY_ROLE_STATES.forEach((entry) => expect(entry.reason).toBeTruthy());
    });

    it('keeps the human-readable role matrix synchronized with the executable contract', () => {
        const documentation = readRepositoryFile('docs/role-capability-test-matrix.md');

        SHIPPED_ROLE_PROFILES.forEach((profile) => {
            expect(documentation, `documentation is missing ${profile.id}`).toContain(`\`${profile.id}\``);
        });
        Object.keys(ROLE_CAPABILITIES).forEach((capabilityId) => {
            expect(documentation, `documentation is missing ${capabilityId}`).toContain(`\`${capabilityId}\``);
        });
        NON_ENTRY_ROLE_STATES.forEach((entry) => {
            expect(documentation, `documentation is missing ${entry.id}`).toContain(`\`${entry.id}\``);
        });
    });
});
