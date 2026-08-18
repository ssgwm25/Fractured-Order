import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ROOT_URL = new URL('../../', import.meta.url);
const MOJIBAKE_PATTERN = new RegExp('[\\u00e2\\u00c2\\ufffd]');

function fileUrl(relativePath) {
    return new URL(relativePath, ROOT_URL);
}

function collectFiles(relativeDir, predicate) {
    const results = [];

    function walk(currentRelativeDir) {
        const dirUrl = fileUrl(`${currentRelativeDir}/`);

        for (const entry of readdirSync(dirUrl, { withFileTypes: true })) {
            const relativePath = `${currentRelativeDir}/${entry.name}`;

            if (entry.isDirectory()) {
                walk(relativePath);
                continue;
            }

            if (entry.isFile() && predicate(relativePath)) {
                results.push({
                    label: relativePath,
                    url: fileUrl(relativePath)
                });
            }
        }
    }

    walk(relativeDir);
    return results;
}

function readText(source) {
    return readFileSync(source.url, 'utf8');
}

const ROLE_HTML_FILES = collectFiles('teams', (path) => path.endsWith('.html'));
const ROLE_JS_FILES = collectFiles('src/roles', (path) => path.endsWith('.js'));

const UI_SOURCE_FILES = [
    'index.html',
    'master.html',
    'whitecell.html'
].map((path) => ({
    label: path,
    url: fileUrl(path)
})).concat(ROLE_HTML_FILES, ROLE_JS_FILES);

const DECORATIVE_ICON_HTML_FILES = [
    'master.html',
    'whitecell.html'
].map((path) => ({
    label: path,
    url: fileUrl(path)
})).concat(ROLE_HTML_FILES);

const TRAINING_INTRO_SOURCE = {
    label: 'src/features/training/TrainingIntroModal.js',
    url: fileUrl('src/features/training/TrainingIntroModal.js')
};

const TRAINING_INTRO_CAPTIONS = {
    label: 'public/training/intro/plenum-onboarding.en.vtt',
    url: fileUrl('public/training/intro/plenum-onboarding.en.vtt')
};

const TRAINING_SHELL_STYLES = Object.freeze({
    variables: fileUrl('styles/base/variables.css'),
    header: fileUrl('styles/layouts/header.css'),
    appLayout: fileUrl('styles/layouts/app-layout.css'),
    sidebar: fileUrl('styles/layouts/sidebar.css'),
    scribe: fileUrl('styles/pages/scribe.css')
});

