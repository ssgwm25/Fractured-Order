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

    it('keeps the shared modal close icon decorative for assistive technology', () => {
        const source = readFileSync(fileUrl('src/components/ui/Modal.js'), 'utf8');
        const closeIcon = source.match(/<svg\b[^>]*viewBox="0 0 20 20"[^>]*>/i)?.[0] || '';

        expect(closeIcon).toContain('aria-hidden="true"');
        expect(closeIcon).toContain('focusable="false"');
    });
});
