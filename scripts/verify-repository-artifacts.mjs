#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, posix, resolve } from 'node:path';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function normalizeRepositoryPath(candidatePath) {
    const normalizedPath = posix.normalize(String(candidatePath).replaceAll('\\', '/'));

    return normalizedPath === '.'
        ? ''
        : normalizedPath.replace(/^\.\/+/, '').replace(/\/$/, '');
}

export const ALLOWLIST = Object.freeze([
    Object.freeze({
        id: 'environment-template',
        ruleIds: Object.freeze(['runtime-secrets']),
        pattern: /(?:^|\/)\.env\.(?:example|sample|template)$/i
    }),
    Object.freeze({
        id: 'published-sample-report',
        ruleIds: Object.freeze(['unapproved-report-binary']),
        pattern: /^Fractured-Order-Sample-Report\.pdf$/i
    }),
    Object.freeze({
        id: 'published-playtest-briefing',
        ruleIds: Object.freeze(['unapproved-report-binary']),
        pattern: /^Plenum Briefing\/PLENUM_Playtest_30Jul2026_Open_Tech_Check\.pdf$/i
    }),
    Object.freeze({
        id: 'reviewed-codebook-evidence',
        ruleIds: Object.freeze(['unapproved-report-binary']),
        pattern: /^pli\/codebook\/evidence\/(?:.+\/)?[^/]+\.(?:docx?|pdf|pptx?|xlsx?)$/i
    }),
    Object.freeze({
        id: 'curated-pli-deliverable',
        ruleIds: Object.freeze(['unapproved-report-binary']),
        pattern: /^pli\/deliverables\/(?:.+\/)?[^/]+\.pdf$/i
    })
]);

function containsDirectory(...directoryNames) {
    const alternatives = directoryNames
        .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    return new RegExp(`(?:^|/)(?:${alternatives})(?:/|$)`, 'i');
}

export const DENYLIST = Object.freeze([
    Object.freeze({
        id: 'dependency-folder',
        pattern: containsDirectory('node_modules', 'bower_components', 'jspm_packages', '.pnpm-store', '.venv', 'venv'),
        remediation: 'Remove installed dependencies from the Git index and restore them with the package manager.'
    }),
    Object.freeze({
        id: 'runtime-secrets',
        pattern: /(?:^|\/)(?:\.env(?:\.[^/]+)?|credentials\.json|service-account(?:\.[^/]+)?\.json|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:key|p12|pfx|pem))(?:$|\/)/i,
        remediation: 'Remove the runtime secret from the Git index, rotate any exposed credential, and commit only a documented template.'
    }),
    Object.freeze({
        id: 'test-output',
        pattern: containsDirectory('test-results', 'playwright-report', 'blob-report', '.playwright-mcp', 'coverage', 'htmlcov', '.nyc_output', '.pytest_cache'),
        remediation: 'Remove generated test output from the Git index and keep it in an ignored local output directory.'
    }),
    Object.freeze({
        id: 'build-output',
        pattern: containsDirectory('dist', 'build', '.vite', '__pycache__'),
        remediation: 'Remove reproducible build output from the Git index and regenerate it during CI or deployment.'
    }),
    Object.freeze({
        id: 'browser-storage',
        pattern: /(?:^|\/)(?:\.auth|browser-(?:data|storage)|user-data(?:-dir)?)(?:\/|$)|(?:^|\/)(?:auth|storage)[-_]?state(?:\.[^/]+)?\.json$/i,
        remediation: 'Remove browser storage from the Git index; tests must create isolated state at runtime.'
    }),
    Object.freeze({
        id: 'recording',
        pattern: /(?:^|\/)(?:recordings?|session-recordings?)(?:\/|$)|(?:^|\/)(?:recording|screen[-_]?recording|session[-_]?recording)[^/]*\.(?:m4a|mov|mp3|mp4|ogg|wav|webm)$/i,
        remediation: 'Remove recordings from the Git index and store approved evidence outside the source repository.'
    }),
    Object.freeze({
        id: 'generated-report-output',
        pattern: /(?:^|\/)(?:output\/release-evidence|release-evidence|pli\/reports\/out|generated[-_]?reports?|report-output)(?:\/|$)|(?:^|\/)report\.(?:aux|bbl|bcf|blg|fdb_latexmk|fls|log|out|run\.xml|synctex\.gz|toc)$/i,
        remediation: 'Remove generated reports or local evidence from the Git index and publish them through the approved evidence workflow.'
    }),
    Object.freeze({
        id: 'unapproved-report-binary',
        pattern: /\.(?:docx?|pdf|pptx?|xlsx?)$/i,
        remediation: 'Remove the binary report or add a narrowly reviewed allowlist entry that documents its stable repository purpose.'
    })
]);

function isAllowedForRule(repositoryPath, ruleId) {
    return ALLOWLIST.some((entry) => (
        entry.ruleIds.includes(ruleId) && entry.pattern.test(repositoryPath)
    ));
}

export function findProhibitedArtifacts(trackedPaths) {
    const violations = [];

    for (const trackedPath of trackedPaths) {
        const repositoryPath = normalizeRepositoryPath(trackedPath);
        if (!repositoryPath) {
            continue;
        }

        for (const rule of DENYLIST) {
            if (rule.pattern.test(repositoryPath) && !isAllowedForRule(repositoryPath, rule.id)) {
                violations.push({
                    path: repositoryPath,
                    ruleId: rule.id,
                    remediation: rule.remediation
                });
            }
        }
    }

    return violations;
}

export function formatViolations(violations) {
    const details = violations.map((violation) => (
        `- ${violation.path} [${violation.ruleId}]\n  Remediation: ${violation.remediation}`
    ));

    return [
        'Repository artifact boundary violation: prohibited generated or sensitive paths are tracked.',
        ...details
    ].join('\n');
}

function readTrackedPaths() {
    const result = spawnSync('git', ['ls-files', '-z'], {
        cwd: repositoryRoot,
        encoding: 'utf8'
    });

    if (result.error || result.status !== 0) {
        const reason = result.error?.message || String(result.stderr || '').trim() || `git exited with status ${result.status}`;
        throw new Error(`Unable to inspect tracked repository paths: ${reason}`);
    }

    return result.stdout.split('\0').filter(Boolean);
}

export function main() {
    let trackedPaths;

    try {
        trackedPaths = readTrackedPaths();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 2;
        return;
    }

    const violations = findProhibitedArtifacts(trackedPaths);
    if (violations.length > 0) {
        console.error(formatViolations(violations));
        process.exitCode = 1;
        return;
    }

    console.log(`Repository artifact check passed (${trackedPaths.length} tracked paths inspected).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
