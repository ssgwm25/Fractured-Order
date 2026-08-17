import { afterEach, describe, expect, it, vi } from 'vitest';

import { database } from '../../services/database.js';
import { sessionStore } from '../../stores/session.js';
import { getTrainingRoleRoute } from './trainingContext.js';
import {
    BLUE_SCRIBE_PRACTICE_ARTIFACT,
    TRAINING_RECOVERY_MESSAGE,
    hydrateTrainingFixtures,
    syncTrainingSandboxBannerLayout,
    trainingRuntime
} from './trainingRuntime.js';

function serverBootstrap(overrides = {}) {
    return {
        attempt_id: 'attempt-blue-scribe-1',
        template_session_id: '00000000-0000-4000-8000-000000002026',
        curriculum_version: '1.0',
        profile_id: 'blue.scribe',
        semantic_role: 'scribe',
        team: 'blue',
        status: 'in_progress',
        current_step_id: null,
        resumed: false,
        session_classification: 'training_template',
        is_protected: true,
        experience_plugin_id: 'ssg-training',
        ...overrides
    };
}

function createSessionStoreDouble() {
    let context = null;
    return {
        clear: vi.fn(() => { context = null; }),
        setTrainingContext: vi.fn((value) => { context = value; }),
        clearTrainingContext: vi.fn(() => { context = null; }),
        setRole: vi.fn(),
        setUserName: vi.fn(),
        hasTrainingContext: vi.fn(() => Boolean(context)),
        getTrainingContext: vi.fn(() => context)
    };
}

