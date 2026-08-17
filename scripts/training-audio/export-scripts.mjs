#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { getTrainingCurriculumProfiles } from '../../src/features/training/content/curriculum.js';

const COMMON_INTRO = Object.freeze({
    id: 'training.intro',
    kind: 'intro',
    text: 'Welcome in. This guided practice is private to your training attempt. You can pause, replay, or mute me at any time — and every spoken instruction stays visible on screen.'
});

function sha256(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function readOutputArgument(argv) {
    const index = argv.indexOf('--out');
    if (index === -1 || !argv[index + 1]) {
        throw new Error('Usage: node scripts/training-audio/export-scripts.mjs --out <path>');
    }
    return resolve(argv[index + 1]);
}

export function buildTrainingAudioScripts() {
    const entries = [COMMON_INTRO];
    getTrainingCurriculumProfiles().forEach((module) => {
        entries.push({
            id: module.id,
            kind: 'module',
            semanticRole: module.semanticRole,
            team: module.supportedTeams[0],
            text: module.narrationScript
        });
        module.steps.forEach((step) => entries.push({
            id: step.id,
            kind: 'step',
            semanticRole: step.semanticRole,
            team: step.supportedTeams[0],
            stage: step.stage,
            text: step.narrationScript
        }));
    });

    const scripts = entries.map((entry) => ({ ...entry, scriptSha256: sha256(entry.text) }));
    const canonicalBundle = scripts.map(({ id, text }) => `${id}\0${text}`).join('\n');
    return {
        schemaVersion: 1,
        curriculumVersion: '1.0',
        scriptBundleSha256: sha256(canonicalBundle),
        entries: scripts
    };
}

async function main() {
    const outputPath = readOutputArgument(process.argv.slice(2));
    const payload = `${JSON.stringify(buildTrainingAudioScripts(), null, 2)}\n`;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, payload, 'utf8');
    process.stdout.write(`Exported training narration scripts to ${outputPath}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    void main();
}

export { COMMON_INTRO };
