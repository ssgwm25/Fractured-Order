-- ESG Simulation Platform
-- Proposal response finalization lock follow-up patch
--
-- Purpose:
-- 1) Reapply the proposal recipient final-state guard on already-provisioned projects.
-- 2) Prevent a second PROPOSAL_RESPONSE once the forwarded proposal is finalized.

BEGIN;

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
    updated_communication public.communications%ROWTYPE;
    participant_role TEXT;
    participant_team TEXT;
    participant_surface TEXT;
    normalized_status TEXT := LOWER(NULLIF(BTRIM(requested_status), ''));
    normalized_metadata JSONB := COALESCE(requested_metadata, '{}'::jsonb);
    recipient_team TEXT;
    current_status TEXT;
BEGIN
    IF requested_communication_id IS NULL THEN
        RAISE EXCEPTION 'Proposal communication ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_status IS NULL OR normalized_status NOT IN ('unread', 'acknowledged', 'responded', 'declined', 'ignored') THEN
        RAISE EXCEPTION 'Unsupported proposal recipient status.'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(normalized_metadata) <> 'object' THEN
        RAISE EXCEPTION 'Proposal recipient metadata must be a JSON object.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO communication_row
    FROM public.communications c
    WHERE c.id = requested_communication_id
    FOR UPDATE;

    IF communication_row.id IS NULL THEN
        RAISE EXCEPTION 'Proposal communication not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF communication_row.type <> 'PROPOSAL_FORWARDED' THEN
        RAISE EXCEPTION 'Only forwarded proposals can update recipient state.'
            USING ERRCODE = 'P0001';
    END IF;

    participant_role := public.live_demo_participant_role(communication_row.session_id);
    participant_team := public.live_demo_participant_team(communication_row.session_id);
    participant_surface := public.live_demo_participant_surface(communication_row.session_id);

    IF auth.uid() IS NULL
       OR participant_role IS NULL
       OR participant_surface NOT IN ('facilitator', 'scribe') THEN
        RAISE EXCEPTION 'Team-lead access is required to update proposal recipient state.'
            USING ERRCODE = '42501';
    END IF;

    recipient_team := COALESCE(
        NULLIF(BTRIM(communication_row.metadata ->> 'recipient_team'), ''),
        CASE
            WHEN communication_row.to_role IN ('blue', 'red', 'green') THEN communication_row.to_role
            WHEN communication_row.to_role ~ '^(blue|red|green)_' THEN split_part(communication_row.to_role, '_', 1)
            ELSE NULL
        END
    );

    IF recipient_team IS NULL OR participant_team <> recipient_team THEN
        RAISE EXCEPTION 'Only the addressed team can update proposal recipient state.'
            USING ERRCODE = '42501';
    END IF;

    current_status := LOWER(NULLIF(BTRIM(
        COALESCE(communication_row.metadata -> 'proposal_recipient_state' ->> 'status', '')
    ), ''));

    IF current_status IN ('responded', 'declined', 'ignored') THEN
        RAISE EXCEPTION 'This proposal recipient state is already final.'
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.communications c
    SET
        metadata = COALESCE(c.metadata, '{}'::jsonb) || jsonb_build_object(
            'proposal_recipient_state',
            COALESCE(c.metadata -> 'proposal_recipient_state', '{}'::jsonb)
            || normalized_metadata
            || jsonb_build_object(
                'status', normalized_status,
                'actioned_at', NOW(),
                'participant_role', participant_role,
                'participant_team', participant_team,
                'participant_auth_user_id', auth.uid()
            )
        )
    WHERE c.id = requested_communication_id
    RETURNING *
    INTO updated_communication;

    RETURN updated_communication;
END;
$$;

DROP POLICY IF EXISTS communications_live_demo_insert ON public.communications;

CREATE POLICY communications_live_demo_insert
    ON public.communications FOR INSERT
    WITH CHECK (
        public.live_demo_can_write_session_surface(session_id, ARRAY['facilitator', 'scribe']::TEXT[])
        AND type = 'PROPOSAL_RESPONSE'
        AND LOWER(BTRIM(to_role)) = 'white_cell'
        AND LOWER(BTRIM(from_role)) = public.live_demo_participant_role(session_id)
        AND NULLIF(BTRIM(content), '') IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.communications forwarded
            WHERE forwarded.id::TEXT = NULLIF(BTRIM(communications.metadata ->> 'source_communication_id'), '')
              AND forwarded.session_id = communications.session_id
              AND forwarded.type = 'PROPOSAL_FORWARDED'
              AND COALESCE(
                  NULLIF(BTRIM(forwarded.metadata -> 'proposal_recipient_state' ->> 'status'), ''),
                  'unread'
              ) NOT IN ('responded', 'declined', 'ignored')
              AND COALESCE(
                  NULLIF(BTRIM(forwarded.metadata ->> 'recipient_team'), ''),
                  CASE
                      WHEN forwarded.to_role IN ('blue', 'red', 'green') THEN forwarded.to_role
                      WHEN forwarded.to_role ~ '^(blue|red|green)_' THEN split_part(forwarded.to_role, '_', 1)
                      ELSE NULL
                  END
              ) = public.live_demo_participant_team(communications.session_id)
        )
    );

GRANT EXECUTE ON FUNCTION public.update_proposal_recipient_status(UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.update_proposal_recipient_status(UUID, TEXT, JSONB) IS 'Protected facilitator/scribe RPC that persists proposal recipient inbox status in communication metadata.';

COMMIT;
