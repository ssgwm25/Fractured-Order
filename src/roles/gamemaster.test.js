import { describe, expect, it, vi } from 'vitest';

import {
    buildDashboardModel,
    buildExportSelectionState,
    buildRecentActivityModel,
    getGameMasterAccessState,
    getAdminExportButtonConfig
} from './gamemaster.js';

describe('GameMaster dashboard mapping', () => {
    it('computes connected participant counts from live session bundles', () => {
        const bundles = [
            {
                session: { id: 'session-1', name: 'Alpha' },
                participants: [{ id: 'p1', is_active: true }, { id: 'p2', is_active: false }],
                actions: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
                requests: [{ id: 'r1', status: 'pending' }, { id: 'r2', status: 'answered' }],
                timeline: []
            },
            {
                session: { id: 'session-2', name: 'Bravo' },
                participants: [{ id: 'p3', is_active: true }],
                actions: [{ id: 'a4' }],
                requests: [{ id: 'r3', status: 'pending' }, { id: 'r4', status: 'pending' }],
                timeline: []
            }
        ];

        expect(buildDashboardModel(bundles)).toEqual({
            activeSessions: 2,
            totalParticipants: 2,
            totalActions: 4,
            pendingRequests: 3
        });
    });

    it('orders recent activity newest-first across sessions', () => {
        const recent = buildRecentActivityModel([
            {
                session: { id: 'session-1', name: 'Alpha' },
                timeline: [
                    { id: 't1', content: 'Older', created_at: '2026-04-06T10:00:00.000Z' }
                ]
            },
            {
                session: { id: 'session-2', name: 'Bravo' },
                timeline: [
                    { id: 't2', content: 'Newest', created_at: '2026-04-06T11:00:00.000Z' }
                ]
            }
        ]);

        expect(recent.map((item) => item.id)).toEqual(['t2', 't1']);
        expect(recent[0].sessionName).toBe('Bravo');
    });
});

describe('GameMaster export wiring', () => {
    it('matches the rendered export button set for the live legacy and research export surface', () => {
        expect(getAdminExportButtonConfig().map((config) => config.id)).toEqual([
            'exportJsonBtn',
            'exportActionsCsvBtn',
            'exportRequestsCsvBtn',
            'exportTimelineCsvBtn',
            'exportParticipantsCsvBtn',
            'exportResearchArchiveBtn',
            'printResearchReportBtn'
        ]);
    });

    it('defaults the export selection state to research mode and still supports an explicit standard override', () => {
        expect(buildExportSelectionState()).toEqual({
            disabled: true,
            researchDisabled: true,
            captureMode: 'research',
            message: 'Select a session before exporting JSON, CSV, or research archive data.'
        });

        expect(buildExportSelectionState({
            session: { id: 'session-1', name: 'Alpha' }
        })).toEqual({
            disabled: false,
            researchDisabled: false,
            captureMode: 'research',
            message: 'JSON, CSV, and research exports are ready for Alpha.'
        });

        expect(buildExportSelectionState({
            session: { id: 'session-1', name: 'Alpha' }
        }, {
            captureMode: 'standard'
        })).toEqual({
            disabled: false,
            researchDisabled: true,
            captureMode: 'standard',
            message: 'JSON and CSV exports are ready for Alpha. Research archive controls stay locked until research capture mode is enabled.'
        });
    });
});

describe('GameMaster operator access', () => {
    it('blocks access when operator auth is missing', () => {
        expect(getGameMasterAccessState({
            getRole: () => null,
            getSessionData: () => null,
            hasOperatorAccess: () => false
        })).toEqual({
            allowed: false,
            role: null,
            cachedOperatorAccess: false
        });
    });

    it('allows access only when the operator grant matches the Game Master surface', () => {
        const hasOperatorAccess = vi.fn(() => true);

        expect(getGameMasterAccessState({
            getRole: () => 'white',
            getSessionData: () => ({ role: 'white' }),
            hasOperatorAccess
        })).toEqual({
            allowed: true,
            role: 'white',
            cachedOperatorAccess: true
        });

        expect(hasOperatorAccess).toHaveBeenCalledWith('gamemaster', { role: 'white' });
    });
});
