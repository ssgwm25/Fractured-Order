import { afterEach, describe, expect, it } from 'vitest';
import { getConfirmedSeat, setConfirmedSeat } from '../../src/core/seatContext.js';

import { buildStartHereAudioScripts } from './export-scripts.mjs';

afterEach(() => setConfirmedSeat(null));

describe('Start Here narration export', () => {
    it('covers every shipped role profile and slide from the live walkthrough copy', async () => {
        const bundle = await buildStartHereAudioScripts();
        expect(bundle.profileCount).toBe(24);
        expect(bundle.slideReferenceCount).toBe(257);
        expect(bundle.clipCount).toBe(125);
        expect(bundle.entries.every((entry) => entry.scriptSha256 && entry.usedBy.length > 0)).toBe(true);
        expect(bundle.profiles.every((profile) => profile.slides[0].kind === 'role-focus')).toBe(true);
    });
    it('keeps catalog keys and narration independent of a confirmed regional seat', async () => {
        const baseline = await buildStartHereAudioScripts();
        const seat = { sessionId: 'synthetic-session', participantId: 'synthetic-seat',
            topology: 2, teamId: 'green', delegationId: 'europe', role: 'green_europe_scribe' };
        setConfirmedSeat(seat);
        const regionalContextExport = await buildStartHereAudioScripts();
        expect(regionalContextExport).toEqual(baseline);
        expect(regionalContextExport.profiles.map(profile => profile.storageKey)).toContain('followalong:facilitator:green');
        expect(regionalContextExport.profiles.every(profile => profile.storageKey.startsWith('followalong:'))).toBe(true);
        expect(getConfirmedSeat()).toBe(seat);
    });
});
