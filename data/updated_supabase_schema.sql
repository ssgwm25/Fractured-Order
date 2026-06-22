-- ESG Simulation Platform - Updated Supabase Schema
-- Aligned to current src/ code + remediation plan (Jan 23, 2026)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. SESSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on sessions"
    ON sessions FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. PARTICIPANTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT,
    demographics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participants_client_id ON participants(client_id);
CREATE INDEX IF NOT EXISTS idx_participants_role ON participants(role);

ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on participants"
    ON participants FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. SESSION_PARTICIPANTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS session_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    total_active_time INTEGER DEFAULT 0,
    contributions_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    UNIQUE(session_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_session_participants_session ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_participant ON session_participants(participant_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_role ON session_participants(role);
CREATE INDEX IF NOT EXISTS idx_session_participants_active
    ON session_participants(session_id, role, is_active)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_session_participants_heartbeat
    ON session_participants(heartbeat_at)
    WHERE is_active = true;

ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on session_participants"
    ON session_participants FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. GAME_STATE
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    move INTEGER NOT NULL DEFAULT 1 CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL DEFAULT 1 CHECK (phase >= 1 AND phase <= 5),
    timer_seconds INTEGER DEFAULT 5400,
    timer_running BOOLEAN DEFAULT false,
    timer_last_update TIMESTAMPTZ,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_state_session ON game_state(session_id);

ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on game_state"
    ON game_state FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. ACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL CHECK (phase >= 1 AND phase <= 5),
    team TEXT NOT NULL DEFAULT 'blue',
    client_id TEXT,

    -- Updated action fields
    mechanism TEXT NOT NULL,
    sector TEXT,
    exposure_type TEXT,
    targets TEXT[] DEFAULT '{}'::text[],
    goal TEXT,
    expected_outcomes TEXT,
    ally_contingencies TEXT,
    priority TEXT DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),

    -- Status and adjudication
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'adjudicated', 'abandoned')),
    outcome TEXT
        CHECK (outcome IS NULL OR outcome IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAIL', 'BACKFIRE')),
    adjudication_notes TEXT,
    adjudicated_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,

    -- Optional audit JSON (future use)
    adjudication JSONB,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_actions_session ON actions(session_id);
CREATE INDEX IF NOT EXISTS idx_actions_session_move ON actions(session_id, move);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_is_deleted ON actions(is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_actions_created_at ON actions(created_at DESC);

ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on actions"
    ON actions FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 6. ACTION_LOGS (RESEARCH)
-- ============================================================================
CREATE TABLE IF NOT EXISTS action_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    client_id TEXT,
    changed_by_role TEXT,
    previous_state JSONB,
    new_state JSONB,
    status_from TEXT,
    status_to TEXT,
    transition_duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_action_logs_action ON action_logs(action_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_session ON action_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON action_logs(created_at DESC);

ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on action_logs"
    ON action_logs FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 7. REQUESTS (RFIs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL CHECK (phase >= 1 AND phase <= 5),
    team TEXT NOT NULL DEFAULT 'blue',
    client_id TEXT,

    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
    categories TEXT[] DEFAULT '{}'::text[],
    query TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'withdrawn')),
    response TEXT,
    responded_by TEXT,
    responded_at TIMESTAMPTZ,
    response_time_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_requests_session ON requests(session_id);
CREATE INDEX IF NOT EXISTS idx_requests_session_move ON requests(session_id, move);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on requests"
    ON requests FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 8. COMMUNICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    move INTEGER CHECK (move IS NULL OR (move >= 1 AND move <= 3)),
    phase INTEGER CHECK (phase IS NULL OR (phase >= 1 AND phase <= 5)),
    from_role TEXT NOT NULL,
    to_role TEXT NOT NULL DEFAULT 'all',
    type TEXT NOT NULL CHECK (type IN ('INJECT', 'ANNOUNCEMENT', 'GUIDANCE', 'RFI_RESPONSE')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    client_id TEXT,
    linked_request_id UUID REFERENCES requests(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_communications_session ON communications(session_id);
CREATE INDEX IF NOT EXISTS idx_communications_session_move ON communications(session_id, move);
CREATE INDEX IF NOT EXISTS idx_communications_to_role ON communications(to_role);
CREATE INDEX IF NOT EXISTS idx_communications_linked_request ON communications(linked_request_id);
CREATE INDEX IF NOT EXISTS idx_communications_created_at ON communications(created_at DESC);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on communications"
    ON communications FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 9. TIMELINE
-- ============================================================================
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
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_timeline_session ON timeline(session_id);
CREATE INDEX IF NOT EXISTS idx_timeline_session_move ON timeline(session_id, move);
CREATE INDEX IF NOT EXISTS idx_timeline_team ON timeline(team);
CREATE INDEX IF NOT EXISTS idx_timeline_type ON timeline(type);
CREATE INDEX IF NOT EXISTS idx_timeline_created_at ON timeline(created_at DESC);

ALTER TABLE timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on timeline"
    ON timeline FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 10. NOTETAKER_DATA
-- ============================================================================
CREATE TABLE IF NOT EXISTS notetaker_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL CHECK (phase >= 1 AND phase <= 5),
    team TEXT NOT NULL DEFAULT 'blue',
    client_id TEXT,
    dynamics_analysis JSONB DEFAULT '{}'::jsonb,
    external_factors JSONB DEFAULT '{}'::jsonb,
    observation_timeline JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, move)
);

CREATE INDEX IF NOT EXISTS idx_notetaker_data_session_move ON notetaker_data(session_id, move);
CREATE INDEX IF NOT EXISTS idx_notetaker_data_session ON notetaker_data(session_id);
CREATE INDEX IF NOT EXISTS idx_notetaker_data_move ON notetaker_data(move);

ALTER TABLE notetaker_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on notetaker_data"
    ON notetaker_data FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 11. REPORTS (RESEARCH)
-- ============================================================================
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL CHECK (phase >= 1 AND phase <= 5),
    author_role TEXT NOT NULL DEFAULT 'notetaker',
    client_id TEXT,
    report_type TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_reports_session ON reports(session_id);
CREATE INDEX IF NOT EXISTS idx_reports_session_move ON reports(session_id, move);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on reports"
    ON reports FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 12. MOVE_COMPLETIONS (RESEARCH)
-- ============================================================================
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

CREATE INDEX IF NOT EXISTS idx_move_completions_session ON move_completions(session_id);
CREATE INDEX IF NOT EXISTS idx_move_completions_session_move ON move_completions(session_id, move);
CREATE INDEX IF NOT EXISTS idx_move_completions_created_at ON move_completions(created_at DESC);

ALTER TABLE move_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on move_completions"
    ON move_completions FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 13. GAME_STATE_TRANSITIONS (RESEARCH)
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_state_transitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    transition_type TEXT NOT NULL CHECK (transition_type IN ('move', 'phase')),
    from_value INTEGER,
    to_value INTEGER,
    initiated_by_client_id TEXT,
    initiated_by_role TEXT,
    duration INTEGER, -- seconds
    transition_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    previous_phase_duration_seconds INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_transitions_session ON game_state_transitions(session_id);
CREATE INDEX IF NOT EXISTS idx_transitions_type ON game_state_transitions(transition_type);
CREATE INDEX IF NOT EXISTS idx_transitions_created_at ON game_state_transitions(created_at);

ALTER TABLE game_state_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on game_state_transitions"
    ON game_state_transitions FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 14. PARTICIPANT_ACTIVITY (RESEARCH)
-- ============================================================================
CREATE TABLE IF NOT EXISTS participant_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
    client_id TEXT NOT NULL,
    event_type TEXT NOT NULL
        CHECK (event_type IN ('login', 'logout', 'action_created', 'action_submitted',
                              'rfi_created', 'observation_added', 'page_view', 'idle')),
    event_timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_activity_session ON participant_activity(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_participant ON participant_activity(participant_id);
CREATE INDEX IF NOT EXISTS idx_activity_client ON participant_activity(client_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON participant_activity(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON participant_activity(event_timestamp);

ALTER TABLE participant_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on participant_activity"
    ON participant_activity FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 15. DATA_COMPLETENESS_CHECKS (RESEARCH)
-- ============================================================================
CREATE TABLE IF NOT EXISTS data_completeness_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    move INTEGER,
    phase INTEGER,
    check_type TEXT NOT NULL,
    check_name TEXT NOT NULL,
    is_complete BOOLEAN NOT NULL,
    missing_fields TEXT[],
    checked_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_completeness_session ON data_completeness_checks(session_id);
CREATE INDEX IF NOT EXISTS idx_completeness_move ON data_completeness_checks(move);
CREATE INDEX IF NOT EXISTS idx_completeness_type ON data_completeness_checks(check_type);

ALTER TABLE data_completeness_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on data_completeness_checks"
    ON data_completeness_checks FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 16. ACTION_RELATIONSHIPS (RESEARCH)
-- ============================================================================
CREATE TABLE IF NOT EXISTS action_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    source_action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    target_action_id UUID REFERENCES actions(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN
        ('influenced_by', 'response_to', 'follows', 'replaces', 'refines')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_relationships_source ON action_relationships(source_action_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON action_relationships(target_action_id);
CREATE INDEX IF NOT EXISTS idx_relationships_session ON action_relationships(session_id);

ALTER TABLE action_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on action_relationships"
    ON action_relationships FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 17. RFI_ACTION_LINKS (RESEARCH)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rfi_action_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    link_type TEXT DEFAULT 'informed_by',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rfi_action_request ON rfi_action_links(request_id);
CREATE INDEX IF NOT EXISTS idx_rfi_action_action ON rfi_action_links(action_id);
CREATE INDEX IF NOT EXISTS idx_rfi_action_session ON rfi_action_links(session_id);

ALTER TABLE rfi_action_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on rfi_action_links"
    ON rfi_action_links FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================================
-- TRIGGERS FOR updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_participants_updated_at
    BEFORE UPDATE ON participants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_actions_updated_at
    BEFORE UPDATE ON actions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notetaker_data_updated_at
    BEFORE UPDATE ON notetaker_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- OPTIONAL: Realtime publication
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE session_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE actions;
ALTER PUBLICATION supabase_realtime ADD TABLE action_logs;
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
