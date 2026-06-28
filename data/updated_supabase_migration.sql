-- ESG Simulation Platform - Migration Script
-- Authoritative schema: updated_supabase_schema.sql (Jan 23, 2026)
--
-- Purpose:
-- 1) Ensure all tables from updated_supabase_schema.sql exist
-- 2) Add/rename columns to match updated schema
-- 3) Backfill legacy fields where possible
-- 4) Ensure realtime publication includes all tables

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1) CREATE TABLES (idempotent)
-- ============================================================================

-- sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- participants
CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT,
    demographics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- session_participants
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

-- game_state
CREATE TABLE IF NOT EXISTS game_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    move INTEGER NOT NULL DEFAULT 1 CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL DEFAULT 1 CHECK (phase >= 1 AND phase <= 5),
    timer_seconds INTEGER DEFAULT 5400,
    timer_allocations JSONB NOT NULL DEFAULT '{"strategic_orientation":5400,"move_1":5400,"move_2":5400,"move_3":5400}'::jsonb,
    plugin_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    timer_running BOOLEAN DEFAULT false,
    timer_last_update TIMESTAMPTZ,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- actions
CREATE TABLE IF NOT EXISTS actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    move INTEGER NOT NULL CHECK (move >= 1 AND move <= 3),
    phase INTEGER NOT NULL CHECK (phase >= 1 AND phase <= 5),
    team TEXT NOT NULL DEFAULT 'blue',
    client_id TEXT,
    mechanism TEXT NOT NULL,
    sector TEXT,
    exposure_type TEXT,
    targets TEXT[] DEFAULT '{}'::text[],
    goal TEXT,
    expected_outcomes TEXT,
    ally_contingencies TEXT,
    priority TEXT DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'adjudicated', 'abandoned')),
    outcome TEXT
        CHECK (outcome IS NULL OR outcome IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAIL', 'BACKFIRE')),
    adjudication_notes TEXT,
    adjudicated_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    adjudication JSONB,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ
);

-- action_logs
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

-- requests
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

-- communications
CREATE TABLE IF NOT EXISTS communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    move INTEGER CHECK (move IS NULL OR (move >= 1 AND move <= 3)),
    phase INTEGER CHECK (phase IS NULL OR (phase >= 1 AND phase <= 5)),
    from_role TEXT NOT NULL,
    to_role TEXT NOT NULL DEFAULT 'all',
    type TEXT NOT NULL CHECK (
        type IN (
            'INJECT',
            'ANNOUNCEMENT',
            'GUIDANCE',
            'RFI_RESPONSE',
            'PROPOSAL_FORWARDED',
            'PROPOSAL_RESPONSE'
        )
    ),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    client_id TEXT,
    linked_request_id UUID REFERENCES requests(id) ON DELETE SET NULL
);

-- timeline
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

-- notetaker_data
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

-- reports
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

-- move_completions
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

-- game_state_transitions
CREATE TABLE IF NOT EXISTS game_state_transitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    transition_type TEXT NOT NULL CHECK (transition_type IN ('move', 'phase')),
    from_value INTEGER,
    to_value INTEGER,
    initiated_by_client_id TEXT,
    initiated_by_role TEXT,
    duration INTEGER,
    transition_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    previous_phase_duration_seconds INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- participant_activity
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

-- data_completeness_checks
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

-- action_relationships
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

-- rfi_action_links
CREATE TABLE IF NOT EXISTS rfi_action_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    link_type TEXT DEFAULT 'informed_by',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2) ADD / RENAME COLUMNS (safe idempotent)
-- ============================================================================

-- game_state legacy columns
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'game_state' AND column_name = 'current_move'
    ) THEN
        EXECUTE 'ALTER TABLE game_state RENAME COLUMN current_move TO move';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'game_state' AND column_name = 'current_phase'
    ) THEN
        EXECUTE 'ALTER TABLE game_state RENAME COLUMN current_phase TO phase';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'game_state' AND column_name = 'last_update'
    ) THEN
        EXECUTE 'ALTER TABLE game_state RENAME COLUMN last_update TO timer_last_update';
    END IF;
