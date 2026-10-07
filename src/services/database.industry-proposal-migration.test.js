import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
    new URL('../../data/2026-10-06_industry_proposals.sql', import.meta.url),
    'utf8'
);

describe('Industry proposal database contract', () => {
    it('enforces completed Strategic Plan, recipients, atomic numbering, and Proposal 1 completion', () => {
        expect(MIGRATION).toContain('INDUSTRY_STRATEGIC_PLAN_COMPLETION_REQUIRED');
        expect(MIGRATION).toContain("'{strategic_orientation,industryStrategicPlanParseStatus}'");
        expect(MIGRATION).toContain('Draft, forwarded, and submitted proposals share the same persisted');
        expect(MIGRATION).toContain('INDUSTRY_PROPOSAL_RECIPIENT_REQUIRED');
        expect(MIGRATION).toContain('pg_advisory_xact_lock');
        expect(MIGRATION).toContain('INDUSTRY_PROPOSAL_ONE_COMPLETION_REQUIRED');
        expect(MIGRATION).toContain("MAX(");
        expect(MIGRATION).toContain('INTO next_ordinal');
    });

    it('blocks move advance until all three Industry sectors have a completed proposal', () => {
        expect(MIGRATION).toContain("ARRAY['agriculture', 'biotechnology', 'telecommunications']");
        expect(MIGRATION).toContain('INDUSTRY_PROPOSALS_INCOMPLETE');
        expect(MIGRATION).toContain('BEFORE UPDATE ON public.game_state');
    });

    it('uses restrictive read policies for proposals and their related records', () => {
        expect(MIGRATION).toContain('industry_proposal_visibility');
        expect(MIGRATION).toContain('industry_proposal_review_visibility');
        expect(MIGRATION).toContain('industry_proposal_log_visibility');
        expect(MIGRATION).toContain('industry_proposal_timeline_visibility');
        expect(MIGRATION).toContain('industry_proposal_communication_visibility');
        expect(MIGRATION).toContain('{proposal,industryTurnSheet,engagement,outbound,linkedRecordId}');
        expect(MIGRATION.match(/AS RESTRICTIVE FOR SELECT TO authenticated/g)).toHaveLength(5);
    });

    it('projects structured content to approved recipients without routing or facilitator-only fields', () => {
        expect(MIGRATION).toContain('project_industry_proposal_communication');
        expect(MIGRATION).toContain("'{proposal,industryProposal}'");
        expect(MIGRATION).toContain("- 'recipientTeams'");
        expect(MIGRATION).toContain("- 'facilitatorNote'");
        expect(MIGRATION).toContain("- 'linkedRecordId' - 'contact'");
    });
});
