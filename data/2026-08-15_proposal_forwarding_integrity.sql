-- Repair multi-recipient proposal forwarding, redact routing-only partner data
-- from recipient snapshots, and gate proposal responses through White Cell.

BEGIN;

CREATE OR REPLACE FUNCTION public.proposal_detail_jsonb_list(
    requested_existing JSONB,
    requested_details TEXT,
    requested_label TEXT,
    requested_fallback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    legacy_value TEXT := public.action_legacy_detail(requested_details, requested_label);
BEGIN
    IF jsonb_typeof(requested_existing) = 'array' AND jsonb_array_length(requested_existing) > 0 THEN
        RETURN requested_existing;
    END IF;
    IF legacy_value IS NOT NULL AND legacy_value <> 'None selected' THEN
        IF legacy_value ~ '^[[:space:]]*\[' THEN
            RETURN legacy_value::jsonb;
        END IF;
        RETURN to_jsonb(regexp_split_to_array(legacy_value, '[[:space:]]*,[[:space:]]*'));
    END IF;
    IF NULLIF(BTRIM(requested_fallback), '') IS NOT NULL THEN
        RETURN to_jsonb(ARRAY[requested_fallback]);
    END IF;
    RETURN '[]'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_all_recipient_teams(
    requested_payload JSONB,
    requested_details TEXT,
    requested_fallback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(team ORDER BY team), '[]'::jsonb)
    FROM (
        SELECT DISTINCT LOWER(BTRIM(value)) AS team
        FROM jsonb_array_elements_text(
            COALESCE(
                CASE
                    WHEN jsonb_typeof(requested_payload -> 'recipientTeams') = 'array'
                        THEN requested_payload -> 'recipientTeams'
                END,
                '[]'::jsonb
            )
            || CASE
                WHEN public.action_legacy_detail(requested_details, 'Recipient Teams') ~ '^[[:space:]]*\['
                    THEN public.action_legacy_detail(requested_details, 'Recipient Teams')::jsonb
                WHEN public.action_legacy_detail(requested_details, 'Recipient Teams') IS NOT NULL
                    THEN to_jsonb(regexp_split_to_array(
                        public.action_legacy_detail(requested_details, 'Recipient Teams'),
                        '[[:space:]]*,[[:space:]]*'
                    ))
                ELSE '[]'::jsonb
            END
            || CASE
                WHEN NULLIF(BTRIM(requested_fallback), '') IS NOT NULL
                    THEN to_jsonb(ARRAY[requested_fallback])
                ELSE '[]'::jsonb
            END
        ) AS recipients(value)
        WHERE LOWER(BTRIM(value)) IN ('blue', 'red')
    ) normalized;
$$;

CREATE OR REPLACE FUNCTION public.sync_proposal_recipient_payload()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    proposal_payload JSONB;
BEGIN
    IF NEW.artifact_type <> 'proposal' THEN
        RETURN NEW;
    END IF;

    proposal_payload := COALESCE(NEW.artifact_payload -> 'proposal', '{}'::jsonb);
    NEW.artifact_payload := COALESCE(NEW.artifact_payload, '{}'::jsonb)
        || jsonb_build_object(
            'proposal',
            proposal_payload || jsonb_build_object(
                'recipientTeams',
                public.proposal_all_recipient_teams(
                    proposal_payload,
                    NEW.ally_contingencies,
                    NEW.proposal_recipient_team
                )
            )
        );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS actions_sync_proposal_recipient_payload ON public.actions;
DROP TRIGGER IF EXISTS zz_actions_sync_proposal_recipient_payload ON public.actions;
CREATE TRIGGER zz_actions_sync_proposal_recipient_payload
    BEFORE INSERT OR UPDATE ON public.actions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_proposal_recipient_payload();

UPDATE public.actions
SET artifact_payload = COALESCE(artifact_payload, '{}'::jsonb)
    || jsonb_build_object(
        'proposal',
        COALESCE(artifact_payload -> 'proposal', '{}'::jsonb)
        || jsonb_build_object(
            'recipientTeams',
            public.proposal_all_recipient_teams(
                COALESCE(artifact_payload -> 'proposal', '{}'::jsonb),
                ally_contingencies,
                proposal_recipient_team
            )
        )
    )
WHERE artifact_type = 'proposal';

ALTER TABLE public.communications
    DROP CONSTRAINT IF EXISTS communications_type_check;

DO $$
DECLARE
    constraint_row RECORD;
BEGIN
    FOR constraint_row IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.communications'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%type IN%'
    LOOP
        EXECUTE format('ALTER TABLE public.communications DROP CONSTRAINT %I', constraint_row.conname);
    END LOOP;
END $$;

ALTER TABLE public.communications
    ADD CONSTRAINT communications_type_check
    CHECK (type IN (
        'INJECT', 'ANNOUNCEMENT', 'GUIDANCE', 'PROPOSAL_FORWARDED',
        'PROPOSAL_RESPONSE', 'PROPOSAL_RESPONSE_REVIEW', 'ACTION_NOTIFICATION',
        'rfi_response', 'RFI_RESPONSE', 'broadcast', 'direct', 'system',
        'game_update', 'message'
    ));

CREATE UNIQUE INDEX IF NOT EXISTS communications_proposal_response_review_client_unique
    ON public.communications ((metadata ->> 'client_message_id'))
    WHERE type = 'PROPOSAL_RESPONSE_REVIEW'
      AND NULLIF(BTRIM(metadata ->> 'client_message_id'), '') IS NOT NULL;

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
                'proposedActivity', COALESCE(NULLIF(BTRIM(payload ->> 'proposedActivity'), ''), public.action_legacy_detail(action_row.ally_contingencies, 'Proposed Activity')),
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

DROP TRIGGER IF EXISTS communications_prepare_proposal_workflow ON public.communications;
CREATE TRIGGER communications_prepare_proposal_workflow
    BEFORE INSERT ON public.communications
    FOR EACH ROW
    EXECUTE FUNCTION public.prepare_proposal_communication();

CREATE OR REPLACE FUNCTION public.operator_forward_proposal_response(
    requested_review_communication_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    review_row public.communications%ROWTYPE;
    parent_row public.communications%ROWTYPE;
    latest_row public.communications%ROWTYPE;
    existing_row public.communications%ROWTYPE;
    created_row public.communications%ROWTYPE;
    created_timeline public.timeline%ROWTYPE;
    source_action public.actions%ROWTYPE;
    sent_at_value TIMESTAMPTZ := clock_timestamp();
BEGIN
    SELECT * INTO review_row
    FROM public.communications
    WHERE id = requested_review_communication_id
    FOR UPDATE;

    IF review_row.id IS NULL OR review_row.type <> 'PROPOSAL_RESPONSE_REVIEW' THEN
        RAISE EXCEPTION 'Proposal response review not found.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.live_demo_has_operator_grant('whitecell', review_row.session_id) THEN
        RAISE EXCEPTION 'White Cell operator authorization is required.' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(BTRIM(review_row.content), '') IS NULL
       OR LOWER(review_row.metadata ->> 'proposed_message_type') NOT IN (
            'recipient_response', 'negotiation_message', 'thread_closed'
       )
       OR LOWER(review_row.metadata ->> 'sender_team') NOT IN (
            LOWER(review_row.metadata ->> 'source_team'),
            LOWER(review_row.metadata ->> 'recipient_team')
       ) THEN
        RAISE EXCEPTION 'Proposal response review metadata is invalid.' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO existing_row
    FROM public.communications
    WHERE metadata ->> 'review_request_id' = review_row.id::TEXT
    LIMIT 1;
    IF existing_row.id IS NOT NULL THEN
        RETURN jsonb_build_object('communication', to_jsonb(existing_row), 'timeline_event', NULL, 'idempotent_replay', true);
    END IF;

    SELECT * INTO parent_row
    FROM public.communications
    WHERE id::TEXT = review_row.metadata ->> 'parent_message_id'
    FOR UPDATE;
    SELECT * INTO latest_row
    FROM public.communications
    WHERE type IN ('PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE')
      AND metadata ->> 'thread_id' = review_row.metadata ->> 'thread_id'
      AND LOWER(metadata ->> 'recipient_team') = LOWER(review_row.metadata ->> 'recipient_team')
    ORDER BY (metadata ->> 'round_number')::INTEGER DESC, created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;

    IF parent_row.id IS NULL OR latest_row.id IS DISTINCT FROM parent_row.id THEN
        RAISE EXCEPTION 'A newer proposal thread round already exists.' USING ERRCODE = '40001';
    END IF;
    IF (review_row.metadata ->> 'proposed_round_number')::INTEGER
       <> (parent_row.metadata ->> 'round_number')::INTEGER + 1 THEN
        RAISE EXCEPTION 'Proposal response round is invalid.' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO source_action
    FROM public.actions
    WHERE id::TEXT = review_row.metadata ->> 'source_proposal_id';
    IF source_action.id IS NULL OR source_action.session_id <> review_row.session_id THEN
        RAISE EXCEPTION 'Proposal response source does not match the review session.' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.communications (
        session_id, move, from_role, to_role, type, title, content, client_id, metadata
    ) VALUES (
        review_row.session_id,
        review_row.move,
        review_row.metadata ->> 'sender_role',
        CASE
            WHEN LOWER(review_row.metadata ->> 'sender_team') = LOWER(review_row.metadata ->> 'source_team')
                THEN LOWER(review_row.metadata ->> 'recipient_team')
            ELSE LOWER(review_row.metadata ->> 'source_team')
        END,
        'PROPOSAL_RESPONSE',
        review_row.title,
        review_row.content,
        review_row.client_id,
        jsonb_strip_nulls(jsonb_build_object(
            'thread_id', review_row.metadata ->> 'thread_id',
            'recipient_team', LOWER(review_row.metadata ->> 'recipient_team'),
            'round_number', (review_row.metadata ->> 'proposed_round_number')::INTEGER,
            'parent_message_id', parent_row.id,
            'source_proposal_id', review_row.metadata ->> 'source_proposal_id',
            'source_revision', (review_row.metadata ->> 'source_revision')::INTEGER,
            'source_team', LOWER(review_row.metadata ->> 'source_team'),
            'sender_team', LOWER(review_row.metadata ->> 'sender_team'),
            'sender_role', review_row.metadata ->> 'sender_role',
            'sent_at', sent_at_value,
            'message_type', review_row.metadata ->> 'proposed_message_type',
            'facilitator_decision', review_row.metadata ->> 'facilitator_decision',
            'client_message_id', review_row.metadata ->> 'client_message_id',
            'review_request_id', review_row.id,
            'forwarded_by_role', public.live_demo_participant_role(review_row.session_id),
            'forwarded_at', sent_at_value
        ))
    ) RETURNING * INTO created_row;

    INSERT INTO public.timeline (session_id, move, phase, team, type, content, client_id, metadata)
    VALUES (
        review_row.session_id,
        review_row.move,
        COALESCE(source_action.phase, 1),
        'white_cell',
        'PROPOSAL_RESPONSE',
        format('White Cell forwarded a proposal response from %s to %s.',
            INITCAP(review_row.metadata ->> 'sender_team'), INITCAP(created_row.to_role)),
        auth.uid()::TEXT,
        jsonb_build_object(
            'related_id', review_row.metadata ->> 'source_proposal_id',
            'communication_id', created_row.id,
            'review_request_id', review_row.id,
            'recipient_team', review_row.metadata ->> 'recipient_team',
            'thread_id', review_row.metadata ->> 'thread_id',
            'round_number', (review_row.metadata ->> 'proposed_round_number')::INTEGER
        )
    ) RETURNING * INTO created_timeline;

    RETURN jsonb_build_object(
        'communication', to_jsonb(created_row),
        'timeline_event', to_jsonb(created_timeline),
        'idempotent_replay', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.operator_forward_proposal_response(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_forward_proposal_response(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.operator_forward_proposal_response(UUID) TO authenticated;

COMMENT ON FUNCTION public.operator_forward_proposal_response(UUID) IS
    'Atomically forwards one pending proposal response as the next immutable recipient-scoped thread round.';

COMMIT;
