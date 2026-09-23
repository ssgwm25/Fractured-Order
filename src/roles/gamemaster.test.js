import { describe, expect, it, vi } from 'vitest';

import {
    buildDashboardModel,
    buildExportSelectionState,
    getCreateSessionFormHtml,
    buildRecentActivityModel,
    GameMasterController,
    getGameMasterArchiveSessionConfirmationOptions,
    getGameMasterDeleteSessionConfirmationOptions,
    getGameMasterAccessState,
    getAdminExportButtonConfig,
    getParticipantSessionLabel
} from './gamemaster.js';
import {
    SESSION_CODE_MAX_LENGTH,
    SESSION_CODE_MIN_LENGTH
} from '../utils/validation.js';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function installBadgeDocument() {
    const previousDocument = global.document;

    global.document = {
        createElement(tagName) {
            let explicitInnerHtml = '';

            return {
                className: '',
                set textContent(value) {
                    explicitInnerHtml = escapeHtml(value ?? '');
                },
                get innerHTML() {
                    return explicitInnerHtml;
                },
                set innerHTML(value) {
                    explicitInnerHtml = value == null ? '' : String(value);
                },
                get outerHTML() {
                    const classAttribute = this.className ? ` class="${escapeHtml(this.className)}"` : '';
                    return `<${tagName}${classAttribute}>${this.innerHTML}</${tagName}>`;
                }
            };
        }
    };

    return () => {
        if (previousDocument) {
            global.document = previousDocument;
        } else {
            delete global.document;
        }
    };
}

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
            'printResearchReportBtn',
            'exportCrossSessionResearchArchiveBtn'
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

describe('GameMaster session administration', () => {
    it('GC08 exposes labelled native controls, both explicit models and live recovery status', () => {
        const html = getCreateSessionFormHtml();
        expect(html).toContain('for="newSessionGreenConfiguration"');
        expect(html).toContain('value="unified_v1"');
        expect(html).toContain('value="shared_facilitator_v1"');
        expect(html).toContain('for="newSessionRoster"');
        expect(html).toContain('id="newSessionCreationStatus" role="status" aria-live="polite"');
    });
    it('uses modal-scoped create-session ids that do not collide with the sidebar session name', () => {
        const html = getCreateSessionFormHtml();

        expect(html).toContain('for="newSessionName"');
        expect(html).toContain('id="newSessionName"');
        expect(html).toContain('for="newSessionCode"');
        expect(html).toContain('id="newSessionCode"');
        expect(html).toContain(`maxlength="${SESSION_CODE_MAX_LENGTH}"`);
        expect(html).toContain(`Alphanumeric, ${SESSION_CODE_MIN_LENGTH}-${SESSION_CODE_MAX_LENGTH} characters.`);
        expect(html).toContain('for="newSessionDescription"');
        expect(html).toContain('id="newSessionDescription"');
        expect(html).not.toContain('for="sessionName"');
        expect(html).not.toContain('id="sessionName"');
        expect(html).not.toContain('for="sessionCode"');
        expect(html).not.toContain('id="sessionCode"');
    });

    it('explains that session archival closes joins while retaining evidence', () => {
        expect(getGameMasterArchiveSessionConfirmationOptions({ name: 'Alpha Session' })).toMatchObject({
            title: 'Archive Session',
            confirmLabel: 'Archive',
            cancelLabel: 'Keep Active',
            variant: 'warning'
        });
        expect(getGameMasterArchiveSessionConfirmationOptions({ name: 'Alpha Session' }).message).toContain(
            'immutable audit records will be retained'
        );
        expect(getGameMasterArchiveSessionConfirmationOptions({ name: 'Alpha Session' }).message).toContain(
            'Export the research archive first'
        );
    });

    it('gives archived sessions a Game Master delete confirmation that preserves evidence', () => {
        const options = getGameMasterDeleteSessionConfirmationOptions({ name: 'Alpha Session' });

        expect(options).toMatchObject({
            title: 'Delete Archived Session',
            confirmLabel: 'Delete Session',
            cancelLabel: 'Keep Archived',
            variant: 'danger'
        });
        expect(options.message).toContain('no longer appear in active or archived lists');
        expect(options.message).toContain('immutable audit records will remain stored');
    });

    it('renders delete only for archived session cards', () => {
        const restoreDocument = installBadgeDocument();

        try {
            const controller = new GameMasterController();
            const archivedHtml = controller.renderSessionCard({
                id: 'archived-session',
                name: 'Archived Session',
                session_code: 'ARCHIVE1',
                status: 'archived',
                created_at: '2026-08-01T10:00:00.000Z',
                updated_at: '2026-08-02T10:00:00.000Z'
            });
            const activeHtml = controller.renderSessionCard({
                id: 'active-session',
                name: 'Active Session',
                session_code: 'ACTIVE01',
                status: 'active',
                created_at: '2026-08-01T10:00:00.000Z',
                updated_at: '2026-08-02T10:00:00.000Z'
            });

            expect(archivedHtml).toContain('delete-session-btn');
            expect(archivedHtml).not.toContain('archive-session-btn');
            expect(archivedHtml).not.toContain('select-session-btn');
            expect(activeHtml).toContain('archive-session-btn');
            expect(activeHtml).not.toContain('delete-session-btn');
        } finally {
            restoreDocument();
        }
    });

    it('labels participant rows with the selected or joined session', () => {
        expect(getParticipantSessionLabel({}, {
            name: 'Alpha Session',
            session_code: 'ALPHA'
        })).toBe('Alpha Session (ALPHA)');

        expect(getParticipantSessionLabel({
            sessionName: 'Bravo Session',
            sessionCode: 'BRAVO'
        }, {
            name: 'Alpha Session',
            session_code: 'ALPHA'
        })).toBe('Bravo Session (BRAVO)');
    });

    it('renders the participant table with explicit session context', () => {
        const restoreDocument = installBadgeDocument();

        try {
            const controller = new GameMasterController();
            const html = controller.renderParticipantsTable([{
                id: 'seat-1',
                display_name: 'Alex',
                role: 'blue_facilitator',
                is_active: true,
                heartbeat_at: '2026-04-08T10:05:00.000Z'
            }], {
                session: {
                    name: 'Alpha Session',
                    code: 'ALPHA'
                }
            });

            expect(html).toContain('<th scope="col">Session</th>');
            expect(html).toContain('Alpha Session (ALPHA)');
        } finally {
            restoreDocument();
        }
    });
});

