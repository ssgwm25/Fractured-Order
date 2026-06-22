CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- RESEARCH ENHANCEMENT TABLES (Added for Post-Simulation Analysis)
-- ============================================================================
-- These tables address critical gaps identified in the research gap analysis.
-- They enable comprehensive participant tracking, timing analysis, engagement
-- metrics, and relationship mapping for research purposes.
-- ============================================================================

-- ============================================================================
-- 1. SESSIONS TABLE
-- ============================================================================
-- Stores simulation session metadata

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    session_code TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_session_code_upper
    ON sessions (UPPER(session_code))
    WHERE session_code IS NOT NULL
      AND BTRIM(session_code) <> ''
      AND status = 'active';

-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sessions (allow all operations for now - adjust based on your auth)
CREATE POLICY "Allow all operations on sessions"
    ON sessions FOR ALL
    USING (true)
    WITH CHECK (true);

-- Public participant join contract. Public clients must resolve codes via this RPC and
-- must not enumerate sessions in the browser to discover session_code values.
CREATE OR REPLACE FUNCTION public.lookup_joinable_session_by_code(requested_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized_code TEXT := UPPER(BTRIM(requested_code));
    session_row RECORD;
BEGIN
    IF normalized_code IS NULL OR normalized_code = '' THEN
        RAISE EXCEPTION 'Session code is required.'
            USING ERRCODE = '22023';
    END IF;

    SELECT
        s.id,
        s.name,
        s.status,
        COALESCE(NULLIF(BTRIM(s.session_code), ''), UPPER(BTRIM(s.metadata->>'session_code'))) AS resolved_session_code
    INTO session_row
    FROM public.sessions s
    WHERE COALESCE(NULLIF(UPPER(BTRIM(s.session_code)), ''), UPPER(BTRIM(s.metadata->>'session_code'))) = normalized_code
    ORDER BY
        CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
        s.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found. Please check the code and try again.'
            USING ERRCODE = 'P0002';
    END IF;

    IF session_row.status <> 'active' THEN
        RAISE EXCEPTION 'This session is not currently joinable.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
        'id', session_row.id,
        'name', session_row.name,
        'session_code', session_row.resolved_session_code,
        'status', session_row.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_joinable_session_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_joinable_session_by_code(TEXT) TO authenticated;

-- ============================================================================
-- 2. PARTICIPANTS TABLE (RESEARCH)
-- ============================================================================
-- Stores participant demographics and information across sessions

CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT,
    demographics JSONB DEFAULT '{}', -- age, experience, background, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for participants
CREATE INDEX IF NOT EXISTS idx_participants_client_id ON participants(client_id);
CREATE INDEX IF NOT EXISTS idx_participants_role ON participants(role);

-- Enable RLS
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for participants
CREATE POLICY "Allow all operations on participants"
    ON participants FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 3. SESSION_PARTICIPANTS TABLE (RESEARCH)
-- ============================================================================
-- Tracks participant involvement in specific sessions

CREATE TABLE IF NOT EXISTS session_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    total_active_time INTEGER DEFAULT 0, -- seconds
    contributions_count INTEGER DEFAULT 0,
    -- Role login management columns
    is_active BOOLEAN DEFAULT true,
    heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    UNIQUE(session_id, participant_id)
);

