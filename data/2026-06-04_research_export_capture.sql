-- ESG Simulation Platform
-- Research export capture contract
--
-- Purpose:
-- 1) Add the research-mode capture schema required by RESEARCH_EXPORT_SPECIFICATION.md v1.2.0.
-- 2) Store the research capture mode and software build hash in the protected runtime-config table.
-- 3) Introduce an append-only research audit spine and the research export projection tables.

BEGIN;

INSERT INTO public.live_demo_runtime_config (config_key, config_value)
VALUES ('research_capture_mode', 'research')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO public.live_demo_runtime_config (config_key, config_value)
VALUES ('software_build_hash', '')
ON CONFLICT (config_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.live_demo_research_capture_mode()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT CASE
                WHEN LOWER(NULLIF(BTRIM(config_value), '')) = 'standard' THEN 'standard'
                ELSE 'research'
            END
            FROM public.live_demo_runtime_config
            WHERE config_key = 'research_capture_mode'
            LIMIT 1
        ),
        'research'
    )
$$;

CREATE OR REPLACE FUNCTION public.live_demo_software_build_hash()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NULLIF(BTRIM(config_value), '')
    FROM public.live_demo_runtime_config
    WHERE config_key = 'software_build_hash'
    LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.live_demo_research_capture_mode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.live_demo_software_build_hash() TO authenticated;

CREATE TABLE IF NOT EXISTS public.research_audit_event_log (
    event_id bigint generated always as identity primary key,
    event_uuid uuid not null default gen_random_uuid(),
    session_id uuid not null references public.sessions (id),
    event_ts_utc timestamptz not null,
    server_received_utc timestamptz not null default clock_timestamp(),
    client_ts_utc timestamptz,
    actor_pseudonym text,
    actor_role text,
    actor_team text,
    actor_seat_index integer,
    event_type text not null,
    entity_type text not null,
    entity_id uuid,
    move_number integer,
    action_sequence integer,
    correlation_id uuid,
    causal_event_id bigint references public.research_audit_event_log (event_id),
    before_state jsonb,
    after_state jsonb,
    payload jsonb not null default '{}'::jsonb,
    phase text,
    elapsed_session_s numeric,
    elapsed_actor_prev_s numeric,
    prev_event_hash text,
    event_hash text not null,
    constraint research_audit_event_log_event_type_chk check (
        event_type in (
            'SESSION_CREATED','SESSION_CONFIG_UPDATED','SESSION_CLOSED',
            'GAME_STATE_INITIALIZED','GAME_STATE_UPDATED','MOVE_ADVANCED',
            'SEAT_CLAIMED','SEAT_RELEASED','SEAT_REASSIGNED',
            'OPERATOR_AUTHORIZED','GRANT_ISSUED','GRANT_REVOKED',
            'ACTION_DRAFT_SAVED','ACTION_SUBMITTED','ACTION_ADJUDICATED',
            'PROPOSAL_CREATED','PROPOSAL_SUBMITTED','PROPOSAL_FORWARDED',
            'PROPOSAL_CHANGES_REQUESTED','PROPOSAL_REJECTED',
            'PROPOSAL_ACKNOWLEDGED','PROPOSAL_DECLINED','PROPOSAL_IGNORED','PROPOSAL_RESPONDED',
            'MOVE_RESPONSE_SUBMITTED',
            'RFI_RAISED','RFI_ANSWERED',
            'COMMUNICATION_SENT',
            'NOTE_CREATED','NOTE_EDITED','NOTE_DELETED',
            'PARTICIPANT_DISCONNECTED','PARTICIPANT_RECONNECTED','STALE_SEAT_RELEASED','HEARTBEAT_TIMEOUT'
        )
    )
);

CREATE INDEX IF NOT EXISTS research_audit_event_log_session_ts_idx
    ON public.research_audit_event_log (session_id, event_ts_utc, event_id);
CREATE INDEX IF NOT EXISTS research_audit_event_log_correlation_idx
    ON public.research_audit_event_log (correlation_id);
CREATE INDEX IF NOT EXISTS research_audit_event_log_actor_idx
    ON public.research_audit_event_log (session_id, actor_pseudonym, event_ts_utc);

