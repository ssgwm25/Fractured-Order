import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adaptGreenGuide, GREEN_MEDIA_GAP } from '../../src/features/onboarding/greenGuidance.js';
import { resolveTeamContext } from '../../src/core/teamContext.js';
import { greenDeckAssignmentOptions, greenDeckAssignmentRoles, deckAssignmentScopeLabel } from '../../src/features/scribe/deckAssignment.js';
import { buildDefaultScribeDeckPath, parseScribeDeckHtml, expandScribeDeckSections, flattenScribeDeckSlides, renderScribeGuidanceSlide } from '../../src/features/scribe/deckConfig.js';
import { getSeatDeckStorageKey } from '../../src/features/scribe/deckStorage.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const model = 'shared_facilitator_v1';
const context = (role, region, shared = true) => resolveTeamContext({
    documentRef: { body: { dataset: { team: 'green' } } },
    seat: { role, delegationId: region, greenSeatModel: shared ? model : 'regional_pairs_v1' }
});
const baseGuide = { summary: 'Existing guide', steps: ['Build proposals', 'RFIs', 'Proposals', 'Deck'].map((title) => ({ title })) };
const step = (guide, title) => guide.steps.find((entry) => entry.title === title);

describe('GC09 model-aware guidance and actual runtime deck', () => {
    it.each(['asian_pacific', 'europe'])('guides the %s Scribe through its own handoff without RFI authoring', (region) => {
        const guide = adaptGreenGuide(baseGuide, context(`green_${region}_scribe`, region), 'scribe');
        expect(guide.summary).toContain('one shared Green Facilitator');
        expect(step(guide, 'Build proposals').body).toContain('hand off the new revision');
        expect(step(guide, 'RFIs').narrative).toContain('Scribes cannot create, correct or answer RFIs');
        expect(guide.textOnly).toBe(true);
        expect(guide.mediaNotice).toBe(GREEN_MEDIA_GAP);
    });
    it('provides the shared Facilitator guide, native region control, permitted writes and isolated threads', () => {
        const guide = adaptGreenGuide(baseGuide, context('green_shared_facilitator', null), 'facilitator');
        expect(guide.summary).toContain('submit each separately');
        expect(guide.summary).toContain('private drafts and notes remain inaccessible');
        expect(step(guide, 'Choose the working region').action).toEqual({
            label: 'Focus working region', selector: '.shared-green-context select', activate: false
        });
        expect(step(guide, 'Proposals').body).toContain('current proposal revision');
        expect(step(guide, 'Deck').body).toContain('never changes this shared assignment');
        expect(step(guide, 'Deck').narrative).toContain('does not transfer the file');
    });
    it('retains paired and unified guidance without relabeling historical ownership', () => {
        const paired = adaptGreenGuide(baseGuide, context('green_europe_facilitator', 'europe', false), 'facilitator');
        expect(paired.summary).toContain('existing paired session');
        expect(paired.summary).not.toContain('one shared Green Facilitator');
        const unified = adaptGreenGuide(baseGuide, { teamId: 'green' }, 'facilitator');
        expect(unified.summary).toContain('unified Green session');
        expect(unified.summary).toContain('do not relabel historical');
        expect(adaptGreenGuide(baseGuide, { teamId: 'blue' }, 'facilitator')).toBe(baseGuide);
    });
    it.each(['asian_pacific', 'europe'])('keeps the existing %s Notetaker and private notes scoped', (region) => {
        const guide = adaptGreenGuide(baseGuide, context(`green_${region}_notetaker`, region), 'notetaker');
        expect(guide.summary).toContain('existing');
        expect(guide.summary).toContain('two regional Notetakers');
        expect(guide.summary).toContain('seat-scoped notes');
    });
    it('does not promise shared publication of regional Notetaker notes or captures', () => {
        const titles = ['Quick Capture', 'Team Dynamics', 'Alliance Tracking', 'Timeline'];
        const guide = adaptGreenGuide({ steps: titles.map((title) => ({ title, details: ['old shared promise'] })) },
            context('green_europe_notetaker', 'europe'), 'notetaker');
        expect(step(guide, 'Quick Capture').narrative).toContain('not published to the shared timeline');
        expect(step(guide, 'Team Dynamics').narrative).toContain('reload saved notes before retrying');
        expect(step(guide, 'Timeline').narrative).toContain('do not become shared timeline records');
        titles.forEach((title) => expect(step(guide, title).details).toEqual([]));
    });
    it('loads current text first from the actual Green default and retains original image provenance', () => {
        const slides = parseScribeDeckHtml(read(buildDefaultScribeDeckPath('green')));
        expect(slides[0].title).toContain('July 24, 2026');
        expect(slides[0].src).toContain('data:image/');
        const ordered = flattenScribeDeckSlides(expandScribeDeckSections(slides));
        expect(ordered[0].slideType).toBe('guidance');
        expect(ordered[0].title).toContain('current text guide');
        const contract = JSON.parse(read('docs/architecture/green-regional-contract.json'));
        for (const [region, members] of Object.entries(contract.roster.approved_members)) {
            const regional = slides.find((slide) => slide.kind === 'guidance' && slide.scope === region);
            members.forEach((member) => expect(regional.paragraphs.join(' ')).toContain(member));
        }
        const text = ordered.filter((slide) => slide.slideType === 'guidance').map(renderScribeGuidanceSlide).join(' ');
        expect(text).toContain('synthetic rehearsal fixtures are not exercise approval');
        expect(text).toContain('browser-local');
        expect(text).toContain('prior revisions');
    });
    it('renders uploaded guidance as escaped text, never executable HTML', () => {
        const html = renderScribeGuidanceSlide({ title: '<img onerror=alert(1)>', paragraphs: ['<script>attack</script>'] });
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<img');
    });
});

