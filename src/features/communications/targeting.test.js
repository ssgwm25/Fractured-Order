import { describe, expect, it } from 'vitest';

import {
    buildWhiteCellRecipientMetadata,
    isNotetakerScopedWhiteCellCommunication,
    isWhiteCellCommunicationVisibleToLead,
    isWhiteCellCommunicationVisibleToScribe,
    isWhiteCellTimelineEventVisibleToLead,
    isWhiteCellTimelineEventVisibleToNotetaker,
    isActionNotificationCommunication
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

describe('isActionNotificationCommunication', () => {
    it('returns true for ACTION_NOTIFICATION communications', () => {
        expect(isActionNotificationCommunication({
            type: 'ACTION_NOTIFICATION',
            metadata: { shared_action_id: 'action-1', source_team: 'blue' }
        })).toBe(true);
    });

    it('returns true for GUIDANCE communications carrying a shared_action_id', () => {
        expect(isActionNotificationCommunication({
            type: 'GUIDANCE',
            metadata: { shared_action_id: 'action-2', source_team: 'blue' }
        })).toBe(true);
    });

    it('returns false for plain GUIDANCE communications without a shared_action_id', () => {
        expect(isActionNotificationCommunication({
            type: 'GUIDANCE',
            metadata: { content_kind: 'TRIBE_STREET_JOURNAL' }
        })).toBe(false);
    });

    it('returns false for other communication types', () => {
        expect(isActionNotificationCommunication({
            type: 'PROPOSAL_FORWARDED',
            metadata: { shared_action_id: 'action-3' }
        })).toBe(false);
        expect(isActionNotificationCommunication({
            type: 'DIRECT',
            metadata: {}
        })).toBe(false);
    });

    it('handles missing metadata without throwing', () => {
        expect(isActionNotificationCommunication({})).toBe(false);
        expect(isActionNotificationCommunication(undefined)).toBe(false);
    });
});