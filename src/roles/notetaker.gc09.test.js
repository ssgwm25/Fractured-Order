import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../components/ui/Toast.js', () => ({ showToast: vi.fn() }));
import { showToast } from '../components/ui/Toast.js';
import { database } from '../services/database.js';
import { sessionStore } from '../stores/session.js';
import { resolveTeamContext } from '../core/teamContext.js';
import { NotetakerController } from './notetaker.js';

const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

describe('GC09 Notetaker controller scoped persistence (mock, not hosted evidence)', () => {
    let seat, controller, fields, stored;
    const row = (patch = {}) => ({
        id: 'note', session_id: 'session', session_participant_id: seat.participantId,
        team: 'green', delegation_id: seat.delegationId, move: 1, phase: 1, revision: 3,
        dynamics_analysis: { dynamicsSummary: 'Saved dynamics' },
        external_factors: { allianceNotes: 'Saved alliance' },
        observation_timeline: [{ id: 'capture-old', type: 'QUOTE', content: 'Saved quote', timestamp: '2026-09-21T12:00:00Z', phase: 1 }],
        ...patch
    });
    beforeEach(() => {
        seat = { sessionId: 'session', participantId: 'seat-asian_pacific', topology: 2,
            teamId: 'green', delegationId: 'asian_pacific', surface: 'notetaker',
            role: 'green_asian_pacific_notetaker', greenSeatModel: 'shared_facilitator_v1' };
        vi.spyOn(sessionStore, 'getConfirmedSeat').mockImplementation(() => seat);
        vi.spyOn(sessionStore, 'getSessionId').mockReturnValue('session');
        vi.spyOn(sessionStore, 'getSessionParticipantId').mockImplementation(() => seat?.participantId);
        vi.spyOn(sessionStore, 'getClientId').mockReturnValue('client');
        fields = Object.fromEntries(['dynamicsSummary', 'allianceNotes', 'captureContent', 'dynamicsAutoSave', 'allianceAutoSave']
            .map((id) => [id, { value: '', dataset: {}, textContent: '' }]));
        vi.stubGlobal('document', {
            body: { dataset: { team: 'green' } }, getElementById: (id) => fields[id] || null,
            querySelector: () => ({ value: 'NOTE' }), querySelectorAll: () => []
        });
        controller = new NotetakerController();
        controller.teamContext = resolveTeamContext({ seat });
        controller.teamId = 'green';
        vi.spyOn(controller, 'getCurrentGameState').mockReturnValue({ move: 1, phase: 1 });
        vi.spyOn(controller, 'renderCaptures').mockImplementation(() => {});
        vi.spyOn(controller, 'renderTimeline').mockImplementation(() => {});
        stored = row();
        vi.spyOn(database, 'fetchScopedNotetakerData').mockImplementation(async () => [stored]);
        vi.spyOn(database, 'saveScopedNotetakerData').mockImplementation(async (payload) => {
            stored = row({ ...payload, revision: payload.expected_revision + 1 });
            return stored;
        });
        vi.spyOn(database, 'getNotetakerData').mockResolvedValue(null);
        vi.spyOn(database, 'saveNotetakerData').mockResolvedValue({});
        vi.spyOn(database, 'createTimelineEvent').mockResolvedValue({ id: 'timeline', type: 'NOTE' });
        showToast.mockClear();
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    it.each(['asian_pacific', 'europe'])('hydrates and persists %s dynamics, alliances and captures through scoped APIs', async (region) => {
        seat = { ...seat, delegationId: region, role: `green_${region}_notetaker`, participantId: `seat-${region}` };
        controller.teamContext = resolveTeamContext({ seat });
        stored = row();
        await controller.loadCurrentMoveData();
        expect(database.fetchScopedNotetakerData).toHaveBeenCalledWith('session', 1);
        expect(fields.dynamicsSummary.value).toBe('Saved dynamics');
        expect(controller.captures[0].content).toBe('Saved quote');
        controller.dynamicsData = { dynamicsSummary: 'New dynamics' };
        await controller.saveDynamicsData({ emitTimelineEvent: true });
        controller.allianceData = { allianceNotes: 'New alliance' };
        await controller.saveAllianceData({ emitTimelineEvent: true });
        fields.captureContent.value = 'New observation';
        await controller.handleCaptureSubmit({ preventDefault: vi.fn() });
        expect(database.saveScopedNotetakerData.mock.calls.map(([p]) => p.expected_revision)).toEqual([3, 4, 5]);
        expect(stored.dynamics_analysis.dynamicsSummary).toBe('New dynamics');
        expect(stored.external_factors.allianceNotes).toBe('New alliance');
        expect(stored.observation_timeline.map((entry) => entry.content)).toEqual(['Saved quote', 'New observation']);
        expect(database.saveScopedNotetakerData.mock.calls[0][0]).not.toHaveProperty('session_participant_id');
        expect(database.saveScopedNotetakerData.mock.calls[0][0]).not.toHaveProperty('delegation_id');
        expect(database.createTimelineEvent).not.toHaveBeenCalled();
        expect(database.getNotetakerData).not.toHaveBeenCalled();
        expect(database.saveNotetakerData).not.toHaveBeenCalled();
        expect(fields.captureContent.value).toBe('');
        await controller.loadCurrentMoveData();
        expect(fields.dynamicsSummary.value).toBe('New dynamics');
        expect(fields.allianceNotes.value).toBe('New alliance');
        expect(controller.captures.map((entry) => entry.content)).toContain('New observation');
    });

    it('serializes overlapping section saves and a capture without overwriting another section', async () => {
        await controller.loadCurrentMoveData();
        const gate = deferred();
        database.saveScopedNotetakerData.mockImplementationOnce(async (p) => {
            await gate.promise;
            return row({ ...p, revision: 4 });
        });
        controller.dynamicsData = { dynamicsSummary: 'Queued dynamics' };
        const dynamics = controller.saveDynamicsData();
        controller.allianceData = { allianceNotes: 'Queued alliance' };
        const alliance = controller.saveAllianceData();
        fields.captureContent.value = 'Queued observation';
        const capture = controller.handleCaptureSubmit({ preventDefault: vi.fn() });
        await Promise.resolve();
        expect(database.saveScopedNotetakerData).toHaveBeenCalledTimes(1);
        gate.resolve();
        await Promise.all([dynamics, alliance, capture]);
        expect(stored).toMatchObject({ revision: 6, dynamics_analysis: { dynamicsSummary: 'Queued dynamics' }, external_factors: { allianceNotes: 'Queued alliance' } });
        expect(stored.observation_timeline).toHaveLength(2);
    });

    it('uses expected revision zero only after a successful empty hydration', async () => {
        database.fetchScopedNotetakerData.mockResolvedValue([]);
        await controller.loadCurrentMoveData();
        await controller.saveDynamicsData();
        expect(database.saveScopedNotetakerData).toHaveBeenCalledWith(expect.objectContaining({ expected_revision: 0 }));
    });

    it.each(['denied', 'foreign'])('fails closed on %s hydration without falling back to shared storage', async (failure) => {
        if (failure === 'denied') database.fetchScopedNotetakerData.mockRejectedValue(new Error('42501'));
        else database.fetchScopedNotetakerData.mockResolvedValue([row({ session_participant_id: 'foreign' })]);
        await controller.loadCurrentMoveData();
        await controller.saveDynamicsData();
        expect(database.saveScopedNotetakerData).not.toHaveBeenCalled();
        expect(database.saveNotetakerData).not.toHaveBeenCalled();
        expect(fields.dynamicsSummary.value).toBe('');
        expect(fields.dynamicsAutoSave.textContent).toContain('reload');
    });

    it.each(['PT409', '42501', 'lost response'])('retains drafts and stops queued writes after %s until reload', async (message) => {
        await controller.loadCurrentMoveData();
        database.saveScopedNotetakerData.mockRejectedValueOnce(new Error(message));
        fields.captureContent.value = 'Keep this draft';
        const capture = controller.handleCaptureSubmit({ preventDefault: vi.fn() });
        const alliance = controller.saveAllianceData();
        await Promise.all([capture, alliance]);
        await controller.saveDynamicsData();
        expect(database.saveScopedNotetakerData).toHaveBeenCalledTimes(1);
        expect(fields.captureContent.value).toBe('Keep this draft');
        expect(controller.observationTimeline).toHaveLength(1);
        expect(fields.allianceAutoSave.textContent).toContain('reload');
        await controller.loadCurrentMoveData();
        await controller.saveDynamicsData();
        expect(database.saveScopedNotetakerData).toHaveBeenCalledTimes(2);
    });

    it('does not hydrate a new move from a late previous-move response', async () => {
        const gate = deferred();
        database.fetchScopedNotetakerData.mockReturnValueOnce(gate.promise).mockResolvedValueOnce([row({ move: 2, dynamics_analysis: { dynamicsSummary: 'Move two' } })]);
        const previous = controller.loadCurrentMoveData();
        controller.currentMove = 2;
        await controller.loadCurrentMoveData();
        gate.resolve([row()]);
        await previous;
        expect(fields.dynamicsSummary.value).toBe('Move two');
    });

    it('ignores hydration completed after revocation', async () => {
        const gate = deferred();
        database.fetchScopedNotetakerData.mockReturnValueOnce(gate.promise);
        const pending = controller.loadCurrentMoveData();
        controller.seatInvalidated = true;
        gate.resolve([row()]);
        await pending;
        expect(fields.dynamicsSummary.value).toBe('');
        expect(controller.observationTimeline).toEqual([]);
        expect(controller.scopedNotes.ready).toBe(false);
    });

    it('rejects a mismatched save acknowledgement and never advances the revision', async () => {
        await controller.loadCurrentMoveData();
        database.saveScopedNotetakerData.mockResolvedValueOnce(row({ session_participant_id: 'foreign', revision: 4 }));
        await controller.saveDynamicsData();
        await controller.saveAllianceData();
        expect(controller.scopedNotes.record.revision).toBe(3);
        expect(database.saveScopedNotetakerData).toHaveBeenCalledTimes(1);
        expect(fields.dynamicsAutoSave.textContent).toContain('reload');
    });

    it.each(['revoked', 'destroyed', 'replaced'])('ignores an in-flight save and cancels queued writes when the seat is %s', async (change) => {
        await controller.loadCurrentMoveData();
        const gate = deferred();
        database.saveScopedNotetakerData.mockReturnValueOnce(gate.promise);
        const first = controller.saveDynamicsData({ showSuccessToast: true });
        const second = controller.saveAllianceData({ showSuccessToast: true });
        await Promise.resolve();
        if (change === 'revoked') controller.seatInvalidated = true;
        if (change === 'destroyed') controller.destroy();
        if (change === 'replaced') seat = { ...seat, participantId: 'replacement' };
        gate.resolve(row({ revision: 4 }));
        await Promise.all([first, second]);
        expect(database.saveScopedNotetakerData).toHaveBeenCalledTimes(1);
        expect(controller.scopedNotes.record.revision).toBe(3);
        expect(showToast).not.toHaveBeenCalledWith(expect.anything(), { type: 'success' });
    });

    it('retains unified hydration, shared ledger saves and manual timeline publication', async () => {
        seat = { ...seat, topology: 1, delegationId: null, role: 'green_notetaker', greenSeatModel: 'unified_v1' };
        controller.teamContext = resolveTeamContext({ seat });
        await controller.loadCurrentMoveData();
        controller.dynamicsData = { dynamicsSummary: 'Unified note' };
        await controller.saveDynamicsData({ emitTimelineEvent: true });
        expect(database.getNotetakerData).toHaveBeenCalledWith('session', 1);
        expect(database.saveNotetakerData).toHaveBeenCalledWith(expect.objectContaining({ dynamics_analysis: { dynamicsSummary: 'Unified note' } }));
        expect(database.createTimelineEvent).toHaveBeenCalledTimes(1);
        expect(database.saveScopedNotetakerData).not.toHaveBeenCalled();
    });

    it('retains the unified capture timeline and observation append', async () => {
        seat = { ...seat, topology: 1, delegationId: null, role: 'green_notetaker', greenSeatModel: 'unified_v1' };
        controller.teamContext = resolveTeamContext({ seat });
        fields.captureContent.value = 'Unified observation';
        await controller.handleCaptureSubmit({ preventDefault: vi.fn() });
        expect(database.createTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({ content: 'Unified observation' }));
        expect(database.saveNotetakerData).toHaveBeenCalledWith(expect.objectContaining({
            observation_timeline_append: [expect.objectContaining({ content: 'Unified observation', id: 'timeline' })]
        }));
        expect(database.saveScopedNotetakerData).not.toHaveBeenCalled();
    });
});
