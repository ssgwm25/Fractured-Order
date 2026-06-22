-- ESG Simulation Platform
-- Operator code runtime-config table
--
-- Purpose:
-- 1) Replace the unsupported custom database-setting dependency used for live operator auth.
-- 2) Store the SHA-256 operator code hash in a protected table that hosted Supabase projects can manage.
-- 3) Preserve existing deployments by seeding the table from the legacy app.settings value when present.

BEGIN;

CREATE TABLE IF NOT EXISTS public.live_demo_runtime_config (
    config_key TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.live_demo_runtime_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.live_demo_runtime_config FROM PUBLIC;
REVOKE ALL ON public.live_demo_runtime_config FROM anon;
REVOKE ALL ON public.live_demo_runtime_config FROM authenticated;

COMMENT ON TABLE public.live_demo_runtime_config IS 'Protected live-demo runtime configuration for operator-only secrets and switches.';
COMMENT ON COLUMN public.live_demo_runtime_config.config_key IS 'Stable runtime config identifier.';
COMMENT ON COLUMN public.live_demo_runtime_config.config_value IS 'Protected runtime config value. Operator access codes are stored as SHA-256 hashes only.';

INSERT INTO public.live_demo_runtime_config (config_key, config_value)
SELECT
    'operator_code_sha256',
    legacy_hash
FROM (
    SELECT NULLIF(current_setting('app.settings.live_demo_operator_code_sha256', true), '') AS legacy_hash
) legacy_setting
WHERE legacy_hash IS NOT NULL
ON CONFLICT (config_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.live_demo_operator_code_hash()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NULLIF(BTRIM(config_value), '')
    FROM public.live_demo_runtime_config
    WHERE config_key = 'operator_code_sha256'
    LIMIT 1
$$;

COMMIT;
