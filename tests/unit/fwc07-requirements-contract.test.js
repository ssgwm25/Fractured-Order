import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
    return readFileSync(join(ROOT, relativePath), 'utf8');
}

function listRuntimeJavaScript(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return listRuntimeJavaScript(path);
        return extname(path) === '.js' && !entry.name.endsWith('.test.js') ? [path] : [];
    });
}

describe('FWC-07 authoritative workflow requirements', () => {
    it('ships no active client instruction that promises a handoff deadline', () => {
        const runtimeSource = listRuntimeJavaScript(join(ROOT, 'src'))
            .map((path) => readFileSync(path, 'utf8'))
            .join('\n');

        expect(runtimeSource).not.toMatch(/(?:before (?:the )?)?handoff deadline/i);
        expect(runtimeSource).not.toMatch(/before the deadline/i);
        expect(read('docs/WORKFLOW_INTERACTION_CONTRACT.md'))
            .toMatch(/does not implement a\s+submission deadline/);
    });

    it('publishes canonical terminology, components, and every dirty-form exit path', () => {
        const glossary = read('docs/GLOSSARY.md');
        const components = read('docs/COMPONENTS.md');
        const contract = read('docs/WORKFLOW_INTERACTION_CONTRACT.md');

        expect(glossary).toContain('| Unsaved changes |');
        expect(glossary).toContain('| Timer |');
        expect(components).toContain('Unsaved-change confirmation');
        [
            /Cancel button/i,
            /Escape/i,
            /Modal close button/i,
            /Modal backdrop/i,
            /Browser navigation/i,
            /Role\/session switching/i
        ].forEach((exitPath) => expect(contract).toMatch(exitPath));
        expect(contract).toContain('Failed saves leave the form open and dirty');
    });
});