CREATE TABLE IF NOT EXISTS public.research_participant (
    participant_pseudonym text not null,
    session_id uuid not null references public.sessions (id),
    auth_uid_hash text not null,
    team text,
    role text,
    seat_index integer,
    first_seen_utc timestamptz not null,
    last_seen_utc timestamptz not null,
    active_duration_s numeric,
    rejoin_count integer not null default 0,
    primary key (participant_pseudonym, session_id, role, seat_index)
);

CREATE TABLE IF NOT EXISTS public.research_note (
    note_id uuid primary key,
    session_id uuid not null references public.sessions (id),
    author_pseudonym text not null,
    author_role text not null,
    author_team text not null,
    author_seat_index integer,
    scope text not null,
    visibility text not null,
    move_number integer,
    linked_entity_type text,
    linked_entity_id uuid,
    content_text text not null,
    content_length_chars integer not null,
    created_utc timestamptz not null,
    last_edited_utc timestamptz not null,
    edit_count integer not null default 0,
    current_version integer not null default 1,
    constraint research_note_scope_chk check (scope in ('seat_scoped','shared_capture'))
);

CREATE TABLE IF NOT EXISTS public.research_note_revision (
    note_id uuid not null references public.research_note (note_id),
    version integer not null,
    author_pseudonym text not null,
    content_text text not null,
    content_length_chars integer not null,
    edited_utc timestamptz not null,
    supersedes_version integer,
    primary key (note_id, version)
);

CREATE TABLE IF NOT EXISTS public.research_draft_revision (
    draft_id uuid primary key,
    session_id uuid not null references public.sessions (id),
    author_pseudonym text not null,
    author_role text not null,
    author_team text not null,
    author_seat_index integer,
    artifact_type text not null,
    artifact_id uuid,
    revision_number integer not null,
    revision_cycle_id uuid not null,
    status text not null,
    move_number integer,
    action_sequence integer,
    wizard_page_reached integer,
    content_snapshot jsonb not null,
    content_diff_from_prev jsonb,
    created_utc timestamptz not null,
    submitted_utc timestamptz,
    time_to_submit_s numeric,
    constraint research_draft_revision_artifact_chk check (artifact_type in ('action','proposal')),
    constraint research_draft_revision_status_chk check (
        status in ('draft_saved','submitted','abandoned','superseded','changes_requested')
    )
);

CREATE INDEX IF NOT EXISTS research_draft_revision_cycle_idx
    ON public.research_draft_revision (revision_cycle_id, revision_number);

CREATE TABLE IF NOT EXISTS public.research_state_transition (
    transition_id uuid primary key,
    session_id uuid not null references public.sessions (id),
    entity_type text not null,
    entity_id uuid not null,
    from_state text,
    to_state text not null,
    transition_utc timestamptz not null,
    actor_pseudonym text,
    actor_role text,
    actor_team text,
    recipient_team text,
    move_number integer,
    dwell_in_from_s numeric,
    triggering_event_id bigint references public.research_audit_event_log (event_id),
    constraint research_state_transition_entity_chk check (
        entity_type in ('action','proposal','rfi','move_response')
    )
);

CREATE INDEX IF NOT EXISTS research_state_transition_entity_idx
    ON public.research_state_transition (entity_type, entity_id, transition_utc);

CREATE TABLE IF NOT EXISTS public.research_action_content (
    action_id uuid primary key,
    session_id uuid not null references public.sessions (id),
    author_pseudonym text not null,
    author_role text not null,
    author_team text not null,
    move_number integer,
    action_sequence integer,
    title text,
    action_type text,
    intent_text text,
    targets jsonb,
    instruments jsonb,
    resources_committed jsonb,
    full_content jsonb not null,
    submitted_utc timestamptz,
    final_status text
);

CREATE TABLE IF NOT EXISTS public.research_proposal_content (
    proposal_id uuid primary key,
    session_id uuid not null references public.sessions (id),
    author_pseudonym text not null,
    author_role text not null,
    author_team text not null,
    move_number integer,
    title text,
    intended_recipient_team text,
    proposal_text text,
    requested_action text,
    rationale text,
    full_content jsonb not null,
    submitted_utc timestamptz,
    review_decision text,
    review_reason text,
    reviewer_pseudonym text,
    reviewed_utc timestamptz,
    forwarded_to_team text,
    final_recipient_state text
);

