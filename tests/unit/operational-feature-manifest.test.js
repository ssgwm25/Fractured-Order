import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
    OPERATIONAL_SCOPE_EXCLUSIONS,
    SHIPPED_NON_PLI_OPERATIONAL_FEATURES
} from '../contracts/operationalFeatureManifest.js';

function readRepositoryFile(relativePath) {
    return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

describe('complete non-PLI operational rehearsal manifest', () => {
    it('requires focused and browser evidence for every shipped in-scope feature', () => {
        const featureEntries = Object.entries(SHIPPED_NON_PLI_OPERATIONAL_FEATURES);
        expect(featureEntries.length).toBeGreaterThanOrEqual(15);

        featureEntries.forEach(([featureId, feature]) => {
            expect(feature.label, `${featureId} is missing a label`).toBeTruthy();
            expect(
                feature.evidence.some((entry) => entry.layer === 'e2e'),
                `${featureId} has no operational browser procedure`
            ).toBe(true);
            expect(
                feature.evidence.some((entry) => ['unit', 'integration'].includes(entry.layer)),
                `${featureId} has no focused contract coverage`
            ).toBe(true);
        });
    });

    it('fails closed when a named evidence file or procedure anchor disappears', () => {
        Object.entries(SHIPPED_NON_PLI_OPERATIONAL_FEATURES).forEach(([featureId, feature]) => {
            feature.evidence.forEach((entry) => {
                expect(['unit', 'integration', 'e2e']).toContain(entry.layer);
                const source = readRepositoryFile(entry.file);
                expect(source, `${featureId} evidence file ${entry.file} is empty`).not.toBe('');
                expect(
                    source.includes(entry.anchor),
                    `${featureId} lost evidence anchor "${entry.anchor}" in ${entry.file}`
                ).toBe(true);
            });
        });
    });

    it('keeps all PLI functionality explicitly outside this gate', () => {
        expect(OPERATIONAL_SCOPE_EXCLUSIONS.map((entry) => entry.id).sort()).toEqual([
            'pli.adjudication',
            'pli.external_handoffs',
            'pli.reports',
            'pli.sme_reviews'
        ]);

        Object.entries(SHIPPED_NON_PLI_OPERATIONAL_FEATURES).forEach(([featureId, feature]) => {
            expect(featureId).not.toMatch(/^pli(?:\.|$)/i);
            feature.evidence.forEach((entry) => {
                expect(entry.file.split(/[\\/._-]+/)).not.toContain('pli');
                expect(entry.anchor).not.toMatch(/\bPLI\b/i);
            });
        });
        OPERATIONAL_SCOPE_EXCLUSIONS.forEach((entry) => expect(entry.reason).toContain('excluded'));
    });

    it('binds the package gate to every non-PLI browser component and keeps the documentation synchronized', () => {
        const packageJson = JSON.parse(readRepositoryFile('package.json'));
        const browserGate = packageJson.scripts?.['test:e2e:operational'] || '';
        for (const spec of [
            'live-demo-topology.e2e.js',
            'live-demo-scale.e2e.js',
            'live-demo-realtime.e2e.js',
            'live-demo-playthrough.e2e.js',
            'live-demo-operator-controls.e2e.js'
        ]) {
            expect(browserGate).toContain(spec);
        }
        expect(browserGate).not.toContain('live-demo-role-matrix.e2e.js');
        expect(packageJson.scripts?.['test:non-pli']).toContain('--config vitest.operational.config.js');
        expect(packageJson.scripts?.['test:operational']).toContain('test:non-pli');
        expect(packageJson.scripts?.['test:operational']).toContain('test:e2e:operational');

        const focusedConfig = readRepositoryFile('vitest.operational.config.js');
        for (const exclusion of [
            'src/features/pli/**',
            'src/roles/sme.test.js',
            'src/roles/whitecell.pli.test.js',
            'src/services/database.*pli*.test.js',
            'tests/unit/role-capability-matrix.test.js'
        ]) {
            expect(focusedConfig).toContain(`'${exclusion}'`);
        }

        const documentation = readRepositoryFile('docs/operational-rehearsal.md');
        Object.keys(SHIPPED_NON_PLI_OPERATIONAL_FEATURES).forEach((featureId) => {
            expect(documentation, `documentation is missing ${featureId}`).toContain(`\`${featureId}\``);
        });
        OPERATIONAL_SCOPE_EXCLUSIONS.forEach((entry) => {
            expect(documentation, `documentation is missing exclusion ${entry.id}`).toContain(`\`${entry.id}\``);
        });
    });
});