END$$;

-- actions legacy columns backfill
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'actions' AND column_name = 'title'
    ) THEN
        EXECUTE 'UPDATE actions SET goal = COALESCE(goal, title) WHERE title IS NOT NULL';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'actions' AND column_name = 'description'
    ) THEN
        EXECUTE 'UPDATE actions SET expected_outcomes = COALESCE(expected_outcomes, description) WHERE description IS NOT NULL';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'actions' AND column_name = 'target'
    ) THEN
        EXECUTE 'UPDATE actions SET targets = CASE WHEN targets IS NULL OR array_length(targets, 1) IS NULL THEN ARRAY[target]::text[] ELSE targets END WHERE target IS NOT NULL';
    END IF;
END$$;

-- timeline legacy columns backfill
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'timeline' AND column_name = 'event_type'
    ) THEN
        EXECUTE 'UPDATE timeline SET type = COALESCE(type, event_type) WHERE event_type IS NOT NULL';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'timeline' AND column_name = 'description'
    ) THEN
        EXECUTE 'UPDATE timeline SET content = COALESCE(content, description) WHERE description IS NOT NULL';
    END IF;
END$$;

-- requests legacy responded_at backfill (if answered_at existed)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'requests' AND column_name = 'answered_at'
    ) THEN
        EXECUTE 'UPDATE requests SET responded_at = COALESCE(responded_at, answered_at) WHERE answered_at IS NOT NULL';
    END IF;
END$$;

-- notetaker_data legacy data_type/data backfill
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notetaker_data' AND column_name = 'data_type'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notetaker_data' AND column_name = 'data'
    ) THEN
        EXECUTE 'UPDATE notetaker_data SET dynamics_analysis = data WHERE data_type = ''dynamics'' AND (dynamics_analysis IS NULL OR dynamics_analysis = ''{}''::jsonb)';
        EXECUTE 'UPDATE notetaker_data SET external_factors = data WHERE data_type IN (''alliance'', ''external'') AND (external_factors IS NULL OR external_factors = ''{}''::jsonb)';
    END IF;
END$$;

-- ============================================================================
-- 3) TRIGGERS FOR updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_sessions_updated_at') THEN
        EXECUTE 'CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_participants_updated_at') THEN
        EXECUTE 'CREATE TRIGGER update_participants_updated_at BEFORE UPDATE ON participants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_actions_updated_at') THEN
        EXECUTE 'CREATE TRIGGER update_actions_updated_at BEFORE UPDATE ON actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_notetaker_data_updated_at') THEN
        EXECUTE 'CREATE TRIGGER update_notetaker_data_updated_at BEFORE UPDATE ON notetaker_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
END$$;

-- ============================================================================
-- 4) REALTIME PUBLICATION (idempotent)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'sessions') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE sessions';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'game_state') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE game_state';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'participants') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE participants';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'session_participants') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE session_participants';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'actions') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE actions';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'action_logs') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE action_logs';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'requests') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE requests';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'communications') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE communications';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'timeline') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE timeline';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notetaker_data') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE notetaker_data';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reports') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE reports';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'move_completions') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE move_completions';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'game_state_transitions') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE game_state_transitions';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'participant_activity') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE participant_activity';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'data_completeness_checks') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE data_completeness_checks';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'action_relationships') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE action_relationships';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'rfi_action_links') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE rfi_action_links';
    END IF;
END$$;

-- ============================================================================
-- 5) VERIFICATION QUERIES
-- ============================================================================

-- Verify all tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'sessions', 'participants', 'session_participants', 'game_state',
    'actions', 'action_logs', 'requests', 'communications', 'timeline',
    'notetaker_data', 'reports', 'move_completions', 'game_state_transitions',
    'participant_activity', 'data_completeness_checks', 'action_relationships',
    'rfi_action_links'
  )
ORDER BY table_name;

-- Verify realtime publication membership
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