describe('UI source accessibility checks', () => {
    it('marks every inline SVG in role shells as hidden decorative art', () => {
        const failures = [];

        for (const source of DECORATIVE_ICON_HTML_FILES) {
            const svgTags = readText(source).match(/<svg\b[\s\S]*?>/gi) || [];

            for (const tag of svgTags) {
                if (!/\saria-hidden=["']true["']/i.test(tag) || !/\sfocusable=["']false["']/i.test(tag)) {
                    failures.push(`${source.label}: ${tag.replace(/\s+/g, ' ').trim()}`);
                }
            }
        }

        expect(failures).toEqual([]);
    });

    it('keeps browser-facing UI source free of common mojibake markers', () => {
        const failures = [];

        for (const source of UI_SOURCE_FILES) {
            readText(source)
                .split(/\r?\n/)
                .forEach((line, index) => {
                    if (MOJIBAKE_PATTERN.test(line)) {
                        failures.push(`${source.label}:${index + 1}: ${line.trim()}`);
                    }
                });
        }

        expect(failures).toEqual([]);
    });

    it('keeps the training intro local, gesture-started, captioned, and transcript-backed', () => {
        const source = readText(TRAINING_INTRO_SOURCE);
        const captions = readText(TRAINING_INTRO_CAPTIONS);

        expect(source).toContain("createElement(documentRef, 'video'");
        expect(source).toContain("captionTrack.kind = 'captions'");
        expect(source).toContain('video.autoplay = false');
        expect(source).toContain('Play introduction with sound');
        expect(source).toContain('Show video transcript');
        expect(source).toContain('Continue to profile confirmation');
        expect(source).not.toMatch(/https?:\/\//i);
        expect(source).not.toContain('VITE_API_KEY');
        expect(captions.startsWith('WEBVTT')).toBe(true);
        expect(captions).toContain('Plenum addresses this problem');
        expect(captions).toContain('observable, and reviewable simulation');
        expect(captions).not.toContain('awaiting an approved transcript');
    });

    it('reserves the persistent training banner above every role shell', () => {
        const variables = readFileSync(TRAINING_SHELL_STYLES.variables, 'utf8');
        const header = readFileSync(TRAINING_SHELL_STYLES.header, 'utf8');
        const appLayout = readFileSync(TRAINING_SHELL_STYLES.appLayout, 'utf8');
        const sidebar = readFileSync(TRAINING_SHELL_STYLES.sidebar, 'utf8');
        const scribe = readFileSync(TRAINING_SHELL_STYLES.scribe, 'utf8');

        expect(variables).toContain('--app-shell-top-offset: var(--header-height)');
        expect(header).toContain('body.training-sandbox-visible');
        expect(header).toContain('--app-shell-top-offset: calc(var(--header-height) + var(--training-sandbox-banner-height))');
        expect(appLayout).toContain('padding-top: var(--app-shell-top-offset)');
        expect(sidebar).toContain('top: var(--app-shell-top-offset)');
        expect(scribe).toContain('padding-top: var(--app-shell-top-offset)');
        expect(scribe).toContain('top: var(--app-shell-top-offset)');

        for (const team of ['blue', 'red', 'green', 'industry']) {
            const facilitatorShell = readFileSync(fileUrl(`teams/${team}/scribe.html`), 'utf8');
            expect(facilitatorShell).toContain('styles/layouts/header.css');
        }
    });

    it('keeps mastery gating keyboard reachable, announced, reduced-motion safe, and mobile docked', () => {
        const coach = readFileSync(fileUrl('src/features/training/TrainingCoach.js'), 'utf8');
        const appLayout = readFileSync(TRAINING_SHELL_STYLES.appLayout, 'utf8');

        expect(coach).toContain("createElement(documentRef, 'button'");
        expect(coach).toContain("setAttribute('aria-live', 'polite')");
        expect(coach).toContain("createElement(documentRef, 'details'");
        expect(coach).toContain('this.nextButton.disabled = !this.isMastered(step.id)');
        expect(appLayout).toContain('@media (max-width: 767px)');
        expect(appLayout).toContain('position: sticky');
        expect(appLayout).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('presents training as a compact in-context guide without displacing the role workspace', () => {
        const coach = readFileSync(fileUrl('src/features/training/TrainingCoach.js'), 'utf8');
        const appLayout = readFileSync(TRAINING_SHELL_STYLES.appLayout, 'utf8');
        const scribeLayout = readFileSync(TRAINING_SHELL_STYLES.scribe, 'utf8');
        const scribeCoach = readFileSync(fileUrl('src/features/training/ScribeTrainingCoach.js'), 'utf8');

        for (const roleCoach of [
            'src/features/training/ScribeTrainingCoach.js',
            'src/features/training/FacilitatorTrainingCoach.js',
            'src/features/training/NotetakerTrainingCoach.js'
        ]) {
            const source = readFileSync(fileUrl(roleCoach), 'utf8');
            expect(source).toContain("createElement(documentRef, 'section', 'training-coach");
            expect(source).not.toContain('training-coach card card-bordered');
            expect(source).toContain('compact: true');
            expect(source).toContain('autoplay: audio.isAutoplayEnabled()');
            expect(source).toContain('coach.destroy();');
        }

        expect(coach).toContain("createElement(documentRef, 'div', 'training-coach__body')");
        expect(coach).toContain("createElement(documentRef, 'section', 'training-coach__active-stage')");
        expect(coach).toContain("'training-coach__toggle'");
        expect(coach).not.toContain('mountTrainingProgress');
        expect(coach).not.toContain('Pathway, narration, and role tools');
        expect(coach).toContain("target.classList.add('training-walkthrough-target')");
        expect(coach).toContain("classList?.remove('training-walkthrough-target')");
        expect(coach).toContain('this.positionDockForTarget(target)');
        expect(coach).toContain('this.objective.focus({ preventScroll: true })');
        expect(coach).toContain('this.activeTarget?.scrollIntoView?.({');
        expect(appLayout).toContain('.training-coach__body');
        expect(appLayout).toContain('position: fixed');
        expect(appLayout).toContain('.training-coach[data-collapsed="true"]');
        expect(appLayout).toContain('.training-coach[data-collapsed="true"] .training-coach__audio');
        expect(appLayout).toContain('.training-walkthrough-target');
        expect(scribeLayout).not.toContain('body.training-sandbox-visible .scribe-main');
        expect(scribeCoach).toContain("onNavigate('timeline')");
        expect(scribeCoach).toContain('coach.updateTargetSpotlight(module.steps[6], { shouldScroll: true })');
        expect(appLayout).toContain('@media (prefers-reduced-motion: no-preference)');
        expect(appLayout).toContain('.training-coach__active-stage--entering');
    });

    it('keeps the shared modal close icon decorative for assistive technology', () => {
        const source = readFileSync(fileUrl('src/components/ui/Modal.js'), 'utf8');
        const closeIcon = source.match(/<svg\b[^>]*viewBox="0 0 20 20"[^>]*>/i)?.[0] || '';

        expect(closeIcon).toContain('aria-hidden="true"');
        expect(closeIcon).toContain('focusable="false"');
    });
});
