-- ESG Simulation Platform
-- Secure session-code join contract
--
-- Purpose:
-- 1) Promote session_code to a first-class indexed column.
-- 2) Backfill existing rows that only stored session_code in metadata.
-- 3) Add an authenticated server-side lookup for participant joins.
-- 4) Record that public clients must not enumerate sessions in the browser.

BEGIN;

ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS session_code TEXT;

UPDATE public.sessions
SET session_code = UPPER(BTRIM(metadata->>'session_code'))
WHERE COALESCE(BTRIM(session_code), '') = ''
  AND COALESCE(BTRIM(metadata->>'session_code'), '') <> '';

UPDATE public.sessions
SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{session_code}',
    to_jsonb(session_code),
    true
)
WHERE session_code IS NOT NULL
  AND COALESCE(metadata->>'session_code', '') <> session_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_session_code_upper
    ON public.sessions (UPPER(session_code))
    WHERE session_code IS NOT NULL
      AND BTRIM(session_code) <> ''
      AND status = 'active';

COMMENT ON COLUMN public.sessions.session_code IS 'Public participant join code. Public clients must resolve it through lookup_joinable_session_by_code.';

CREATE OR REPLACE FUNCTION public.lookup_joinable_session_by_code(requested_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized_code TEXT := UPPER(BTRIM(requested_code));
    session_row RECORD;
BEGIN
    IF normalized_code IS NULL OR normalized_code = '' THEN
        RAISE EXCEPTION 'Session code is required.'
            USING ERRCODE = '22023';
    END IF;

    SELECT
        s.id,
        s.name,
        s.status,
        COALESCE(NULLIF(BTRIM(s.session_code), ''), UPPER(BTRIM(s.metadata->>'session_code'))) AS resolved_session_code
    INTO session_row
    FROM public.sessions s
    WHERE COALESCE(NULLIF(UPPER(BTRIM(s.session_code)), ''), UPPER(BTRIM(s.metadata->>'session_code'))) = normalized_code
    ORDER BY
        CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
        s.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found. Please check the code and try again.'
            USING ERRCODE = 'P0002';
    END IF;

    IF session_row.status <> 'active' THEN
        RAISE EXCEPTION 'This session is not currently joinable.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
        'id', session_row.id,
        'name', session_row.name,
        'session_code', session_row.resolved_session_code,
        'status', session_row.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_joinable_session_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_joinable_session_by_code(TEXT) TO authenticated;

COMMENT ON FUNCTION public.lookup_joinable_session_by_code(TEXT) IS 'Authenticated public join RPC. Operator note: do not reintroduce browser-side session inventory listing for code-based joins.';

COMMIT;
