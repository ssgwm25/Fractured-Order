-- Participant role resolver normalization patch
--
-- Purpose:
-- 1) Normalize stored participant seat roles before RLS derives surface/team.
-- 2) Let existing active seats with casing or hidden characters keep their
--    same-team write permissions without broadening the write policy.
-- 3) Backfill missing game_state rows for sessions created before the protected
--    session RPC provisioned state atomically.
--
-- Apply this to already-provisioned Supabase projects after the live-demo RLS
-- hardening migrations and the Industry team role contract. Safe to reapply.

BEGIN;

CREATE OR REPLACE FUNCTION public.live_demo_normalize_role(requested_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    sanitized_role TEXT := regexp_replace(
        LOWER(COALESCE(requested_role, '')),
        '[^a-z_]+',
        '',
        'g'
    );
BEGIN
    IF sanitized_role = '' THEN
        RETURN NULL;
    END IF;

    IF sanitized_role = 'white' THEN
        RETURN 'whitecell_lead';
    END IF;

    IF sanitized_role ~ '^((blue|red|green|industry)_)?whitecell(_lead)?$' THEN
        RETURN 'whitecell_lead';
    END IF;

    IF sanitized_role ~ '^((blue|red|green|industry)_)?whitecell_support$' THEN
        RETURN 'whitecell_support';
    END IF;

    RETURN sanitized_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_demo_participant_role(requested_session_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role TEXT;
BEGIN
    IF auth.uid() IS NULL OR requested_session_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT public.live_demo_normalize_role(COALESCE(sp.role, p.role))
    INTO resolved_role
    FROM public.session_participants sp
    INNER JOIN public.participants p
        ON p.id = sp.participant_id
    WHERE sp.session_id = requested_session_id
      AND sp.is_active = true
      AND p.auth_user_id = auth.uid()
    ORDER BY sp.joined_at DESC, sp.id DESC
    LIMIT 1;

    RETURN resolved_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_demo_participant_surface(requested_session_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role TEXT := public.live_demo_participant_role(requested_session_id);
BEGIN
    IF resolved_role = 'viewer' THEN
        RETURN 'viewer';
    END IF;

    IF resolved_role ~ '^(blue|red|green|industry)_facilitator$' THEN
        RETURN 'facilitator';
    END IF;

    IF resolved_role ~ '^(blue|red|green|industry)_scribe$' THEN
        RETURN 'scribe';
    END IF;

    IF resolved_role ~ '^(blue|red|green|industry)_notetaker$' THEN
        RETURN 'notetaker';
    END IF;

    IF resolved_role ~ '^whitecell(_lead|_support)?$' THEN
        RETURN 'whitecell';
    END IF;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_demo_participant_team(requested_session_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role TEXT := public.live_demo_participant_role(requested_session_id);
BEGIN
    IF resolved_role ~ '^(blue|red|green|industry)_' THEN
        RETURN split_part(resolved_role, '_', 1);
    END IF;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_session_role_seat_limit(requested_role TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN normalized_role ~ '^(blue|red|green|industry)_facilitator$' THEN 1
        WHEN normalized_role ~ '^(blue|red|green|industry)_scribe$' THEN 1
        WHEN normalized_role ~ '^(blue|red|green|industry)_notetaker$' THEN 2
        WHEN normalized_role = 'whitecell_lead' THEN 1
        WHEN normalized_role = 'whitecell_support' THEN 1
        ELSE NULL
    END
    FROM (
        SELECT public.live_demo_normalize_role(requested_role) AS normalized_role
    ) normalized_input
$$;

WITH allowed_roles(role) AS (
    VALUES
        ('blue_facilitator'),
        ('blue_scribe'),
        ('blue_notetaker'),
        ('red_facilitator'),
        ('red_scribe'),
        ('red_notetaker'),
        ('green_facilitator'),
        ('green_scribe'),
        ('green_notetaker'),
        ('industry_facilitator'),
        ('industry_scribe'),
        ('industry_notetaker'),
        ('whitecell_lead'),
        ('whitecell_support'),
        ('viewer')
),
normalized_participants AS (
    SELECT
        p.id,
        public.live_demo_normalize_role(p.role) AS normalized_role
    FROM public.participants p
)
UPDATE public.participants p
SET
    role = normalized_participants.normalized_role,
    updated_at = NOW()
FROM normalized_participants
INNER JOIN allowed_roles
    ON allowed_roles.role = normalized_participants.normalized_role
WHERE p.id = normalized_participants.id
  AND p.role IS DISTINCT FROM normalized_participants.normalized_role;

WITH allowed_roles(role) AS (
    VALUES
        ('blue_facilitator'),
        ('blue_scribe'),
        ('blue_notetaker'),
        ('red_facilitator'),
        ('red_scribe'),
        ('red_notetaker'),
        ('green_facilitator'),
        ('green_scribe'),
        ('green_notetaker'),
        ('industry_facilitator'),
        ('industry_scribe'),
        ('industry_notetaker'),
        ('whitecell_lead'),
        ('whitecell_support'),
        ('viewer')
),
normalized_seats AS (
    SELECT
        sp.id,
        public.live_demo_normalize_role(sp.role) AS normalized_role
    FROM public.session_participants sp
)
UPDATE public.session_participants sp
SET
    role = normalized_seats.normalized_role
FROM normalized_seats
INNER JOIN allowed_roles
    ON allowed_roles.role = normalized_seats.normalized_role
WHERE sp.id = normalized_seats.id
  AND sp.role IS DISTINCT FROM normalized_seats.normalized_role;

INSERT INTO public.game_state (
    session_id,
    move,
    phase,
    timer_seconds,
    timer_running,
    timer_last_update
)
SELECT
    s.id,
    1,
    1,
    5400,
    false,
    NULL
FROM public.sessions s
LEFT JOIN public.game_state gs
    ON gs.session_id = s.id
WHERE gs.session_id IS NULL
ON CONFLICT (session_id) DO NOTHING;

REVOKE ALL ON FUNCTION public.live_demo_normalize_role(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_participant_role(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_participant_surface(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_participant_team(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_role_seat_limit(TEXT) FROM PUBLIC;

COMMENT ON FUNCTION public.live_demo_normalize_role(TEXT) IS 'Canonicalizes live-demo participant role strings before RLS derives participant surface and team.';

COMMIT;