describe('GC09 explicit deck assignment scope (server authorization remains GC07)', () => {
    const shared = { session_topology_version: 2, green_seat_model: model };
    const paired = { sessionTopologyVersion: 2, greenSeatModel: null };
    it('offers one shared deck and rejects regional or forged assignment scopes', () => {
        expect(greenDeckAssignmentOptions(shared)).toHaveLength(1);
        expect(greenDeckAssignmentRoles(shared, 'shared')).toEqual(['green_shared_facilitator']);
        for (const scope of ['europe', 'both', 'unified', '', 'forged']) {
            expect(() => greenDeckAssignmentRoles(shared, scope)).toThrow('Choose a deck scope');
        }
    });
    it('addresses only the selected paired Facilitator or the explicit both selection', () => {
        expect(greenDeckAssignmentRoles(paired, 'europe')).toEqual(['green_europe_facilitator']);
        expect(greenDeckAssignmentRoles(paired, 'asian_pacific')).toEqual(['green_asian_pacific_facilitator']);
        expect(greenDeckAssignmentRoles(paired, 'both')).toHaveLength(2);
        expect(greenDeckAssignmentRoles({ session_topology_version: null }, 'unified')).toEqual(['green_scribe']);
        expect(() => greenDeckAssignmentOptions({ session_topology_version: 2, green_seat_model: 'forged' })).toThrow();
    });
    it('never derives shared deck storage or scope from a working view', () => {
        const seat = { sessionId: 's', participantId: 'p', teamId: 'green', role: 'green_shared_facilitator', greenSeatModel: model };
        const key = getSeatDeckStorageKey(seat);
        for (const workingDelegation of ['asian_pacific', 'europe']) {
            expect(getSeatDeckStorageKey({ ...seat, workingDelegation })).toBe(key);
            expect(deckAssignmentScopeLabel({ sharedFacilitator: true, workingDelegation })).toContain('Shared Green deck');
            expect(getSeatDeckStorageKey({ ...seat, role: `green_${workingDelegation}_facilitator`, delegationId: workingDelegation, greenSeatModel: 'regional_pairs_v1' })).not.toBe(key);
        }
        expect(getSeatDeckStorageKey({ ...seat, participantId: 'replacement' })).not.toBe(key);
    });
});
