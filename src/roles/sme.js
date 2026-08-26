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
import { createSmePliPacketQueue } from '../features/pli/SmePliPacketQueue.js';
import {
    SEATS as PLI_SEATS,
    seatNeedsReview,
    getSeatReview,
    isDownstreamSeatUnlocked
} from '../features/pli/pliShared.js';

const logger = createLogger('SmeConsole');

/** Queue kinds mounted by the SME console — one entry per SME_ROLES value. */
export const SME_QUEUE_KINDS = Object.freeze({
    [SME_ROLES.ECON]: 'macro',
    [SME_ROLES.NI_ESCALATION]: 'ni_escalation',
    [SME_ROLES.DIPLOMACY_INFORMATION]: 'diplomacy_information',
    [SME_ROLES.TSJ]: 'handoff_tsj',
    [SME_ROLES.VERBA]: 'handoff_verba'
});

export function getSmeQueueKind(smeRole) {
    return SME_QUEUE_KINDS[smeRole] || null;
}

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
        this.packetPanel = null;
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

        try {
            this.smeRole = accessState.smeRole;
            this.bindChrome();
            this.mountRoleQueue();
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
        } catch (error) {
            logger.error('SME console failed to start', error);
            showToast({
                message: 'SME console failed to start. Try signing in again.',
                type: 'error'
            });
        }
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
            [SME_ROLES.TSJ]: 'Copy White Cell–complete action narratives into Tribe Street Journal, then mark done.',
            [SME_ROLES.VERBA]: 'Copy White Cell–complete action narratives into Verba, then mark done.'
        };
        if (sectionDescription) {
            sectionDescription.textContent = descriptions[this.smeRole] || 'SME queue';
        }

        const isHandoffRole = this.smeRole === SME_ROLES.TSJ || this.smeRole === SME_ROLES.VERBA;
        if (isHandoffRole && navLabel) {
            navLabel.textContent = 'Action handoffs';
        }
        if (isHandoffRole && sectionTitle) {
            sectionTitle.textContent = 'Action handoffs';
        }

        const packetNav = document.getElementById('smePliPacketsNavItem');
        if (packetNav) {
            packetNav.hidden = !isHandoffRole;
        }
        const packetTitle = document.getElementById('smePliPacketsSectionTitle');
        const packetDescription = document.getElementById('smePliPacketsSectionDescription');
        if (isHandoffRole && packetTitle) packetTitle.textContent = 'Approved PLI';
        if (isHandoffRole && packetDescription) {
            packetDescription.textContent = this.smeRole === SME_ROLES.VERBA
                ? 'Copy SME-approved PLI JSON into Verba after Econ, NI, or Dip-Info finalize, then mark done.'
                : 'Copy SME-approved PLI markdown into Tribe Street Journal after Econ, NI, or Dip-Info finalize, then mark done.';
        }

        const sessionData = sessionStore.getSessionData?.() || {};
        if (sessionMeta) {
            sessionMeta.textContent = [
                sessionData.name || sessionData.code || '',
                sessionData.displayName || ''
            ].filter(Boolean).join(' · ');
        }
    }

    mountRoleQueue() {
        const host = document.getElementById('smeQueuePanel');
        if (!host) {
            throw new Error('SME queue host #smeQueuePanel is missing from sme.html');
        }

        host.innerHTML = '';
        this.panel?.destroy?.();
        this.panel = null;
        this.packetPanel?.destroy?.();
        this.packetPanel = null;

        const sessionId = () => sessionStore.getSessionId?.() || sessionStore.getSessionData?.()?.id || null;
        const reviewerName = () => {
            const auth = sessionStore.getOperatorAuth?.() || {};
            return auth.operatorName
                || auth.displayName
                || sessionStore.getUserName?.()
                || getSmeRoleDisplayLabel(this.smeRole);
        };

        const queueKind = getSmeQueueKind(this.smeRole);
        if (queueKind === 'macro') {
            this.panel = createPliMacroReview({
                container: host,
                getSessionId: sessionId,
                getReviewerName: reviewerName,
                canReview: () => true
            });
        } else if (queueKind === 'ni_escalation') {
            this.panel = createNiEscalationReview({
                container: host,
                getSessionId: sessionId,
                getReviewerName: reviewerName,
                canReview: () => true,
                isRowUnlocked: isDownstreamSeatUnlocked
            });
        } else if (queueKind === 'diplomacy_information') {
            this.panel = createDiplomacyInfoReview({
                container: host,
                getSessionId: sessionId,
                getReviewerName: reviewerName,
                canReview: () => true,
                isRowUnlocked: isDownstreamSeatUnlocked
            });
        } else if (queueKind === 'handoff_tsj' || queueKind === 'handoff_verba') {
            this.panel = createSmeHandoffQueue({
                container: host,
                getSessionId: sessionId,
                getAcknowledgerName: reviewerName,
                seat: queueKind === 'handoff_verba' ? 'verba' : 'tsj'
            });
            const packetHost = document.getElementById('smePliPacketsPanel');
            if (!packetHost) {
                throw new Error('SME packet host #smePliPacketsPanel is missing from sme.html');
            }
            packetHost.innerHTML = '';
            this.packetPanel = createSmePliPacketQueue({
                container: packetHost,
                getSessionId: sessionId,
                getAcknowledgerName: reviewerName,
                seat: queueKind === 'handoff_verba' ? 'verba' : 'tsj'
            });
        } else {
            throw new Error(`Unsupported SME role for queue mount: ${this.smeRole || 'unknown'}`);
        }

        if (!this.panel?.refresh) {
            throw new Error(`SME queue panel for ${this.smeRole} did not expose refresh()`);
        }
        if (this.packetPanel && !this.packetPanel.refresh) {
            throw new Error(`SME PLI packet panel for ${this.smeRole} did not expose refresh()`);
        }

        this.refreshQueue();
    }

    refreshQueue() {
        this.panel?.refresh?.();
        this.packetPanel?.refresh?.();
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
                const packetBadge = document.getElementById('smePliPacketsBadge');
                if (packetBadge) {
                    const packets = await database.fetchSmePliPackets(sessionId, {
                        handoffSeat: seat,
                        status: 'pending'
                    }).catch(() => []);
                    packetBadge.textContent = String(packets.length);
                    packetBadge.hidden = packets.length <= 0;
                }
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
        this.packetPanel?.destroy?.();
    }
}

export const smeController = new SmeController();

function startSmeConsole() {
    void smeController.init().catch((error) => {
        logger.error('Unhandled SME console init failure', error);
        showToast({
            message: 'SME console failed to start. Try signing in again.',
            type: 'error'
        });
    });
}

if (!globalThis.__ESG_DISABLE_AUTO_INIT__) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startSmeConsole);
    } else {
        startSmeConsole();
    }
}

export default smeController;
