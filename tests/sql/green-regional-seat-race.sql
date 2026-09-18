-- Human-run in two independent database-owner psql connections. This script
-- COMMITS synthetic claims in an already approved, disposable rehearsal session.
-- Required psql variables: session_id, auth_user_id, seat_role, client_id.
-- See docs/architecture/green-regional-authorization.md; never use production.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '20s';
SELECT set_config('request.jwt.claim.sub', :'auth_user_id', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', :'auth_user_id', 'role', 'authenticated')::TEXT, true);
SET LOCAL ROLE authenticated;
SELECT public.claim_session_role_seat(:'session_id'::UUID, :'seat_role', 'GC03 race fixture', :'client_id', 90);
SELECT pg_sleep(5);
COMMIT;
