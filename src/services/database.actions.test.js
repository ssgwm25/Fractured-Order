import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENUMS } from '../core/enums.js';
import { DatabaseError } from '../core/errors.js';
import { database } from './database.js';

describe('database action lifecycle transitions', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('submits draft actions and stamps submitted_at', async () => {
        const draftAction = {
            id: 'action-1',
            status: ENUMS.ACTION_STATUS.DRAFT
        };

        vi.spyOn(database, 'getAction').mockResolvedValue(draftAction);
        vi.spyOn(database, 'updateAction').mockImplementation(async (_actionId, updates) => ({
            ...draftAction,
            ...updates
        }));

        const updatedAction = await database.submitAction('action-1');

        expect(database.getAction).toHaveBeenCalledWith('action-1');
        expect(database.updateAction).toHaveBeenCalledWith(
            'action-1',
            expect.objectContaining({
                status: ENUMS.ACTION_STATUS.SUBMITTED,
                submitted_at: expect.any(String)
            })
        );
        expect(updatedAction.status).toBe(ENUMS.ACTION_STATUS.SUBMITTED);
        expect(updatedAction.submitted_at).toEqual(expect.any(String));
    });

    it('rejects adjudication unless the action is already submitted', async () => {
        vi.spyOn(database, 'getAction').mockResolvedValue({
            id: 'action-2',
            status: ENUMS.ACTION_STATUS.DRAFT
        });
        vi.spyOn(database, 'updateAction').mockResolvedValue(null);

        await expect(database.adjudicateAction('action-2', {
            outcome: 'SUCCESS'
        })).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'Only submitted actions can be adjudicated.'
        });

        expect(database.updateAction).not.toHaveBeenCalled();
    });

    it('keeps draft-only edits within facilitator-safe fields', async () => {
        const draftAction = {
            id: 'action-3',
            status: ENUMS.ACTION_STATUS.DRAFT,
            goal: 'Initial goal'
        };

        vi.spyOn(database, 'getAction').mockResolvedValue(draftAction);
        vi.spyOn(database, 'updateAction').mockImplementation(async (_actionId, updates) => ({
            ...draftAction,
            ...updates
        }));

        await database.updateDraftAction('action-3', {
            goal: 'Updated goal',
            status: ENUMS.ACTION_STATUS.SUBMITTED,
            submitted_at: '2026-04-06T12:00:00.000Z',
            adjudicated_at: '2026-04-06T12:10:00.000Z',
            outcome: 'SUCCESS',
            adjudication_notes: 'Should be stripped'
        });

        expect(database.updateAction).toHaveBeenCalledWith(
            'action-3',
            {
                goal: 'Updated goal'
            },
            {
                allowEmptyMechanism: true
            }
        );
    });

    it('rejects draft updates for already submitted actions', async () => {
        vi.spyOn(database, 'getAction').mockResolvedValue({
            id: 'action-4',
            status: ENUMS.ACTION_STATUS.SUBMITTED
        });

        await expect(database.updateDraftAction('action-4', {
            goal: 'Late edit'
        })).rejects.toBeInstanceOf(DatabaseError);
    });
});
