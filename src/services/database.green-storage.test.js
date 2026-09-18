import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildScopedNotetakerWrite } from '../features/notetaker/storage.js';

const { supabase, ensureBrowserIdentity } = vi.hoisted(() => ({
    supabase: { rpc: vi.fn(), from: vi.fn() },
    ensureBrowserIdentity: vi.fn().mockResolvedValue({ user: { id: 'authenticated-browser' } })
}));
vi.mock('./supabase.js', () => ({ supabase, ensureBrowserIdentity, getRuntimeConfigStatus: () => ({ ready: true }) }));
vi.mock('../stores/session.js', () => ({ sessionStore: { getClientId: () => 'browser-client' } }));

import { database, mergeNotetakerRecord, normalizeArtifactWorkflowRecord } from './database.js';

describe('GC-02 database storage boundary', () => {
    beforeEach(() => vi.clearAllMocks());

    it('passes topology and an approval identifier, never browser-authored roster approval', async () => {
        const session = { id: 'session', session_topology_version: 2, green_roster_version: null };
        supabase.rpc.mockResolvedValueOnce({ data: session, error: null });
        await expect(database.configureSessionGreenTopology('session', 2)).resolves.toEqual(session);
        expect(supabase.rpc).toHaveBeenCalledWith('configure_session_green_topology', {
            requested_session_id: 'session', requested_topology_version: 2, requested_roster_version: null
        });
    });

    it('does not silently create unified sessions when a caller asks for regional topology', async () => {
        await expect(database.createSession({ name: 'test', session_topology_version: 2 })).rejects.toThrow('configure');
        expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('keeps legacy records unlabeled and preserves authoritative delegation through normalization', () => {
        const legacy = normalizeArtifactWorkflowRecord({ id: 'legacy', team: 'green', status: 'draft' });
        expect(legacy).not.toHaveProperty('delegation_id');
        const regional = normalizeArtifactWorkflowRecord({
            id: 'regional', team: 'green', delegation_id: 'europe', status: 'submitted',
            revision_number: 3, artifact_payload: { ownership_scope: { green_roster_version: 'test-fixture' } }
        });
        expect(regional.delegation_id).toBe('europe');
        expect(regional.revision_number).toBe(3);
        expect(regional.artifact_payload.ownership_scope.green_roster_version).toBe('test-fixture');
    });

    it('never merges regional notes into the legacy shared JSON row', async () => {
        const regional = { session_id: 'session', team: 'green', delegation_id: 'europe' };
        expect(() => mergeNotetakerRecord(null, regional)).toThrow('shared JSON');
        expect(() => mergeNotetakerRecord(regional, { team: 'green' })).toThrow('shared JSON');
        await expect(database.saveNotetakerData({ session_topology_version: 2 })).rejects.toThrow('shared JSON');
        expect(supabase.from).not.toHaveBeenCalled();
    });

    it('does not transmit caller-supplied seat, team or delegation as note authority', () => {
        const payload = buildScopedNotetakerWrite({
            session_id: 'session', move: 1, phase: 2, expected_revision: 0,
            team: 'green', delegation_id: 'europe', session_participant_id: 'spoofed',
            dynamics_analysis: { summary: 'Synthetic fixture' }
        });
        expect(payload).toEqual({
            requested_session_id: 'session', requested_move: 1, requested_phase: 2,
            requested_expected_revision: 0, requested_dynamics: { summary: 'Synthetic fixture' },
            requested_external: {}, requested_observations: []
        });
    });

    it('rejects multi-seat ledger wrappers and missing concurrency revisions', () => {
        const base = { session_id: 'session', move: 1, phase: 1, expected_revision: 0 };
        expect(() => buildScopedNotetakerWrite({ ...base, dynamics_analysis: { team_entries: {} } })).toThrow('shared');
        expect(() => buildScopedNotetakerWrite({ ...base, external_factors: { participant_entries: {} } })).toThrow('shared');
        expect(() => buildScopedNotetakerWrite({ ...base, expected_revision: null })).toThrow('revision');
    });

    it('propagates the activation/stale-write error without retrying in shared storage', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'GC02_REGIONAL_ACTIVATION_PENDING_GC03' } });
        await expect(database.saveScopedNotetakerData({
            session_id: 'session', move: 1, phase: 1, expected_revision: 0
        })).rejects.toThrow();
        expect(supabase.rpc).toHaveBeenCalledTimes(1);
        expect(supabase.from).not.toHaveBeenCalled();
    });

    it('returns raw evidence without dropping topology, revisions, scope or snapshots', async () => {
        const evidence = {
            storage_evidence_version: 'gc02-1',
            session: { session_topology_version: 2, green_roster_version: 'test-fixture' },
            communications: [{ delegation_id: 'europe', sender_delegation_id: null, recipient_delegation_id: 'europe', metadata: { round_number: 2 } }],
            reviews: [{ delegation_id: 'europe', prior_state: { revision_number: 1 }, new_state: { revision_number: 2 } }]
        };
        supabase.rpc.mockResolvedValueOnce({ data: evidence, error: null });
        await expect(database.fetchRegionalStorageEvidence('session')).resolves.toEqual(evidence);
        expect(supabase.rpc).toHaveBeenCalledWith('export_green_storage_evidence', { requested_session_id: 'session' });
        supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } });
        await expect(database.fetchRegionalStorageEvidence('session')).rejects.toThrow();
    });

    it('blocks regional publication exports until all publication projections preserve scope', async () => {
        const spies = [
            vi.spyOn(database, 'fetchSessionBundle').mockResolvedValue({ session: { session_topology_version: 2 } }),
            vi.spyOn(database, 'fetchCommunications').mockResolvedValue([]),
            vi.spyOn(database, 'fetchNotetakerData').mockResolvedValue([]),
            vi.spyOn(database, 'getResearchCaptureMode').mockResolvedValue('research'),
            vi.spyOn(database, 'getResearchBuildHash').mockResolvedValue(null),
            vi.spyOn(database, 'fetchResearchTable').mockResolvedValue([])
        ];
        try {
            await expect(database.fetchResearchExportBundle('session')).rejects.toThrow('GC-11');
        } finally {
            spies.forEach((spy) => spy.mockRestore());
        }
    });
});
