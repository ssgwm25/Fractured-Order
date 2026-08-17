import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { getTrainingCurriculumProfiles } from './content/curriculum.js';
import { buildTrainingAudioScripts } from '../../../scripts/training-audio/export-scripts.mjs';
import {
    TRAINING_AUDIO_MANIFEST,
    TRAINING_AUDIO_MEDIA_BUDGET,
    TRAINING_AUDIO_PROVENANCE_ID,
    getNarrationSequence,
    validateApprovedAudioManifest
} from './audioManifest.js';

const SHA = 'a'.repeat(64);

function approvedManifest({ perFileBytes = 1024, totalBytes = null } = {}) {
    const entries = TRAINING_AUDIO_MANIFEST.entries.map((entry, index) => ({
        ...entry,
        audioUrl: `/training/audio/clips/${index}.mp3`,
        captionsUrl: `/training/audio/captions/${index}.vtt`,
        durationSeconds: 4.25,
        checksum: SHA,
        scriptChecksum: SHA,
        cues: [{ startSeconds: 0, endSeconds: 4.25, text: entry.text }],
        byteLength: totalBytes === null ? perFileBytes : (index === 0 ? totalBytes : 0),
        approvalStatus: 'approved',
        provenanceId: TRAINING_AUDIO_PROVENANCE_ID
    }));
    return {
        ...TRAINING_AUDIO_MANIFEST,
        provenance: {
            ...TRAINING_AUDIO_MANIFEST.provenance,
            generationDate: '2026-08-17T12:00:00Z',
            scriptBundleSha256: SHA,
            voice: {
                ...TRAINING_AUDIO_MANIFEST.provenance.voice,
                voiceFileSha256: SHA
            },
            mediaBudget: {
                perFileBytes: TRAINING_AUDIO_MEDIA_BUDGET.perFileBytes,
                totalBytes: TRAINING_AUDIO_MEDIA_BUDGET.totalBytes,
                status: 'approved-from-sample-measurement',
                sampleMeasurementsReviewed: true
            },
            approval: {
                status: 'approved',
                scope: 'full-batch',
                owner: 'Training media owner',
                reviewedAt: '2026-08-17T12:00:00Z',
                fullListenThrough: true,
                clipCount: 97,
                qualityReview: {
                    pronunciation: true,
                    pacing: true,
                    clippingFree: true,
                    pausesNatural: true,
                    prosodyAccepted: true
                }
            }
        },
        entries
    };
}

