/**
 * SME Console Controller
 * Role-scoped PLI review (Econ / NI / Dip-Info) and TSJ / Verba handoff queues.
 */

import { sessionStore } from '../stores/session.js';
import { database } from '../services/database.js';
import { syncService } from '../services/sync.js';
import { createLogger } from '../utils/logger.js';
import { showToast } from '../components/ui/Toast.js';
import { navigateToApp } from '../core/navigation.js';
import {
    OPERATOR_SURFACES,
    SME_ROLES,
    getSmeRoleDisplayLabel,
    parseTeamRole
} from '../core/teamContext.js';
import { createPliMacroReview } from '../features/pli/PliMacroReview.js';
import { createNiEscalationReview } from '../features/pli/NiEscalationReview.js';
import { createDiplomacyInfoReview } from '../features/pli/DiplomacyInfoReview.js';
import { createSmeHandoffQueue } from '../features/pli/SmeHandoffQueue.js';
import {
    SEATS as PLI_SEATS,
    seatNeedsReview,
    getSeatReview,
    isDownstreamSeatUnlocked
} from '../features/pli/pliShared.js';

const logger = createLogger('SmeConsole');

export function getSmeAccessState(sessionStoreRef = sessionStore) {
    const sessionId = sessionStoreRef.getSessionId?.()
        || sessionStoreRef.getSessionData?.()?.id
        || null;
    const role = sessionStoreRef.getRole?.()
        || sessionStoreRef.getSessionData?.()?.role
        || sessionStoreRef.getOperatorAuth?.()?.role
        || null;
    const parsed = parseTeamRole(role);
    const allowed = Boolean(
        sessionId
        && parsed.surface === OPERATOR_SURFACES.SME
        && parsed.smeRole
    );

    return {
        allowed,
        sessionId,
        role,
        smeRole: parsed.smeRole || null
    };
}

export class SmeController {
    constructor() {
        this.smeRole = null;
        this.panel = null;
        this.refreshTimer = null;
    }

    async init() {
        logger.info('Initializing SME console');

        const accessState = getSmeAccessState(sessionStore);
        if (!accessState.allowed) {
            showToast({
                message: 'SME consoles require authorization from the landing page.',
                type: 'error'
            });
            navigateToApp('index.html#smeAccessSection', { replace: true });
            return;
        }

        try {
            const grant = await database.requireOperatorGrant(OPERATOR_SURFACES.SME, {
                sessionId: accessState.sessionId,
                role: accessState.role
            });
            sessionStore.setOperatorAuth({
                ...grant,
                sessionId: grant?.sessionId || accessState.sessionId,
                teamId: grant?.teamId || null,
                role: grant?.role || accessState.role
            });
        } catch (error) {
            logger.warn('Blocked SME access after failed server verification', error);
            sessionStore.clearOperatorAuth();
            showToast({
                message: 'SME access requires a valid server-side operator grant.',
                type: 'error'
            });
            navigateToApp('index.html#smeAccessSection', { replace: true });
            return;
        }

        this.smeRole = accessState.smeRole;
        this.bindChrome();
        this.mountRolePanel();
        this.startRefreshLoop();

        const sessionId = accessState.sessionId;
        const participantId = sessionStore.getSessionData?.()?.participantId;
        if (sessionId && !syncService.isInitialized?.()) {
            try {
                await syncService.initialize(sessionId, { participantId });
            } catch (error) {
                logger.warn('SME sync initialize skipped/failed', error);
            }
        }

        logger.info('SME console initialized for', this.smeRole);
    }

