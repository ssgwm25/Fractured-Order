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
});