describe('isolated training runtime', () => {
    afterEach(() => {
        sessionStore.clear();
    });

    it('starts from protected bootstrap metadata without seat, sync, or live persistence calls', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        const databaseRef = {
            startOrResumeTrainingAttempt: vi.fn().mockResolvedValue(serverBootstrap()),
            claimParticipantSeat: vi.fn(),
            getGameState: vi.fn(),
            createAction: vi.fn()
        };

        const result = await trainingRuntime.startOrResume({
            code: 'TRAINING2026',
            team: 'blue',
            publicRoleSurface: 'facilitator',
            displayName: 'Morgan',
            databaseRef,
            sessionStoreRef
        });

        expect(result).toMatchObject({
            role: 'blue_facilitator',
            route: getTrainingRoleRoute('blue', 'scribe'),
            context: { team: 'blue', semanticRole: 'scribe', trainingMode: true }
        });
        expect(databaseRef.claimParticipantSeat).not.toHaveBeenCalled();
        expect(databaseRef.getGameState).not.toHaveBeenCalled();
        expect(databaseRef.createAction).not.toHaveBeenCalled();
    });

    it('rejects a forged training flag when protected plugin metadata is absent', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        const databaseRef = {
            startOrResumeTrainingAttempt: vi.fn().mockResolvedValue({
                ...serverBootstrap(),
                training_mode: true,
                experience_plugin_id: undefined
            })
        };

        await expect(trainingRuntime.startOrResume({
            code: 'TRAINING2026',
            team: 'blue',
            publicRoleSurface: 'facilitator',
            databaseRef,
            sessionStoreRef
        })).rejects.toMatchObject({ code: 'TRAINING_WRITE_BLOCKED' });
        expect(sessionStoreRef.setTrainingContext).not.toHaveBeenCalled();
    });

    it('rejects a protected bootstrap for a curriculum version not bundled by the client', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        const databaseRef = {
            startOrResumeTrainingAttempt: vi.fn().mockResolvedValue(serverBootstrap({
                curriculum_version: '2.0'
            }))
        };

        await expect(trainingRuntime.startOrResume({
            code: 'TRAINING2026',
            team: 'blue',
            publicRoleSurface: 'facilitator',
            databaseRef,
            sessionStoreRef
        })).rejects.toMatchObject({ code: 'TRAINING_WRITE_BLOCKED' });
        expect(databaseRef.startOrResumeTrainingAttempt).toHaveBeenCalledWith(expect.objectContaining({
            curriculumVersion: '1.0'
        }));
        expect(sessionStoreRef.setTrainingContext).not.toHaveBeenCalled();
    });

    it('revalidates cached context by owner-scoped attempt ID and rejects mismatches', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        sessionStoreRef.setTrainingContext({
            attemptId: 'attempt-blue-scribe-1',
            curriculumVersion: '1.0',
            semanticRole: 'scribe',
            team: 'blue',
            trainingMode: true
        });
        const databaseRef = {
            getTrainingAttemptBootstrap: vi.fn().mockResolvedValue(serverBootstrap({
                profile_id: 'red.scribe',
                team: 'red'
            }))
        };

        await expect(trainingRuntime.revalidate({ databaseRef, sessionStoreRef }))
            .rejects.toMatchObject({ code: 'TRAINING_WRITE_BLOCKED' });
        expect(sessionStoreRef.clearTrainingContext).toHaveBeenCalled();
    });

    it('rejects handcrafted operator, SME, Observer, and White Cell routes', async () => {
        for (const pathname of ['/master.html', '/sme.html', '/whitecell.html', '/teams/blue/facilitator.html?mode=observer']) {
            const sessionStoreRef = createSessionStoreDouble();
            sessionStoreRef.setTrainingContext({
                attemptId: 'attempt-blue-scribe-1',
                curriculumVersion: '1.0',
                semanticRole: 'scribe',
                team: 'blue',
                trainingMode: true
            });
            const navigateRef = vi.fn();
            const showToastRef = vi.fn();
            const databaseRef = {
                getTrainingAttemptBootstrap: vi.fn().mockResolvedValue(serverBootstrap())
            };
            const url = new URL(pathname, 'https://app.local');

            const state = await trainingRuntime.guardCurrentRoute({
                locationRef: url,
                databaseRef,
                sessionStoreRef,
                navigateRef,
                showToastRef
            });

            expect(state).toEqual({ active: false, allowed: false });
            expect(sessionStoreRef.clearTrainingContext).toHaveBeenCalled();
            expect(navigateRef).toHaveBeenCalledWith('', { replace: true });
            expect(showToastRef).toHaveBeenCalledWith({
                message: TRAINING_RECOVERY_MESSAGE,
                type: 'error'
            });
        }
    });

    it('hydrates one deterministic Blue Scribe practice artifact in memory', () => {
        const first = hydrateTrainingFixtures({ team: 'blue', semanticRole: 'scribe' });
        const second = hydrateTrainingFixtures({ team: 'blue', semanticRole: 'scribe' });

        expect(first.actions).toEqual([BLUE_SCRIBE_PRACTICE_ARTIFACT]);
        expect(second.actions).toEqual(first.actions);
        expect(second.actions).not.toBe(first.actions);
        expect(hydrateTrainingFixtures({ team: 'red', semanticRole: 'scribe' }).actions).toEqual([]);
    });

    it('reserves the full measured banner height when its content wraps', () => {
        const setProperty = vi.fn();
        const documentRef = { body: { style: { setProperty } } };
        const banner = {
            getBoundingClientRect: vi.fn(() => ({ height: 97.2 }))
        };

        expect(syncTrainingSandboxBannerLayout({ banner, documentRef })).toBe(98);
        expect(setProperty).toHaveBeenCalledWith('--training-sandbox-banner-height', '98px');
    });

    it('fails closed on unrecognized training writes with recovery copy', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        sessionStoreRef.setTrainingContext({
            attemptId: 'attempt-blue-scribe-1',
            curriculumVersion: '1.0',
            semanticRole: 'scribe',
            team: 'blue',
            trainingMode: true
        });
        const databaseRef = {
            recordTrainingProgressEvent: vi.fn(),
            createAction: vi.fn()
        };

        await expect(trainingRuntime.executeWrite('create-action', {}, {
            databaseRef,
            sessionStoreRef
        })).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        expect(databaseRef.recordTrainingProgressEvent).not.toHaveBeenCalled();
        expect(databaseRef.createAction).not.toHaveBeenCalled();
    });

    it('blocks every live database method while a training attempt hint is present', () => {
        const createActionBoundary = database.createAction;
        sessionStore.setTrainingContext({
            attemptId: 'attempt-blue-scribe-1',
            curriculumVersion: '1.0',
            semanticRole: 'scribe',
            team: 'blue',
            trainingMode: true
        }, { serverValidated: true });

        expect(database.createAction).toBe(createActionBoundary);
        expect(() => database.createAction({})).toThrow(TRAINING_RECOVERY_MESSAGE);
        expect(() => database.fetchActions('forged-live-session')).toThrow(TRAINING_RECOVERY_MESSAGE);
    });
});