CREATE TABLE IF NOT EXISTS public.research_adjudication_content (
    adjudication_id uuid primary key,
    session_id uuid not null references public.sessions (id),
    target_entity_type text not null,
    target_entity_id uuid not null,
    adjudicator_pseudonym text not null,
    adjudicator_role text not null,
    move_number integer,
    ruling text,
    reasoning text,
    effects jsonb,
    adjudicated_utc timestamptz not null
);

CREATE TABLE IF NOT EXISTS public.research_move_response_content (
    move_response_id uuid primary key,
    session_id uuid not null references public.sessions (id),
    author_pseudonym text not null,
    author_role text not null,
    author_team text not null,
    move_number integer,
    responding_to_entity_type text,
    responding_to_entity_id uuid,
    posture text,
    response_text text,
    rationale text,
    full_content jsonb not null,
    submitted_utc timestamptz,
    review_state text
);

CREATE TABLE IF NOT EXISTS public.research_rfi_content (
    rfi_id uuid primary key,
    session_id uuid not null references public.sessions (id),
    requester_pseudonym text not null,
    requester_role text not null,
    requester_team text not null,
    move_number integer,
    question_text text not null,
    raised_utc timestamptz not null,
    answer_text text,
    answered_by_pseudonym text,
    answered_utc timestamptz,
    status text not null
);

CREATE TABLE IF NOT EXISTS public.research_interaction_edge (
    edge_id uuid primary key,
    session_id uuid not null references public.sessions (id),
    source_pseudonym text,
    source_role text,
    source_team text,
    target_pseudonym text,
    target_team text,
    channel text not null,
    direction text not null,
    communication_type text,
    entity_id uuid,
    move_number integer,
    occurred_utc timestamptz not null,
    latency_s numeric,
    constraint research_interaction_edge_channel_chk check (
        channel in ('communication','proposal_forward','proposal_response','adjudication','rfi')
    )
);

CREATE INDEX IF NOT EXISTS research_interaction_edge_session_idx
    ON public.research_interaction_edge (session_id, occurred_utc);

CREATE TABLE IF NOT EXISTS public.research_data_quality_event (
    dq_event_id uuid primary key,
    session_id uuid not null references public.sessions (id),
    participant_pseudonym text,
    role text,
    team text,
    seat_index integer,
    event_type text not null,
    occurred_utc timestamptz not null,
    gap_seconds numeric,
    detail jsonb not null default '{}'::jsonb,
    constraint research_data_quality_event_type_chk check (
        event_type in ('disconnect','reconnect','stale_seat_release','seat_reassignment','heartbeat_gap','heartbeat_timeout')
    )
);

CREATE TABLE IF NOT EXISTS public.research_derived_participant_metrics (
    session_id uuid not null,
    participant_pseudonym text not null,
    role text,
    team text,
    seat_index integer,
    events_count integer not null default 0,
    notes_count integer not null default 0,
    note_edits_count integer not null default 0,
    drafts_count integer not null default 0,
    submissions_count integer not null default 0,
    mean_time_to_submit_s numeric,
    mean_response_latency_s numeric,
    active_duration_s numeric,
    disconnect_count integer not null default 0,
    first_event_offset_s numeric,
    last_event_offset_s numeric,
    primary key (session_id, participant_pseudonym, role, seat_index)
);

CREATE TABLE IF NOT EXISTS public.research_derived_session_metrics (
    session_id uuid primary key,
    capture_mode text not null,
    session_duration_s numeric,
    moves_count integer not null default 0,
    participants_active integer not null default 0,
    total_events integer not null default 0,
    actions_submitted integer not null default 0,
    actions_adjudicated integer not null default 0,
    proposals_submitted integer not null default 0,
    proposals_forwarded integer not null default 0,
    rfis_raised integer not null default 0,
    communications_sent integer not null default 0,
    mean_proposal_response_latency_s numeric
);

