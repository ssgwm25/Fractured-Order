-- Fractured Order
-- White Cell plugin state patch
--
-- Purpose:
-- 1) Persist registered plugin enablement on game_state.
-- 2) Keep plugin enablement changes behind the protected White Cell game-state RPC.
-- 3) Preserve the existing move, phase, timer, and timer allocation update contract
--    for callers that do not send requested_plugin_state.

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_game_state_plugin_state(requested_state JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN requested_state IS NULL OR jsonb_typeof(requested_state) <> 'object'
            THEN '{}'::jsonb
        ELSE requested_state
    END
$$;

ALTER TABLE public.game_state
    ADD COLUMN IF NOT EXISTS plugin_state JSONB;

UPDATE public.game_state
SET plugin_state = public.normalize_game_state_plugin_state(plugin_state)
WHERE plugin_state IS NULL
   OR jsonb_typeof(plugin_state) <> 'object';

ALTER TABLE public.game_state
    ALTER COLUMN plugin_state SET DEFAULT '{}'::jsonb,
    ALTER COLUMN plugin_state SET NOT NULL;

DROP FUNCTION IF EXISTS public.operator_update_game_state(
    UUID,
    INTEGER,
    INTEGER,
    INTEGER,
    BOOLEAN,
    TIMESTAMPTZ
);

DROP FUNCTION IF EXISTS public.operator_update_game_state(
    UUID,
    INTEGER,
    INTEGER,
    INTEGER,
    BOOLEAN,
    TIMESTAMPTZ,
    JSONB
);

CREATE OR REPLACE FUNCTION public.operator_update_game_state(
    requested_session_id UUID,
    requested_move INTEGER DEFAULT NULL,
    requested_phase INTEGER DEFAULT NULL,
    requested_timer_seconds INTEGER DEFAULT NULL,
    requested_timer_running BOOLEAN DEFAULT NULL,
    requested_timer_last_update TIMESTAMPTZ DEFAULT NULL,
    requested_timer_allocations JSONB DEFAULT NULL,
    requested_plugin_state JSONB DEFAULT NULL
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
        plugin_state = CASE
            WHEN requested_plugin_state IS NULL THEN public.normalize_game_state_plugin_state(gs.plugin_state)
            ELSE public.normalize_game_state_plugin_state(requested_plugin_state)
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

REVOKE ALL ON FUNCTION public.operator_update_game_state(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_update_game_state(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ, JSONB, JSONB) TO authenticated;

COMMENT ON FUNCTION public.normalize_game_state_plugin_state(JSONB) IS 'Normalizes White Cell plugin enablement state stored on game_state.';
COMMENT ON FUNCTION public.operator_update_game_state(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ, JSONB, JSONB) IS 'Protected White Cell RPC for move, phase, timer control, per-state timer allocations, and registered plugin enablement.';
COMMENT ON COLUMN public.game_state.plugin_state IS 'White Cell-managed registered plugin enablement map for the active session.';

COMMIT;
