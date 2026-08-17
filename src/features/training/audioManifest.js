import { getTrainingCurriculumProfiles } from './content/curriculum.js';
import provenance from './audioProvenance.json';

export const TRAINING_AUDIO_SCHEMA_VERSION = 1;
export const TRAINING_AUDIO_PROVENANCE_ID = 'training-audio-kokoro-v1';

export const TRAINING_AUDIO_INTRO = Object.freeze({
    id: 'training.intro',
    kind: 'intro',
    text: 'Welcome in. This guided practice is private to your training attempt. You can pause, replay, or mute me at any time — and every spoken instruction stays visible on screen.'
});

export const TRAINING_AUDIO_MEDIA_BUDGET = Object.freeze({
    perFileBytes: provenance.mediaBudget?.perFileBytes ?? 256 * 1024,
    totalBytes: provenance.mediaBudget?.totalBytes ?? 12 * 1024 * 1024,
    status: provenance.mediaBudget?.status || 'provisional-until-approved-samples-are-measured'
});

function publicAssetUrl(path, baseUrl = import.meta.env?.BASE_URL || '/') {
    if (!path) return null;
    const normalizedBase = String(baseUrl || '/').endsWith('/')
        ? String(baseUrl || '/')
        : `${baseUrl}/`;
    return `${normalizedBase}${String(path).replace(/^\/+/, '')}`;
}

function curriculumNarrationItems() {
    return getTrainingCurriculumProfiles().flatMap((module) => [
        {
            id: module.id,
            kind: 'module',
            semanticRole: module.semanticRole,
            team: module.supportedTeams[0],
            text: module.narrationScript
        },
        ...module.steps.map((step) => ({
            id: step.id,
            kind: 'step',
            semanticRole: step.semanticRole,
            team: step.supportedTeams[0],
            stage: step.stage,
            text: step.narrationScript
        }))
    ]);
}

function buildEntry(item) {
    const generated = provenance.clips?.[item.id] || {};
    return Object.freeze({
        ...item,
        language: provenance.language,
        transcript: item.text,
        audioUrl: publicAssetUrl(generated.outputPath),
        captionsUrl: publicAssetUrl(generated.captionsPath),
        durationSeconds: generated.durationSeconds ?? null,
        checksum: generated.outputSha256 ?? null,
        byteLength: generated.byteLength ?? null,
        scriptChecksum: generated.scriptSha256 ?? null,
        cues: Object.freeze((generated.cues || []).map((cue) => Object.freeze({ ...cue }))),
        approvalStatus: generated.approvalStatus || 'pending-owner-review',
        provenanceId: provenance.id
    });
}

export const TRAINING_AUDIO_MANIFEST = Object.freeze({
    schemaVersion: TRAINING_AUDIO_SCHEMA_VERSION,
    curriculumVersion: provenance.curriculumVersion,
    provenance: Object.freeze(provenance),
    mediaBudget: TRAINING_AUDIO_MEDIA_BUDGET,
    entries: Object.freeze([
        buildEntry(TRAINING_AUDIO_INTRO),
        ...curriculumNarrationItems().map(buildEntry)
    ])
});

const ENTRIES_BY_ID = new Map(TRAINING_AUDIO_MANIFEST.entries.map((entry) => [entry.id, entry]));

function hasApprovedClipMetadata(entry, provenanceStatus) {
    return Boolean(
        entry
        && provenanceStatus === 'approved'
        && entry.approvalStatus === 'approved'
        && entry.audioUrl
        && entry.audioUrl.endsWith('.mp3')
        && entry.captionsUrl
        && entry.captionsUrl.endsWith('.vtt')
        && Number.isFinite(entry.durationSeconds)
        && entry.durationSeconds > 0
        && /^[a-f0-9]{64}$/i.test(entry.checksum || '')
        && /^[a-f0-9]{64}$/i.test(entry.scriptChecksum || '')
        && Number.isInteger(entry.byteLength)
        && entry.byteLength > 0
        && Array.isArray(entry.cues)
        && entry.cues.length > 0
        && entry.cues.every((cue) => (
            Number.isFinite(cue.startSeconds)
            && Number.isFinite(cue.endSeconds)
            && cue.endSeconds > cue.startSeconds
            && typeof cue.text === 'string'
            && cue.text.trim()
        ))
        && entry.provenanceId === TRAINING_AUDIO_PROVENANCE_ID
    );
}