CREATE TABLE IF NOT EXISTS public.research_identity_map (
    participant_pseudonym text not null,
    session_id uuid not null references public.sessions (id),
    auth_uid text not null,
    display_name text,
    consent_status text not null default 'unknown',
    consent_recorded_utc timestamptz,
    primary key (participant_pseudonym, session_id)
);

CREATE TABLE IF NOT EXISTS public.research_export_codebook (
    table_name text not null,
    column_name text not null,
    data_type text not null,
    units text,
    allowed_values text,
    nullable boolean not null,
    is_derived boolean not null,
    derivation text,
    pii_class text not null,
    description text not null,
    primary key (table_name, column_name)
);

ALTER TABLE public.research_audit_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_note_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_draft_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_state_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_action_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_proposal_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_adjudication_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_move_response_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_rfi_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_interaction_edge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_data_quality_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_derived_participant_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_derived_session_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_identity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_export_codebook ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS research_audit_event_log_select ON public.research_audit_event_log;
CREATE POLICY research_audit_event_log_select
    ON public.research_audit_event_log
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_participant_select ON public.research_participant;
CREATE POLICY research_participant_select
    ON public.research_participant
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_note_select ON public.research_note;
CREATE POLICY research_note_select
    ON public.research_note
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_note_revision_select ON public.research_note_revision;
CREATE POLICY research_note_revision_select
    ON public.research_note_revision
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.research_note rn
            WHERE rn.note_id = research_note_revision.note_id
              AND public.live_demo_can_read_session(rn.session_id)
        )
    );

DROP POLICY IF EXISTS research_draft_revision_select ON public.research_draft_revision;
CREATE POLICY research_draft_revision_select
    ON public.research_draft_revision
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_state_transition_select ON public.research_state_transition;
CREATE POLICY research_state_transition_select
    ON public.research_state_transition
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_action_content_select ON public.research_action_content;
CREATE POLICY research_action_content_select
    ON public.research_action_content
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_proposal_content_select ON public.research_proposal_content;
CREATE POLICY research_proposal_content_select
    ON public.research_proposal_content
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_adjudication_content_select ON public.research_adjudication_content;
CREATE POLICY research_adjudication_content_select
    ON public.research_adjudication_content
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_move_response_content_select ON public.research_move_response_content;
CREATE POLICY research_move_response_content_select
    ON public.research_move_response_content
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_rfi_content_select ON public.research_rfi_content;
CREATE POLICY research_rfi_content_select
    ON public.research_rfi_content
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_interaction_edge_select ON public.research_interaction_edge;
CREATE POLICY research_interaction_edge_select
    ON public.research_interaction_edge
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_data_quality_event_select ON public.research_data_quality_event;
CREATE POLICY research_data_quality_event_select
    ON public.research_data_quality_event
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_derived_participant_metrics_select ON public.research_derived_participant_metrics;
CREATE POLICY research_derived_participant_metrics_select
    ON public.research_derived_participant_metrics
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_derived_session_metrics_select ON public.research_derived_session_metrics;
CREATE POLICY research_derived_session_metrics_select
    ON public.research_derived_session_metrics
    FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

DROP POLICY IF EXISTS research_export_codebook_select ON public.research_export_codebook;
CREATE POLICY research_export_codebook_select
    ON public.research_export_codebook
    FOR SELECT
    USING (true);

REVOKE ALL ON public.research_identity_map FROM PUBLIC;
REVOKE ALL ON public.research_identity_map FROM anon;
REVOKE ALL ON public.research_identity_map FROM authenticated;

CREATE OR REPLACE FUNCTION public.block_research_audit_event_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'research_audit_event_log is append-only.'
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS research_audit_event_log_block_update ON public.research_audit_event_log;
CREATE TRIGGER research_audit_event_log_block_update
    BEFORE UPDATE ON public.research_audit_event_log
    FOR EACH ROW
    EXECUTE FUNCTION public.block_research_audit_event_log_mutation();

DROP TRIGGER IF EXISTS research_audit_event_log_block_delete ON public.research_audit_event_log;
CREATE TRIGGER research_audit_event_log_block_delete
    BEFORE DELETE ON public.research_audit_event_log
    FOR EACH ROW
    EXECUTE FUNCTION public.block_research_audit_event_log_mutation();

