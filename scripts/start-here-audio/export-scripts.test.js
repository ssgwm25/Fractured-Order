import { describe, expect, it } from 'vitest';

import { buildStartHereAudioScripts } from './export-scripts.mjs';

describe('Start Here narration export', () => {
    it('covers every shipped role profile and slide from the live walkthrough copy', async () => {
        const bundle = await buildStartHereAudioScripts();
        expect(bundle.profileCount).toBe(24);
        expect(bundle.slideReferenceCount).toBe(253);
        expect(bundle.clipCount).toBe(122);
        expect(bundle.entries.every((entry) => entry.scriptSha256 && entry.usedBy.length > 0)).toBe(true);
        expect(bundle.profiles.every((profile) => profile.slides[0].kind === 'role-focus')).toBe(true);
    });
});
