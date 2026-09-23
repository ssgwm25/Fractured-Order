import { afterEach, describe, expect, it } from 'vitest';
import { getConfirmedSeat, setConfirmedSeat } from '../../src/core/seatContext.js';

import { buildStartHereAudioScripts } from './export-scripts.mjs';

afterEach(() => setConfirmedSeat(null));

describe('Start Here narration export', () => {
    it('separates current Green text transcripts from audio generation without approving media', async () => {
        const bundle = await buildStartHereAudioScripts();
        expect(bundle.profileCount).toBe(21);
        expect(bundle.textOnlyProfileCount).toBe(14);
        expect(bundle.entries.length).toBeGreaterThan(0);
        expect(bundle.entries.every((entry) => entry.scriptSha256 && entry.usedBy.length > 0)).toBe(true);
        expect(bundle.profiles.every((profile) => profile.slides[0].kind === 'role-focus')).toBe(true);
        expect(bundle.textOnlyProfiles.every((profile) => profile.slides.every((slide) => slide.text && !slide.clipId))).toBe(true);
        const textKeys = new Set(bundle.textOnlyProfiles.map((profile) => profile.storageKey));
        expect(bundle.entries.every((entry) => entry.usedBy.every((use) => !textKeys.has(use.storageKey)))).toBe(true);
        const shared = bundle.textOnlyProfiles.find((profile) => profile.storageKey.endsWith(':green_shared_facilitator'));
        expect(shared.slides.find((slide) => slide.title === 'RFIs').text).toContain('owning region');
        expect(shared.slides[0].text).toContain('submit each separately');
    });
    it('keeps catalog keys and narration independent of a confirmed regional seat', async () => {
        const baseline = await buildStartHereAudioScripts();
        const seat = { sessionId: 'synthetic-session', participantId: 'synthetic-seat',
            topology: 2, teamId: 'green', delegationId: 'europe', role: 'green_europe_scribe' };
        setConfirmedSeat(seat);
        const regionalContextExport = await buildStartHereAudioScripts();
        expect(regionalContextExport).toEqual(baseline);
        expect(regionalContextExport.textOnlyProfiles.map(profile => profile.storageKey)).toContain('followalong:facilitator:green');
        expect(regionalContextExport.profiles.every(profile => profile.storageKey.startsWith('followalong:'))).toBe(true);
        expect(getConfirmedSeat()).toBe(seat);
    });
});
