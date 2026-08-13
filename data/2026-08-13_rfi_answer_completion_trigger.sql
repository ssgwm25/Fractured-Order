-- Close the returned-RFI answer loop without weakening completed-artifact
-- immutability.
-- Apply after data/2026-08-12_session_archive_transition.sql.
--
-- operator_answer_request() completes the request before it inserts the
-- linked rfi_response communication. The legacy communication trigger then
-- attempted a second UPDATE of that completed request. The request workflow
-- guard correctly rejected the second write and rolled back the whole answer.
-- Keep the legacy communication path for genuinely pending rows, but make it
-- a no-op once the authoritative request row is terminal.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_request_response_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $request_response$
BEGIN
    IF NEW.linked_request_id IS NOT NULL
       AND NEW.type IN ('rfi_response', 'RFI_RESPONSE') THEN
        UPDATE public.requests
        SET response = COALESCE(response, NEW.content),
            status = CASE WHEN status = 'withdrawn' THEN status ELSE 'answered' END,
            responded_at = COALESCE(responded_at, NEW.created_at),
            answered_at = COALESCE(answered_at, NEW.created_at),
            response_time_seconds = GREATEST(
                EXTRACT(EPOCH FROM (COALESCE(responded_at, NEW.created_at) - created_at))::INTEGER,
                0
            )
        WHERE id = NEW.linked_request_id
          AND status NOT IN ('answered', 'withdrawn')
          AND COALESCE(workflow_state, 'submitted_to_white_cell') <> 'completed';
    END IF;

    RETURN NEW;
END;
$request_response$;

COMMENT ON FUNCTION public.update_request_response_time() IS
    'Legacy linked-RFI response synchronizer. Terminal requests are skipped so operator_answer_request remains the single completion write.';

COMMIT;