-- Indexes for session_participants
CREATE INDEX IF NOT EXISTS idx_session_participants_session ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_participant ON session_participants(participant_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_role ON session_participants(role);
CREATE INDEX IF NOT EXISTS idx_session_participants_active ON session_participants(session_id, role, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_session_participants_heartbeat ON session_participants(heartbeat_at) WHERE is_active = true;

-- Comments for role login management columns
COMMENT ON COLUMN session_participants.is_active IS 'Whether participant is currently connected';
COMMENT ON COLUMN session_participants.heartbeat_at IS 'Last heartbeat timestamp for timeout detection';
COMMENT ON COLUMN session_participants.disconnected_at IS 'When participant disconnected';
COMMENT ON COLUMN session_participants.role IS 'Claimed live-demo seat role. White Cell operator seats use explicit *_whitecell_lead and *_whitecell_support roles.';

-- Enable RLS
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for session_participants
CREATE POLICY "Allow all operations on session_participants"
    ON session_participants FOR ALL
    USING (true)
    WITH CHECK (true);

-- Live-demo seat model helpers.
CREATE OR REPLACE FUNCTION public.get_session_role_seat_limit(requested_role TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN requested_role ~ '^(blue|red|green)_facilitator$' THEN 1
        WHEN requested_role ~ '^(blue|red|green)_scribe$' THEN 1
        WHEN requested_role ~ '^(blue|red|green)_notetaker$' THEN 2
        WHEN requested_role ~ '^(blue|red|green)_whitecell(_lead)?$' THEN 1
        WHEN requested_role ~ '^(blue|red|green)_whitecell_support$' THEN 1
        WHEN requested_role = 'white' THEN 1
        ELSE NULL
    END
$$;

CREATE OR REPLACE FUNCTION public.release_stale_session_role_seats(
    requested_session_id UUID,
    requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized_timeout_seconds INTEGER := GREATEST(COALESCE(requested_timeout_seconds, 90), 1);
    released_count INTEGER := 0;
BEGIN
    IF requested_session_id IS NULL THEN
        RAISE EXCEPTION 'Session ID is required.'
            USING ERRCODE = '22023';
    END IF;

    WITH released_rows AS (
        UPDATE public.session_participants sp
        SET
            is_active = false,
            disconnected_at = COALESCE(sp.disconnected_at, NOW()),
            left_at = COALESCE(sp.left_at, NOW()),
            last_seen = COALESCE(sp.last_seen, sp.heartbeat_at, sp.joined_at, NOW())
        WHERE sp.session_id = requested_session_id
          AND sp.is_active = true
          AND COALESCE(sp.heartbeat_at, sp.last_seen, sp.joined_at, NOW())
                < (NOW() - make_interval(secs => normalized_timeout_seconds))
        RETURNING 1
    )
    SELECT COUNT(*)
    INTO released_count
    FROM released_rows;

    RETURN COALESCE(released_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_active_session_participants(
    requested_session_id UUID,
    requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS TABLE (
    id UUID,
    session_id UUID,
    participant_id UUID,
    role TEXT,
    is_active BOOLEAN,
    heartbeat_at TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    joined_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    display_name TEXT,
    client_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.release_stale_session_role_seats(requested_session_id, requested_timeout_seconds);

    RETURN QUERY
    SELECT
        sp.id,
        sp.session_id,
        sp.participant_id,
        sp.role,
        sp.is_active,
        sp.heartbeat_at,
        sp.last_seen,
        sp.joined_at,
        sp.disconnected_at,
        COALESCE(p.name, 'Unknown') AS display_name,
        p.client_id
    FROM public.session_participants sp
    INNER JOIN public.participants p
        ON p.id = sp.participant_id
    WHERE sp.session_id = requested_session_id
      AND sp.is_active = true
    ORDER BY sp.joined_at ASC, sp.id ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_session_role_seat(
    requested_session_id UUID,
    requested_role TEXT,
    requested_name TEXT DEFAULT NULL,
    requested_client_id TEXT DEFAULT NULL,
    requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized_role TEXT := CASE
        WHEN requested_role ~ '^(blue|red|green)_whitecell$'
            THEN regexp_replace(BTRIM(requested_role), '_whitecell$', '_whitecell_lead')
        ELSE BTRIM(requested_role)
    END;
    normalized_name TEXT := NULLIF(BTRIM(requested_name), '');
    normalized_client_id TEXT := NULLIF(BTRIM(requested_client_id), '');
    normalized_timeout_seconds INTEGER := GREATEST(COALESCE(requested_timeout_seconds, 90), 1);
    role_limit INTEGER := public.get_session_role_seat_limit(normalized_role);
    active_claim_count INTEGER := 0;
    participant_row public.participants%ROWTYPE;
    seat_row public.session_participants%ROWTYPE;
    claim_status TEXT := 'claimed';
BEGIN
    IF requested_session_id IS NULL THEN
        RAISE EXCEPTION 'Session ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_role IS NULL OR normalized_role = '' THEN
        RAISE EXCEPTION 'Role is required.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_client_id IS NULL OR normalized_client_id = '' THEN
        RAISE EXCEPTION 'Client identity is required.'
            USING ERRCODE = '22023';
    END IF;

    IF role_limit IS NULL THEN
        RAISE EXCEPTION 'This role cannot be claimed in the live demo.'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.sessions s
    WHERE s.id = requested_session_id
      AND s.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'This session is not currently joinable.'
            USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(requested_session_id::TEXT || ':' || normalized_role));
    PERFORM public.release_stale_session_role_seats(requested_session_id, normalized_timeout_seconds);

    INSERT INTO public.participants (
        client_id,
        name,
        role,
        updated_at
    )
    VALUES (
        normalized_client_id,
        normalized_name,
        normalized_role,
        NOW()
    )
    ON CONFLICT (client_id) DO UPDATE
    SET
        name = COALESCE(EXCLUDED.name, public.participants.name),
        role = EXCLUDED.role,
        updated_at = NOW()
    RETURNING *
    INTO participant_row;

    SELECT *
    INTO seat_row
    FROM public.session_participants sp
    WHERE sp.session_id = requested_session_id
      AND sp.participant_id = participant_row.id
    FOR UPDATE;

    SELECT COUNT(*)
    INTO active_claim_count
    FROM public.session_participants sp
    WHERE sp.session_id = requested_session_id
      AND sp.role = normalized_role
      AND sp.is_active = true
      AND (seat_row.id IS NULL OR sp.id <> seat_row.id);

    IF active_claim_count >= role_limit THEN
        RAISE EXCEPTION 'The requested role is full. Please choose another seat.'
            USING ERRCODE = 'P0001';
    END IF;

    IF seat_row.id IS NULL THEN
        INSERT INTO public.session_participants (
            session_id,
            participant_id,
            role,
            is_active,
            heartbeat_at,
            joined_at,
            last_seen,
            disconnected_at,
            left_at
        )
        VALUES (
            requested_session_id,
            participant_row.id,
            normalized_role,
            true,
            NOW(),
            NOW(),
            NOW(),
            NULL,
            NULL
        )
        RETURNING *
        INTO seat_row;

        claim_status := 'claimed';
    ELSE
        claim_status := CASE
            WHEN seat_row.is_active AND seat_row.role = normalized_role THEN 'refreshed'
            WHEN seat_row.role = normalized_role THEN 'rejoined'
            ELSE 'reassigned'
        END;

        UPDATE public.session_participants sp
        SET
            role = normalized_role,
            is_active = true,
            heartbeat_at = NOW(),
            last_seen = NOW(),
            disconnected_at = NULL,
            left_at = NULL
        WHERE sp.id = seat_row.id
        RETURNING *
        INTO seat_row;
    END IF;

    RETURN jsonb_build_object(
        'id', seat_row.id,
        'session_id', seat_row.session_id,
        'participant_id', seat_row.participant_id,
        'role', seat_row.role,
        'is_active', seat_row.is_active,
        'heartbeat_at', seat_row.heartbeat_at,
        'last_seen', seat_row.last_seen,
        'joined_at', seat_row.joined_at,
        'disconnected_at', seat_row.disconnected_at,
        'display_name', COALESCE(participant_row.name, 'Unknown'),
        'client_id', participant_row.client_id,
        'seat_limit', role_limit,
        'active_count', active_claim_count + 1,
        'claim_status', claim_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_session_role_seat(
    requested_session_id UUID,
    requested_session_participant_id UUID,
    requested_client_id TEXT DEFAULT NULL,
    requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized_client_id TEXT := NULLIF(BTRIM(requested_client_id), '');
    normalized_timeout_seconds INTEGER := GREATEST(COALESCE(requested_timeout_seconds, 90), 1);
    role_limit INTEGER;
    active_claim_count INTEGER := 0;
    seat_row public.session_participants%ROWTYPE;
    participant_row public.participants%ROWTYPE;
BEGIN
    IF requested_session_id IS NULL OR requested_session_participant_id IS NULL THEN
        RAISE EXCEPTION 'A claimed seat is required to send heartbeats.'
            USING ERRCODE = '22023';
    END IF;

    PERFORM public.release_stale_session_role_seats(requested_session_id, normalized_timeout_seconds);

    SELECT sp.*
    INTO seat_row
    FROM public.session_participants sp
    WHERE sp.id = requested_session_participant_id
      AND sp.session_id = requested_session_id
      AND EXISTS (
          SELECT 1
          FROM public.participants p
          WHERE p.id = sp.participant_id
            AND (normalized_client_id IS NULL OR p.client_id = normalized_client_id)
      )
    FOR UPDATE;

    IF seat_row.id IS NULL THEN
        RAISE EXCEPTION 'Participant seat not found. Please rejoin the session.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT p.*
    INTO participant_row
    FROM public.participants p
    WHERE p.id = seat_row.participant_id;

    role_limit := public.get_session_role_seat_limit(seat_row.role);

    IF seat_row.is_active IS DISTINCT FROM true THEN
        SELECT COUNT(*)
        INTO active_claim_count
        FROM public.session_participants sp
        WHERE sp.session_id = requested_session_id
          AND sp.role = seat_row.role
          AND sp.is_active = true
          AND sp.id <> seat_row.id;

        IF active_claim_count >= COALESCE(role_limit, 1) THEN
            RAISE EXCEPTION 'This seat is no longer available. Please rejoin the session.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    UPDATE public.session_participants sp
    SET
        is_active = true,
        heartbeat_at = NOW(),
        last_seen = NOW(),
        disconnected_at = NULL,
        left_at = NULL
    WHERE sp.id = seat_row.id
    RETURNING *
    INTO seat_row;

    RETURN jsonb_build_object(
        'id', seat_row.id,
        'session_id', seat_row.session_id,
        'participant_id', seat_row.participant_id,
        'role', seat_row.role,
        'is_active', seat_row.is_active,
        'heartbeat_at', seat_row.heartbeat_at,
        'last_seen', seat_row.last_seen,
        'joined_at', seat_row.joined_at,
        'disconnected_at', seat_row.disconnected_at,
        'display_name', COALESCE(participant_row.name, 'Unknown'),
        'client_id', participant_row.client_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_session_role_seat(
    requested_session_id UUID,
    requested_session_participant_id UUID,
    requested_client_id TEXT DEFAULT NULL,
    requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized_client_id TEXT := NULLIF(BTRIM(requested_client_id), '');
    seat_row public.session_participants%ROWTYPE;
    participant_row public.participants%ROWTYPE;
BEGIN
    IF requested_session_id IS NULL OR requested_session_participant_id IS NULL THEN
        RETURN NULL;
    END IF;

    PERFORM public.release_stale_session_role_seats(requested_session_id, requested_timeout_seconds);

    SELECT sp.*
    INTO seat_row
    FROM public.session_participants sp
    WHERE sp.id = requested_session_participant_id
      AND sp.session_id = requested_session_id
      AND EXISTS (
          SELECT 1
          FROM public.participants p
          WHERE p.id = sp.participant_id
            AND (normalized_client_id IS NULL OR p.client_id = normalized_client_id)
      )
    FOR UPDATE;

    IF seat_row.id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT p.*
    INTO participant_row
    FROM public.participants p
    WHERE p.id = seat_row.participant_id;

    UPDATE public.session_participants sp
    SET
        is_active = false,
        disconnected_at = NOW(),
        left_at = COALESCE(sp.left_at, NOW()),
        last_seen = COALESCE(sp.last_seen, NOW())
    WHERE sp.id = seat_row.id
    RETURNING *
    INTO seat_row;

    RETURN jsonb_build_object(
        'id', seat_row.id,
        'session_id', seat_row.session_id,
        'participant_id', seat_row.participant_id,
        'role', seat_row.role,
        'is_active', seat_row.is_active,
        'heartbeat_at', seat_row.heartbeat_at,
        'last_seen', seat_row.last_seen,
        'joined_at', seat_row.joined_at,
        'disconnected_at', seat_row.disconnected_at,
        'display_name', COALESCE(participant_row.name, 'Unknown'),
        'client_id', participant_row.client_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_role_seat_limit(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_stale_session_role_seats(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_active_session_participants(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_session_role_seat(UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_session_role_seat(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disconnect_session_role_seat(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_session_role_seat_limit(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_session_role_seats(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_active_session_participants(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_session_role_seat(UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_session_role_seat(UUID, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_session_role_seat(UUID, UUID, TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- 4. GAME_STATE TABLE
-- ============================================================================
-- Stores global game state (move, phase, timer) for each session

CREATE TABLE IF NOT EXISTS game_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    move INTEGER NOT NULL DEFAULT 1 CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL DEFAULT 1 CHECK (phase >= 1 AND phase <= 5),
    timer_seconds INTEGER DEFAULT 5400,
    timer_running BOOLEAN DEFAULT false,
    timer_last_update TIMESTAMPTZ,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for game_state
CREATE INDEX IF NOT EXISTS idx_game_state_session ON game_state(session_id);

-- Enable RLS
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies for game_state
CREATE POLICY "Allow all operations on game_state"
    ON game_state FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 5. ACTIONS TABLE
-- ============================================================================
-- Stores strategic actions submitted by facilitators

CREATE TABLE IF NOT EXISTS actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL CHECK (phase >= 1 AND phase <= 5),
    team TEXT NOT NULL DEFAULT 'blue',
    client_id TEXT,
    
    -- Action details (from Facilitator Schema)
    mechanism TEXT NOT NULL,
    sector TEXT NOT NULL,
    exposure_type TEXT,
    targets TEXT[] DEFAULT '{}',
    goal TEXT,
    expected_outcomes TEXT,
    ally_contingencies TEXT,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'adjudicated', 'abandoned')),
    
    -- Adjudication data (stored as JSONB)
    adjudication JSONB,
    
    -- RESEARCH: Action lifecycle timestamps
    submitted_at TIMESTAMPTZ,
    adjudicated_at TIMESTAMPTZ,
    draft_duration_seconds INTEGER,
    submission_to_adjudication_seconds INTEGER,
    
    -- Soft delete
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ
);

-- Indexes for actions
CREATE INDEX IF NOT EXISTS idx_actions_session ON actions(session_id);
CREATE INDEX IF NOT EXISTS idx_actions_session_move ON actions(session_id, move);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_is_deleted ON actions(is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_actions_created_at ON actions(created_at DESC);

-- Enable RLS
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for actions
CREATE POLICY "Allow all operations on actions"
    ON actions FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 6. ACTION_LOGS TABLE
-- ============================================================================
-- Audit trail for action changes

CREATE TABLE IF NOT EXISTS action_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    client_id TEXT,
    changed_by_role TEXT,
    previous_state JSONB,
    new_state JSONB,
    
    -- RESEARCH: Enhanced tracking for decision-making analysis
    status_from TEXT,
    status_to TEXT,
    transition_duration_seconds INTEGER
);

-- Indexes for action_logs
CREATE INDEX IF NOT EXISTS idx_action_logs_action ON action_logs(action_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_session ON action_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON action_logs(created_at DESC);

-- Enable RLS
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for action_logs
CREATE POLICY "Allow all operations on action_logs"
    ON action_logs FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 7. REQUESTS TABLE
-- ============================================================================
-- Information requests (RFIs) from facilitators

CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL CHECK (phase >= 1 AND phase <= 5),
    team TEXT NOT NULL DEFAULT 'blue',
    client_id TEXT,
    
    -- Request details
    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
    categories TEXT[] DEFAULT '{}',
    query TEXT NOT NULL,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'withdrawn')),
    
    -- RESEARCH: RFI response time tracking
    answered_at TIMESTAMPTZ,
    response_time_seconds INTEGER
);

-- Indexes for requests
CREATE INDEX IF NOT EXISTS idx_requests_session ON requests(session_id);
CREATE INDEX IF NOT EXISTS idx_requests_session_move ON requests(session_id, move);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);

-- Enable RLS
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for requests
CREATE POLICY "Allow all operations on requests"
    ON requests FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 8. COMMUNICATIONS TABLE
-- ============================================================================
-- RFI responses and team communications

CREATE TABLE IF NOT EXISTS communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    from_role TEXT NOT NULL,
    to_role TEXT NOT NULL,
    type TEXT NOT NULL CHECK (
        type IN (
            'rfi_response',
            'game_update',
            'message',
            'RFI_RESPONSE',
            'INJECT',
            'ANNOUNCEMENT',
            'GUIDANCE',
            'PROPOSAL_FORWARDED',
            'PROPOSAL_RESPONSE'
        )
    ),
    title TEXT,
    content TEXT NOT NULL,
    client_id TEXT,
    linked_request_id UUID REFERENCES requests(id) ON DELETE SET NULL
);

-- Indexes for communications
CREATE INDEX IF NOT EXISTS idx_communications_session ON communications(session_id);
CREATE INDEX IF NOT EXISTS idx_communications_session_move ON communications(session_id, move);
CREATE INDEX IF NOT EXISTS idx_communications_to_role ON communications(to_role);
CREATE INDEX IF NOT EXISTS idx_communications_linked_request ON communications(linked_request_id);
CREATE INDEX IF NOT EXISTS idx_communications_created_at ON communications(created_at DESC);

-- Enable RLS
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for communications
CREATE POLICY "Allow all operations on communications"
    ON communications FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 9. TIMELINE TABLE
-- ============================================================================
-- Timeline events from all teams

CREATE TABLE IF NOT EXISTS timeline (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL CHECK (phase >= 1 AND phase <= 5),
    team TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    client_id TEXT,
    category TEXT,
    faction_tag TEXT,
    debate_marker TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Indexes for timeline
CREATE INDEX IF NOT EXISTS idx_timeline_session ON timeline(session_id);
CREATE INDEX IF NOT EXISTS idx_timeline_session_move ON timeline(session_id, move);
CREATE INDEX IF NOT EXISTS idx_timeline_team ON timeline(team);
CREATE INDEX IF NOT EXISTS idx_timeline_type ON timeline(type);
CREATE INDEX IF NOT EXISTS idx_timeline_created_at ON timeline(created_at DESC);

-- Enable RLS
ALTER TABLE timeline ENABLE ROW LEVEL SECURITY;

-- RLS Policies for timeline
CREATE POLICY "Allow all operations on timeline"
    ON timeline FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 10. NOTETAKER_DATA TABLE
-- ============================================================================
-- Notetaker observations, dynamics analysis, and external factors

CREATE TABLE IF NOT EXISTS notetaker_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL CHECK (phase >= 1 AND phase <= 5),
    team TEXT NOT NULL DEFAULT 'blue',
    client_id TEXT,
    
    -- Structured analysis data (from Notetaker Schema)
    dynamics_analysis JSONB DEFAULT '{}',
    external_factors JSONB DEFAULT '{}',
    observation_timeline JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one record per session/move combination
    UNIQUE(session_id, move)
);

-- Indexes for notetaker_data
CREATE INDEX IF NOT EXISTS idx_notetaker_data_session_move ON notetaker_data(session_id, move);
CREATE INDEX IF NOT EXISTS idx_notetaker_data_session ON notetaker_data(session_id);
CREATE INDEX IF NOT EXISTS idx_notetaker_data_move ON notetaker_data(move);

-- Enable RLS
ALTER TABLE notetaker_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notetaker_data
CREATE POLICY "Allow all operations on notetaker_data"
    ON notetaker_data FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 11. REPORTS TABLE
-- ============================================================================
-- Report versions saved by notetakers

CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL CHECK (phase >= 1 AND phase <= 5),
    author_role TEXT NOT NULL DEFAULT 'notetaker',
    client_id TEXT,
    report_type TEXT NOT NULL,
    data JSONB DEFAULT '{}'
);

-- Indexes for reports
CREATE INDEX IF NOT EXISTS idx_reports_session ON reports(session_id);
CREATE INDEX IF NOT EXISTS idx_reports_session_move ON reports(session_id, move);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

-- Enable RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reports
CREATE POLICY "Allow all operations on reports"
    ON reports FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 12. MOVE_COMPLETIONS TABLE
-- ============================================================================
-- Tracks move completion submissions

CREATE TABLE IF NOT EXISTS move_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    team TEXT NOT NULL DEFAULT 'blue',
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    final_action_count INTEGER DEFAULT 0,
    final_timeline_count INTEGER DEFAULT 0,
    submitted_by_role TEXT NOT NULL DEFAULT 'notetaker',
    client_id TEXT
);

-- Indexes for move_completions
CREATE INDEX IF NOT EXISTS idx_move_completions_session ON move_completions(session_id);
CREATE INDEX IF NOT EXISTS idx_move_completions_session_move ON move_completions(session_id, move);
CREATE INDEX IF NOT EXISTS idx_move_completions_created_at ON move_completions(created_at DESC);

-- Enable RLS
ALTER TABLE move_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for move_completions
CREATE POLICY "Allow all operations on move_completions"
    ON move_completions FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 13. GAME_STATE_TRANSITIONS TABLE (RESEARCH)
-- ============================================================================
-- Tracks phase and move transitions for progression analysis

CREATE TABLE IF NOT EXISTS game_state_transitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    transition_type TEXT NOT NULL CHECK (transition_type IN ('move', 'phase')),
    from_value INTEGER,
    to_value INTEGER,
    initiated_by_client_id TEXT,
    initiated_by_role TEXT,
    transition_reason TEXT, -- 'manual', 'auto', 'completion', etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    previous_phase_duration_seconds INTEGER, -- for phase transitions
    metadata JSONB DEFAULT '{}'
);

-- Indexes for game_state_transitions
CREATE INDEX IF NOT EXISTS idx_transitions_session ON game_state_transitions(session_id);
CREATE INDEX IF NOT EXISTS idx_transitions_type ON game_state_transitions(transition_type);
CREATE INDEX IF NOT EXISTS idx_transitions_created_at ON game_state_transitions(created_at);

-- Enable RLS
ALTER TABLE game_state_transitions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for game_state_transitions
CREATE POLICY "Allow all operations on game_state_transitions"
    ON game_state_transitions FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 14. PARTICIPANT_ACTIVITY TABLE (RESEARCH)
-- ============================================================================
-- Tracks participant engagement and activity events

CREATE TABLE IF NOT EXISTS participant_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
    client_id TEXT NOT NULL, -- fallback if participant_id not available
    event_type TEXT NOT NULL CHECK (event_type IN ('login', 'logout', 'action_created', 'action_submitted', 'rfi_created', 'observation_added', 'page_view', 'idle')),
    event_timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}', -- additional context
    duration_seconds INTEGER -- for events with duration
);

-- Indexes for participant_activity
CREATE INDEX IF NOT EXISTS idx_activity_session ON participant_activity(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_participant ON participant_activity(participant_id);
CREATE INDEX IF NOT EXISTS idx_activity_client ON participant_activity(client_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON participant_activity(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON participant_activity(event_timestamp);

-- Enable RLS
ALTER TABLE participant_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policies for participant_activity
CREATE POLICY "Allow all operations on participant_activity"
    ON participant_activity FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 15. DATA_COMPLETENESS_CHECKS TABLE (RESEARCH)
-- ============================================================================
-- Tracks data quality and completeness for research validation

CREATE TABLE IF NOT EXISTS data_completeness_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    move INTEGER,
    phase INTEGER,
    check_type TEXT NOT NULL, -- 'action_required', 'rfi_required', 'observation_required', etc.
    check_name TEXT NOT NULL,
    is_complete BOOLEAN NOT NULL,
    missing_fields TEXT[],
    checked_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Indexes for data_completeness_checks
CREATE INDEX IF NOT EXISTS idx_completeness_session ON data_completeness_checks(session_id);
CREATE INDEX IF NOT EXISTS idx_completeness_move ON data_completeness_checks(move);
CREATE INDEX IF NOT EXISTS idx_completeness_type ON data_completeness_checks(check_type);

-- Enable RLS
ALTER TABLE data_completeness_checks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for data_completeness_checks
CREATE POLICY "Allow all operations on data_completeness_checks"
    ON data_completeness_checks FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 16. ACTION_RELATIONSHIPS TABLE (RESEARCH)
-- ============================================================================
-- Tracks relationships and dependencies between actions

CREATE TABLE IF NOT EXISTS action_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    source_action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    target_action_id UUID REFERENCES actions(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN ('influenced_by', 'response_to', 'follows', 'replaces', 'refines')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Indexes for action_relationships
CREATE INDEX IF NOT EXISTS idx_relationships_source ON action_relationships(source_action_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON action_relationships(target_action_id);
CREATE INDEX IF NOT EXISTS idx_relationships_session ON action_relationships(session_id);

-- Enable RLS
ALTER TABLE action_relationships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for action_relationships
CREATE POLICY "Allow all operations on action_relationships"
    ON action_relationships FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 17. RFI_ACTION_LINKS TABLE (RESEARCH)
-- ============================================================================
-- Links RFIs to actions they informed

CREATE TABLE IF NOT EXISTS rfi_action_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    link_type TEXT DEFAULT 'informed_by', -- how the RFI informed the action
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for rfi_action_links
CREATE INDEX IF NOT EXISTS idx_rfi_action_request ON rfi_action_links(request_id);
CREATE INDEX IF NOT EXISTS idx_rfi_action_action ON rfi_action_links(action_id);
CREATE INDEX IF NOT EXISTS idx_rfi_action_session ON rfi_action_links(session_id);

-- Enable RLS
ALTER TABLE rfi_action_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rfi_action_links
CREATE POLICY "Allow all operations on rfi_action_links"
    ON rfi_action_links FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- TRIGGERS FOR AUTO-UPDATE TIMESTAMPS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for sessions
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for notetaker_data
CREATE TRIGGER update_notetaker_data_updated_at
    BEFORE UPDATE ON notetaker_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for actions
CREATE TRIGGER update_actions_updated_at
    BEFORE UPDATE ON actions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for participants
CREATE TRIGGER update_participants_updated_at
    BEFORE UPDATE ON participants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RESEARCH-SPECIFIC TRIGGERS
-- ============================================================================

-- Trigger to auto-update RFI response time when communication is created
CREATE OR REPLACE FUNCTION update_request_response_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.linked_request_id IS NOT NULL AND NEW.type = 'rfi_response' THEN
        UPDATE requests
        SET answered_at = NEW.created_at,
            response_time_seconds = EXTRACT(EPOCH FROM (NEW.created_at - (SELECT created_at FROM requests WHERE id = NEW.linked_request_id)))::INTEGER
        WHERE id = NEW.linked_request_id AND answered_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_request_on_communication
    AFTER INSERT ON communications
    FOR EACH ROW
    EXECUTE FUNCTION update_request_response_time();

-- ============================================================================
-- ENABLE REALTIME FOR ALL TABLES
-- ============================================================================
-- Enable Supabase Realtime for all tables that need real-time subscriptions

ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE session_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE actions;
ALTER PUBLICATION supabase_realtime ADD TABLE requests;
ALTER PUBLICATION supabase_realtime ADD TABLE communications;
ALTER PUBLICATION supabase_realtime ADD TABLE timeline;
ALTER PUBLICATION supabase_realtime ADD TABLE notetaker_data;
ALTER PUBLICATION supabase_realtime ADD TABLE reports;
ALTER PUBLICATION supabase_realtime ADD TABLE move_completions;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state_transitions;
ALTER PUBLICATION supabase_realtime ADD TABLE participant_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE data_completeness_checks;
ALTER PUBLICATION supabase_realtime ADD TABLE action_relationships;
ALTER PUBLICATION supabase_realtime ADD TABLE rfi_action_links;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE sessions IS 'Simulation session metadata and management';
COMMENT ON COLUMN sessions.session_code IS 'Public participant join code. Public clients must resolve it through lookup_joinable_session_by_code.';
COMMENT ON TABLE game_state IS 'Global game state (move, phase, timer) for each session';
COMMENT ON TABLE participants IS 'RESEARCH: Participant demographics and information across sessions';
COMMENT ON TABLE session_participants IS 'RESEARCH: Participant involvement in specific sessions';
COMMENT ON FUNCTION public.get_session_role_seat_limit(TEXT) IS 'Live-demo seat limit lookup for public participant and White Cell seat claims.';
COMMENT ON FUNCTION public.release_stale_session_role_seats(UUID, INTEGER) IS 'Marks stale session seats inactive so claims and participant counts use the same timeout contract.';
COMMENT ON FUNCTION public.list_active_session_participants(UUID, INTEGER) IS 'Returns active participants after stale seat cleanup using the live-demo timeout contract.';
COMMENT ON FUNCTION public.claim_session_role_seat(UUID, TEXT, TEXT, TEXT, INTEGER) IS 'Atomic live-demo seat claim RPC. Uses an advisory lock per session-role to prevent claim races.';
COMMENT ON FUNCTION public.heartbeat_session_role_seat(UUID, UUID, TEXT, INTEGER) IS 'Updates a claimed live-demo seat heartbeat and only reactivates inactive seats when capacity still exists.';
COMMENT ON FUNCTION public.disconnect_session_role_seat(UUID, UUID, TEXT, INTEGER) IS 'Explicit disconnect RPC for claimed live-demo seats. Supports keepalive fetch calls during page exit.';
COMMENT ON TABLE actions IS 'Strategic actions submitted by facilitators';
COMMENT ON TABLE action_logs IS 'Audit trail for action changes';
COMMENT ON TABLE requests IS 'Information requests (RFIs) from facilitators';
COMMENT ON TABLE communications IS 'RFI responses and team communications';
COMMENT ON TABLE timeline IS 'Timeline events from all teams';
COMMENT ON TABLE notetaker_data IS 'Notetaker observations, dynamics analysis, and external factors';
COMMENT ON TABLE reports IS 'Report versions saved by notetakers';
COMMENT ON TABLE move_completions IS 'Tracks move completion submissions';
COMMENT ON TABLE game_state_transitions IS 'RESEARCH: Phase and move transition history for progression analysis';
COMMENT ON TABLE participant_activity IS 'RESEARCH: Participant engagement and activity event tracking';
COMMENT ON TABLE data_completeness_checks IS 'RESEARCH: Data quality and completeness validation';
COMMENT ON TABLE action_relationships IS 'RESEARCH: Action dependencies and influence mapping';
COMMENT ON TABLE rfi_action_links IS 'RESEARCH: Links between RFIs and actions they informed';

COMMENT ON COLUMN game_state.timer_seconds IS 'Current timer value in seconds (default: 5400 = 90 minutes)';
COMMENT ON COLUMN game_state.timer_running IS 'Whether the timer is currently running';
COMMENT ON COLUMN game_state.timer_last_update IS 'Timestamp of last timer update for calculating elapsed time';

COMMENT ON COLUMN actions.adjudication IS 'JSONB containing adjudication data (vulnerabilities, interdependencies, structural_impacts, outcome, narrative)';
COMMENT ON COLUMN actions.submitted_at IS 'RESEARCH: Timestamp when action was submitted';
COMMENT ON COLUMN actions.adjudicated_at IS 'RESEARCH: Timestamp when action was adjudicated';
COMMENT ON COLUMN actions.draft_duration_seconds IS 'RESEARCH: Time spent in draft status before submission';
COMMENT ON COLUMN actions.submission_to_adjudication_seconds IS 'RESEARCH: Time from submission to adjudication';
COMMENT ON COLUMN requests.answered_at IS 'RESEARCH: Timestamp when RFI was answered';
COMMENT ON COLUMN requests.response_time_seconds IS 'RESEARCH: Time from RFI creation to response';
COMMENT ON COLUMN notetaker_data.dynamics_analysis IS 'JSONB containing leadership, friction_metrics, and resource_strategy';
COMMENT ON COLUMN notetaker_data.external_factors IS 'JSONB containing alliance feedback, red activity assessment, and counter-measures';
COMMENT ON COLUMN notetaker_data.observation_timeline IS 'JSONB array of observation objects with type (NOTE/MOMENT/QUOTE), timestamp, phase, and content';
COMMENT ON FUNCTION public.lookup_joinable_session_by_code(TEXT) IS 'Authenticated public join RPC. Operator note: do not reintroduce browser-side session inventory listing for code-based joins.';

-- ============================================================================
-- LIVE DEMO SECURITY OVERLAY
-- ============================================================================
-- The base schema above intentionally documents the original bootstrap state.
-- The authoritative live-demo security model is applied by:
--   data/2026-04-08_live_demo_rls_hardening.sql
--   data/2026-04-08_facilitator_join_session_access_fix.sql
--   data/2026-04-09_global_white_cell_role_contract.sql
--
-- That committed migration replaces the blanket "Allow all operations" policies
-- with auth.uid-bound RLS, server-issued operator grants, and protected RPCs
-- for Game Master / White Cell writes. The follow-up join fix preserves those
-- protections while allowing first-time public seat claims to perform stale-seat
-- cleanup inside the claim RPC, and the White Cell role contract keeps that
-- behavior while normalizing global whitecell_lead / whitecell_support roles.
-- Review those files alongside this schema when
-- auditing the current Supabase project.
--   Required deployment row:
--     public.live_demo_runtime_config.config_key = 'operator_code_sha256'
--     The hardened operator RPCs do not ship with a fallback access code hash.
--
-- Review index for the hardened live-demo model:
--   Replaced blanket table policies:
--     sessions, participants, session_participants, game_state, actions,
--     action_logs, requests, communications, timeline, notetaker_data,
--     reports, move_completions, game_state_transitions, participant_activity,
--     data_completeness_checks, action_relationships, rfi_action_links
--   Protected backend paths:
--     authorize_demo_operator
--     create_live_demo_session
--     delete_live_demo_session
--     operator_update_game_state
--     operator_adjudicate_action
--     operator_answer_request
--     operator_send_communication
--     claim_session_role_seat
--     heartbeat_session_role_seat
--     disconnect_session_role_seat
--     release_stale_session_role_seats
--     list_active_session_participants

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these after deployment to verify all tables were created

-- Verify all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'sessions', 'game_state', 'participants', 'session_participants',
    'actions', 'action_logs', 'requests', 'communications', 
    'timeline', 'notetaker_data', 'reports', 'move_completions',
    'game_state_transitions', 'participant_activity', 'operator_grants',
    'data_completeness_checks', 'action_relationships', 'rfi_action_links'
)
ORDER BY table_name;

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'sessions', 'game_state', 'participants', 'session_participants',
    'actions', 'action_logs', 'requests', 'communications', 
    'timeline', 'notetaker_data', 'reports', 'move_completions',
    'game_state_transitions', 'participant_activity', 'operator_grants',
    'data_completeness_checks', 'action_relationships', 'rfi_action_links'
)
ORDER BY tablename;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

