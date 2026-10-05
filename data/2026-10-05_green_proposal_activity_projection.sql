-- Keep recipient proposal snapshots aligned with team-specific proposal fields.
-- Green proposals use Objective; Proposed Activity belongs only to Industry.
-- Apply after 2026-10-04_sme_pli_regional_read.sql. No historical rows are rewritten.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.prepare_proposal_communication()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    action_row public.actions%ROWTYPE;
    payload JSONB;
    safe_snapshot JSONB;
BEGIN
    IF NEW.type = 'PROPOSAL_FORWARDED' THEN
        SELECT * INTO action_row
        FROM public.actions
        WHERE id::TEXT = NEW.metadata ->> 'source_proposal_id'
          AND session_id = NEW.session_id;

        IF action_row.id IS NOT NULL THEN
            payload := COALESCE(action_row.artifact_payload -> 'proposal', '{}'::jsonb);
            safe_snapshot := jsonb_strip_nulls(jsonb_build_object(
                'title', action_row.goal,
                'originators', public.proposal_detail_jsonb_list(payload -> 'originators', action_row.ally_contingencies, 'Originators'),
                'objective', COALESCE(NULLIF(BTRIM(payload ->> 'objective'), ''), public.action_legacy_detail(action_row.ally_contingencies, 'Objective')),
                'instruments', public.proposal_detail_jsonb_list(payload -> 'instruments', action_row.ally_contingencies, 'Instruments'),
                'category', COALESCE(NULLIF(BTRIM(payload ->> 'category'), ''), public.action_legacy_detail(action_row.ally_contingencies, 'Category')),
                'focusSector', COALESCE(NULLIF(BTRIM(payload ->> 'focusSector'), ''), action_row.sector),
                'focusSectors', public.proposal_detail_jsonb_list(payload -> 'focusSectors', action_row.ally_contingencies, 'Focus Sectors', action_row.sector),
                'supplyChainFocusDecision', COALESCE(NULLIF(BTRIM(payload ->> 'supplyChainFocusDecision'), ''), public.action_legacy_detail(action_row.ally_contingencies, 'Supply Chain Focus Decision')),
                'supplyChainActionAngles', public.proposal_detail_jsonb_list(payload -> 'supplyChainActionAngles', action_row.ally_contingencies, 'Supply Chain Action Angles'),
                'supplyChainAreas', public.proposal_detail_jsonb_list(payload -> 'supplyChainAreas', action_row.ally_contingencies, 'Supply Chain Areas'),
                'industryFocus', COALESCE(NULLIF(BTRIM(payload ->> 'industryFocus'), ''), public.action_legacy_detail(action_row.ally_contingencies, 'Industry Focus')),
                'countryFocus', COALESCE(NULLIF(BTRIM(payload ->> 'countryFocus'), ''), public.action_legacy_detail(action_row.ally_contingencies, 'Country Focus')),
                'proposedActivity', CASE
                    WHEN LOWER(action_row.team) = 'industry' THEN COALESCE(
                        CASE
                            WHEN jsonb_typeof(payload -> 'proposedActivity') = 'string'
                                THEN NULLIF(BTRIM(payload ->> 'proposedActivity'), '')
                        END,
                        public.action_legacy_detail(action_row.ally_contingencies, 'Proposed Activity')
                    )
                    ELSE NULL
                END,
                'delivery', COALESCE(NULLIF(BTRIM(payload ->> 'delivery'), ''), public.action_legacy_detail(action_row.ally_contingencies, 'Delivery')),
                'timingAndConditions', COALESCE(NULLIF(BTRIM(payload ->> 'timingAndConditions'), ''), public.action_legacy_detail(action_row.ally_contingencies, 'Timing And Conditions')),
                'expectedOutcomes', COALESCE(NULLIF(BTRIM(action_row.expected_outcomes), ''), NULLIF(BTRIM(payload ->> 'expectedOutcomes'), ''))
            ));
            NEW.metadata := jsonb_set(COALESCE(NEW.metadata, '{}'::jsonb), '{proposal}', safe_snapshot, true);
        END IF;
    ELSIF NEW.type = 'PROPOSAL_RESPONSE'
          AND NULLIF(BTRIM(NEW.metadata ->> 'review_request_id'), '') IS NULL THEN
        NEW.type := 'PROPOSAL_RESPONSE_REVIEW';
        NEW.to_role := 'white_cell';
        NEW.metadata := NEW.metadata || jsonb_build_object(
                'proposed_round_number', (NEW.metadata ->> 'round_number')::INTEGER,
                'proposed_message_type', NEW.metadata ->> 'message_type',
                'submitted_at', COALESCE(NEW.metadata ->> 'sent_at', clock_timestamp()::TEXT)
            );
    END IF;
    RETURN NEW;
END;
$$;

COMMIT;
