// Records human observations; never opens a browser or infers accessibility PASS.
import { readFile, writeFile, realpath, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { check, roles, makeManifest, validate, setupSql, assertCleanup } from './gc07-live-contract.mjs';
import { uuid, redact } from './gc04-live-contract.mjs';
import { sha, assertSource, sourceSnapshot, verifyDeployment } from './gc07-live-provenance.mjs';

export const manualCases = Object.freeze([
    ['keyboard', 'Use only Tab/Shift+Tab/Enter/Space/Escape for join, regional selection, RFI creation/correction and White Cell answer. Check visible focus, dialog focus containment and return.'],
    ['screen-reader', 'Record screen reader/browser/OS versions. Read role, owner, revision, labels, errors and live notices. Verify updates announce once without stealing focus.'],
    ['mobile-zoom', 'At 390x844 and desktop 200% zoom, reach submission/correction buttons without overlap, clipping or unintended horizontal scrolling. Record viewport and zoom.'],
    ['reduced-motion', 'Enable reduced motion. Navigate regional workspaces and notices; verify transitions respect the setting and information remains available without animation or colour alone.'],
    ['recovery', 'Mark a notice read, disconnect one browser, send a new scoped message from White Cell, reconnect and reload. Check one notice, preserved unread/read state, silent startup and correct owning region.'],
    ['audiences-and-approval', 'Verify journal/deck and four audience forms with distinct identities. For Blue and Red synthetic actions, prove no delivery before White Cell approval and delivery to both regions after approval. Preserve private proposal recipient threads.'],
    ['removal', 'Remove a fixture participant using the existing operator flow. Confirm UI/storage clear private content and server reads/writes fail. Record the actual result; do not rejoin to conceal a failure.']
]);
export function template(report, reportHash) {
    check(report?.diagnosticOnly !== true && report?.connectionPolicy !== 'close-after-response',
        'connection-close diagnostics cannot supply manual acceptance evidence');
    check(report?.passed === true && report.workflowPassed === true && report.racesPassed === true && report.cleanupPassed === true,
        'manual evidence must reference a successful hosted API/concurrency run');
    const fixtures = makeManifest(report.projectRef, report.baseURL, report.target === 'local-assets-hosted-auth-rpc');
    return { version: 1, run: report.run, manualRun: fixtures.run, projectRef: report.projectRef, baseURL: report.baseURL,
        hostedReportSha256: reportHash, sourceDigest: report.deployment.build.source.digest,
        createdAt: new Date().toISOString(), operator: '', browser: '', os: '', screenReader: '',
        fixtureNotice: 'These generated browser fixtures are separate from the archived automated run. Fill real browser Auth IDs, then use manual-prepare.',
        sessions: fixtures.sessions.map(s => ({ model: s.model, sessionId: s.id, code: s.code, cleanupReceipt: '',
            actors: roles(s.model).map(role => ({ role, authUserId: '', seatId: '' })) })),
        checks: ['shared','pairs','unified'].flatMap(model => manualCases.map(([id, instruction]) => ({
            model, id, instruction: model === 'unified' ? 'Preserve the legacy unified role mapping and unscoped Green records. '
                + instruction.replace('regional selection, ', '').replace('four audience forms', 'legacy audience forms')
                    .replace('delivery to both regions', 'delivery to unified Green').replace('correct owning region', 'original unscoped owner')
                    .replace('regional workspaces', 'legacy workspaces') : instruction,
            status: 'pending', observedAt: '', observation: '', evidenceFiles: []
        }))) };
}
export function manualManifest(form, report) {
    uuid(form.manualRun);
    check(form.manualRun !== form.run && form.run === report.run && form.projectRef === report.projectRef
        && form.baseURL === report.baseURL, 'manual fixture provenance mismatch');
    const m = { version: 1, stage: 'GC-07-messaging', run: form.manualRun, projectRef: report.projectRef,
        baseURL: report.baseURL, local: report.target === 'local-assets-hosted-auth-rpc',
        roster: `green-roster-v${BigInt(`0x${form.manualRun.replaceAll('-', '')}`)}`,
        sessions: form.sessions.map(s => ({ model: s.model, id: s.sessionId, code: s.code,
            name: `GC07 SYNTHETIC REHEARSAL ${form.manualRun} ${s.model}`,
            actors: s.actors.map(a => ({ role: a.role, userId: a.authUserId, clientId: `gc07-${a.authUserId}`, sessionId: s.sessionId })) })) };
    validate(m);
    check(m.sessions.every(s => !report.actors.some(a => a.sessionId === s.id))
        && m.sessions.every(s => s.actors.every(a => !report.actors.some(old => old.userId === a.userId))),
    'manual browsers need independent identities and sessions');
    return m;
}
export function assertManual(form, report, reportHash) {
    const expected = template(report, reportHash);
    manualManifest(form, report);
    check(form?.version === 1 && form.run === report.run && form.projectRef === report.projectRef && form.baseURL === report.baseURL
        && form.hostedReportSha256 === reportHash && form.sourceDigest === expected.sourceDigest, 'manual provenance mismatch');
    for (const field of ['operator','browser','os','screenReader']) check(typeof form[field] === 'string' && form[field].trim(), `missing ${field}`);
    check(form.sessions?.length === 3 && form.checks?.length === expected.checks.length, 'missing manual model/case');
    const identities = [], sessions = [];
    for (const model of ['shared','pairs','unified']) {
        const matches = form.sessions.filter(s => s.model === model);
        check(matches.length === 1, 'duplicate/missing manual session');
        const s = matches[0]; sessions.push(uuid(s.sessionId));
        check(!report.actors.some(a => a.sessionId === s.sessionId), 'automated archived sessions cannot be reused');
        check(s.actors?.length === roles(model).length && s.cleanupReceipt, 'manual actors/cleanup evidence missing');
        for (const role of roles(model)) {
            const actors = s.actors.filter(a => a.role === role);
            check(actors.length === 1, 'manual role missing/duplicated');
            identities.push(uuid(actors[0].authUserId), uuid(actors[0].seatId));
        }
        for (const [id] of manualCases) {
            const records = form.checks.filter(c => c.model === model && c.id === id);
            check(records.length === 1, 'manual case missing/duplicated');
            const c = records[0];
            check(c.status === 'pass' && typeof c.observation === 'string' && c.observation.trim().length >= 20
                && Array.isArray(c.evidenceFiles) && c.evidenceFiles.length > 0
                && Number.isFinite(Date.parse(form.createdAt)) && Number.isFinite(Date.parse(c.observedAt))
                && Date.parse(c.observedAt) >= Date.parse(form.createdAt) && Date.parse(c.observedAt) <= Date.now(),
            `manual ${model}/${id} needs an actual passing observation, timestamp and evidence`);
        }
    }
    check(new Set(sessions).size === 3 && new Set(identities).size === identities.length, 'manual sessions/identities must be distinct');
}
export async function evidenceFile(directory, name) {
    check(typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name), 'evidence must be a file directly in the run directory');
    const root = await realpath(directory), path = await realpath(resolve(directory, name));
    check(dirname(path) === root, 'evidence symlink escaped run directory');
    const bytes = await readFile(path); check(bytes.length > 0, 'empty evidence file');
    return { file: name, sha256: sha(bytes), bytes: bytes.length };
}
export async function manual(mode, run) {
    uuid(run);
    const directory = resolve('test-results/gc07-live', run);
    const bytes = await readFile(resolve(directory, 'results.json')), report = JSON.parse(bytes);
    check(report.run === run, 'run directory mismatch');
    if (mode === 'manual-template') {
        assertSource(report.deployment.build.source, await sourceSnapshot());
        await writeFile(resolve(directory, 'manual-observations.json'), JSON.stringify(template(report, sha(bytes)), null, 2), { flag: 'wx' });
        console.log(`Pending template: ${resolve(directory, 'manual-observations.json')}`); return;
    }
    if (mode === 'manual-prepare') {
        const form = JSON.parse(await readFile(resolve(directory, 'manual-observations.json')));
        check(form.hostedReportSha256 === sha(bytes), 'hosted receipt changed');
        assertSource(report.deployment.build.source, await sourceSnapshot());
        const m = manualManifest(form, report), manualDirectory = resolve('test-results/gc07-live', m.run);
        await mkdir(manualDirectory, { recursive: true });
        await writeFile(resolve(manualDirectory, 'manifest.json'), JSON.stringify(m, null, 2), { flag: 'wx' });
        await writeFile(resolve(manualDirectory, 'setup.sql'), setupSql(m), { flag: 'wx' });
        console.log(`Generated SQL only: ${resolve(manualDirectory, 'setup.sql')}`);
        console.log(`After browser observations, archive with: node scripts/gc07-live-check.mjs cleanup ${m.run}`);
        return;
    }
    const receipt = { run, hostedReportSha256: sha(bytes), startedAt: new Date().toISOString(), passed: false,
        scope: 'human-attested manual observations and file integrity; not automated accessibility certification' };
    try {
        const formBytes = await readFile(resolve(directory, 'manual-observations.json'));
        const form = JSON.parse(formBytes); receipt.observationsSha256 = sha(formBytes);
        assertManual(form, report, sha(bytes));
        const m = manualManifest(form, report);
        assertSource(report.deployment.build.source, await sourceSnapshot());
        receipt.deployment = await verifyDeployment(report.baseURL, report.projectRef);
        const names = [...new Set([...form.checks.flatMap(c => c.evidenceFiles), ...form.sessions.map(s => s.cleanupReceipt)])];
        receipt.files = [];
        for (const name of names) receipt.files.push(await evidenceFile(directory, name));
        for (const name of new Set(form.sessions.map(s => s.cleanupReceipt))) {
            const cleanup = JSON.parse(await readFile(resolve(directory, name)));
            check(cleanup.run === m.run && cleanup.projectRef === m.projectRef && cleanup.passed === true
                && cleanup.cleanup?.outcome === 'archived-history-retained', 'manual fixture archive receipt missing/mismatched');
            assertCleanup(m, cleanup.cleanup.before, cleanup.cleanup.after);
            for (const s of form.sessions) {
                const actual = cleanup.cleanup.after.find(row => row.id === s.sessionId)?.seat_identities;
                check(Array.isArray(actual) && s.actors.every(a => actual.some(seat => seat.id === a.seatId
                    && seat.role === a.role && seat.authUserId === a.authUserId)), 'manual seat identities do not match database cleanup receipt');
            }
        }
        receipt.observations = form; receipt.passed = true;
    } catch (e) { receipt.error = e.message; process.exitCode = 1; }
    finally {
        receipt.finishedAt = new Date().toISOString();
        const output = resolve(directory, `manual-validation-${randomUUID()}.json`);
        await writeFile(output, JSON.stringify(redact(receipt), null, 2), { flag: 'wx' });
        console.log(`Manual evidence ${receipt.passed ? 'COMPLETE FOR REVIEW' : 'INCOMPLETE'}: ${output}`);
    }
}
