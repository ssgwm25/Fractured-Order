// Resume only interrupted Auth provisioning, never a started fixture matrix.
import { ACTORS } from './gc03-completion-sql.mjs';
import { check, uuid } from './gc03-completion-contract.mjs';

export function validateAuthResume(report, manifest, state) {
    uuid(manifest.run); uuid(manifest.legacy);
    for (const id of Object.values(manifest.sessions)) uuid(id);
    check(/^[a-z]{20}$/.test(manifest.projectRef), 'resume project reference');
    check(report.run === manifest.run && state.run === manifest.run
        && report.projectRef === manifest.projectRef, 'resume run/project match');
    check(report.setupAttempted !== true && !report.matrixPassed && !report.cleanupPassed
        && /^FAIL: anonymous Auth /.test(report.failure || '')
        && report.requests?.length > 0
        && report.requests.every(r => ['deployed-authorization-inventory', 'auth-resume-presence'].includes(r.label)),
    'resume requires an Auth-only failure before fixture setup');
    const entries = Object.entries(state.users || {});
    check(entries.length > 0 && entries.every(([who]) => ACTORS.includes(who)), 'known saved Auth actors');
    check(new Set(entries.map(([, user]) => uuid(user.id))).size === entries.length, 'distinct saved Auth identities');
    for (const [, user] of entries) {
        check(typeof user.access_token === 'string' && user.access_token.length > 0
            && typeof user.refresh_token === 'string' && user.refresh_token.length > 0, 'saved Auth credentials required');
    }
}

export async function provisionActor({ who, runId, users, auth, persist, protect }) {
    const saved = users[who];
    const verify = user => check(user?.id && user.is_anonymous === true
        && user.user_metadata?.gc03_test_run === runId && (!saved || user.id === saved.id),
    `anonymous Auth ${who}: server identity/provenance mismatch`);
    // Refresh the same identity to obtain a full token lifetime for the matrix.
    // A refresh failure never falls back to signing up a replacement identity.
    const result = saved
        ? await auth.refreshSession({ refresh_token: saved.refresh_token })
        : await auth.signInAnonymously({ options: { data: { gc03_test_run: runId } } });
    if (result.data?.session) protect(result.data.session.access_token, result.data.session.refresh_token);
    check(!result.error && result.data?.session,
        `anonymous Auth ${who}: ${result.error?.message || 'missing session'}`);
    verify(result.data.user);
    users[who] = { id: uuid(result.data.user.id), access_token: result.data.session.access_token,
        refresh_token: result.data.session.refresh_token };
    await persist(); // Refresh tokens rotate: checkpoint before the next actor.
    return saved ? 'refreshed' : 'created';
}
