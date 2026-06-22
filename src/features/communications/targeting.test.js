import { describe, expect, it } from 'vitest';

import {
    buildWhiteCellRecipientMetadata,
    isNotetakerScopedWhiteCellCommunication,
    isWhiteCellCommunicationVisibleToLead,
    isWhiteCellCommunicationVisibleToScribe,
    isWhiteCellTimelineEventVisibleToLead,
    isWhiteCellTimelineEventVisibleToNotetaker
} from './targeting.js';

const BLUE_TEAM_CONTEXT = {
    teamId: 'blue',
    facilitatorRole: 'blue_facilitator',
    scribeRole: 'blue_scribe',
    notetakerRole: 'blue_notetaker'
};

describe('white cell targeting helpers', () => {
    it('shows lead communications only when they are addressed to the team or a lead seat', () => {
        expect(isWhiteCellCommunicationVisibleToLead({
            from_role: 'white_cell',
            to_role: 'blue'
        }, BLUE_TEAM_CONTEXT)).toBe(true);

        expect(isWhiteCellCommunicationVisibleToLead({
            from_role: 'white_cell',
            to_role: 'blue_facilitator'
        }, BLUE_TEAM_CONTEXT)).toBe(true);

        expect(isWhiteCellCommunicationVisibleToLead({
            from_role: 'white_cell',
            to_role: 'blue_scribe'
        }, BLUE_TEAM_CONTEXT)).toBe(true);

        expect(isWhiteCellCommunicationVisibleToLead({
            from_role: 'white_cell',
            to_role: 'blue_notetaker'
        }, BLUE_TEAM_CONTEXT)).toBe(false);

        expect(isWhiteCellCommunicationVisibleToLead({
            from_role: 'white_cell',
            to_role: 'green'
        }, BLUE_TEAM_CONTEXT)).toBe(false);
    });

    it('uses recipient metadata and white cell role aliases when deciding lead visibility', () => {
        expect(isWhiteCellCommunicationVisibleToLead({
            from_role: 'whitecell_lead',
            to_role: 'whitecell_lead',
            metadata: buildWhiteCellRecipientMetadata('blue')
        }, BLUE_TEAM_CONTEXT)).toBe(true);

        expect(isWhiteCellCommunicationVisibleToLead({
            from_role: 'whitecell_support',
            to_role: '',
            metadata: buildWhiteCellRecipientMetadata('blue_scribe')
        }, BLUE_TEAM_CONTEXT)).toBe(true);
    });

    it('shows notetaker communications only when they are addressed to the team or the notetaker seat', () => {
        expect(isNotetakerScopedWhiteCellCommunication({
            from_role: 'white_cell',
            to_role: 'blue'
        }, BLUE_TEAM_CONTEXT)).toBe(true);

        expect(isNotetakerScopedWhiteCellCommunication({
            from_role: 'white_cell',
            to_role: 'blue_notetaker'
        }, BLUE_TEAM_CONTEXT)).toBe(true);

        expect(isNotetakerScopedWhiteCellCommunication({
            from_role: 'white_cell',
            to_role: 'blue_facilitator'
        }, BLUE_TEAM_CONTEXT)).toBe(false);
    });

    it('shows scribe communications only when they are addressed to the team, all teams, or the scribe seat', () => {
        expect(isWhiteCellCommunicationVisibleToScribe({
            from_role: 'white_cell',
            to_role: 'all'
        }, BLUE_TEAM_CONTEXT)).toBe(true);

        expect(isWhiteCellCommunicationVisibleToScribe({
            from_role: 'white_cell',
            to_role: 'blue_scribe'
        }, BLUE_TEAM_CONTEXT)).toBe(true);

        expect(isWhiteCellCommunicationVisibleToScribe({
            from_role: 'white_cell',
            to_role: 'blue_facilitator'
        }, BLUE_TEAM_CONTEXT)).toBe(false);
    });

    it('filters white cell timeline events by explicit recipient metadata', () => {
        const leadVisibleEvent = {
            team: 'white_cell',
            metadata: buildWhiteCellRecipientMetadata('blue_facilitator')
        };
        const notetakerVisibleEvent = {
            team: 'white_cell',
            metadata: buildWhiteCellRecipientMetadata('blue_notetaker')
        };
        const hiddenEvent = {
            team: 'white_cell',
            metadata: buildWhiteCellRecipientMetadata('green')
        };

        expect(isWhiteCellTimelineEventVisibleToLead(leadVisibleEvent, BLUE_TEAM_CONTEXT)).toBe(true);
        expect(isWhiteCellTimelineEventVisibleToLead(notetakerVisibleEvent, BLUE_TEAM_CONTEXT)).toBe(false);
        expect(isWhiteCellTimelineEventVisibleToLead(hiddenEvent, BLUE_TEAM_CONTEXT)).toBe(false);

        expect(isWhiteCellTimelineEventVisibleToNotetaker(notetakerVisibleEvent, BLUE_TEAM_CONTEXT)).toBe(true);
        expect(isWhiteCellTimelineEventVisibleToNotetaker(leadVisibleEvent, BLUE_TEAM_CONTEXT)).toBe(false);
        expect(isWhiteCellTimelineEventVisibleToNotetaker(hiddenEvent, BLUE_TEAM_CONTEXT)).toBe(false);
    });
});
