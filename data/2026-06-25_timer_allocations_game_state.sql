-- Fractured Order
-- White Cell timer allocation patch
--
-- Purpose:
-- 1) Persist per-game-state timer allocations on game_state.
-- 2) Keep allocation updates behind the protected White Cell game-state RPC.
-- 3) Preserve the existing move, phase, and timer update contract for callers
--    that do not send requested_timer_allocations.

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_game_state_timer_allocations(requested_allocations JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
    WITH input AS (
        SELECT COALESCE(requested_allocations, '{}'::jsonb) AS payload
    ),
    raw_values AS (
        SELECT
            CASE
                WHEN payload->>'strategic_orientation' ~ '^[0-9]+(\.[0-9]+)?$'
                    THEN ROUND((payload->>'strategic_orientation')::NUMERIC)::INTEGER
                ELSE 5400
            END AS strategic_orientation,
            CASE
                WHEN payload->>'move_1' ~ '^[0-9]+(\.[0-9]+)?$'
                    THEN ROUND((payload->>'move_1')::NUMERIC)::INTEGER
                ELSE 5400
            END AS move_1,
            CASE
                WHEN payload->>'move_2' ~ '^[0-9]+(\.[0-9]+)?$'
                    THEN ROUND((payload->>'move_2')::NUMERIC)::INTEGER
                ELSE 5400
            END AS move_2,
            CASE
                WHEN payload->>'move_3' ~ '^[0-9]+(\.[0-9]+)?$'
                    THEN ROUND((payload->>'move_3')::NUMERIC)::INTEGER
                ELSE 5400
            END AS move_3
        FROM input
    )
    SELECT jsonb_build_object(
        'strategic_orientation', LEAST(36000, GREATEST(60, strategic_orientation)),
        'move_1', LEAST(36000, GREATEST(60, move_1)),
        'move_2', LEAST(36000, GREATEST(60, move_2)),
        'move_3', LEAST(36000, GREATEST(60, move_3))
    )
    FROM raw_values
$$;

ALTER TABLE public.game_state
    ADD COLUMN IF NOT EXISTS timer_allocations JSONB;

UPDATE public.game_state
SET timer_allocations = public.normalize_game_state_timer_allocations(timer_allocations)
WHERE timer_allocations IS NULL
   OR timer_allocations IS DISTINCT FROM public.normalize_game_state_timer_allocations(timer_allocations);

ALTER TABLE public.game_state
    ALTER COLUMN timer_allocations SET DEFAULT '{"strategic_orientation":5400,"move_1":5400,"move_2":5400,"move_3":5400}'::jsonb,
    ALTER COLUMN timer_allocations SET NOT NULL;

DROP FUNCTION IF EXISTS public.operator_update_game_state(
    UUID,
    INTEGER,
    INTEGER,
    INTEGER,
    BOOLEAN,
    TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.operator_update_game_state(
    requested_session_id UUID,
    requested_move INTEGER DEFAULT NULL,
    requested_phase INTEGER DEFAULT NULL,
    requested_timer_seconds INTEGER DEFAULT NULL,
    requested_timer_running BOOLEAN DEFAULT NULL,
    requested_timer_last_update TIMESTAMPTZ DEFAULT NULL,
    requested_timer_allocations JSONB DEFAULT NULL
)
RETURNS public.game_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    participant_role TEXT := public.live_demo_participant_role(requested_session_id);
    participant_team TEXT := public.live_demo_participant_team(requested_session_id);
    existing_state public.game_state%ROWTYPE;
    updated_state public.game_state%ROWTYPE;
BEGIN
    IF requested_session_id IS NULL THEN
        RAISE EXCEPTION 'Session ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF auth.uid() IS NULL
       OR participant_role IS NULL
       OR public.live_demo_participant_surface(requested_session_id) <> 'whitecell'
       OR NOT public.live_demo_has_operator_grant('whitecell', requested_session_id, participant_team, participant_role) THEN
        RAISE EXCEPTION 'White Cell operator authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
    INTO existing_state
    FROM public.game_state gs
    WHERE gs.session_id = requested_session_id
    FOR UPDATE;

    IF existing_state.id IS NULL THEN
        RAISE EXCEPTION 'Game state not found for this session.'
            USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.game_state gs
    SET
        move = COALESCE(requested_move, gs.move),
        phase = COALESCE(requested_phase, gs.phase),
        timer_seconds = COALESCE(requested_timer_seconds, gs.timer_seconds),
        timer_allocations = CASE
            WHEN requested_timer_allocations IS NULL THEN public.normalize_game_state_timer_allocations(gs.timer_allocations)
            ELSE public.normalize_game_state_timer_allocations(requested_timer_allocations)
        END,
        timer_running = COALESCE(requested_timer_running, gs.timer_running),
        timer_last_update = COALESCE(requested_timer_last_update, gs.timer_last_update),
        last_updated = NOW()
    WHERE gs.session_id = requested_session_id
    RETURNING *
    INTO updated_state;

    IF existing_state.move IS DISTINCT FROM updated_state.move THEN
        INSERT INTO public.game_state_transitions (
            session_id,
            transition_type,
            from_value,
            to_value,
            initiated_by_client_id,
            initiated_by_role,
            transition_reason,
            metadata
        )
        VALUES (
            requested_session_id,
            'move',
            existing_state.move,
            updated_state.move,
            auth.uid()::TEXT,
            participant_role,
            'operator_rpc',
            jsonb_build_object('surface', 'whitecell')
        );
    END IF;

    IF existing_state.phase IS DISTINCT FROM updated_state.phase THEN
        INSERT INTO public.game_state_transitions (
            session_id,
            transition_type,
            from_value,
            to_value,
            initiated_by_client_id,
            initiated_by_role,
            transition_reason,
            metadata
        )
        VALUES (
            requested_session_id,
            'phase',
            existing_state.phase,
            updated_state.phase,
            auth.uid()::TEXT,
            participant_role,
            'operator_rpc',
            jsonb_build_object('surface', 'whitecell')
        );
    END IF;

    RETURN updated_state;
END;
$$;

REVOKE ALL ON FUNCTION public.operator_update_game_state(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_update_game_state(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ, JSONB) TO authenticated;

COMMENT ON FUNCTION public.operator_update_game_state(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ, JSONB) IS 'Protected White Cell RPC for move, phase, timer control, and per-state timer allocations.';
COMMENT ON COLUMN public.game_state.timer_allocations IS 'White Cell-managed timer allocation map, in seconds, for strategic_orientation and move_1 through move_3.';

COMMIT;