CREATE OR REPLACE FUNCTION public.record_research_event(
    requested_session_id uuid,
    requested_event_ts_utc timestamptz,
    requested_client_ts_utc timestamptz,
    requested_actor_pseudonym text,
    requested_actor_role text,
    requested_actor_team text,
    requested_actor_seat_index integer,
    requested_event_type text,
    requested_entity_type text,
    requested_entity_id uuid,
    requested_move_number integer,
    requested_action_sequence integer,
    requested_correlation_id uuid,
    requested_causal_event_id bigint,
    requested_before_state jsonb,
    requested_after_state jsonb,
    requested_payload jsonb default '{}'::jsonb,
    requested_phase text default null
)
RETURNS public.research_audit_event_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    previous_row public.research_audit_event_log%ROWTYPE;
    inserted_row public.research_audit_event_log%ROWTYPE;
    normalized_event_ts timestamptz := COALESCE(requested_event_ts_utc, NOW());
    normalized_event_uuid uuid := gen_random_uuid();
    canonical_hash_input text;
BEGIN
    SELECT *
    INTO previous_row
    FROM public.research_audit_event_log
    WHERE session_id = requested_session_id
    ORDER BY event_id DESC
    LIMIT 1;

    canonical_hash_input := concat_ws(
        '|',
        normalized_event_uuid::text,
        requested_session_id::text,
        normalized_event_ts::text,
        COALESCE(requested_client_ts_utc::text, ''),
        COALESCE(NULLIF(BTRIM(requested_actor_pseudonym), ''), ''),
        COALESCE(NULLIF(BTRIM(requested_actor_role), ''), ''),
        COALESCE(NULLIF(BTRIM(requested_actor_team), ''), ''),
        COALESCE(requested_actor_seat_index::text, ''),
        requested_event_type,
        requested_entity_type,
        COALESCE(requested_entity_id::text, ''),
        COALESCE(requested_move_number::text, ''),
        COALESCE(requested_action_sequence::text, ''),
        COALESCE(requested_correlation_id::text, ''),
        COALESCE(requested_causal_event_id::text, ''),
        COALESCE(requested_before_state::text, ''),
        COALESCE(requested_after_state::text, ''),
        COALESCE(requested_payload, '{}'::jsonb)::text,
        COALESCE(requested_phase, ''),
        COALESCE(previous_row.event_hash, '')
    );

    INSERT INTO public.research_audit_event_log (
        event_uuid,
        session_id,
        event_ts_utc,
        client_ts_utc,
        actor_pseudonym,
        actor_role,
        actor_team,
        actor_seat_index,
        event_type,
        entity_type,
        entity_id,
        move_number,
        action_sequence,
        correlation_id,
        causal_event_id,
        before_state,
        after_state,
        payload,
        phase,
        prev_event_hash,
        event_hash
    )
    VALUES (
        normalized_event_uuid,
        requested_session_id,
        normalized_event_ts,
        requested_client_ts_utc,
        NULLIF(BTRIM(requested_actor_pseudonym), ''),
        NULLIF(BTRIM(requested_actor_role), ''),
        NULLIF(BTRIM(requested_actor_team), ''),
        requested_actor_seat_index,
        requested_event_type,
        requested_entity_type,
        requested_entity_id,
        requested_move_number,
        requested_action_sequence,
        requested_correlation_id,
        requested_causal_event_id,
        requested_before_state,
        requested_after_state,
        COALESCE(requested_payload, '{}'::jsonb),
        requested_phase,
        previous_row.event_hash,
        encode(extensions.digest(canonical_hash_input, 'sha256'), 'hex')
    )
    RETURNING *
    INTO inserted_row;

    RETURN inserted_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_research_event(
    uuid, timestamptz, timestamptz, text, text, text, integer, text, text, uuid, integer, integer, uuid, bigint, jsonb, jsonb, jsonb, text
) TO authenticated;

COMMENT ON FUNCTION public.record_research_event(
    uuid, timestamptz, timestamptz, text, text, text, integer, text, text, uuid, integer, integer, uuid, bigint, jsonb, jsonb, jsonb, text
) IS 'Security-definer helper that appends one tamper-evident research event to the per-session audit chain.';

COMMIT;
