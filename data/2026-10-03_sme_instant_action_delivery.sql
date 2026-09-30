-- Instant SME action delivery. Apply after 2026-10-02_pli_regional_dispatch_and_realtime.sql.
--
-- White Cell accept used to leave SMEs waiting on GitHub Actions + agents
-- (minutes) before any queue row existed. TSJ/Verba handoffs also opened only
-- from the browser, and only for Blue, so a failed follow-up JS call (timeline,
-- notifications) meant no SME visibility at all.
--
-- This stage opens TSJ/Verba handoffs and a queue-visible PLI stub in the same
-- transaction as the action becoming adjudicated. Scoring still fills the stub
-- later; run_pli treats record.queue_stub as rescore-needed.
--
-- Safe to reapply: CREATE OR REPLACE + drop/create trigger + ON CONFLICT inserts.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
    IF to_regclass('public.actions') IS NULL
        OR to_regclass('public.sme_handoffs') IS NULL
        OR to_regclass('public.pli_adjudications') IS NULL THEN
        RAISE EXCEPTION 'SME_INSTANT_DELIVERY_PREREQUISITES_MISSING';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.action_is_strategic_orientation(action_row public.actions)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT COALESCE(action_row.artifact_type, '') IN (
            'strategic_orientation_selection',
            'strategic_orientation_forecast'
        )
        OR lower(btrim(COALESCE(action_row.mechanism, ''))) = 'strategic orientation';
$$;

CREATE OR REPLACE FUNCTION public.action_is_pli_queue_candidate(action_row public.actions)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT NOT public.action_is_strategic_orientation(action_row)
        AND NOT (
            COALESCE(action_row.artifact_type, '') = 'proposal'
            AND lower(btrim(COALESCE(action_row.team, ''))) = 'industry'
        );
$$;

CREATE OR REPLACE FUNCTION public.open_sme_action_delivery(requested_action_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    action_row public.actions%ROWTYPE;
    queued_at TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF requested_action_id IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO action_row
    FROM public.actions
    WHERE id = requested_action_id
      AND COALESCE(is_deleted, false) = false;

    IF action_row.id IS NULL
        OR action_row.status <> 'adjudicated'
        OR public.action_is_strategic_orientation(action_row) THEN
        RETURN;
    END IF;

    BEGIN
        INSERT INTO public.sme_handoffs (session_id, action_id, seat, status, updated_at)
        VALUES
            (action_row.session_id, action_row.id, 'tsj', 'pending', queued_at),
            (action_row.session_id, action_row.id, 'verba', 'pending', queued_at)
        ON CONFLICT (action_id, seat) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'open_sme_action_delivery handoff failed for %: %', action_row.id, SQLERRM;
    END;

    IF NOT public.action_is_pli_queue_candidate(action_row) THEN
        RETURN;
    END IF;

    BEGIN
        INSERT INTO public.pli_adjudications (
            action_id,
            session_id,
            created_at,
            updated_at,
            record,
            codebook_version,
            status,
            seat_reviews
        ) VALUES (
            action_row.id,
            action_row.session_id,
            queued_at,
            queued_at,
            jsonb_build_object(
                'queue_stub', true,
                'queued_at', queued_at,
                'action', jsonb_build_object(
                    'id', action_row.id,
                    'team', action_row.team,
                    'goal', action_row.goal,
                    'mechanism', action_row.mechanism,
                    'move', action_row.move
                ),
                'tracks', '{}'::jsonb,
                'track_statuses', '{}'::jsonb
            ),
            'queued',
            'pending',
            jsonb_build_object(
                'macro', jsonb_build_object('status', 'pending'),
                'diplomacy_information', jsonb_build_object('status', 'pending'),
                'national_interest_escalation', jsonb_build_object('status', 'pending')
            )
        )
        ON CONFLICT (action_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'open_sme_action_delivery stub failed for %: %', action_row.id, SQLERRM;
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.open_sme_action_delivery(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_sme_action_delivery(UUID) TO authenticated;

COMMENT ON FUNCTION public.open_sme_action_delivery(UUID) IS
    'Open TSJ/Verba handoffs and a queue-visible PLI stub when White Cell accepts an action. Scoring replaces the stub later.';

CREATE OR REPLACE FUNCTION public.trg_open_sme_action_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.open_sme_action_delivery(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzzz_open_sme_action_delivery ON public.actions;
CREATE TRIGGER zzzz_open_sme_action_delivery
    AFTER UPDATE OF status ON public.actions
    FOR EACH ROW
    WHEN (NEW.status = 'adjudicated' AND OLD.status IS DISTINCT FROM 'adjudicated')
    EXECUTE FUNCTION public.trg_open_sme_action_delivery();

-- Backfill active live sessions so current queues catch up immediately.
DO $$
DECLARE rec RECORD;
BEGIN
    FOR rec IN
        SELECT a.id
        FROM public.actions a
        JOIN public.sessions s ON s.id = a.session_id
        WHERE COALESCE(a.is_deleted, false) = false
          AND a.status = 'adjudicated'
          AND s.status = 'active'
          AND s.session_classification = 'live_exercise'
          AND NOT s.is_protected
    LOOP
        PERFORM public.open_sme_action_delivery(rec.id);
    END LOOP;
END $$;

COMMIT;
