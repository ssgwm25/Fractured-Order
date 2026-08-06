-- Independent proposal-recipient approvals and append-only response threads.
-- Apply after data/2026-08-06_facilitator_rfi_communications.sql.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS communications_proposal_thread_round_unique
    ON public.communications (
        (metadata ->> 'thread_id'),
        (metadata ->> 'recipient_team'),
        ((metadata ->> 'round_number')::INTEGER)
    )
    WHERE type IN ('PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE')
      AND NULLIF(BTRIM(metadata ->> 'thread_id'), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS communications_proposal_client_message_unique
    ON public.communications ((metadata ->> 'client_message_id'))
    WHERE type = 'PROPOSAL_RESPONSE'
      AND NULLIF(BTRIM(metadata ->> 'client_message_id'), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_proposal_thread_message_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NULLIF(BTRIM(OLD.metadata ->> 'thread_id'), '') IS NOT NULL THEN
        RAISE EXCEPTION 'Proposal thread messages are append-only.'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_proposal_thread_message_immutability ON public.communications;
CREATE TRIGGER guard_proposal_thread_message_immutability
    BEFORE UPDATE OR DELETE ON public.communications
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_proposal_thread_message_immutability();

-- Retain the old RPC signature for compatibility, but freeze all legacy and
-- thread-backed rows. New state is expressed only by appended thread messages.
CREATE OR REPLACE FUNCTION public.update_proposal_recipient_status(
    requested_communication_id UUID,
    requested_status TEXT,
    requested_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.communications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    communication_row public.communications%ROWTYPE;
BEGIN
    SELECT * INTO communication_row
    FROM public.communications
    WHERE id = requested_communication_id;

    IF communication_row.id IS NULL THEN
        RAISE EXCEPTION 'Proposal communication not found.' USING ERRCODE = 'P0002';
    END IF;
    IF NULLIF(BTRIM(communication_row.metadata ->> 'thread_id'), '') IS NOT NULL THEN
        RAISE EXCEPTION 'Proposal threads are append-only; append a new message instead.'
            USING ERRCODE = '23514';
    END IF;

    RAISE EXCEPTION 'Legacy proposal recipient state is immutable.'
        USING ERRCODE = '23514';
END;
$$;

DROP FUNCTION IF EXISTS public.operator_review_proposal(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.operator_review_proposal(
    requested_action_id UUID,
    requested_review_decision TEXT,
    requested_recipient_team TEXT,
    requested_adjudication_notes TEXT DEFAULT NULL,
    requested_expected_revision INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    action_row public.actions%ROWTYPE;
    updated_action public.actions%ROWTYPE;
    created_communication public.communications%ROWTYPE;
    created_timeline public.timeline%ROWTYPE;
    existing_communication public.communications%ROWTYPE;
    normalized_decision TEXT := LOWER(NULLIF(BTRIM(requested_review_decision), ''));
    normalized_recipient TEXT := LOWER(NULLIF(BTRIM(requested_recipient_team), ''));
    normalized_notes TEXT := NULLIF(BTRIM(requested_adjudication_notes), '');
    intended_recipients TEXT[];
    approved_recipient_count INTEGER;
    proposal_snapshot JSONB;
    recipient_reviews JSONB;
    thread_id_value UUID := gen_random_uuid();
    sent_at_value TIMESTAMPTZ := clock_timestamp();
    reviewer_role TEXT;
BEGIN
    SELECT * INTO action_row
    FROM public.actions
    WHERE id = requested_action_id
      AND COALESCE(is_deleted, false) = false
    FOR UPDATE;

    IF action_row.id IS NULL THEN
        RAISE EXCEPTION 'Proposal action not found.' USING ERRCODE = 'P0002';
    END IF;
    IF action_row.artifact_type <> 'proposal' THEN
        RAISE EXCEPTION 'Only proposal artifacts can use operator_review_proposal.'
            USING ERRCODE = '22023';
    END IF;
    IF normalized_decision <> 'forward_to_recipient' THEN
        RAISE EXCEPTION 'Recipient approvals only support forward_to_recipient; return changes through the artifact review RPC.'
            USING ERRCODE = '22023';
    END IF;
    IF normalized_recipient NOT IN ('blue', 'red') THEN
        RAISE EXCEPTION 'A Blue or Red recipient is required.' USING ERRCODE = '23514';
    END IF;
    IF requested_expected_revision IS NOT NULL
       AND requested_expected_revision <> COALESCE(action_row.revision_number, 1) THEN
        RAISE EXCEPTION 'Stale proposal revision. Expected %, current %.',
            requested_expected_revision, COALESCE(action_row.revision_number, 1)
            USING ERRCODE = '40001';
    END IF;
    IF NOT public.live_demo_has_operator_grant(
        'whitecell',
        action_row.session_id,
        public.live_demo_participant_team(action_row.session_id),
        public.live_demo_participant_role(action_row.session_id)
    ) THEN
        RAISE EXCEPTION 'White Cell operator authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    reviewer_role := COALESCE(
        public.live_demo_participant_role(action_row.session_id),
        'whitecell'
    );
    SELECT ARRAY_AGG(DISTINCT LOWER(BTRIM(value)) ORDER BY LOWER(BTRIM(value)))
    INTO intended_recipients
    FROM jsonb_array_elements_text(
        CASE
            WHEN jsonb_typeof(action_row.artifact_payload -> 'proposal' -> 'recipientTeams') = 'array'
                THEN action_row.artifact_payload -> 'proposal' -> 'recipientTeams'
            WHEN public.action_legacy_detail(action_row.ally_contingencies, 'Recipient Teams') ~ '^[[:space:]]*\['
                THEN public.action_legacy_detail(action_row.ally_contingencies, 'Recipient Teams')::jsonb
            WHEN NULLIF(BTRIM(public.action_legacy_detail(action_row.ally_contingencies, 'Recipient Teams')), '') IS NOT NULL
                THEN to_jsonb(regexp_split_to_array(
                    public.action_legacy_detail(action_row.ally_contingencies, 'Recipient Teams'),
                    '[[:space:]]*,[[:space:]]*'
                ))
            WHEN action_row.proposal_recipient_team IS NOT NULL
                THEN to_jsonb(ARRAY[action_row.proposal_recipient_team])
            ELSE '[]'::jsonb
        END
    ) AS recipients(value)
    WHERE LOWER(BTRIM(value)) IN ('blue', 'red');

    IF intended_recipients IS NULL OR NOT normalized_recipient = ANY(intended_recipients) THEN
        RAISE EXCEPTION 'Requested recipient is not an intended proposal partner.'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO existing_communication
    FROM public.communications
    WHERE type = 'PROPOSAL_FORWARDED'
      AND metadata ->> 'source_proposal_id' = action_row.id::TEXT
      AND LOWER(metadata ->> 'recipient_team') = normalized_recipient
    ORDER BY created_at, id
    LIMIT 1;

    IF existing_communication.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'action', to_jsonb(action_row),
            'communication', to_jsonb(existing_communication),
            'timeline_events', '[]'::jsonb,
            'recipient_team', normalized_recipient,
            'idempotent_replay', true
        );
    END IF;

    IF action_row.status <> 'submitted'
       OR action_row.workflow_state NOT IN ('submitted_to_white_cell', 'resubmitted') THEN
        RAISE EXCEPTION 'Only a submitted proposal with pending recipients can be approved.'
            USING ERRCODE = '23514';
    END IF;

    proposal_snapshot := COALESCE(action_row.artifact_payload -> 'proposal', '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
            'title', action_row.goal,
            'expectedOutcomes', action_row.expected_outcomes,
            'recipientTeams', to_jsonb(intended_recipients)
        ));

    INSERT INTO public.communications (
        session_id, move, from_role, to_role, type, title, content, client_id, metadata
    ) VALUES (
        action_row.session_id,
        action_row.move,
        'white_cell',
        normalized_recipient,
        'PROPOSAL_FORWARDED',
        action_row.goal,
        format('White Cell approved and forwarded the %s Team proposal: %s',
            INITCAP(action_row.team), COALESCE(NULLIF(BTRIM(action_row.goal), ''), 'Untitled proposal')),
        auth.uid()::TEXT,
        jsonb_build_object(
            'thread_id', thread_id_value,
            'recipient_team', normalized_recipient,
            'round_number', 0,
            'parent_message_id', NULL,
            'source_proposal_id', action_row.id,
            'source_revision', COALESCE(action_row.revision_number, 1),
            'source_team', LOWER(BTRIM(action_row.team)),
            'sender_team', 'white_cell',
            'sender_role', reviewer_role,
            'sent_at', sent_at_value,
            'message_type', 'proposal_forwarded',
            'proposal', proposal_snapshot,
            'review_decision', 'forward_to_recipient',
            'review_stage', 'approved_forwarded'
        )
    ) RETURNING * INTO created_communication;

    recipient_reviews := COALESCE(action_row.artifact_payload -> 'proposal_recipient_reviews', '{}'::jsonb)
        || jsonb_build_object(normalized_recipient, jsonb_build_object(
            'status', 'approved_forwarded',
            'thread_id', thread_id_value,
            'communication_id', created_communication.id,
            'approved_at', sent_at_value,
            'approved_by_role', reviewer_role
        ));

    UPDATE public.actions
    SET artifact_payload = COALESCE(artifact_payload, '{}'::jsonb)
        || jsonb_build_object('proposal_recipient_reviews', recipient_reviews),
        updated_at = sent_at_value
    WHERE id = action_row.id
    RETURNING * INTO updated_action;

    INSERT INTO public.timeline (
        session_id, move, phase, team, type, content, client_id, metadata
    ) VALUES (
        updated_action.session_id,
        updated_action.move,
        updated_action.phase,
        'white_cell',
        'PROPOSAL_FORWARDED',
        format('%s Team proposal independently approved for %s Team.',
            INITCAP(updated_action.team), INITCAP(normalized_recipient)),
        auth.uid()::TEXT,
        jsonb_build_object(
            'related_id', updated_action.id,
            'source_team', updated_action.team,
            'recipient_team', normalized_recipient,
            'thread_id', thread_id_value,
            'source_revision', COALESCE(updated_action.revision_number, 1),
            'review_decision', 'forward_to_recipient',
            'review_stage', 'approved_forwarded',
            'proposal', true
        )
    ) RETURNING * INTO created_timeline;

    SELECT COUNT(DISTINCT LOWER(metadata ->> 'recipient_team'))
    INTO approved_recipient_count
    FROM public.communications
    WHERE type = 'PROPOSAL_FORWARDED'
      AND metadata ->> 'source_proposal_id' = updated_action.id::TEXT;

    IF approved_recipient_count = CARDINALITY(intended_recipients) THEN
        PERFORM public.operator_review_artifact(
            'action',
            updated_action.id,
            'complete',
            updated_action.team,
            COALESCE(updated_action.revision_number, 1),
            normalized_notes
        );
        SELECT * INTO updated_action FROM public.actions WHERE id = action_row.id;
    END IF;

    RETURN jsonb_build_object(
        'action', to_jsonb(updated_action),
        'communication', to_jsonb(created_communication),
        'timeline_events', jsonb_build_array(to_jsonb(created_timeline)),
        'recipient_team', normalized_recipient,
        'idempotent_replay', false
    );
END;
$$;

DROP FUNCTION IF EXISTS public.append_proposal_thread_message(UUID, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.append_proposal_thread_message(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.append_proposal_thread_message(
    requested_parent_message_id UUID,
    requested_content TEXT,
    requested_message_type TEXT,
    requested_facilitator_decision TEXT DEFAULT NULL,
    requested_client_message_id TEXT DEFAULT NULL
)
RETURNS public.communications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    parent_row public.communications%ROWTYPE;
    latest_row public.communications%ROWTYPE;
    existing_row public.communications%ROWTYPE;
    created_row public.communications%ROWTYPE;
    participant_team TEXT;
    participant_role TEXT;
    participant_surface TEXT;
    source_team TEXT;
    recipient_team TEXT;
    sender_team TEXT;
    next_recipient TEXT;
    thread_id_value TEXT;
    source_proposal_id TEXT;
    source_revision INTEGER;
    parent_round INTEGER;
    normalized_content TEXT := NULLIF(BTRIM(requested_content), '');
    normalized_type TEXT := LOWER(NULLIF(BTRIM(requested_message_type), ''));
    normalized_decision TEXT := LOWER(NULLIF(BTRIM(requested_facilitator_decision), ''));
    normalized_client_message_id TEXT := NULLIF(BTRIM(COALESCE(requested_client_message_id, '')), '');
    sent_at_value TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF requested_parent_message_id IS NULL OR normalized_content IS NULL THEN
        RAISE EXCEPTION 'Parent message and content are required.' USING ERRCODE = '22023';
    END IF;
    IF normalized_type NOT IN ('recipient_response', 'negotiation_message', 'thread_closed') THEN
        RAISE EXCEPTION 'Unsupported proposal thread message type.' USING ERRCODE = '22023';
    END IF;
    IF normalized_decision IS NOT NULL AND normalized_decision NOT IN ('accept', 'not_interested', 'negotiate') THEN
        RAISE EXCEPTION 'Unsupported proposal response decision.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO parent_row
    FROM public.communications
    WHERE id = requested_parent_message_id
    FOR UPDATE;

    IF parent_row.id IS NULL
       OR parent_row.type NOT IN ('PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE')
       OR NULLIF(BTRIM(parent_row.metadata ->> 'thread_id'), '') IS NULL THEN
        RAISE EXCEPTION 'Proposal thread parent message not found.' USING ERRCODE = 'P0002';
    END IF;

    participant_team := public.live_demo_participant_team(parent_row.session_id);
    participant_role := public.live_demo_participant_role(parent_row.session_id);
    participant_surface := public.live_demo_participant_surface(parent_row.session_id);
    source_team := LOWER(BTRIM(parent_row.metadata ->> 'source_team'));
    recipient_team := LOWER(BTRIM(parent_row.metadata ->> 'recipient_team'));
    sender_team := LOWER(BTRIM(parent_row.metadata ->> 'sender_team'));
    thread_id_value := parent_row.metadata ->> 'thread_id';
    source_proposal_id := parent_row.metadata ->> 'source_proposal_id';
    source_revision := (parent_row.metadata ->> 'source_revision')::INTEGER;
    parent_round := (parent_row.metadata ->> 'round_number')::INTEGER;

    IF auth.uid() IS NULL
       OR participant_surface NOT IN ('facilitator', 'scribe')
       OR participant_team NOT IN (source_team, recipient_team) THEN
        RAISE EXCEPTION 'Proposal thread access is restricted to its two teams.'
            USING ERRCODE = '42501';
    END IF;

    -- Resolve a retry before the stale-parent check. The client message ID is
    -- stable for one attempted round, so a committed first attempt is returned
    -- without creating or notifying a second time.
    IF normalized_client_message_id IS NOT NULL THEN
        SELECT * INTO existing_row
        FROM public.communications
        WHERE metadata ->> 'client_message_id' = normalized_client_message_id
        LIMIT 1;
        IF existing_row.id IS NOT NULL THEN
            IF existing_row.metadata ->> 'thread_id' <> thread_id_value
               OR LOWER(existing_row.metadata ->> 'sender_team') <> participant_team THEN
                RAISE EXCEPTION 'Client message ID belongs to another proposal thread.'
                    USING ERRCODE = '42501';
            END IF;
            RETURN existing_row;
        END IF;
    END IF;

    IF participant_team = sender_team THEN
        RAISE EXCEPTION 'The other thread participant must answer the latest round.'
            USING ERRCODE = '23514';
    END IF;

    SELECT * INTO latest_row
    FROM public.communications
    WHERE metadata ->> 'thread_id' = thread_id_value
      AND LOWER(metadata ->> 'recipient_team') = recipient_team
    ORDER BY (metadata ->> 'round_number')::INTEGER DESC, created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;

    IF latest_row.id IS DISTINCT FROM parent_row.id THEN
        RAISE EXCEPTION 'A newer proposal thread round already exists.' USING ERRCODE = '40001';
    END IF;
    IF LOWER(latest_row.metadata ->> 'message_type') = 'thread_closed' THEN
        RAISE EXCEPTION 'Closed proposal threads are immutable.' USING ERRCODE = '23514';
    END IF;
    IF parent_round = 0 AND participant_team <> recipient_team THEN
        RAISE EXCEPTION 'The addressed recipient must send the first response.' USING ERRCODE = '42501';
    END IF;
    IF participant_team = source_team AND normalized_type = 'recipient_response' THEN
        RAISE EXCEPTION 'The proposing team must use a negotiation follow-up or close the thread.'
            USING ERRCODE = '22023';
    END IF;

    next_recipient := CASE WHEN participant_team = source_team THEN recipient_team ELSE source_team END;

    INSERT INTO public.communications (
        session_id, move, from_role, to_role, type, title, content, client_id, metadata
    ) VALUES (
        parent_row.session_id,
        parent_row.move,
        participant_role,
        next_recipient,
        'PROPOSAL_RESPONSE',
        parent_row.title,
        normalized_content,
        auth.uid()::TEXT,
        jsonb_strip_nulls(jsonb_build_object(
            'thread_id', thread_id_value,
            'recipient_team', recipient_team,
            'round_number', parent_round + 1,
            'parent_message_id', parent_row.id,
            'source_proposal_id', source_proposal_id,
            'source_revision', source_revision,
            'source_team', source_team,
            'sender_team', participant_team,
            'sender_role', participant_role,
            'sent_at', sent_at_value,
            'message_type', normalized_type,
            'facilitator_decision', normalized_decision,
            'client_message_id', normalized_client_message_id
        ))
    ) RETURNING * INTO created_row;

    RETURN created_row;
END;
$$;

DROP POLICY IF EXISTS communications_live_demo_read ON public.communications;
DROP POLICY IF EXISTS communications_live_demo_insert ON public.communications;
DROP POLICY IF EXISTS "Allow all operations on communications" ON public.communications;

CREATE POLICY communications_live_demo_read
    ON public.communications FOR SELECT
    USING (
        public.live_demo_has_operator_grant('whitecell', session_id)
        OR public.live_demo_has_operator_grant('gamemaster')
        OR (
            public.live_demo_can_read_session(session_id)
            AND (
                LOWER(BTRIM(from_role)) = public.live_demo_participant_role(session_id)
                OR (
                    type IN ('PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE')
                    AND NULLIF(BTRIM(metadata ->> 'thread_id'), '') IS NOT NULL
                    AND public.live_demo_participant_team(session_id) IN (
                        LOWER(BTRIM(metadata ->> 'source_team')),
                        LOWER(BTRIM(metadata ->> 'recipient_team'))
                    )
                )
                OR (
                    LOWER(BTRIM(from_role)) IN ('white_cell', 'whitecell', 'whitecell_lead', 'whitecell_support')
                    AND (
                        LOWER(BTRIM(to_role)) = 'all'
                        OR LOWER(BTRIM(to_role)) = public.live_demo_participant_team(session_id)
                        OR LOWER(BTRIM(to_role)) = public.live_demo_participant_role(session_id)
                        OR LOWER(BTRIM(COALESCE(metadata ->> 'recipient_team', ''))) = public.live_demo_participant_team(session_id)
                        OR LOWER(BTRIM(COALESCE(metadata ->> 'recipient_role', ''))) = public.live_demo_participant_role(session_id)
                    )
                )
            )
        )
    );

-- Thread writes are available only through append_proposal_thread_message so
-- routing, round ordering, parent linkage, and sender identity are atomic.
CREATE POLICY communications_live_demo_insert
    ON public.communications FOR INSERT
    WITH CHECK (
        public.live_demo_can_write_session_surface(session_id, ARRAY['scribe']::TEXT[])
        AND LOWER(BTRIM(type)) = 'direct'
        AND LOWER(BTRIM(to_role)) = 'white_cell'
        AND LOWER(BTRIM(from_role)) = public.live_demo_participant_role(session_id)
        AND LOWER(BTRIM(COALESCE(metadata ->> 'source_team', ''))) = public.live_demo_participant_team(session_id)
        AND NULLIF(BTRIM(content), '') IS NOT NULL
    );

REVOKE ALL ON FUNCTION public.operator_review_proposal(UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_review_proposal(UUID, TEXT, TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.operator_review_proposal(UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.append_proposal_thread_message(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_proposal_thread_message(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.append_proposal_thread_message(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.operator_review_proposal(UUID, TEXT, TEXT, TEXT, INTEGER) IS
    'Independently and idempotently approves one intended proposal recipient without minting an outcome.';
COMMENT ON FUNCTION public.append_proposal_thread_message(UUID, TEXT, TEXT, TEXT, TEXT) IS
    'Appends one immutable, recipient-isolated proposal thread round and rejects stale, cross-team, and cross-session writes.';

COMMIT;
