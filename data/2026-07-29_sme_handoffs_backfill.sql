-- Backfill TSJ + Verba SME handoffs for Blue actions already marked complete
-- before ensureSmeHandoffs was wired (or for any missed rows).
-- Idempotent: INSERT … ON CONFLICT DO NOTHING on (action_id, seat).

BEGIN;

INSERT INTO public.sme_handoffs (session_id, action_id, seat, status)
SELECT
    a.session_id,
    a.id AS action_id,
    seats.seat,
    'pending'::text AS status
FROM public.actions a
CROSS JOIN (VALUES ('tsj'), ('verba')) AS seats(seat)
WHERE coalesce(a.is_deleted, false) = false
  AND lower(coalesce(a.team, '')) = 'blue'
  AND a.status = 'adjudicated'
  AND lower(coalesce(a.mechanism, '')) <> 'strategic orientation'
  AND coalesce(a.artifact_type, '') NOT IN (
      'strategic_orientation_selection',
      'strategic_orientation_forecast'
  )
ON CONFLICT (action_id, seat) DO NOTHING;

COMMIT;
