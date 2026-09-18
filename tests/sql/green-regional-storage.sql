-- Human-run on a dedicated, fully migrated rehearsal database, as database owner.
-- psql -X -v ON_ERROR_STOP=1 -f tests/sql/green-regional-storage.sql
-- Synthetic fixtures only. Approval below is NOT an exercise roster approval.
-- Everything, including the temporary approval, is rolled back. No trigger is disabled.
BEGIN;
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claims = '{}';

CREATE FUNCTION pg_temp.expect_error(statement TEXT, expected_code TEXT, expected_message TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE <> expected_code OR (expected_message IS NOT NULL AND SQLERRM NOT LIKE '%' || expected_message || '%') THEN
            RAISE EXCEPTION 'Wrong rejection: % / %, expected % / %', SQLSTATE, SQLERRM, expected_code, expected_message;
        END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected rejection %, statement succeeded: %', expected_code, statement;
END;
$$;
CREATE FUNCTION pg_temp.check_true(value BOOLEAN, label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF;
END $$;

CREATE TEMP TABLE gc02_ids(name TEXT PRIMARY KEY, id UUID NOT NULL DEFAULT gen_random_uuid());
INSERT INTO gc02_ids(name) VALUES ('v1'), ('v2'), ('other'), ('pending'), ('unfrozen'), ('retirement'),
    ('ap_user'), ('eu_user'), ('operator_user'), ('ap_participant'), ('eu_participant'),
    ('ap_seat'), ('eu_seat'), ('ap_orientation'), ('eu_orientation'), ('blue_orientation'),
    ('proposal'), ('rfi'), ('thread_root'), ('review'), ('ap_note'), ('eu_note');
GRANT SELECT ON gc02_ids TO authenticated;
CREATE FUNCTION pg_temp.fixture_id(key TEXT) RETURNS UUID LANGUAGE SQL AS $$ SELECT id FROM gc02_ids WHERE name = key $$;

-- Snapshot existing nullable-topology history to detect accidental relabeling.
CREATE TEMP TABLE gc02_legacy_before AS SELECT id, to_jsonb(s) AS record FROM public.sessions s WHERE session_topology_version IS NULL;

INSERT INTO public.green_roster_approvals(version, snapshot, approved_by, approved_at) VALUES (
    'green-roster-v2147483647',
    '{"asian_pacific":[{"entity_id":"fixture-ap","display_label":"Synthetic AP"}],"europe":[{"entity_id":"fixture-eu","display_label":"Synthetic EU"}],"aliases":{},"source_references":["SQL regression fixture only"]}',
    'Synthetic regression fixture; not an exercise approval', '2026-09-18T00:00:00Z'
);
INSERT INTO public.sessions(id, name, status, session_topology_version)
    SELECT id, 'GC02 synthetic ' || name, 'active', CASE WHEN name = 'v1' THEN 1 ELSE 2 END
    FROM gc02_ids WHERE name IN ('v1', 'v2', 'other', 'pending', 'unfrozen');
UPDATE public.sessions SET green_roster_version = a.version,
    green_roster_snapshot = a.snapshot || jsonb_build_object('approved_by', a.approved_by, 'approved_at', a.approved_at)
FROM public.green_roster_approvals a
WHERE a.version = 'green-roster-v2147483647' AND id IN (pg_temp.fixture_id('v2'), pg_temp.fixture_id('other'));
SELECT pg_temp.check_true((SELECT green_roster_snapshot ->> 'approved_by' = 'Synthetic regression fixture; not an exercise approval'
    FROM public.sessions WHERE id = pg_temp.fixture_id('v2')), 'approved roster snapshot persisted');

SELECT pg_temp.expect_error($q$UPDATE public.sessions SET session_topology_version = 99 WHERE id = pg_temp.fixture_id('unfrozen')$q$, '23514');
SELECT pg_temp.expect_error($q$UPDATE public.sessions SET green_roster_version = 'green-roster-v1', green_roster_snapshot = '{}' WHERE id = pg_temp.fixture_id('pending')$q$, '23514', 'UNAPPROVED_ROSTER');
SELECT pg_temp.expect_error($q$UPDATE public.green_roster_approvals SET approved_by = 'changed' WHERE version = 'green-roster-v2147483647'$q$, '23514', 'IMMUTABLE');
SELECT pg_temp.expect_error($q$INSERT INTO public.game_state(session_id) VALUES (pg_temp.fixture_id('pending'))$q$, '23514', 'APPROVED_ROSTER_REQUIRED');
INSERT INTO public.game_state(session_id) SELECT id FROM gc02_ids WHERE name IN ('v1', 'v2', 'other');

INSERT INTO public.participants(id, client_id, name, role, auth_user_id) VALUES
    (pg_temp.fixture_id('ap_participant'), pg_temp.fixture_id('ap_user')::TEXT, 'Synthetic AP', 'green_europe_notetaker', pg_temp.fixture_id('ap_user')),
    (pg_temp.fixture_id('eu_participant'), pg_temp.fixture_id('eu_user')::TEXT, 'Synthetic EU', 'green_asian_pacific_notetaker', pg_temp.fixture_id('eu_user'));
-- Deliberately conflicting GLOBAL roles above prove that seat identity owns scope.
INSERT INTO public.session_participants(id, session_id, participant_id, role, delegation_id) VALUES
    (pg_temp.fixture_id('ap_seat'), pg_temp.fixture_id('v2'), pg_temp.fixture_id('ap_participant'), 'green_asian_pacific_notetaker', 'asian_pacific'),
    (pg_temp.fixture_id('eu_seat'), pg_temp.fixture_id('v2'), pg_temp.fixture_id('eu_participant'), 'green_europe_notetaker', 'europe');
SELECT pg_temp.expect_error($q$UPDATE public.sessions SET session_topology_version = 1, green_roster_version = NULL, green_roster_snapshot = NULL WHERE id = pg_temp.fixture_id('v2')$q$, '23514', 'TOPOLOGY_FROZEN');
SELECT pg_temp.expect_error($q$UPDATE public.session_participants SET delegation_id = 'europe' WHERE id = pg_temp.fixture_id('ap_seat')$q$, '23514');
SELECT pg_temp.expect_error($q$INSERT INTO public.session_participants(session_id, participant_id, role, delegation_id) VALUES (pg_temp.fixture_id('v1'), pg_temp.fixture_id('ap_participant'), 'green_asian_pacific_scribe', 'asian_pacific')$q$, '23514');

INSERT INTO public.actions(id, session_id, move, phase, team, delegation_id, mechanism, sector, artifact_type) VALUES
    (pg_temp.fixture_id('ap_orientation'), pg_temp.fixture_id('v2'), 1, 1, 'green', 'asian_pacific', 'Strategic Orientation', '', 'strategic_orientation_forecast'),
    (pg_temp.fixture_id('eu_orientation'), pg_temp.fixture_id('v2'), 1, 1, 'green', 'europe', 'Strategic Orientation', '', 'strategic_orientation_forecast'),
    (pg_temp.fixture_id('blue_orientation'), pg_temp.fixture_id('v2'), 1, 1, 'blue', NULL, 'Strategic Orientation', '', 'strategic_orientation_selection');
SELECT pg_temp.check_true((SELECT COUNT(*) = 2 FROM public.actions WHERE session_id = pg_temp.fixture_id('v2') AND team = 'green'), 'both regional orientations exist');
SELECT pg_temp.expect_error($q$INSERT INTO public.actions(session_id, move, phase, team, delegation_id, mechanism, sector, artifact_type) VALUES (pg_temp.fixture_id('v2'), 1, 1, 'green', 'europe', 'Strategic Orientation', '', 'strategic_orientation_forecast')$q$, '23505');
SELECT pg_temp.expect_error($q$INSERT INTO public.actions(session_id, move, phase, team, mechanism, sector, artifact_type) VALUES (pg_temp.fixture_id('v2'), 1, 1, 'blue', 'Strategic Orientation', '', 'strategic_orientation_selection')$q$, '23505');
SELECT pg_temp.expect_error($q$INSERT INTO public.actions(session_id, move, phase, team, mechanism, sector) VALUES (pg_temp.fixture_id('v2'), 1, 1, 'green', 'fixture', '')$q$, '23514', 'DELEGATION_REQUIRED');
SELECT pg_temp.expect_error($q$INSERT INTO public.actions(session_id, move, phase, team, delegation_id, mechanism, sector) VALUES (pg_temp.fixture_id('v2'), 1, 1, 'blue', 'europe', 'fixture', '')$q$, '23514', 'UNEXPECTED_DELEGATION');
SELECT pg_temp.expect_error($q$INSERT INTO public.actions(session_id, move, phase, team, delegation_id, mechanism, sector) VALUES (pg_temp.fixture_id('v2'), 1, 1, 'green', 'unknown', 'fixture', '')$q$, '23514');
SELECT pg_temp.expect_error($q$INSERT INTO public.actions(session_id, move, phase, team, delegation_id, mechanism, sector) VALUES (pg_temp.fixture_id('v2'), 1, 1, 'Green', 'europe', 'fixture', '')$q$, '23514', 'NONCANONICAL_TEAM');
SELECT pg_temp.expect_error($q$UPDATE public.actions SET delegation_id = 'europe' WHERE id = pg_temp.fixture_id('ap_orientation')$q$, '23514', 'IMMUTABLE_OWNERSHIP');
SELECT pg_temp.expect_error($q$UPDATE public.actions SET session_id = pg_temp.fixture_id('other') WHERE id = pg_temp.fixture_id('ap_orientation')$q$, '23514', 'IMMUTABLE_SESSION');

INSERT INTO public.actions(session_id, move, phase, team, mechanism, sector, artifact_type)
    VALUES (pg_temp.fixture_id('v1'), 1, 1, 'green', 'Strategic Orientation', '', 'strategic_orientation_forecast');
SELECT pg_temp.expect_error($q$INSERT INTO public.actions(session_id, move, phase, team, mechanism, sector, artifact_type) VALUES (pg_temp.fixture_id('v1'), 1, 1, 'green', 'Strategic Orientation', '', 'strategic_orientation_forecast')$q$, '23505');
SELECT pg_temp.check_true((SELECT bool_and(delegation_id IS NULL) FROM public.actions WHERE session_id = pg_temp.fixture_id('v1')), 'unified records remain unified');
INSERT INTO public.session_participants(session_id, participant_id, role)
    VALUES (pg_temp.fixture_id('v1'), pg_temp.fixture_id('ap_participant'), 'green_facilitator');

INSERT INTO public.requests(id, session_id, move, phase, team, delegation_id, query)
    VALUES (pg_temp.fixture_id('rfi'), pg_temp.fixture_id('v2'), 1, 1, 'green', 'asian_pacific', 'Synthetic RFI');
SELECT pg_temp.expect_error($q$INSERT INTO public.requests(session_id, move, phase, team, query) VALUES (pg_temp.fixture_id('v2'), 1, 1, 'green', 'ambiguous fixture')$q$, '23514', 'DELEGATION_REQUIRED');
INSERT INTO public.artifact_workflow_reviews(id, session_id, artifact_kind, artifact_id, artifact_type, team,
    decision, revision_number, next_revision_number, prior_status, status_to, workflow_state_to,
    reviewer_auth_user_id, reviewer_role, reviewer_notes, prior_state, new_state)
    SELECT pg_temp.fixture_id('review'), session_id, 'rfi', id, 'rfi', team, 'return_for_clarification',
        1, 2, 'pending', 'pending', 'returned_to_team', pg_temp.fixture_id('operator_user'), 'whitecell_lead',
        'Synthetic storage snapshot fixture', to_jsonb(r), to_jsonb(r)
    FROM public.requests r WHERE id = pg_temp.fixture_id('rfi');
SELECT pg_temp.check_true((SELECT delegation_id = 'asian_pacific' AND prior_state ->> 'delegation_id' = delegation_id
    FROM public.artifact_workflow_reviews WHERE id = pg_temp.fixture_id('review')), 'review derives owner and preserves snapshot');
SELECT pg_temp.expect_error($q$UPDATE public.artifact_workflow_reviews SET delegation_id = 'europe' WHERE id = pg_temp.fixture_id('review')$q$, '23514', 'IMMUTABLE');

INSERT INTO public.actions(id, session_id, move, phase, team, delegation_id, mechanism, sector, artifact_type, proposal_recipient_team)
    VALUES (pg_temp.fixture_id('proposal'), pg_temp.fixture_id('v2'), 1, 1, 'green', 'asian_pacific', 'Proposal', '', 'proposal', 'blue');
-- Exercise the CASE-based owner comparison that previously failed to compile.
SELECT pg_temp.expect_error($q$INSERT INTO public.communications(session_id, move, from_role, to_role, type, content, delegation_id)
    VALUES (pg_temp.fixture_id('v2'), 1, 'green_asian_pacific_facilitator', 'white_cell', 'ANNOUNCEMENT',
        'Synthetic conflicting owner', 'europe')$q$, '23514', 'COMMUNICATION_SCOPE_CONFLICT');
INSERT INTO public.communications(id, session_id, move, from_role, to_role, type, content, metadata)
    VALUES (pg_temp.fixture_id('thread_root'), pg_temp.fixture_id('v2'), 1, 'white_cell', 'blue', 'PROPOSAL_FORWARDED',
        'Synthetic storage thread root', jsonb_build_object('source_proposal_id', pg_temp.fixture_id('proposal'),
            'source_team', 'green', 'recipient_team', 'blue', 'thread_id', gen_random_uuid(), 'round_number', 0, 'source_revision', 1));
SELECT pg_temp.check_true((SELECT owner_team = 'green' AND delegation_id = 'asian_pacific'
    AND sender_delegation_id IS NULL AND recipient_delegation_id IS NULL
    AND metadata #>> '{proposal,ownership_scope,delegation_id}' = 'asian_pacific'
    AND NOT ((metadata -> 'proposal') ?| ARRAY['recipientTeams', 'intendedPartners'])
    FROM public.communications WHERE id = pg_temp.fixture_id('thread_root')), 'thread source scope survives redacted snapshot');
SELECT pg_temp.expect_error($q$INSERT INTO public.communications(session_id, move, from_role, to_role, type, content, metadata)
    SELECT session_id, move, 'blue_scribe', 'green', 'PROPOSAL_RESPONSE', 'synthetic wrong thread',
        metadata || jsonb_build_object('parent_message_id', id, 'round_number', 1, 'thread_id', gen_random_uuid())
    FROM public.communications WHERE id = pg_temp.fixture_id('thread_root')$q$, '23514', 'THREAD_PARENT_MISMATCH');
SELECT pg_temp.expect_error($q$INSERT INTO public.communications(session_id, move, from_role, to_role, type, content, metadata)
    SELECT session_id, move, 'green_europe_facilitator', 'blue', 'PROPOSAL_RESPONSE', 'synthetic wrong region',
        metadata || jsonb_build_object('parent_message_id', id, 'round_number', 1)
    FROM public.communications WHERE id = pg_temp.fixture_id('thread_root')$q$, '23514', 'THREAD_SENDER_MISMATCH');
SELECT pg_temp.expect_error($q$INSERT INTO public.communications(session_id, move, from_role, to_role, type, content, linked_request_id) VALUES (pg_temp.fixture_id('other'), 1, 'white_cell', 'green', 'rfi_response', 'cross session', pg_temp.fixture_id('rfi'))$q$, '23514', 'SOURCE_MISMATCH');
SELECT pg_temp.expect_error($q$INSERT INTO public.communications(session_id, move, from_role, to_role, type, content) VALUES (pg_temp.fixture_id('v2'), 1, 'white_cell', 'green', 'ANNOUNCEMENT', 'ambiguous')$q$, '23514', 'AMBIGUOUS_GREEN');
INSERT INTO public.communications(session_id, move, from_role, to_role, type, content, recipient_scope)
    VALUES (pg_temp.fixture_id('v2'), 1, 'white_cell', 'green', 'ANNOUNCEMENT', 'Synthetic shared audience', 'both_green_delegations');
INSERT INTO public.timeline(session_id, move, phase, team, type, content, metadata)
    VALUES (pg_temp.fixture_id('v2'), 1, 1, 'white_cell', 'PROPOSAL_FORWARDED', 'Synthetic timeline',
        jsonb_build_object('related_id', pg_temp.fixture_id('proposal'), 'communication_id', pg_temp.fixture_id('thread_root')));
SELECT pg_temp.check_true((SELECT bool_and(delegation_id = 'asian_pacific' AND owner_team = 'green')
    FROM public.timeline WHERE session_id = pg_temp.fixture_id('v2')), 'timeline keeps source ownership separately from operator');
SELECT pg_temp.expect_error($q$INSERT INTO public.timeline(session_id, move, phase, team, type, content, metadata) VALUES (pg_temp.fixture_id('other'), 1, 1, 'white_cell', 'NOTE', 'cross session', jsonb_build_object('related_id', pg_temp.fixture_id('proposal')))$q$, '23514', 'SOURCE_MISMATCH');
SELECT pg_temp.expect_error($q$INSERT INTO public.rfi_action_links(session_id, request_id, action_id) VALUES (pg_temp.fixture_id('v2'), pg_temp.fixture_id('rfi'), pg_temp.fixture_id('eu_orientation'))$q$, '23514', 'LINK_SCOPE_MISMATCH');

INSERT INTO public.scoped_notetaker_data(id, session_id, session_participant_id, team, delegation_id, move, phase, dynamics_analysis) VALUES
    (pg_temp.fixture_id('ap_note'), pg_temp.fixture_id('v2'), pg_temp.fixture_id('ap_seat'), 'green', 'asian_pacific', 1, 1, '{"summary":"AP private synthetic"}'),
    (pg_temp.fixture_id('eu_note'), pg_temp.fixture_id('v2'), pg_temp.fixture_id('eu_seat'), 'green', 'europe', 1, 1, '{"summary":"EU private synthetic"}');
SELECT pg_temp.expect_error($q$UPDATE public.scoped_notetaker_data SET dynamics_analysis = '{"team_entries":{"green":{}}}' WHERE id = pg_temp.fixture_id('ap_note')$q$, '23514');
SELECT pg_temp.expect_error($q$UPDATE public.scoped_notetaker_data SET session_participant_id = pg_temp.fixture_id('eu_seat') WHERE id = pg_temp.fixture_id('ap_note')$q$, '23514');
SELECT pg_temp.expect_error($q$INSERT INTO public.notetaker_data(session_id, move, phase, team) VALUES (pg_temp.fixture_id('v2'), 1, 1, 'green')$q$, '23514', 'SHARED_NOTES_FORBIDDEN');

-- Real PostgreSQL RLS under separate auth identities, not a mocked policy engine.
-- A missing JWT must not turn a browser database role into a privileged writer.
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$INSERT INTO public.actions(session_id, move, phase, team, delegation_id, mechanism, sector)
    VALUES (pg_temp.fixture_id('v2'), 1, 1, 'green', 'europe', 'Synthetic no-JWT write', '')$q$,
    '42501', 'ACTIVATION_PENDING');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', pg_temp.fixture_id('ap_user')::TEXT, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_true((SELECT COUNT(*) = 1 FROM public.scoped_notetaker_data WHERE session_id = pg_temp.fixture_id('v2')), 'AP receives one seat row');
SELECT pg_temp.check_true((SELECT COUNT(*) = 0 FROM public.scoped_notetaker_data WHERE id = pg_temp.fixture_id('eu_note')), 'AP cannot read Europe JSON by ID');
SELECT pg_temp.check_true((SELECT COUNT(*) = 0 FROM public.actions WHERE session_id = pg_temp.fixture_id('v2')), 'legacy permissive policies cannot expose v2 artifacts');
SELECT pg_temp.check_true((SELECT COUNT(*) = 1 FROM public.actions WHERE session_id = pg_temp.fixture_id('v1')), 'unified session action reads remain compatible');
SELECT pg_temp.expect_error($q$SELECT public.append_proposal_thread_message(pg_temp.fixture_id('thread_root'), 'fixture', 'negotiation_message', NULL, 'fixture-retry')$q$, '42501', 'ACTIVATION_PENDING');
SELECT pg_temp.expect_error($q$SELECT public.gc02_unified_append_proposal_thread_message(pg_temp.fixture_id('thread_root'), 'fixture', 'negotiation_message', NULL, 'fixture-retry')$q$, '42501');
SELECT pg_temp.expect_error($q$SELECT public.save_scoped_notetaker_data(pg_temp.fixture_id('v2'), 1, 1, '{}', '{}', '[]', 1)$q$, '42501', 'ACTIVATION_PENDING');
SELECT pg_temp.expect_error($q$SELECT public.export_green_storage_evidence(pg_temp.fixture_id('v2'))$q$, '42501');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', pg_temp.fixture_id('eu_user')::TEXT, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_true((SELECT COUNT(*) = 1 FROM public.scoped_notetaker_data WHERE id = pg_temp.fixture_id('eu_note')), 'Europe receives its row despite conflicting global role');
SELECT pg_temp.check_true((SELECT COUNT(*) = 0 FROM public.scoped_notetaker_data WHERE id = pg_temp.fixture_id('ap_note')), 'Europe cannot read AP JSON');
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
UPDATE public.session_participants SET is_active = false WHERE id = pg_temp.fixture_id('ap_seat');
SELECT set_config('request.jwt.claim.sub', pg_temp.fixture_id('ap_user')::TEXT, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_true((SELECT COUNT(*) = 0 FROM public.scoped_notetaker_data WHERE session_id = pg_temp.fixture_id('v2')), 'revoked seat loses notes');
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';

-- Retained freeze marker survives the removal of the last seat in a seat-only session.
INSERT INTO public.session_participants(session_id, participant_id, role, delegation_id)
    VALUES (pg_temp.fixture_id('other'), pg_temp.fixture_id('ap_participant'), 'green_asian_pacific_scribe', 'asian_pacific');
DELETE FROM public.session_participants WHERE session_id = pg_temp.fixture_id('other');
SELECT pg_temp.expect_error($q$UPDATE public.sessions SET green_roster_version = NULL, green_roster_snapshot = NULL WHERE id = pg_temp.fixture_id('other')$q$, '23514', 'TOPOLOGY_FROZEN');
SELECT pg_temp.check_true(NOT EXISTS (SELECT 1 FROM gc02_legacy_before b JOIN public.sessions s USING(id)
    WHERE b.record IS DISTINCT FROM to_jsonb(s)), 'existing nullable-topology history unchanged');

INSERT INTO public.operator_grants(auth_user_id, surface, role)
    VALUES (pg_temp.fixture_id('operator_user'), 'gamemaster', 'white');
-- Retirement may write the first evidence after the session becomes immutable.
INSERT INTO public.sessions(id, name, status, session_topology_version)
    VALUES (pg_temp.fixture_id('retirement'), 'GC02 synthetic empty archive', 'archived', 1);
SELECT set_config('request.jwt.claim.sub', pg_temp.fixture_id('operator_user')::TEXT, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_true((public.delete_live_demo_session(pg_temp.fixture_id('retirement')) ->> 'status') = 'deleted',
    'legacy retirement can append its first audit event without mutating a tombstone');
SELECT pg_temp.check_true(EXISTS (SELECT 1 FROM public.research_audit_event_log
    WHERE session_id = pg_temp.fixture_id('retirement') AND event_type = 'SESSION_DELETED'),
    'retirement retains its evidence');
SELECT pg_temp.check_true((public.export_green_storage_evidence(pg_temp.fixture_id('v2')) #>> '{session,green_roster_version}')
    = 'green-roster-v2147483647', 'raw export preserves approved version');
SELECT pg_temp.check_true(jsonb_array_length(public.export_green_storage_evidence(pg_temp.fixture_id('v2')) -> 'scoped_notetaker_data') = 2,
    'operator export retains both private note rows, including revoked authors');
SELECT pg_temp.check_true((public.export_green_storage_evidence(pg_temp.fixture_id('v2')) #>> '{reviews,0,prior_state,delegation_id}') = 'asian_pacific',
    'raw export retains original review snapshot scope');
RESET ROLE;

SELECT 'GC-02 storage assertions completed; transaction will roll back' AS result;
ROLLBACK;
