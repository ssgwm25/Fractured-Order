import { describe, expect, it } from 'vitest';

import {
    START_HERE_AUDIO_MANIFEST,
    resolveApprovedStartHereAudioUrl
} from './startHereAudioManifest.js';

describe('Start Here audio activation boundary', () => {
    it('loads content-addressed review audio locally without approving it for production', () => {
        const narration = 'Game Master. Maintain the operational record.';
        expect(START_HERE_AUDIO_MANIFEST.status).toBe('pending-owner-full-listen-through');
        expect(resolveApprovedStartHereAudioUrl(narration, { allowLocalReview: true }))
            .toMatch(/^\/onboarding\/start-here\/audio\/clips\/[a-f0-9]{16}\.mp3$/);
        expect(resolveApprovedStartHereAudioUrl(narration, { allowLocalReview: false })).toBeNull();
    });
});
