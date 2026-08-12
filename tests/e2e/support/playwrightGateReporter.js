import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ACTOR_ANNOTATION = 'rehearsal-actors';
const SESSION_ANNOTATION = 'rehearsal-sessions';

function readCountAnnotation(test, type) {
    const annotation = [...test.annotations].reverse().find((entry) => entry.type === type);
    const count = Number(annotation?.description || 0);
    return Number.isInteger(count) && count >= 0 ? count : 0;
}

function readBrowserErrorCount(attachments) {
    const attachment = attachments.find((entry) => entry.name === 'browser-diagnostics.json');
    if (!attachment) {
        return 0;
    }

    try {
        const body = attachment.body
            ? Buffer.from(attachment.body).toString('utf8')
            : readFileSync(attachment.path, 'utf8');
        const diagnostics = JSON.parse(body);
        return (diagnostics.consoleErrors?.length || 0) + (diagnostics.pageErrors?.length || 0);
    } catch {
        return 1;
    }
}

export function buildGateSummary({
    gateName,
    protectedBranch,
    ciArtifactName,
    tests,
    runStatus
}) {
    const testRecords = [...tests.values()];
    const skippedTests = testRecords.filter((record) => record.status === 'skipped');
    const retriedToSuccess = testRecords.filter((record) => record.status === 'passed' && record.retries > 0);
    const retryCount = testRecords.reduce((sum, record) => sum + record.retries, 0);
    const browserErrorCount = testRecords.reduce((sum, record) => sum + record.browserErrorCount, 0);
    const violations = [];

    if (skippedTests.length > 0) {
        violations.push(`${skippedTests.length} test(s) were skipped`);
    }
    if (protectedBranch && retriedToSuccess.length > 0) {
        violations.push(`${retriedToSuccess.length} test(s) retried to success on a protected branch`);
    }
    if (browserErrorCount > 0) {
        violations.push(`${browserErrorCount} unexpected console/page error(s) were recorded`);
    }

    const diagnosticArtifactNames = [...new Set(testRecords.flatMap((record) => record.diagnosticNames))].sort();
    diagnosticArtifactNames.push('playwright-gate-summary.json');

    return {
        gateName,
        protectedBranch,
        ciArtifactName,
        status: runStatus === 'passed' && violations.length === 0 ? 'passed' : 'failed',
        actorCount: testRecords.reduce((sum, record) => sum + record.actorCount, 0),
        sessionCount: testRecords.reduce((sum, record) => sum + record.sessionCount, 0),
        testCount: testRecords.length,
        skippedCount: skippedTests.length,
        retryCount,
        retriedToSuccessCount: retriedToSuccess.length,
        browserErrorCount,
        diagnosticArtifactNames,
        violations
    };
}

export default class PlaywrightGateReporter {
    constructor(options = {}) {
        this.outputFile = resolve(options.outputFile || 'test-results/playwright-gate-summary.json');
        this.tests = new Map();
    }

    onTestEnd(test, result) {
        const previous = this.tests.get(test.id);
        const diagnosticNames = result.attachments.map((attachment) => attachment.name);

        this.tests.set(test.id, {
            actorCount: readCountAnnotation(test, ACTOR_ANNOTATION),
            sessionCount: readCountAnnotation(test, SESSION_ANNOTATION),
            retries: Math.max(previous?.retries || 0, result.retry),
            status: result.status,
            browserErrorCount: (previous?.browserErrorCount || 0) + readBrowserErrorCount(result.attachments),
            diagnosticNames: [...new Set([...(previous?.diagnosticNames || []), ...diagnosticNames])]
        });
    }

    onEnd(result) {
        const summary = buildGateSummary({
            gateName: process.env.PLAYWRIGHT_GATE_NAME || 'browser',
            protectedBranch: process.env.PLAYWRIGHT_PROTECTED_BRANCH === 'true',
            ciArtifactName: process.env.PLAYWRIGHT_CI_ARTIFACT_NAME || null,
            tests: this.tests,
            runStatus: result.status
        });

        mkdirSync(dirname(this.outputFile), { recursive: true });
        writeFileSync(this.outputFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

        if (summary.violations.length > 0) {
            summary.violations.forEach((violation) => process.stderr.write(`Playwright gate violation: ${violation}\n`));
        }

        return { status: summary.status };
    }
}
