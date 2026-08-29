/**
 * Plenary board controller — projector surface for SME-finalized PLI outputs.
 */

import { sessionStore } from '../stores/session.js';
import { database } from '../services/database.js';
import { createLogger } from '../utils/logger.js';
import { applyHeaderGameStateDisplay, getHeaderGameStateDisplay } from '../utils/gameStateDisplay.js';
import { createPlenaryBoard } from '../features/plenary/PlenaryBoard.js';
import {
    PLI_REPORT_SCOPES,
    buildPlenaryModel,
    collectPlenaryReportRows
} from '../features/plenary/plenaryData.js';

const logger = createLogger('PlenaryBoard');
const POLL_MS = 20000;
const THEME_STORAGE_KEY = 'fo-theme';

function pinProjectionTheme() {
    const root = document.documentElement;
    if (!root) return;
    let stored = null;
    try {
        stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch (_error) {
        stored = null;
    }
    if (stored !== 'light' && stored !== 'dark') {
        root.setAttribute('data-theme', 'dark');
    }
}

function formatClock(date = new Date()) {
    return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
    });
}

export class PlenaryController {
    constructor() {
        this.board = null;
        this.pollTimer = null;
        this.clockTimer = null;
        this.refreshing = false;
        this.reportRows = [];
        this.gameState = null;
        this.selection = {
            scope: PLI_REPORT_SCOPES.SIMULATION,
            move: null
        };
    }

    init() {
        pinProjectionTheme();
        const host = document.getElementById('plenaryBoard');
        if (!host) {
            logger.error('Missing #plenaryBoard');
            return;
        }
        this.board = createPlenaryBoard(host);
        this.bindChrome();
        this.startClock();
        void this.refresh();
        this.startPoll();
    }

    bindChrome() {
        const scopeSelect = document.getElementById('plenaryScope');
        scopeSelect?.addEventListener('change', () => {
            const value = scopeSelect.value;
            if (value === PLI_REPORT_SCOPES.SIMULATION || value === '') {
                this.selection = { scope: PLI_REPORT_SCOPES.SIMULATION, move: null };
            } else {
                this.selection = { scope: PLI_REPORT_SCOPES.MOVE, move: Number(value) };
            }
            this.renderFromCache();
        });

        const fullscreenBtn = document.getElementById('plenaryFullscreenBtn');
        fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
        document.addEventListener('fullscreenchange', () => this.syncFullscreenLabel());
    }

    startClock() {
        const clock = document.getElementById('plenaryClock');
        const tick = () => {
            if (!clock) return;
            const now = new Date();
            clock.dateTime = now.toISOString();
            clock.textContent = formatClock(now);
        };
        tick();
        this.clockTimer = window.setInterval(tick, 1000);
    }

    startPoll() {
        if (this.pollTimer) window.clearInterval(this.pollTimer);
        this.pollTimer = window.setInterval(() => {
            void this.refresh();
        }, POLL_MS);
    }

    getSessionId() {
        return sessionStore.getSessionId?.()
            || sessionStore.getSessionData?.()?.id
            || sessionStore.getOperatorAuth?.()?.sessionId
            || null;
    }

    getSessionMeta() {
        const sessionData = sessionStore.getSessionData?.() || {};
        const auth = sessionStore.getOperatorAuth?.() || {};
        return {
            sessionId: this.getSessionId(),
            sessionName: sessionData.name || auth.sessionName || '',
            sessionCode: sessionData.code || sessionData.session_code || auth.sessionCode || ''
        };
    }

