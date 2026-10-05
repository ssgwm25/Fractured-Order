/**
 * SME Console Controller
 * Role-scoped PLI review (Econ / NI / Dip-Info) and TSJ / Verba handoff queues.
 */

import { sessionStore } from '../stores/session.js';
import { database } from '../services/database.js';
import { syncService } from '../services/sync.js';
import { ensureSeatStartup } from '../services/seatBootstrap.js';
import { createLogger } from '../utils/logger.js';
import { showToast } from '../components/ui/Toast.js';
import { navigateToApp } from '../core/navigation.js';
import { mountFollowAlong } from '../features/onboarding/followAlong.js';
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
import { subscribePliSmeChanges } from '../features/pli/pliRealtime.js';
import {
    SEATS as PLI_SEATS,
    seatNeedsReview,
    getSeatReview,
    isDownstreamSeatUnlocked
} from '../features/pli/pliShared.js';

const logger = createLogger('SmeConsole');

/** Polling fallback interval; realtime push (pliRealtime.js) is the primary path. */
export const SME_QUEUE_POLL_MS = 20000;

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

export function getSmeOnboardingContent(smeRole) {
    const content = {
        [SME_ROLES.ECON]: {
            summary: 'Review Macro PLI evidence, then approve, override, or send it back without changing the deterministic source record.',
            queueBody: 'Work the Macro queue in order and inspect the generated output alongside its evidence before recording a specialist decision.',
            queueNarrative: 'Macro is the first specialist boundary. A finalized or explicitly skipped Macro review unlocks the downstream seats.',
            controlsBody: 'Use the review footer to approve unchanged output, record an evidence-based override, or send incomplete work back.',
            controlsNarrative: 'Make the outcome explicit and preserve the rationale another operator needs to audit the decision.'
        },
        [SME_ROLES.NI_ESCALATION]: {
            summary: 'Review National Interest domains and escalation evidence after the Macro dependency clears.',
            queueBody: 'Work only unlocked NI and Escalation records, checking the six domains and Glasl trajectory against the supplied evidence.',
            queueNarrative: 'The queue remains dependency-gated. Do not treat a locked row as permission to infer or pre-approve its result.',
            controlsBody: 'Use the specialist controls to approve, override with an auditable rationale, or send the record back for correction.',
            controlsNarrative: 'Keep domain findings and escalation judgment attached to the same reviewed record.'
        },
        [SME_ROLES.DIPLOMACY_INFORMATION]: {
            summary: 'Review the paired Diplomacy and Information outputs after the Macro dependency clears.',
            queueBody: 'Inspect both paired outputs and their evidence before recording a specialist decision for the unlocked row.',
            queueNarrative: 'Diplomacy and Information clear together at this specialist boundary; neither track should be silently omitted.',
            controlsBody: 'Approve the paired result, record an evidence-based override, or return incomplete work through the explicit controls.',
            controlsNarrative: 'Preserve why the paired result changed so White Cell can consume finalized evidence without impersonating the SME.'
        },
        [SME_ROLES.TSJ]: {
            summary: 'Carry finalized action narratives and approved PLI into Tribe Street Journal through explicit, auditable handoffs.',
            queueBody: 'Use Action handoffs to copy each White Cell-complete source narrative into Tribe Street Journal.',
            queueNarrative: 'Copy the source before marking it done. The acknowledgement records the external TSJ handoff without rewriting the source.',
            controlsBody: 'Use Copy, then Mark done, and leave pending work visible until the external handoff is complete.',
            controlsNarrative: 'A completed acknowledgement proves the transfer step; it does not change White Cell adjudication.',
            packetBody: 'Use Approved PLI to copy finalized specialist markdown into Tribe Street Journal, then acknowledge the packet.',
            packetNarrative: 'Keep the approved specialist payload intact across the external TSJ handoff boundary.'
        },
        [SME_ROLES.VERBA]: {
            summary: 'Carry finalized action narratives and approved PLI into Verba through explicit, auditable handoffs.',
            queueBody: 'Use Action handoffs to copy each White Cell-complete source narrative into Verba.',
            queueNarrative: 'Copy the source before marking it done. The acknowledgement records the external Verba handoff without rewriting the source.',
            controlsBody: 'Use Copy, then Mark done, and leave pending work visible until the external handoff is complete.',
            controlsNarrative: 'A completed acknowledgement proves the transfer step; it does not change White Cell adjudication.',
            packetBody: 'Use Approved PLI to copy finalized specialist JSON into Verba, then acknowledge the packet.',
            packetNarrative: 'Keep the approved specialist payload intact across the external Verba handoff boundary.'
        }
    };
    const selected = content[smeRole];
    if (selected) return { roleLabel: getSmeRoleDisplayLabel(smeRole), ...selected };
    return {
        roleLabel: getSmeRoleDisplayLabel(smeRole) || 'SME',
        summary: 'Review the assigned specialist queue without changing deterministic source records.',
        queueBody: 'Inspect the assigned queue and its evidence before recording a specialist outcome.',
        queueNarrative: 'Keep every decision explicit and auditable.',
        controlsBody: 'Use only the controls exposed for the authorized specialist seat.',
        controlsNarrative: 'Do not infer or pre-approve unavailable work.'
    };
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
        this.onboarding = null;
        this.refreshTimer = null;
        this.unsubscribeRealtime = null;
    }

    async init() {
        logger.info('Initializing SME console');
        // main.js and this controller start independently; both must await the
        // same server restore before any heartbeat or protected workspace read.
        if (!await ensureSeatStartup()) return;

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
            this.mountFollowAlongOnboarding();
            this.startRealtime(accessState.sessionId);
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

    mountFollowAlongOnboarding() {
        const content = getSmeOnboardingContent(this.smeRole);
        const queueTarget = '.sidebar-link[data-section="smeQueue"]';
        const packetTarget = '.sidebar-link[data-section="smePliPackets"]';
        const steps = [
            {
                title: 'Your specialist boundary',
                body: `As ${content.roleLabel}, you own only the review or external handoff assigned to this seat.`,
                narrative: 'Use the persisted source evidence, record each outcome explicitly, and leave deterministic exercise decisions with their owning workflow.',
                details: ['Work only the active session queue.', 'Do not infer missing evidence.', 'Acknowledge external transfers only after the copy step is complete.']
            },
            {
                title: 'Read queue state',
                body: 'The queue badge, pending count, reviewed-history controls, and Refresh action show what is ready for this specialist seat.',
                narrative: 'Refresh deliberately when coordinating a handoff; background refresh does not decide an outcome or clear an unread item.',
                details: ['Pending means the seat still requires action.', 'Locked or empty rows are not approval failures.', 'Reviewed history remains read-only.'],
                targetLabel: 'SME queue',
                highlight: queueTarget,
                action: { label: 'Open SME queue', selector: queueTarget }
            },
            {
                title: 'Work the assigned queue',
                body: content.queueBody,
                narrative: content.queueNarrative,
                targetLabel: 'Assigned queue',
                highlight: queueTarget,
                action: { label: 'Open assigned queue', selector: queueTarget }
            },
            {
                title: 'Record an explicit outcome',
                body: content.controlsBody,
                narrative: content.controlsNarrative,
                targetLabel: 'Workflow controls',
                highlight: ['.pli-sme-footer', '.pli-sme-actions']
            }
        ];
        if (this.smeRole === SME_ROLES.TSJ || this.smeRole === SME_ROLES.VERBA) {
            steps.push({
                title: 'Transfer approved PLI',
                body: content.packetBody,
                narrative: content.packetNarrative,
                targetLabel: 'Approved PLI',
                highlight: packetTarget,
                action: { label: 'Open Approved PLI', selector: packetTarget }
            });
        }
        steps.push({
            title: 'Close the specialist loop',
            body: 'Confirm no assigned item is left in an ambiguous state before leaving the console.',
            narrative: 'Pending means work remains. Finalized or acknowledged means the named specialist boundary was completed and remains auditable.',
            details: ['Check the active session.', 'Verify the recorded status.', 'Leave incomplete work pending rather than guessing.'],
            targetLabel: 'Session reference',
            highlight: '#headerSessionMeta'
        });
        this.onboarding = mountFollowAlong({
            storageKey: `followalong:sme:${this.smeRole}`,
            title: `${content.roleLabel} guide`,
            roleLabel: content.roleLabel,
            summary: content.summary,
            steps
        });
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

    /**
     * Realtime push for PLI rows; the polling loop below stays as the fallback.
     */
    startRealtime(sessionId) {
        this.stopRealtime();
        const resolvedSessionId = sessionId
            || sessionStore.getSessionId?.()
            || sessionStore.getSessionData?.()?.id
            || null;
        if (!resolvedSessionId) return;
        this.unsubscribeRealtime = subscribePliSmeChanges({
            sessionId: resolvedSessionId,
            onChange: (detail) => {
                logger.info('PLI realtime change', detail);
                this.refreshQueue();
            }
        });
    }

    stopRealtime() {
        if (typeof this.unsubscribeRealtime === 'function') {
            try {
                this.unsubscribeRealtime();
            } catch (error) {
                logger.warn('PLI realtime unsubscribe failed', error);
            }
        }
        this.unsubscribeRealtime = null;
    }

    startRefreshLoop() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => this.refreshQueue(), SME_QUEUE_POLL_MS);
    }

    destroy() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = null;
        this.stopRealtime();
        this.panel?.destroy?.();
        this.packetPanel?.destroy?.();
        this.onboarding?.destroy?.();
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
