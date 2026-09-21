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
    const ap = { teamId: 'green', delegationId: 'asian_pacific', facilitatorRole: 'green_asian_pacific_scribe', scribeRole: 'green_asian_pacific_facilitator' };
    const eu = { teamId: 'green', delegationId: 'europe', facilitatorRole: 'green_europe_scribe', scribeRole: 'green_europe_facilitator' };
    const shared = { teamId: 'green', sharedFacilitator: true, scribeRole: 'green_shared_facilitator' };

    it('GC07 keeps role and delegation audiences narrower than parent Green metadata', () => {
        const role = { from_role: 'white_cell', to_role: 'green_europe_scribe', recipient_scope: 'role', recipient_delegation_id: 'europe',
            metadata: { recipient_team: 'green', recipient_role: 'green_europe_scribe' } };
        expect(isWhiteCellCommunicationVisibleToLead(role, eu)).toBe(true);
        expect(isWhiteCellCommunicationVisibleToLead(role, ap)).toBe(false);
        expect(isWhiteCellCommunicationVisibleToScribe(role, shared)).toBe(false);
        const regional = { from_role: 'white_cell', to_role: 'green', recipient_scope: 'delegation', recipient_delegation_id: 'europe', metadata: { recipient_team: 'green' } };
        expect(isWhiteCellCommunicationVisibleToLead(regional, eu)).toBe(true);
        expect(isWhiteCellCommunicationVisibleToLead(regional, ap)).toBe(false);
        expect(isWhiteCellCommunicationVisibleToScribe(regional, shared)).toBe(true);
        expect(isWhiteCellCommunicationVisibleToLead({ ...regional, recipient_delegation_id: 'forged' }, eu)).toBe(false);
        expect(isWhiteCellCommunicationVisibleToLead({ ...role, recipient_scope: 'team' }, ap)).toBe(false);
    });

    it('GC07 renders both Green and session notices and preserves regional timeline targeting', () => {
        const both = { from_role: 'white_cell', to_role: 'green', recipient_scope: 'both_green_delegations' };
        for (const context of [ap, eu]) expect(isWhiteCellCommunicationVisibleToLead(both, context)).toBe(true);
        expect(isWhiteCellCommunicationVisibleToLead(both, BLUE_TEAM_CONTEXT)).toBe(false);
        expect(isWhiteCellCommunicationVisibleToScribe(both, shared)).toBe(true);
        const metadata = buildWhiteCellRecipientMetadata('green_europe');
        expect(metadata).toMatchObject({ recipient_scope: 'delegation', recipient_delegation_id: 'europe', recipient_team: 'green' });
        expect(isWhiteCellTimelineEventVisibleToLead({ team: 'white_cell', metadata }, eu)).toBe(true);
        expect(isWhiteCellTimelineEventVisibleToLead({ team: 'white_cell', metadata }, ap)).toBe(false);
    });
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
