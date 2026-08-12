import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function buildPlaywrightSummaryMarkdown(summary) {
    const diagnostics = summary.diagnosticArtifactNames.length > 0
        ? summary.diagnosticArtifactNames.map((name) => `\`${name}\``).join(', ')
        : 'None produced';
    const violations = summary.violations.length > 0
        ? summary.violations.map((violation) => `- ${violation}`).join('\n')
        : '- None';

    return [
        `### Deterministic ${summary.gateName} browser gate`,
        '',
        '| Metric | Value |',
        '| --- | ---: |',
        `| Actor count | ${summary.actorCount} |`,
        `| Session count | ${summary.sessionCount} |`,
        `| Test retries | ${summary.retryCount} |`,
        `| Skipped tests | ${summary.skippedCount} |`,
        `| Unexpected console/page errors | ${summary.browserErrorCount} |`,
        '',
        `Access-controlled CI artifact: \`${summary.ciArtifactName || 'not configured'}\``,
        '',
        `Diagnostic artifact names: ${diagnostics}`,
        '',
        `Gate status: **${summary.status.toUpperCase()}**`,
        '',
        'Violations:',
        '',
        violations,
        ''
    ].join('\n');
}

function main() {
    const summaryPath = process.argv[2] || 'test-results/playwright-gate-summary.json';
    const githubSummaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!githubSummaryPath) {
        throw new Error('GITHUB_STEP_SUMMARY is required to publish the Playwright gate summary.');
    }

    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    appendFileSync(githubSummaryPath, buildPlaywrightSummaryMarkdown(summary), 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
