-- Forward repair: merge the submitting action's title into the
-- ACTION_NOTIFICATION action_snapshot so Green and Industry recipients can
-- render the same team-labeled, informational notification card as the
-- Red Team share path. No table, trigger, or policy changes.

BEGIN;

CREATE OR REPLACE FUNCTION public.operator_complete_action_with_notifications(
    requested_action_id UUID,
    requested_team TEXT,
    requested_expected_revision BIGINT,
    requested_reviewer_notes TEXT,
    requested_notification_teams TEXT[],
    requested_notification_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $complete_with_notifications$
DECLARE
    normalized_team TEXT := LOWER(NULLIF(BTRIM(requested_team), ''));
    normalized_notes TEXT := NULLIF(BTRIM(COALESCE(requested_reviewer_notes, '')), '');
    normalized_content TEXT := NULLIF(BTRIM(COALESCE(requested_notification_content, '')), '');
    normalized_notification_teams TEXT[] := ARRAY[]::TEXT[];
    authored_notification_teams TEXT[] := ARRAY[]::TEXT[];
    authored_notification_note TEXT;
    action_row public.actions%ROWTYPE;
    communication_row public.communications%ROWTYPE;
    review_result JSONB;
    communications_result JSONB := '[]'::jsonb;
    notification_team TEXT;
BEGIN
    SELECT *
    INTO action_row
    FROM public.actions a
    WHERE a.id = requested_action_id
      AND COALESCE(a.is_deleted, false) = false
    FOR UPDATE;

    IF action_row.id IS NULL THEN
        RAISE EXCEPTION 'Action not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF normalized_team NOT IN ('blue', 'red')
       OR LOWER(BTRIM(action_row.team)) <> normalized_team
       OR action_row.artifact_type NOT IN ('action', 'move_response') THEN
        RAISE EXCEPTION 'Notification delivery is limited to the submitting Blue or Red action.'
            USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(ARRAY_AGG(candidate.team ORDER BY candidate.team), ARRAY[]::TEXT[])
    INTO normalized_notification_teams
    FROM (
        SELECT DISTINCT LOWER(BTRIM(value)) AS team
        FROM UNNEST(COALESCE(requested_notification_teams, ARRAY[]::TEXT[])) AS selected(value)
        WHERE NULLIF(BTRIM(value), '') IS NOT NULL
    ) AS candidate;

    IF EXISTS (
        SELECT 1
        FROM UNNEST(normalized_notification_teams) AS selected(team)
        WHERE selected.team NOT IN ('green', 'industry')
    ) THEN
        RAISE EXCEPTION 'Action notifications are limited to Green and Industry.'
            USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(ARRAY_AGG(candidate.team ORDER BY candidate.team), ARRAY[]::TEXT[])
    INTO authored_notification_teams
    FROM (
        SELECT DISTINCT LOWER(BTRIM(value)) AS team
        FROM JSONB_ARRAY_ELEMENTS_TEXT(
            CASE
                WHEN JSONB_TYPEOF(action_row.artifact_payload -> 'action' -> 'notificationTeams') = 'array'
                    THEN action_row.artifact_payload -> 'action' -> 'notificationTeams'
                WHEN public.action_legacy_detail(action_row.ally_contingencies, 'Notification Teams') ~ '^[[:space:]]*\['
                    THEN public.action_legacy_detail(action_row.ally_contingencies, 'Notification Teams')::jsonb
                WHEN NULLIF(BTRIM(public.action_legacy_detail(
                    action_row.ally_contingencies,
                    'Notification Teams'
                )), '') IS NOT NULL
                    THEN jsonb_build_array(public.action_legacy_detail(
                        action_row.ally_contingencies,
                        'Notification Teams'
                    ))
                ELSE '[]'::jsonb
            END
        ) AS authored(value)
        WHERE LOWER(BTRIM(value)) IN ('green', 'industry')
    ) AS candidate;

    IF EXISTS (
        SELECT 1
        FROM UNNEST(normalized_notification_teams) AS selected(team)
        WHERE NOT (selected.team = ANY(authored_notification_teams))
    ) THEN
        RAISE EXCEPTION 'White Cell may only inform teams requested in the submitted action.'
            USING ERRCODE = '42501';
    END IF;

    IF CARDINALITY(normalized_notification_teams) > 0 AND normalized_content IS NULL THEN
        RAISE EXCEPTION 'Notification content is required when informing a requested team.'
            USING ERRCODE = '22023';
    END IF;

    authored_notification_note := NULLIF(BTRIM(COALESCE(
        action_row.artifact_payload -> 'action' ->> 'notificationNote',
        public.action_legacy_detail(action_row.ally_contingencies, 'Notification Note'),
        ''
    )), '');

    review_result := public.operator_review_artifact(
        'action',
        action_row.id,
        'complete',
        normalized_team,
        requested_expected_revision,
        normalized_notes
    );

    FOREACH notification_team IN ARRAY normalized_notification_teams LOOP
        communication_row := public.operator_send_communication(
            action_row.session_id,
            notification_team,
            'ACTION_NOTIFICATION',
            normalized_content,
            INITCAP(normalized_team) || ' Team Action Notification',
            NULL,
            jsonb_strip_nulls(jsonb_build_object(
                'recipient', notification_team,
                'recipient_scope', 'team',
                'recipient_team', notification_team,
                'recipient_role', NULL,
                'shared_action_id', action_row.id,
                'source_team', normalized_team,
                'action_revision', requested_expected_revision,
                'notification_delivery', 'approved',
                'notification_request_note', authored_notification_note,
                'action_snapshot', COALESCE(action_row.artifact_payload -> 'action', '{}'::jsonb)
                    || jsonb_build_object(
                        'title',
                        COALESCE(NULLIF(BTRIM(action_row.goal), ''), 'Untitled action')
                    )
            ))
        );

        communications_result := communications_result || jsonb_build_array(to_jsonb(communication_row));
    END LOOP;

    RETURN review_result || jsonb_build_object(
        'communications', communications_result,
        'notification_teams', to_jsonb(normalized_notification_teams)
    );
END;
$complete_with_notifications$;

REVOKE ALL ON FUNCTION public.operator_complete_action_with_notifications(
    UUID, TEXT, BIGINT, TEXT, TEXT[], TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_complete_action_with_notifications(
    UUID, TEXT, BIGINT, TEXT, TEXT[], TEXT
) FROM anon;
GRANT EXECUTE ON FUNCTION public.operator_complete_action_with_notifications(
    UUID, TEXT, BIGINT, TEXT, TEXT[], TEXT
) TO authenticated;

COMMENT ON FUNCTION public.operator_complete_action_with_notifications(
    UUID, TEXT, BIGINT, TEXT, TEXT[], TEXT
) IS
    'Atomically completes one submitted Blue/Red action and sends White Cell-approved Green/Industry notifications requested by that action, including the action title in the snapshot.';

COMMIT;