function hasReleaseProvenance(candidate) {
    return Boolean(
        candidate?.id === TRAINING_AUDIO_PROVENANCE_ID
        && candidate.engine?.name
        && candidate.engine?.version
        && candidate.engine?.license
        && candidate.model?.name
        && candidate.model?.revision
        && candidate.model?.license
        && candidate.voice?.id
        && /^[a-f0-9]{64}$/i.test(candidate.voice?.voiceFileSha256 || '')
        && candidate.settings?.channels === 1
        && [44100, 48000].includes(candidate.settings?.deliverySampleRateHz)
        && candidate.generationDate
        && /^[a-f0-9]{64}$/i.test(candidate.scriptBundleSha256 || '')
        && candidate.approval?.status === 'approved'
        && candidate.approval?.scope === 'full-batch'
        && candidate.approval?.owner
        && candidate.approval?.reviewedAt
        && candidate.approval?.fullListenThrough === true
        && candidate.approval?.clipCount === 97
        && candidate.approval?.qualityReview?.pronunciation === true
        && candidate.approval?.qualityReview?.pacing === true
        && candidate.approval?.qualityReview?.clippingFree === true
        && candidate.approval?.qualityReview?.pausesNatural === true
        && candidate.approval?.qualityReview?.prosodyAccepted === true
        && candidate.mediaBudget?.status === 'approved-from-sample-measurement'
        && candidate.mediaBudget?.sampleMeasurementsReviewed === true
    );
}

export function isApprovedNarrationClip(entry) {
    return hasReleaseProvenance(TRAINING_AUDIO_MANIFEST.provenance)
        && hasApprovedClipMetadata(
            entry,
            TRAINING_AUDIO_MANIFEST.provenance.approval?.status
        );
}

export function getNarrationClip(id, { approvedOnly = true } = {}) {
    const entry = ENTRIES_BY_ID.get(id) || null;
    if (approvedOnly && !isApprovedNarrationClip(entry)) return null;
    return entry;
}

export function getNarrationSequence(semanticRole, team, { includeCommonIntro = false } = {}) {
    const moduleId = `training.v1.${semanticRole}.${team}`;
    const prefix = `${moduleId}.`;
    return TRAINING_AUDIO_MANIFEST.entries.filter((entry) => (
        (includeCommonIntro && entry.id === TRAINING_AUDIO_INTRO.id)
        || entry.id === moduleId
        || entry.id.startsWith(prefix)
    ));
}

export function validateApprovedAudioManifest(manifest = TRAINING_AUDIO_MANIFEST) {
    const errors = [];
    const expectedItems = [TRAINING_AUDIO_INTRO, ...curriculumNarrationItems()];
    const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    if (
        manifest?.provenance?.approval?.status !== 'approved'
        || manifest?.provenance?.approval?.scope !== 'full-batch'
        || manifest?.provenance?.approval?.fullListenThrough !== true
    ) {
        errors.push('Full-batch owner approval is not recorded.');
    }
    if (!hasReleaseProvenance(manifest?.provenance)) {
        errors.push('Release provenance is incomplete.');
    }
    if (entries.length !== expectedItems.length) {
        errors.push(`Expected ${expectedItems.length} narration entries; found ${entries.length}.`);
    }

    expectedItems.forEach((item) => {
        const entry = byId.get(item.id);
        if (!entry) {
            errors.push(`${item.id}: missing manifest entry.`);
            return;
        }
        if (entry.text !== item.text || entry.transcript !== item.text) {
            errors.push(`${item.id}: transcript does not match curriculum source.`);
        }
        if (!hasApprovedClipMetadata(entry, manifest?.provenance?.approval?.status)) {
            errors.push(`${item.id}: approved audio metadata is incomplete.`);
        }
        if (entry.byteLength > manifest.mediaBudget.perFileBytes) {
            errors.push(`${item.id}: exceeds the per-file media budget.`);
        }
    });

    const totalBytes = entries.reduce((sum, entry) => sum + (entry.byteLength || 0), 0);
    if (totalBytes > manifest.mediaBudget.totalBytes) {
        errors.push('Narration assets exceed the total media budget.');
    }

    return Object.freeze(errors);
}

export default TRAINING_AUDIO_MANIFEST;