describe('GameMaster plugin mounts', () => {
    it('mounts and tears down the registered Intercom plugin from selected-session state', () => {
        const previousDocument = global.document;
        const host = {
            ownerDocument: null,
            children: [],
            innerHTML: '',
            querySelector: vi.fn(() => null),
            appendChild: vi.fn((child) => {
                child.parentNode = host;
                host.children.push(child);
                return child;
            })
        };
        const fakeDocument = {
            head: {
                appendChild: vi.fn()
            },
            createElement: vi.fn(() => ({
                id: '',
                className: '',
                dataset: {},
                innerHTML: '',
                textContent: '',
                ownerDocument: null,
                querySelector: vi.fn(() => null),
                remove() {
                    if (!this.parentNode?.children) {
                        return;
                    }
                    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
                }
            })),
            getElementById: vi.fn((id) => (id === 'gameMasterPluginMounts' ? host : null))
        };
        host.ownerDocument = fakeDocument;
        fakeDocument.createElement.mockImplementation((tagName) => ({
            tagName,
            id: '',
            className: '',
            dataset: {},
            innerHTML: '',
            textContent: '',
            ownerDocument: fakeDocument,
            querySelector: vi.fn(() => null),
            remove() {
                if (!this.parentNode?.children) {
                    return;
                }
                this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
            }
        }));
        global.document = fakeDocument;

        try {
            const controller = new GameMasterController();
            controller.currentSessionId = 'session-1';

            controller.reconcilePluginMounts({
                session: { id: 'session-1' },
                gameState: {
                    plugin_state: {
                        intercom: { enabled: true }
                    }
                }
            });

            expect(controller.pluginMountHosts.get('intercom')?.innerHTML).toContain('Intercom Announcement');
            expect(controller.pluginInstances.has('intercom')).toBe(true);

            controller.reconcilePluginMounts({
                session: { id: 'session-1' },
                gameState: {
                    plugin_state: {
                        intercom: { enabled: false }
                    }
                }
            });

            expect(host.children).toEqual([]);
            expect(controller.pluginInstances.has('intercom')).toBe(false);
        } finally {
            if (previousDocument) {
                global.document = previousDocument;
            } else {
                delete global.document;
            }
        }
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
