export const REQUIRED_MIGRATION_STATE = '2026-10-07_hosted_release_evidence';
export const REQUIRED_MIGRATION_COUNT = 66;
export const REQUIRED_MIGRATION_LEDGER_SHA256 = 'ae7324d4833872fbc4ed0a8da1850a834adcede56b0ea263475ee5d602b8f895';

export function normalizeCommitSha(value) {
    const commit = String(value || '').trim().toLowerCase();
    return /^[a-f0-9]{40}$/.test(commit) ? commit : null;
}

export function getBuiltCommit(env = import.meta.env) {
    return normalizeCommitSha(env?.VITE_DEPLOYED_COMMIT);
}

export function publishDeploymentIdentity({
    documentRef = typeof document !== 'undefined' ? document : null,
    commit = getBuiltCommit()
} = {}) {
    if (!documentRef?.documentElement?.dataset) return null;
    documentRef.documentElement.dataset.deployedCommit = commit || 'unverified';
    return commit;
}

export function normalizeReleaseEvidence(value) {
    const evidence = value && typeof value === 'object' ? value : {};
    return {
        migrationState: String(evidence.migrationState || evidence.migration_state || '').trim() || null,
        migrationCount: Number(evidence.migrationCount ?? evidence.migration_count) || 0,
        migrationLedgerSha256: String(
            evidence.migrationLedgerSha256 || evidence.migration_ledger_sha256 || ''
        ).trim().toLowerCase() || null,
        softwareBuildHash: String(evidence.softwareBuildHash || evidence.software_build_hash || '').trim() || null
    };
}
