import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGreenJoinRole, getGreenSeatModel, getRoleDisplayName, getRoleRoute, parseTeamRole,
    resolveTeamContext, SHARED_GREEN_FACILITATOR as role, SHARED_GREEN_MODEL as model } from '../../src/core/teamContext.js';
import { clearSeatLocalState, regionalSeatStorageKey, seatStorageKey, setConfirmedSeat,
    validateSeatEnvelope, validateSeatRoute } from '../../src/core/seatContext.js';
import { getSeatDeckStorageKey, getUploadedScribeDeck } from '../../src/features/scribe/deckStorage.js';
import { readSharedGreenView, selectSharedGreenView } from '../../src/features/scribe/sharedGreenContext.js';
import { DurableNotificationCenter } from '../../src/components/ui/DurableNotification.js';

const session = { id: 'session', status: 'active', session_topology_version: 2, green_seat_model: model };
const envelope = () => ({ session: { ...session }, seat: { id: 'seat', session_id: 'session', role, delegation_id: null, is_active: true } });
const confirmed = () => validateSeatEnvelope(envelope(), { sessionId: 'session', participantId: 'seat' });
function storage() {
    const values = new Map();
    return { values, get length() { return values.size; }, key: (i) => [...values.keys()][i],
        getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
afterEach(() => { setConfirmedSeat(null); delete globalThis.sessionStorage; delete globalThis.localStorage; });

describe('GC-04A confirmed model and regional state', () => {
    it('defines three target joins while retaining explicit legacy workspace inversion', () => {
        expect(buildGreenJoinRole(session, null, 'scribe')).toBe(role);
        for (const region of ['asian_pacific', 'europe']) {
            expect(buildGreenJoinRole(session, region, 'facilitator')).toBe(`green_${region}_scribe`);
            expect(buildGreenJoinRole(session, region, 'scribe')).toBe(role);
            expect(buildGreenJoinRole({ ...session, green_seat_model: null }, region, 'scribe')).toBe(`green_${region}_facilitator`);
        }
        expect(parseTeamRole(role)).toMatchObject({ delegationId: null, semanticRole: 'facilitator', surface: 'scribe' });
        expect(getRoleDisplayName(role)).toContain('Asia-Pacific and Europe');
        expect(buildGreenJoinRole({ session_topology_version: 1 }, null, 'scribe')).toBe('green_scribe');
    });
    it('requires the server model; missing, unknown or contradictory models cannot confirm a shared seat', () => {
        expect(confirmed()).toMatchObject({ greenSeatModel: model, role, delegationId: null });
        for (const change of [{ green_seat_model: null }, { green_seat_model: 'unknown' }, { session_topology_version: 1 }]) {
            const data = envelope(); Object.assign(data.session, change);
            expect(() => validateSeatEnvelope(data, { sessionId: 'session', participantId: 'seat' })).toThrow('Invalid session seat');
        }
        const data = envelope(); data.seat.role = 'green_europe_facilitator'; data.seat.delegation_id = 'europe';
        expect(() => validateSeatEnvelope(data, { sessionId: 'session', participantId: 'seat' })).toThrow();
        expect(() => getGreenSeatModel({ ...session, green_seat_model: 'unified_v1' })).toThrow();
    });
    it.each(['/', '/Fractured-Order/'])('accepts the shared deck deep link under %s and rejects authority hints', (basePath) => {
        const seat = confirmed();
        const pathname = `${basePath}teams/green/scribe.html`;
        expect(getRoleRoute(role, { basePath })).toBe(pathname);
        expect(validateSeatRoute(seat, { pathname }, { basePath })).toBe(true);
        for (const search of ['?delegation=europe', '?delegation=asian_pacific', '?role=green_scribe', '?team=blue', '?session=other', '?mode=observer', '?green_seat_model=unified_v1']) {
            expect(() => validateSeatRoute(seat, { pathname, search }, { basePath })).toThrow('Permission error');
        }
        expect(() => validateSeatRoute(seat, { pathname: `${basePath}teams/green/facilitator.html` }, { basePath })).toThrow();
        const context = resolveTeamContext({ seat, documentRef: { body: { dataset: { team: 'green' } } } });
        expect(context.scribeRole).toBe(role);
        expect(context.facilitatorRole).toBeNull();
        expect(context.teamLabel).toContain('Asia-Pacific and Europe');
    });
    it('switches only the working view, scopes regional drafts separately and never reuses stale keys', () => {
        const seat = confirmed(); const store = storage();
        setConfirmedSeat(seat); globalThis.sessionStorage = store;
        store.setItem('working-delegation', 'europe'); // old/unscoped key is ignored
        expect(readSharedGreenView(seat)).toBe('asian_pacific');
        const ap = regionalSeatStorageKey('draft', 'asian_pacific');
        const eu = regionalSeatStorageKey('draft', 'europe');
        expect(ap).not.toBe(eu);
        store.setItem(ap, 'AP draft'); store.setItem(eu, 'EU draft');
        const deck = getSeatDeckStorageKey(seat);
        selectSharedGreenView(seat, 'europe');
        expect(readSharedGreenView(seat)).toBe('europe');
        expect(getSeatDeckStorageKey(seat)).toBe(deck);
        expect(store.getItem(ap)).toBe('AP draft');
        expect(seat.delegationId).toBeNull();
        expect(() => selectSharedGreenView(seat, 'both')).toThrow();
        store.setItem(seatStorageKey('working-delegation'), 'unknown');
        expect(readSharedGreenView(seat)).toBe('asian_pacific');
        const regional = { ...seat, role: 'green_europe_scribe', delegationId: 'europe' };
        expect(() => regionalSeatStorageKey('draft', 'asian_pacific', regional)).toThrow();
    });
    it('cleans model/seat/region state and notifications on invalidation and blocks late view changes', async () => {
        const seat = confirmed(); setConfirmedSeat(seat);
        globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
        const key = regionalSeatStorageKey('draft', 'europe');
        localStorage.setItem(key, 'draft');
        sessionStorage.setItem(seatStorageKey('working-delegation'), 'europe');
        localStorage.setItem('historical-export', 'retained');
        const center = new DurableNotificationCenter({ scope: 'shared', storage: localStorage });
        center.notify({ id: 'fixture', source: 'White Cell', artifact: 'Regional fixture', requiredAction: 'Read' });
        expect(center.storageKey).toContain(model);
        await expect(getUploadedScribeDeck('scribe-deck:session:green')).rejects.toThrow('confirmed delegation');
        await expect(getUploadedScribeDeck('scribe-deck:session:green:europe')).rejects.toThrow('confirmed delegation');
        clearSeatLocalState(); setConfirmedSeat(null);
        expect(localStorage.getItem(key)).toBeNull();
        expect(localStorage.getItem(center.storageKey)).toBeNull();
        expect(sessionStorage.length).toBe(0);
        expect(localStorage.getItem('historical-export')).toBe('retained');
        expect(() => selectSharedGreenView(seat, 'europe')).toThrow();
    });
    it('keeps the three-seat SQL suite self-contained and the migration additive', () => {
        const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
        const sql = read('tests/sql/gc04a-shared-facilitator-editor.sql');
        expect(sql).not.toMatch(/REPLACE_|\\set|\\i\s/);
        expect(sql.trim()).toMatch(/ROLLBACK;$/);
        expect(sql).toContain('SET LOCAL ROLE authenticated');
        expect(sql).not.toMatch(/DISABLE TRIGGER|session_replication_role/i);
        const migration = read('data/2026-09-24_gc04a_shared_facilitator.sql');
        expect(migration).toContain('CREATE UNIQUE INDEX idx_green_shared_active_seat');
        expect(migration).toContain('GC04A_SEAT_MODEL_FROZEN');
        expect(migration).not.toMatch(/ALTER FUNCTION.*RENAME|DROP POLICY|UPDATE public\.actions|UPDATE public\.communications/);
    });
});
