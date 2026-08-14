-- Extend the existing communications type contract for the action-notification
-- rows created by operator_complete_action_with_notifications. This is a
-- forward repair for projects that already applied the delivery RPC migration.

BEGIN;

ALTER TABLE public.communications
    DROP CONSTRAINT IF EXISTS communications_type_check;

DO $$
DECLARE
    constraint_row RECORD;
BEGIN
    FOR constraint_row IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.communications'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%type IN%'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.communications DROP CONSTRAINT %I',
            constraint_row.conname
        );
    END LOOP;
END $$;

ALTER TABLE public.communications
    ADD CONSTRAINT communications_type_check
    CHECK (
        type IN (
            'INJECT',
            'ANNOUNCEMENT',
            'GUIDANCE',
            'PROPOSAL_FORWARDED',
            'PROPOSAL_RESPONSE',
            'ACTION_NOTIFICATION',
            'rfi_response',
            'RFI_RESPONSE',
            'broadcast',
            'direct',
            'system',
            'game_update',
            'message'
        )
    );

COMMENT ON CONSTRAINT communications_type_check ON public.communications IS
    'Allows the current communication workflow types, including atomic Green/Industry action notifications.';

COMMIT;