    bindChrome() {
        const label = getSmeRoleDisplayLabel(this.smeRole);
        const headerTitle = document.getElementById('headerTitle');
        const headerSubtitle = document.getElementById('headerSubtitle');
        const navLabel = document.getElementById('smeQueueNavLabel');
        const sectionTitle = document.getElementById('smeQueueSectionTitle');
        const sectionDescription = document.getElementById('smeQueueSectionDescription');
        const sessionMeta = document.getElementById('headerSessionMeta');

        if (headerTitle) headerTitle.textContent = label;
        if (headerSubtitle) headerSubtitle.textContent = 'Subject-matter expert console';
        if (navLabel) navLabel.textContent = label;
        if (sectionTitle) sectionTitle.textContent = label;

        const descriptions = {
            [SME_ROLES.ECON]: 'Approve or override Macro PLI outputs. White Cell Lead sees finalized Macro read-only.',
            [SME_ROLES.NI_ESCALATION]: 'Review NI & Escalation after Macro is finalized or skipped.',
            [SME_ROLES.DIPLOMACY_INFORMATION]: 'Review Diplomacy & Information after Macro is finalized or skipped.',
            [SME_ROLES.TSJ]: 'External Tribe Street Journal handoff — copy narrative, then mark done.',
            [SME_ROLES.VERBA]: 'External Verba AI handoff — copy narrative, then mark done.'
        };
        if (sectionDescription) {
            sectionDescription.textContent = descriptions[this.smeRole] || 'SME queue';
        }

        const sessionData = sessionStore.getSessionData?.() || {};
        if (sessionMeta) {
            sessionMeta.textContent = [
                sessionData.name || sessionData.code || '',
                sessionData.displayName || ''
            ].filter(Boolean).join(' · ');
        }

        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar')?.classList.toggle('is-open');
        });
    }

    mountRoleQueue() {
        const host = document.getElementById('smeQueuePanel');
        if (!host) return;

        host.innerHTML = '';
        this.panel?.destroy?.();
        this.panel = null;

        const sessionId = () => sessionStore.getSessionId?.() || sessionStore.getSessionData?.()?.id || null;
        const reviewerName = () => {
            const auth = sessionStore.getOperatorAuth?.() || {};
            return auth.operatorName
                || auth.displayName
                || sessionStore.getUserName?.()
                || getSmeRoleDisplayLabel(this.smeRole);
        };

        if (this.smeRole === SME_ROLES.ECON) {
            this.panel = createPliMacroReview({
                container: host,
                getSessionId: sessionId,
                getReviewerName: reviewerName,
                canReview: () => true
            });
        } else if (this.smeRole === SME_ROLES.NI_ESCALATION) {
            this.panel = createNiEscalationReview({
                container: host,
                getSessionId: sessionId,
                getReviewerName: reviewerName,
                canReview: () => true,
                isRowUnlocked: isDownstreamSeatUnlocked
            });
        } else if (this.smeRole === SME_ROLES.DIPLOMACY_INFORMATION) {
            this.panel = createDiplomacyInfoReview({
                container: host,
                getSessionId: sessionId,
                getReviewerName: reviewerName,
                canReview: () => true,
                isRowUnlocked: isDownstreamSeatUnlocked
            });
        } else if (this.smeRole === SME_ROLES.TSJ || this.smeRole === SME_ROLES.VERBA) {
            this.panel = createSmeHandoffQueue({
                container: host,
                getSessionId: sessionId,
                getAcknowledgerName: reviewerName,
                seat: this.smeRole === SME_ROLES.VERBA ? 'verba' : 'tsj'
            });
        }

        this.refreshQueue();
    }

    refreshQueue() {
        this.panel?.refresh?.();
        this.syncBadge().catch((err) => logger.warn('SME badge sync failed', err));
    }

    async syncBadge() {
        const badge = document.getElementById('smeQueueBadge');
        if (!badge) return;

        const sessionId = sessionStore.getSessionId?.() || sessionStore.getSessionData?.()?.id;
        if (!sessionId) return;

        let count = 0;
        try {
            if (this.smeRole === SME_ROLES.TSJ || this.smeRole === SME_ROLES.VERBA) {
                const seat = this.smeRole === SME_ROLES.VERBA ? 'verba' : 'tsj';
                const rows = await database.fetchSmeHandoffs(sessionId, { seat, status: 'pending' });
                count = rows.length;
            } else {
                const rows = await database.fetchPliAdjudications(sessionId);
                const seatId = this.smeRole === SME_ROLES.ECON
                    ? PLI_SEATS.MACRO
                    : (this.smeRole === SME_ROLES.NI_ESCALATION
                        ? PLI_SEATS.NATIONAL_INTEREST_ESCALATION
                        : PLI_SEATS.DIPLOMACY_INFORMATION);
                count = rows.filter((row) => {
                    if (this.smeRole !== SME_ROLES.ECON && !isDownstreamSeatUnlocked(row)) {
                        return false;
                    }
                    return seatNeedsReview(getSeatReview(row, seatId));
                }).length;
            }
        } catch (err) {
            logger.warn('SME badge fetch failed', err);
            return;
        }

        badge.textContent = String(count);
        badge.hidden = count <= 0;
    }

    startRefreshLoop() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => this.refreshQueue(), 45000);
    }

    destroy() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.panel?.destroy?.();
    }
}

export const smeController = new SmeController();

if (!globalThis.__ESG_DISABLE_AUTO_INIT__) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            void smeController.init();
        });
    } else {
        void smeController.init();
    }
}

export default smeController;
