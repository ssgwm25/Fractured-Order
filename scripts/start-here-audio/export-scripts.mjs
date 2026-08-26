#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    buildFollowAlongNarration,
    hashFollowAlongNarration
} from '../../src/features/onboarding/audioGuide.js';
import {
    SME_ROLES,
    TEAM_OPTIONS,
    getSmeRoleDisplayLabel,
    getTeamRoleLabels
} from '../../src/core/teamContext.js';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sha256(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function extractMethodBody(relativePath, nextMethodName) {
    const source = await readFile(resolve(REPOSITORY_ROOT, relativePath), 'utf8');
    const marker = '    mountFollowAlongOnboarding() {';
    const start = source.indexOf(marker);
    if (start === -1) throw new Error(`Cannot find Start Here builder in ${relativePath}`);
    const bodyStart = start + marker.length;
    const endMarker = `\n    ${nextMethodName}(`;
    const end = source.indexOf(endMarker, bodyStart);
    if (end === -1) throw new Error(`Cannot find ${nextMethodName} after Start Here builder in ${relativePath}`);
    const closingBrace = source.lastIndexOf('\n    }', end);
    if (closingBrace === -1 || closingBrace < bodyStart) {
        throw new Error(`Cannot isolate Start Here builder in ${relativePath}`);
    }
    return source.slice(bodyStart, closingBrace);
}

async function extractNamedFunction(relativePath, functionName, nextFunctionName, dependencies = {}) {
    const source = await readFile(resolve(REPOSITORY_ROOT, relativePath), 'utf8');
    const marker = `export function ${functionName}(`;
    const start = source.indexOf(marker);
    const end = source.indexOf(`\nexport function ${nextFunctionName}(`, start + marker.length);
    if (start === -1 || end === -1) throw new Error(`Cannot isolate ${functionName} in ${relativePath}`);
    const declaration = source.slice(start, end).replace(/^export\s+/, '');
    const names = Object.keys(dependencies);
    return new Function(...names, `${declaration}\nreturn ${functionName};`)(...Object.values(dependencies));
}

function captureConfig(body, context, dependencies = {}) {
    let captured = null;
    const names = ['mountFollowAlong', ...Object.keys(dependencies)];
    const values = [(config) => {
        captured = config;
        return Object.freeze({ destroy() {} });
    }, ...Object.values(dependencies)];
    const invoke = new Function(...names, `return function buildStartHereProfile() {${body}\n}`)(...values);
    invoke.call(context);
    if (!captured) throw new Error('Start Here builder did not call mountFollowAlong().');
    return captured;
}

function profileFromConfig(config) {
    const slides = [
        {
            kind: 'role-focus',
            title: `${config.roleLabel} role focus`,
            text: buildFollowAlongNarration({
                storageKey: config.storageKey,
                roleLabel: config.roleLabel,
                summary: config.summary
            })
        },
        ...config.steps.map((step, index) => ({
            kind: 'role-surface',
            stepIndex: index,
            title: step.title,
            text: buildFollowAlongNarration({ step })
        }))
    ];
    return {
        storageKey: config.storageKey,
        roleLabel: config.roleLabel,
        title: config.title,
        slides
    };
}

async function buildProfiles() {
    const [observerAndScribeBody, facilitatorBody, notetakerBody, whiteCellBody, gameMasterBody, smeBody] = await Promise.all([
        extractMethodBody('src/roles/facilitator.js', 'isAllowedRole'),
        extractMethodBody('src/roles/scribe.js', 'configureShell'),
        extractMethodBody('src/roles/notetaker.js', 'configureTeamLabels'),
        extractMethodBody('src/roles/whitecell.js', 'configureTeamLabels'),
        extractMethodBody('src/roles/gamemaster.js', 'bindEventListeners'),
        extractMethodBody('src/roles/sme.js', 'refreshQueue')
    ]);

    const profiles = [];
    for (const team of TEAM_OPTIONS) {
        const labels = getTeamRoleLabels(team.id);
        const teamContext = {
            facilitatorLabel: labels.facilitator,
            scribeLabel: labels.scribe,
            notetakerLabel: labels.notetaker
        };
        const common = { teamId: team.id, teamLabel: team.label, teamContext, onboarding: null };
        profiles.push(profileFromConfig(captureConfig(observerAndScribeBody, {
            ...common,
            isReadOnly: true,
            isProposalTeam: () => ['green', 'industry'].includes(team.id),
            isTeamActionWizardEnabled: () => ['blue', 'red'].includes(team.id)
        })));
        profiles.push(profileFromConfig(captureConfig(observerAndScribeBody, {
            ...common,
            isReadOnly: false,
            isProposalTeam: () => ['green', 'industry'].includes(team.id),
            isTeamActionWizardEnabled: () => ['blue', 'red'].includes(team.id)
        })));
        profiles.push(profileFromConfig(captureConfig(facilitatorBody, common)));
        profiles.push(profileFromConfig(captureConfig(notetakerBody, common)));
    }

    for (const mode of ['lead', 'support']) {
        profiles.push(profileFromConfig(captureConfig(whiteCellBody, {
            onboarding: null,
            isLeadOperator: () => mode === 'lead'
        })));
    }
    profiles.push(profileFromConfig(captureConfig(gameMasterBody, { onboarding: null })));

    const getSmeOnboardingContent = await extractNamedFunction(
        'src/roles/sme.js',
        'getSmeOnboardingContent',
        'getSmeAccessState',
        { getSmeRoleDisplayLabel, SME_ROLES }
    );
    for (const smeRole of Object.values(SME_ROLES)) {
        profiles.push(profileFromConfig(captureConfig(smeBody, {
            smeRole,
            onboarding: null
        }, {
            getSmeOnboardingContent,
            SME_ROLES
        })));
    }
    return profiles;
}

export async function buildStartHereAudioScripts() {
    const profiles = await buildProfiles();
    const unique = new Map();

    profiles.forEach((profile) => {
        profile.slides.forEach((slide) => {
            const contentId = hashFollowAlongNarration(slide.text);
            const existing = unique.get(contentId);
            if (existing && existing.text !== slide.text) {
                throw new Error(`Narration hash collision for ${contentId}`);
            }
            if (!existing) {
                unique.set(contentId, {
                    id: `start-here.${contentId}`,
                    filename: `${contentId}.mp3`,
                    text: slide.text,
                    scriptSha256: sha256(slide.text),
                    usedBy: []
                });
            }
            unique.get(contentId).usedBy.push({
                storageKey: profile.storageKey,
                kind: slide.kind,
                stepIndex: slide.stepIndex ?? null,
                title: slide.title
            });
            slide.clipId = `start-here.${contentId}`;
            delete slide.text;
        });
    });

    const entries = [...unique.values()].sort((left, right) => left.id.localeCompare(right.id));
    const canonical = entries.map(({ id, text }) => `${id}\0${text}`).join('\n');
    return {
        schemaVersion: 1,
        experienceVersion: 'start-here-1.0',
        generatedVoiceDisclosure: 'Narration is generated with Kokoro using the af_heart voice.',
        profileCount: profiles.length,
        slideReferenceCount: profiles.reduce((sum, profile) => sum + profile.slides.length, 0),
        clipCount: entries.length,
        scriptBundleSha256: sha256(canonical),
        profiles,
        entries
    };
}

function outputArgument(argv) {
    const index = argv.indexOf('--out');
    if (index === -1 || !argv[index + 1]) {
        throw new Error('Usage: node scripts/start-here-audio/export-scripts.mjs --out <path>');
    }
    return resolve(argv[index + 1]);
}

async function main() {
    const outputPath = outputArgument(process.argv.slice(2));
    const payload = await buildStartHereAudioScripts();
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    process.stdout.write(`Exported ${payload.clipCount} unique clips for ${payload.slideReferenceCount} slide references across ${payload.profileCount} role profiles.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main();
}
