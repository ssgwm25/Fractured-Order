import { describe, expect, it } from 'vitest';

import {
    buildFollowAlongNarration,
    getFollowAlongAudioUrl,
    hashFollowAlongNarration
} from './audioGuide.js';

describe('Start Here audio guide contract', () => {
    it('turns the visible slide fields into a detailed operational walkthrough', () => {
        const narration = buildFollowAlongNarration({
            step: {
                title: 'RFIs',
                body: 'Read the submitted request.',
                narrative: 'Confirm its workflow state before responding.',
                details: ['Check the move.', 'Preserve the rationale.'],
                targetLabel: 'RFIs'
            }
        });

        expect(narration).toContain('Let’s walk through RFIs.');
        expect(narration).toContain('one decision-blocking question');
        expect(narration).toContain('Before you continue, verify these points:');
        expect(narration).toContain('Check the move. Preserve the rationale.');
        expect(narration).toContain('highlighted RFIs area');
        expect(narration).not.toBe('RFIs. Read the submitted request. Confirm its workflow state before responding. Check the move. Preserve the rationale.');
    });

    it('adds the correct authority narrative to each role-focus slide', () => {
        const observer = buildFollowAlongNarration({
            storageKey: 'followalong:observer:blue',
            roleLabel: 'Blue Team Observer',
            summary: 'Follow the team record.'
        });
        const gameMaster = buildFollowAlongNarration({
            storageKey: 'followalong:gamemaster',
            roleLabel: 'Game Master',
            summary: 'Maintain the run.'
        });

        expect(observer).toContain('without crossing into participant authority');
        expect(gameMaster).toContain('Treat administration as an evidence chain');
        expect(observer).not.toBe(gameMaster);
    });

    it('uses stable content-addressed MP3 URLs so changed copy cannot play stale audio', () => {
        const text = 'Game Master. Maintain the operational record.';
        expect(hashFollowAlongNarration(text)).toMatch(/^[a-f0-9]{16}$/);
        expect(getFollowAlongAudioUrl(text, '/')).toBe(`/onboarding/start-here/audio/clips/${hashFollowAlongNarration(text)}.mp3`);
        expect(getFollowAlongAudioUrl(`${text} Updated.`)).not.toBe(getFollowAlongAudioUrl(text));
    });

    it('keeps narration under the configured hosted application base path', () => {
        const text = 'Game Master. Maintain the operational record.';
        const expected = `/Fractured-Order/onboarding/start-here/audio/clips/${hashFollowAlongNarration(text)}.mp3`;

        expect(getFollowAlongAudioUrl(text, '/Fractured-Order/')).toBe(expected);
        expect(getFollowAlongAudioUrl(text, '/Fractured-Order')).toBe(expected);
    });
});
