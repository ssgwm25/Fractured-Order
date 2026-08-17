import { describe, expect, it } from 'vitest';

import {
    ALLOWLIST,
    DENYLIST,
    findProhibitedArtifacts,
    formatViolations,
    normalizeRepositoryPath
} from './verify-repository-artifacts.mjs';

describe('repository artifact verifier', () => {
    it('normalizes relative prefixes, duplicate separators, and Windows separators', () => {
        expect(normalizeRepositoryPath('./packages//web/dist/app.js')).toBe('packages/web/dist/app.js');
        expect(normalizeRepositoryPath('.\\packages\\web\\dist\\app.js')).toBe('packages/web/dist/app.js');
        expect(normalizeRepositoryPath('./packages/../packages/web/')).toBe('packages/web');
    });

    it('keeps the denylist and allowlist explicit and inspectable', () => {
        expect(DENYLIST.map(({ id }) => id)).toEqual([
            'dependency-folder',
            'runtime-secrets',
            'test-output',
            'build-output',
            'browser-storage',
            'recording',
            'training-media-work-output',
            'model-weight',
            'generated-report-output',
            'unapproved-report-binary'
        ]);
        expect(ALLOWLIST.map(({ id }) => id)).toContain('curated-pli-deliverable');
    });

    it('rejects nested artifacts from every prohibited category', () => {
        const prohibitedPaths = [
            'packages/ui/node_modules/example/index.js',
            'deploy/private/.env.production',
            'apps/web/test-results/results.json',
            'packages/site/dist/assets/index.js',
            'tests/e2e/.auth/storage.json',
            'evidence/recordings/session.webm',
            'scripts/training-audio/work/raw/intro.wav',
            'scripts/training-audio/models/kokoro-v1_0.pth',
            'tools/output/release-evidence/run-42/manifest.json',
            'docs/generated-assessment.pdf'
        ];

        const violations = findProhibitedArtifacts(prohibitedPaths);

        expect(new Set(violations.map(({ path }) => path))).toEqual(new Set(prohibitedPaths));
        expect(new Set(violations.map(({ ruleId }) => ruleId))).toEqual(new Set([
            'dependency-folder',
            'runtime-secrets',
            'test-output',
            'build-output',
            'browser-storage',
            'recording',
            'training-media-work-output',
            'model-weight',
            'generated-report-output',
            'unapproved-report-binary'
        ]));

        const message = formatViolations(violations);
        prohibitedPaths.forEach((prohibitedPath) => expect(message).toContain(prohibitedPath));
        expect(message).toContain('Remediation:');
    });

    it('rejects a recording even when it is outside a conventional recording folder', () => {
        expect(findProhibitedArtifacts(['evidence/session-recording.mov'])).toMatchObject([
            { path: 'evidence/session-recording.mov', ruleId: 'recording' }
        ]);
    });

    it('allows authored application audio outside recording conventions', () => {
        expect(findProhibitedArtifacts([
            'src/audio/notification.mp3',
            'public/training/audio/clips/training-intro.mp3',
            'public/training/audio/captions/training-intro.en.vtt',
            'public/training/intro/plenum-onboarding.mp4'
        ])).toEqual([]);
    });

    it('applies deny rules to Windows paths', () => {
        expect(findProhibitedArtifacts([
            'packages\\client\\node_modules\\example\\index.js',
            'apps\\web\\playwright-report\\index.html'
        ])).toMatchObject([
            { path: 'packages/client/node_modules/example/index.js', ruleId: 'dependency-folder' },
            { path: 'apps/web/playwright-report/index.html', ruleId: 'test-output' }
        ]);
    });

    it('allows documented templates and approved curated binaries', () => {
        expect(findProhibitedArtifacts([
            '.env.example',
            'config/.env.template',
            'pli/deliverables/PLI_Master_Codebook.pdf',
            'pli/codebook/evidence/ni/US_NI_Assessment_Methodology_Report.docx'
        ])).toEqual([]);
    });

    it('does not let a binary allowlist exception bypass another deny rule', () => {
        expect(findProhibitedArtifacts([
            'pli/deliverables/node_modules/generated-report.pdf'
        ])).toEqual(expect.arrayContaining([
            expect.objectContaining({ ruleId: 'dependency-folder' })
        ]));
    });
});
