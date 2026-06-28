-- Intercom announcement storage patch
--
-- Creates the private Supabase Storage bucket used when recorded voice clips are
-- too large for the conservative Realtime inline payload threshold.

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'intercom-announcements',
    'intercom-announcements',
    false,
    10485760,
    ARRAY[
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4'
    ]
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.intercom_storage_session_id(object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    session_id_text TEXT := split_part(COALESCE(object_name, ''), '/', 1);
BEGIN
    IF session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN NULL;
    END IF;

    RETURN session_id_text::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS intercom_announcements_session_read ON storage.objects;
CREATE POLICY intercom_announcements_session_read
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'intercom-announcements'
        AND public.intercom_storage_session_id(name) IS NOT NULL
        AND public.live_demo_can_read_session(public.intercom_storage_session_id(name))
    );

DROP POLICY IF EXISTS intercom_announcements_whitecell_insert ON storage.objects;
DROP POLICY IF EXISTS intercom_announcements_operator_insert ON storage.objects;
CREATE POLICY intercom_announcements_operator_insert
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'intercom-announcements'
        AND public.intercom_storage_session_id(name) IS NOT NULL
        AND (
            public.live_demo_has_operator_grant('gamemaster')
            OR (
                public.live_demo_participant_surface(public.intercom_storage_session_id(name)) = 'whitecell'
                AND public.live_demo_has_operator_grant(
                    'whitecell',
                    public.intercom_storage_session_id(name),
                    NULL,
                    public.live_demo_participant_role(public.intercom_storage_session_id(name))
                )
            )
        )
    );

COMMENT ON FUNCTION public.intercom_storage_session_id(TEXT) IS 'Extracts the session UUID prefix from an Intercom Storage object path.';
GRANT EXECUTE ON FUNCTION public.intercom_storage_session_id(TEXT) TO authenticated;
