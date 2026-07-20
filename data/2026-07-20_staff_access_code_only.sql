-- SME / White Cell: allow authorize_demo_operator without a session_id.
-- After the shared operator access code validates, bind to the newest active session.
-- Explicit requested_session_id still wins when provided (tests / multi-session).

CREATE OR REPLACE FUNCTION public.authorize_demo_operator(
    requested_surface TEXT,
    requested_operator_code TEXT,
    requested_session_id UUID DEFAULT NULL,
    requested_team_id TEXT DEFAULT NULL,
    requested_role TEXT DEFAULT NULL,
    requested_operator_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    normalized_surface TEXT := LOWER(BTRIM(requested_surface));
    normalized_team TEXT := LOWER(NULLIF(BTRIM(requested_team_id), ''));
    sanitized_role TEXT := regexp_replace(
        LOWER(COALESCE(requested_role, '')),
        '[^a-z_]+',
        '',
        'g'
    );
    normalized_role TEXT := CASE
        WHEN sanitized_role ~ '^(?:(blue|red|green|industry)_)?whitecell(?:_lead)?$' THEN 'whitecell_lead'
        WHEN sanitized_role ~ '^(?:(blue|red|green|industry)_)?whitecell_support$' THEN 'whitecell_support'
        WHEN sanitized_role IN (
            'sme_econ',
            'sme_ni_escalation',
            'sme_diplomacy_information',
            'sme_tsj',
            'sme_verba'
        ) THEN sanitized_role
        ELSE NULLIF(sanitized_role, '')
    END;
    normalized_name TEXT := NULLIF(BTRIM(requested_operator_name), '');
    resolved_session_id UUID := requested_session_id;
    session_row public.sessions%ROWTYPE;
    grant_row public.operator_grants%ROWTYPE;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Browser identity is required before operator authorization.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.live_demo_validate_operator_code(requested_operator_code) THEN
        RAISE EXCEPTION 'Invalid operator access code.'
            USING ERRCODE = '42501';
    END IF;

    IF normalized_surface NOT IN ('gamemaster', 'whitecell', 'sme') THEN
        RAISE EXCEPTION 'Unsupported operator surface.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_surface = 'gamemaster' THEN
        normalized_team := NULL;
        normalized_role := 'white';
        resolved_session_id := NULL;
    ELSIF normalized_surface = 'whitecell' THEN
        IF normalized_role NOT IN ('whitecell_lead', 'whitecell_support') THEN
            RAISE EXCEPTION 'White Cell authorization requires a supported operator role.'
                USING ERRCODE = '22023';
        END IF;

        normalized_team := NULL;

        IF resolved_session_id IS NULL THEN
            SELECT s.*
            INTO session_row
            FROM public.sessions s
            WHERE s.status = 'active'
            ORDER BY s.created_at DESC NULLS LAST, s.id DESC
            LIMIT 1;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'No active session is available. Ask Game Master to open a session first.'
                    USING ERRCODE = 'P0001';
            END IF;

            resolved_session_id := session_row.id;
        ELSE
            SELECT s.*
            INTO session_row
            FROM public.sessions s
            WHERE s.id = resolved_session_id
              AND s.status = 'active';

            IF NOT FOUND THEN
                RAISE EXCEPTION 'This session is not currently joinable.'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
    ELSE
        -- SME surface
        IF normalized_role NOT IN (
            'sme_econ',
            'sme_ni_escalation',
            'sme_diplomacy_information',
            'sme_tsj',
            'sme_verba'
        ) THEN
            RAISE EXCEPTION 'SME authorization requires a supported SME role.'
                USING ERRCODE = '22023';
        END IF;

        normalized_team := NULL;

        IF resolved_session_id IS NULL THEN
            SELECT s.*
            INTO session_row
            FROM public.sessions s
            WHERE s.status = 'active'
            ORDER BY s.created_at DESC NULLS LAST, s.id DESC
            LIMIT 1;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'No active session is available. Ask Game Master to open a session first.'
                    USING ERRCODE = 'P0001';
            END IF;

            resolved_session_id := session_row.id;
        ELSE
            SELECT s.*
            INTO session_row
            FROM public.sessions s
            WHERE s.id = resolved_session_id
              AND s.status = 'active';

            IF NOT FOUND THEN
                RAISE EXCEPTION 'This session is not currently joinable.'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
    END IF;

    DELETE FROM public.operator_grants og
    WHERE og.auth_user_id = current_user_id
      AND og.surface = normalized_surface;

    INSERT INTO public.operator_grants (
        auth_user_id,
        surface,
        session_id,
        team_id,
        role,
        operator_name,
        granted_at,
        updated_at
    )
    VALUES (
        current_user_id,
        normalized_surface,
        resolved_session_id,
        normalized_team,
        normalized_role,
        normalized_name,
        NOW(),
        NOW()
    )
    RETURNING *
    INTO grant_row;

    RETURN jsonb_build_object(
        'id', grant_row.id,
        'surface', grant_row.surface,
        'session_id', grant_row.session_id,
        'team_id', grant_row.team_id,
        'role', grant_row.role,
        'operator_name', grant_row.operator_name,
        'granted_at', grant_row.granted_at,
        'session_code', CASE
            WHEN resolved_session_id IS NULL THEN NULL
            ELSE session_row.session_code
        END,
        'session_name', CASE
            WHEN resolved_session_id IS NULL THEN NULL
            ELSE session_row.name
        END
    );
END;
$$;

COMMENT ON FUNCTION public.authorize_demo_operator(TEXT, TEXT, UUID, TEXT, TEXT, TEXT) IS
    'Validates operator access server-side. SME/White Cell may omit session_id and bind to the newest active session.';