describe('training audio manifest contract', () => {
    it('keeps build-time and public provenance byte-for-byte aligned', () => {
        const source = readFileSync(fileURLToPath(new URL('./audioProvenance.json', import.meta.url)), 'utf8');
        const published = readFileSync(fileURLToPath(new URL(
            '../../../public/training/audio/provenance.json',
            import.meta.url
        )), 'utf8');
        expect(published).toBe(source);
    });

    it('enumerates the common intro, 12 module introductions, and all 84 curriculum steps', () => {
        const profiles = getTrainingCurriculumProfiles();
        const curriculumSteps = profiles.flatMap((module) => module.steps);
        const expectedIds = new Set([
            'training.intro',
            ...profiles.map((module) => module.id),
            ...curriculumSteps.map((step) => step.id)
        ]);

        expect(profiles).toHaveLength(12);
        expect(curriculumSteps).toHaveLength(84);
        expect(TRAINING_AUDIO_MANIFEST.entries).toHaveLength(97);
        expect(new Set(TRAINING_AUDIO_MANIFEST.entries.map(({ id }) => id))).toEqual(expectedIds);
        TRAINING_AUDIO_MANIFEST.entries.forEach((entry) => {
            expect(entry.text).toBeTruthy();
            expect(entry.transcript).toBe(entry.text);
            expect(entry.provenanceId).toBe(TRAINING_AUDIO_PROVENANCE_ID);
        });
    });

    it('keeps each profile sequence ordered and independently addressable', () => {
        const sequence = getNarrationSequence('scribe', 'blue', { includeCommonIntro: true });
        expect(sequence.map(({ id }) => id)).toEqual([
            'training.intro',
            'training.v1.scribe.blue',
            'training.v1.scribe.blue.orient',
            'training.v1.scribe.blue.show',
            'training.v1.scribe.blue.guide',
            'training.v1.scribe.blue.practice',
            'training.v1.scribe.blue.respond',
            'training.v1.scribe.blue.retrieve',
            'training.v1.scribe.blue.reflect'
        ]);
    });

    it('exports the exact manifest transcripts with deterministic script checksums', () => {
        const exported = buildTrainingAudioScripts();
        expect(exported.entries).toHaveLength(TRAINING_AUDIO_MANIFEST.entries.length);
        expect(exported.entries.map(({ id, text }) => ({ id, text }))).toEqual(
            TRAINING_AUDIO_MANIFEST.entries.map(({ id, text }) => ({ id, text }))
        );
        expect(exported.scriptBundleSha256).toMatch(/^[a-f0-9]{64}$/);
        exported.entries.forEach((entry) => expect(entry.scriptSha256).toMatch(/^[a-f0-9]{64}$/));
    });

    it('exports scripts under plain Node without requiring Vite browser globals', () => {
        const exporterPath = fileURLToPath(new URL(
            '../../../scripts/training-audio/export-scripts.mjs',
            import.meta.url
        ));
        const outputPath = join(tmpdir(), `fractured-order-training-audio-${randomUUID()}.json`);

        try {
            const result = spawnSync(process.execPath, [exporterPath, '--out', outputPath], {
                encoding: 'utf8'
            });

            expect(result.status, result.stderr).toBe(0);
            expect(JSON.parse(readFileSync(outputPath, 'utf8')).entries).toHaveLength(97);
        } finally {
            if (existsSync(outputPath)) unlinkSync(outputPath);
        }
    });

    it('pins the English phonemizer model so generation cannot fetch it implicitly', () => {
        const requirements = readFileSync(fileURLToPath(new URL(
            '../../../scripts/training-audio/requirements.txt',
            import.meta.url
        )), 'utf8');
        const generator = readFileSync(fileURLToPath(new URL(
            '../../../scripts/training-audio/generate.py',
            import.meta.url
        )), 'utf8');

        expect(requirements).toContain(
            'en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/'
            + 'en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl'
            + '#sha256=1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85'
        );
        expect(generator).toContain('EXPECTED_SPACY_MODEL_VERSION = "3.8.0"');
        expect(generator).toContain('metadata.version("en-core-web-sm")');
    });

    it('proves the release contract requires audio, text, duration, checksums, captions, and provenance for every entry', () => {
        expect(validateApprovedAudioManifest(approvedManifest())).toEqual([]);

        const broken = approvedManifest();
        broken.entries[4] = { ...broken.entries[4], checksum: null };
        expect(validateApprovedAudioManifest(broken)).toContain(
            `${broken.entries[4].id}: approved audio metadata is incomplete.`
        );
    });

    it('fails closed for a candidate voice and generated output that remain unapproved', () => {
        const pending = {
            ...TRAINING_AUDIO_MANIFEST,
            provenance: {
                ...TRAINING_AUDIO_MANIFEST.provenance,
                generationDate: null,
                scriptBundleSha256: null,
                voice: { ...TRAINING_AUDIO_MANIFEST.provenance.voice, voiceFileSha256: null },
                mediaBudget: {
                    ...TRAINING_AUDIO_MANIFEST.provenance.mediaBudget,
                    status: 'provisional-until-approved-samples-are-measured',
                    sampleMeasurementsReviewed: false
                },
                approval: { status: 'pending-owner-review' }
            },
            entries: TRAINING_AUDIO_MANIFEST.entries.map((entry) => ({
                ...entry,
                audioUrl: null,
                captionsUrl: null,
                durationSeconds: null,
                checksum: null,
                byteLength: null,
                scriptChecksum: null,
                cues: [],
                approvalStatus: 'pending-owner-review'
            }))
        };
        const errors = validateApprovedAudioManifest(pending);
        expect(errors).toContain('Full-batch owner approval is not recorded.');
        expect(errors).toContain('Release provenance is incomplete.');
        expect(errors.length).toBeGreaterThanOrEqual(99);
    });

    it('reports the current repository release gate honestly', () => {
        const errors = validateApprovedAudioManifest();
        if (TRAINING_AUDIO_MANIFEST.provenance.approval.status === 'approved') {
            expect(errors).toEqual([]);
        } else {
            expect(TRAINING_AUDIO_MANIFEST.provenance.approval.status).toBe('pending-owner-review');
            expect(errors).toContain('Full-batch owner approval is not recorded.');
        }
    });

    it('fails closed when only the pre-generation sample set was approved', () => {
        const sampleOnly = approvedManifest();
        sampleOnly.provenance = {
            ...sampleOnly.provenance,
            approval: {
                ...sampleOnly.provenance.approval,
                scope: 'sample-set',
                fullListenThrough: false,
                clipCount: 4
            }
        };

        expect(validateApprovedAudioManifest(sampleOnly)).toContain(
            'Full-batch owner approval is not recorded.'
        );
    });

    it('pins the candidate engine, model revision, voice, license, and mastering settings', () => {
        expect(TRAINING_AUDIO_MANIFEST.provenance).toMatchObject({
            engine: { name: 'kokoro', version: '0.9.4', license: 'Apache-2.0' },
            model: {
                name: 'hexgrad/Kokoro-82M',
                version: 'v1.0',
                revision: '8542409da2986c0ab5d41b3cf0411f7a58caab38',
                license: 'Apache-2.0'
            },
            voice: { id: 'af_heart', language: 'American English' },
            settings: {
                deliverySampleRateHz: 48000,
                channels: 1,
                integratedLoudnessLufs: -18,
                truePeakDbtp: -2,
                format: 'audio/mpeg',
                bitrateKbps: 64
            }
        });
    });

    it('enforces the provisional per-file and total media ceilings', () => {
        expect(TRAINING_AUDIO_MEDIA_BUDGET).toEqual({
            perFileBytes: 262144,
            totalBytes: 12582912,
            status: TRAINING_AUDIO_MANIFEST.provenance.mediaBudget.status
        });

        const perFileOverrun = approvedManifest({
            perFileBytes: TRAINING_AUDIO_MEDIA_BUDGET.perFileBytes + 1
        });
        expect(validateApprovedAudioManifest(perFileOverrun)).toContain(
            'training.intro: exceeds the per-file media budget.'
        );

        const totalOverrun = approvedManifest({
            totalBytes: TRAINING_AUDIO_MEDIA_BUDGET.totalBytes + 1
        });
        expect(validateApprovedAudioManifest(totalOverrun)).toContain(
            'Narration assets exceed the total media budget.'
        );
    });
});
