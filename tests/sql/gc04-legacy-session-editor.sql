-- Paste the whole file into Supabase SQL Editor as postgres after September 23.
-- Inspect the reported PLENUM2026 session without modifying it or claiming a seat.
-- A synthetic JWT claim exercises the lookup identity check, not live Auth issuance.
BEGIN READ ONLY;
SELECT set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('request.jwt.claim.sub'), 'role', 'authenticated')::text, true);

WITH lookup AS (
    SELECT public.lookup_joinable_session_by_code('PLENUM2026') AS response
)
SELECT
    CASE WHEN (lookup.response->>'session_topology_version')::integer
        = COALESCE(s.session_topology_version, 1) THEN 'PASS' ELSE 'FAIL' END AS status,
    s.id AS session_id,
    s.session_topology_version AS stored_topology,
    (lookup.response->>'session_topology_version')::integer AS returned_topology,
    s.status AS session_status
FROM lookup
JOIN public.sessions s ON s.id = (lookup.response->>'id')::uuid;
ROLLBACK;
