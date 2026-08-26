import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
    return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8');
}

function getSidebarSections(html) {
    return [...html.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1]);
}

describe('Start Here role surface coverage', () => {
    it.each([
        ...['blue', 'green', 'red', 'industry'].flatMap((team) => [
            [`${team} Scribe`, `teams/${team}/facilitator.html`, 'src/roles/facilitator.js', true],
            [`${team} Facilitator`, `teams/${team}/scribe.html`, 'src/roles/scribe.js', true],
            [`${team} Notetaker`, `teams/${team}/notetaker.html`, 'src/roles/notetaker.js', true]
        ]),
        ['White Cell', 'whitecell.html', 'src/roles/whitecell.js', true],
        ['Game Master', 'master.html', 'src/roles/gamemaster.js', false]
    ])('%s exposes the stable Slide 4 tracker targets', (_label, htmlPath, sourcePath, hasTimer) => {
        const html = read(htmlPath);
        const source = read(sourcePath);

        expect(html).toContain('id="header-game-state"');
        expect(source).toContain("'#header-game-state'");
        if (hasTimer) expect(html).toContain('id="header-timer"');
    });

    it.each([
        ['Team Scribe', 'teams/blue/facilitator.html', 'src/roles/facilitator.js'],
        ['Team Notetaker', 'teams/blue/notetaker.html', 'src/roles/notetaker.js'],
        ['White Cell', 'whitecell.html', 'src/roles/whitecell.js'],
        ['Game Master', 'master.html', 'src/roles/gamemaster.js']
    ])('%s guide names every shipped sidebar destination', (_label, htmlPath, sourcePath) => {
        const html = read(htmlPath);
        const source = read(sourcePath);
        const sections = getSidebarSections(html);

        expect(sections.length).toBeGreaterThan(0);
        sections.forEach((section) => {
            const targetReference = new RegExp(`(?:navTarget|surfaceStep)\\([^\\n]*['\"]${section}['\"]`);
            expect(source, `${sourcePath} is missing ${section}`).toMatch(targetReference);
        });
        expect(source).toContain('roleLabel:');
        expect(source).toContain('summary:');
        expect(source).toContain('narrative:');
    });

    it('covers every native Facilitator workspace control', () => {
        const html = read('teams/blue/scribe.html');
        const source = read('src/roles/scribe.js');
        [
            'teamActionReviewViewBtn',
            'deckViewBtn',
            'rfiViewBtn',
            'communicationsViewBtn',
            'scribeAlertsBtn',
            'presentBtn'
        ].forEach((id) => {
            expect(html).toContain(`id="${id}"`);
            expect(source).toContain(`#${id}`);
        });
        expect(source).toContain('.scribe-section-region--proposals');
        expect(source).toContain('Projection does not equal submission.');
    });

    it('gives every shipped SME seat a scoped narrative and queue guide', () => {
        const source = read('src/roles/sme.js');
        [
            'SME_ROLES.ECON',
            'SME_ROLES.NI_ESCALATION',
            'SME_ROLES.DIPLOMACY_INFORMATION',
            'SME_ROLES.TSJ',
            'SME_ROLES.VERBA'
        ].forEach((role) => expect(source).toContain(`[${role}]`));
        expect(source).toContain('followalong:sme:');
        expect(source).toContain('.sidebar-link[data-section="smeQueue"]');
        expect(source).toContain('.pli-sme-footer');
        expect(source).toContain('.pli-sme-actions');
    });

    it('uses one local overview, caption, and transcript contract in Start Here', () => {
        const overview = read('src/features/onboarding/platformOverview.js');
        const startHere = read('src/features/onboarding/followAlong.js');

        expect(overview).toContain('PLenum Onboarding Video.mp4?url');
        expect(overview).toContain('plenum-onboarding.en.vtt');
        expect(overview).toContain('PLATFORM_OVERVIEW_TRANSCRIPT');
        expect(startHere).toContain("from './platformOverview.js'");
        expect(startHere).not.toContain('autoplay = true');
    });
});
