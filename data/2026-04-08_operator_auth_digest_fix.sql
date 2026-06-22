-- ESG Simulation Platform
-- Operator auth digest resolution fix
--
-- Purpose:
-- 1) Ensure the live demo operator-code validation helper can resolve pgcrypto.digest().
-- 2) Preserve the existing SHA-256 operator code contract.
--
-- Why this is needed:
-- Supabase commonly installs pgcrypto in the `extensions` schema. The hardened
-- operator validation helper was calling digest() without `extensions` on its
-- search_path, which causes:
--   function digest(text, unknown) does not exist

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.live_demo_validate_operator_code(requested_code TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = public, extensions
AS $$
    SELECT
        requested_code IS NOT NULL
        AND public.live_demo_operator_code_hash() IS NOT NULL
        AND encode(digest(BTRIM(requested_code), 'sha256'), 'hex') = public.live_demo_operator_code_hash()
$$;

COMMIT;
