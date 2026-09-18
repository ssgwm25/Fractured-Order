import { afterEach, describe, expect, it } from 'vitest';
import { buildRegionalRole, getRoleDisplayName, getRoleRoute, parseTeamRole, resolveTeamContext } from './teamContext.js';
import { clearSeatLocalState, getConfirmedSeat, seatStorageKey, setConfirmedSeat, validateSeatEnvelope, validateSeatRoute } from './seatContext.js';
import { getPossibleKeys } from '../utils/keyGenerator.js';
import { buildUploadedScribeDeckStorageKey, getUploadedScribeDeck } from '../features/scribe/deckStorage.js';
import { DurableNotificationCenter } from '../components/ui/DurableNotification.js';

const seat = { sessionId: 'session', participantId: 'seat', role: 'green_europe_scribe',
    topology: 2, teamId: 'green', delegationId: 'europe', surface: 'facilitator' };
const envelope = () => ({ session: { id: 'session', status: 'active', session_topology_version: 2 },
    seat: { id: 'seat', session_id: 'session', is_active: true, role: seat.role, delegation_id: 'europe' } });
afterEach(() => { setConfirmedSeat(null); delete globalThis.localStorage; });

describe('GC-04 seat context', () => {
    it.each(['asian_pacific', 'europe'].flatMap((region) => ['facilitator', 'scribe'].map((surface) => [region, surface])))
    ('maps %s / legacy %s explicitly and keeps region in the route and label', (region, surface) => {
        const role = buildRegionalRole(region, surface);
        expect(parseTeamRole(role)).toMatchObject({ teamId: 'green', delegationId: region, surface });
        expect(getRoleRoute(role, { basePath: '/Fractured-Order/' }))
            .toBe(`/Fractured-Order/teams/green/${surface}.html?delegation=${region}`);
        expect(getRoleDisplayName(role)).toContain(region === 'europe' ? 'Europe' : 'Asia-Pacific');
        expect(getRoleDisplayName(role)).toContain(surface === 'scribe' ? 'Facilitator' : 'Scribe');
    });

    it.each(['/', '/Fractured-Order/'])('keeps legacy role inversion under %s and rejects unknown regional identifiers', (basePath) => {
        expect(getRoleRoute('green_facilitator', { basePath })).toBe(`${basePath}teams/green/facilitator.html`);
        expect(getRoleDisplayName('green_facilitator')).toBe('Green Team Scribe');
        expect(buildRegionalRole('unknown', 'scribe')).toBeNull();
        expect(getRoleRoute('green_unknown_scribe')).toBeNull();
    });

    it('restores only consistent confirmed envelopes', () => {
        expect(validateSeatEnvelope(envelope(), seat)).toMatchObject(seat);
        for (const mutation of [
            (value) => { value.seat.delegation_id = 'asian_pacific'; },
            (value) => { value.seat.revoked_at = 'now'; },
            (value) => { value.seat.is_active = false; },
            (value) => { value.session.status = 'archived'; },
            (value) => { value.session.session_topology_version = 1; },
            (value) => { delete value.session.session_topology_version; },
            (value) => { value.seat.session_id = 'other'; }
        ]) {
            const value = envelope(); mutation(value);
            expect(() => validateSeatEnvelope(value, seat)).toThrow('Invalid session seat');
        }
    });

    it('accepts a base-path deep link without delegation and rejects tampered parameters', () => {
        const pathname = '/Fractured-Order/teams/green/facilitator.html';
        const options = { basePath: '/Fractured-Order/' };
        expect(validateSeatRoute(seat, { pathname, search: '' }, options)).toBe(true);
        for (const search of ['?delegation=asian_pacific', '?delegation=europe&delegation=europe',
            '?role=green_europe_facilitator', '?session=other', '?team=blue', '?mode=observer']) {
            expect(() => validateSeatRoute(seat, { pathname, search }, options)).toThrow('Permission error');
        }
        expect(() => validateSeatRoute(seat, { pathname: '/teams/green/facilitator.html' }, options)).toThrow();
        expect(() => validateSeatRoute(seat, { pathname: pathname.replace('green', 'blue') }, options)).toThrow();
    });

    it('derives controller labels and roles from a confirmed seat', () => {
        const context = resolveTeamContext({ seat, documentRef: { body: { dataset: { team: 'green' } } } });
        expect(context.facilitatorRole).toBe('green_europe_scribe');
        expect(context.scribeRole).toBe('green_europe_facilitator');
        expect(context.teamLabel).toBe('Green - Europe');
    });

    it('isolates drafts and local state by session, topology, region, role and seat without legacy fallback', () => {
        setConfirmedSeat(seat);
        const key = seatStorageKey('draft');
        for (const partial of [{ sessionId: 'other' }, { topology: 1 }, { delegationId: 'asian_pacific' },
            { role: 'green_europe_facilitator' }, { participantId: 'other' }]) {
            expect(seatStorageKey('draft', { ...seat, ...partial })).not.toBe(key);
        }
        expect(getPossibleKeys('draft', 'session')).toEqual([seatStorageKey('esg_draft')]);
        expect(() => getPossibleKeys('draft', 'other')).toThrow('mismatch');
    });

    it('clears the inaccessible seat namespace without deleting historical or unrelated keys', () => {
        const ownKey = seatStorageKey('draft', seat);
        const data = new Map([[ownKey, 'private'], ['historical-export', 'evidence']]);
        globalThis.localStorage = { length: data.size, key: (index) => [...data.keys()][index], removeItem: (key) => data.delete(key) };
        setConfirmedSeat(seat);
        clearSeatLocalState();
        expect(data.has(ownKey)).toBe(false);
        expect(data.get('historical-export')).toBe('evidence');
        setConfirmedSeat(null);
        expect(getConfirmedSeat()).toBeNull();
    });

    it('rejects unified and cross-region uploaded decks before IndexedDB access', async () => {
        setConfirmedSeat(seat);
        expect(buildUploadedScribeDeckStorageKey('session', 'green', 'europe')).toBe('scribe-deck:session:green:europe');
        await expect(getUploadedScribeDeck('scribe-deck:session:green')).rejects.toThrow('confirmed delegation');
        await expect(getUploadedScribeDeck('scribe-deck:session:green:asian_pacific')).rejects.toThrow('confirmed delegation');
    });

    it('isolates notification state and prevents late notifications after revocation', () => {
        const data = new Map();
        const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value),
            removeItem: (key) => data.delete(key) };
        setConfirmedSeat(seat);
        const europe = new DurableNotificationCenter({ scope: 'notifications', storage });
        const notice = { id: 'notice', source: 'White Cell', artifact: 'Synthetic revision', requiredAction: 'Review' };
        europe.notify(notice);
        expect(data.has(europe.storageKey)).toBe(true);
        setConfirmedSeat({ ...seat, delegationId: 'asian_pacific', role: 'green_asian_pacific_scribe' });
        const asia = new DurableNotificationCenter({ scope: 'notifications', storage });
        expect(asia.storageKey).not.toBe(europe.storageKey);
        expect(asia.getRecord('notice')).toBeNull();
        clearSeatLocalState(seat);
        expect(data.has(europe.storageKey)).toBe(false);
        expect(europe.notify({ ...notice, id: 'late-notice' })).toBeNull();
    });
});