    async refresh() {
        if (this.refreshing) return;
        const sessionId = this.getSessionId();
        if (!sessionId) {
            this.reportRows = [];
            this.gameState = null;
            this.board?.render({ mode: 'connect' });
            this.syncMeta(null);
            return;
        }

        this.refreshing = true;
        try {
            const [adjudications, actions, gameState] = await Promise.all([
                database.fetchPliAdjudications(sessionId),
                database.fetchActions(sessionId).catch(() => []),
                database.getGameState(sessionId).catch(() => null)
            ]);
            const actionsById = new Map((actions || []).map((action) => [action.id, action]));
            this.reportRows = collectPlenaryReportRows(adjudications, actionsById);
            this.gameState = gameState;
            this.syncScopeOptions();
            this.syncGameState();
            this.renderFromCache();
        } catch (error) {
            logger.error('Failed to refresh plenary board', error);
            if (!this.reportRows.length) {
                this.board?.render({ mode: 'empty' });
            }
        } finally {
            this.refreshing = false;
        }
    }

    syncScopeOptions() {
        const select = document.getElementById('plenaryScope');
        if (!select) return;
        const moves = [...new Set(this.reportRows.map((row) => row.move).filter((m) => m != null))]
            .sort((a, b) => a - b);
        const current = this.selection.scope === PLI_REPORT_SCOPES.MOVE
            ? String(this.selection.move)
            : PLI_REPORT_SCOPES.SIMULATION;
        const options = [
            `<option value="${PLI_REPORT_SCOPES.SIMULATION}">Whole simulation</option>`,
            ...moves.map((move) => `<option value="${move}">Move ${move}</option>`)
        ];
        select.innerHTML = options.join('');
        if ([...select.options].some((option) => option.value === current)) {
            select.value = current;
        } else {
            select.value = PLI_REPORT_SCOPES.SIMULATION;
            this.selection = { scope: PLI_REPORT_SCOPES.SIMULATION, move: null };
        }
    }

    syncGameState() {
        const display = getHeaderGameStateDisplay(this.gameState, [], {
            fallbackToMoveOne: Boolean(this.getSessionId())
        });
        applyHeaderGameStateDisplay(display);
    }

    syncMeta(model) {
        const meta = document.getElementById('plenaryMeta');
        if (!meta) return;
        if (!model) {
            meta.textContent = '';
            return;
        }
        const parts = [];
        if (model.actionCount != null) {
            parts.push(`${model.actionCount} finalized`);
        }
        if (model.macroTrend?.action_count) {
            parts.push(`${model.macroTrend.action_count} economic stacked`);
        }
        if (model.codebookVersion) {
            parts.push(`Codebook ${model.codebookVersion}`);
        }
        meta.textContent = parts.join(' · ');
    }

    renderFromCache() {
        const sessionId = this.getSessionId();
        if (!sessionId) {
            this.board?.render({ mode: 'connect' });
            this.syncMeta(null);
            return;
        }
        if (!this.reportRows.length) {
            this.board?.render({ mode: 'empty' });
            this.syncMeta({ actionCount: 0, codebookVersion: '' });
            return;
        }
        const model = buildPlenaryModel({
            reportRows: this.reportRows,
            selection: this.selection,
            gameState: this.gameState,
            sessionMeta: this.getSessionMeta()
        });
        this.syncMeta(model);
        this.board?.render({ mode: 'ready', model });
    }

    async toggleFullscreen() {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await document.documentElement.requestFullscreen();
            }
        } catch (error) {
            logger.warn('Fullscreen toggle failed', error);
        }
        this.syncFullscreenLabel();
    }

    syncFullscreenLabel() {
        const btn = document.getElementById('plenaryFullscreenBtn');
        if (!btn) return;
        const active = Boolean(document.fullscreenElement);
        btn.textContent = active ? 'Exit full screen' : 'Full screen';
        btn.setAttribute('aria-label', btn.textContent);
    }

    destroy() {
        if (this.pollTimer) window.clearInterval(this.pollTimer);
        if (this.clockTimer) window.clearInterval(this.clockTimer);
        this.board?.destroy?.();
    }
}

export const plenaryController = new PlenaryController();

function startPlenaryBoard() {
    void plenaryController.init();
}

if (!globalThis.__ESG_DISABLE_AUTO_INIT__) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startPlenaryBoard);
    } else {
        startPlenaryBoard();
    }
}

export default plenaryController;
