import { describe, expect, it } from 'vitest';

import {
    getBuiltCommit,
    normalizeCommitSha,
    normalizeReleaseEvidence,
    publishDeploymentIdentity
} from './releaseEvidence.js';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

describe('release evidence identity', () => {
    it('accepts only a full immutable source commit', () => {
        expect(normalizeCommitSha(COMMIT.toUpperCase())).toBe(COMMIT);
        expect(normalizeCommitSha('0123456')).toBeNull();
        expect(normalizeCommitSha('not-a-commit')).toBeNull();
        expect(getBuiltCommit({ VITE_DEPLOYED_COMMIT: COMMIT })).toBe(COMMIT);
    });

    it('publishes the built commit without exposing configuration or credentials', () => {
        const documentRef = { documentElement: { dataset: {} } };

        expect(publishDeploymentIdentity({ documentRef, commit: COMMIT })).toBe(COMMIT);
        expect(documentRef.documentElement.dataset.deployedCommit).toBe(COMMIT);

        publishDeploymentIdentity({ documentRef, commit: null });
        expect(documentRef.documentElement.dataset.deployedCommit).toBe('unverified');
    });

    it('normalizes the protected database evidence shape', () => {
        expect(normalizeReleaseEvidence({
            migration_state: '2026-10-07_hosted_release_evidence',
            migration_count: '66',
            migration_ledger_sha256: 'ABC123',
            software_build_hash: COMMIT
        })).toEqual({
            migrationState: '2026-10-07_hosted_release_evidence',
            migrationCount: 66,
            migrationLedgerSha256: 'abc123',
            softwareBuildHash: COMMIT
        });
    });
});
