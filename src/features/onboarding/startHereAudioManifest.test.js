import { describe, expect, it } from 'vitest';

import {
    START_HERE_AUDIO_MANIFEST,
    resolveApprovedStartHereAudioUrl
} from './startHereAudioManifest.js';
import { hashFollowAlongNarration } from './audioGuide.js';

describe('Start Here audio activation boundary', () => {
    it('loads content-addressed review audio locally while production remains allowlisted', () => {
        const narration = 'Game Master. Maintain the operational record.';
        const contentId = hashFollowAlongNarration(narration);
        expect(resolveApprovedStartHereAudioUrl(narration, {
            allowLocalReview: true,
            baseUrl: '/'
        }))
            .toMatch(/^\/onboarding\/start-here\/audio\/clips\/[a-f0-9]{16}\.mp3$/);
        expect(resolveApprovedStartHereAudioUrl(narration, {
            allowLocalReview: false,
            manifest: { status: 'pending-owner-full-listen-through', clips: {} },
            baseUrl: '/'
        })).toBeNull();
        expect(resolveApprovedStartHereAudioUrl(narration, {
            allowLocalReview: false,
            manifest: { status: 'approved', clips: { [contentId]: true } },
            baseUrl: '/Fractured-Order/'
        })).toBe(`/Fractured-Order/onboarding/start-here/audio/clips/${contentId}.mp3`);
        expect(resolveApprovedStartHereAudioUrl(`${narration} Changed.`, {
            allowLocalReview: false,
            manifest: { status: 'approved', clips: { [contentId]: true } },
            baseUrl: '/'
        })).toBeNull();
    });

    it('keeps the checked-in manifest in a valid fail-closed or approved state', () => {
        expect(['pending-owner-full-listen-through', 'approved'])
            .toContain(START_HERE_AUDIO_MANIFEST.status);
        if (START_HERE_AUDIO_MANIFEST.status === 'pending-owner-full-listen-through') {
            expect(START_HERE_AUDIO_MANIFEST.clips).toEqual({});
        } else {
            expect(Object.keys(START_HERE_AUDIO_MANIFEST.clips).length).toBeGreaterThan(0);
        }
    });
});
