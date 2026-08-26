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

export function getSmeOnboardingContent(smeRole) {
    const label = getSmeRoleDisplayLabel(smeRole);
    const commonOpening = {
        title: 'Your specialist boundary',
        body: `${label} is a role-scoped review queue; act only on the evidence and controls exposed for this seat.`,
        narrative: 'Read the source action and the generated worksheet together, then make the explicit specialist decision required by this queue.',
        details: ['White Cell cannot approve on behalf of the SME.', 'Visibility does not mean the item is ready for review.', 'Every approval, override, return, copy, or acknowledgement stays attached to its source record.']
    };
    const configurations = {
        [SME_ROLES.ECON]: {
            summary: 'Validate the Macro PLI classification, implementation worksheet, and outputs before finalizing the Macro seat.',
            reviewTitle: 'Review the Macro chain',
            reviewBody: 'Compare the source action with its lever, policy instrument, implementation score, modifiers, citations, and macro outputs.',
            reviewNarrative: 'Approve only when the generated chain is supportable. Override requires your replacement value and rationale; Send back returns the same seat for rework.',
            decisionDetails: ['Approve finalizes the presented Macro output.', 'Override finalizes the specialist correction and rationale.', 'Send back does not finalize the seat.']
        },
        [SME_ROLES.NI_ESCALATION]: {
            summary: 'Validate the six National Interest domains and Glasl escalation trajectory after the Macro dependency clears.',
            reviewTitle: 'Review NI and escalation',
            reviewBody: 'Read the orientation assessment, domain deltas, primary domains, net NI effect, Glasl stage, trajectory, and cited rationale.',
            reviewNarrative: 'The queue remains locked until Macro is finalized or explicitly skipped. Review the NI and escalation evidence as one specialist decision.',
            decisionDetails: ['Confirm all required domain evidence.', 'Use override only with a bounded rationale.', 'Send back preserves the unresolved specialist boundary.']
        },
        [SME_ROLES.DIPLOMACY_INFORMATION]: {
            summary: 'Validate the paired Diplomacy and Information outputs after the Macro dependency clears.',
            reviewTitle: 'Review the paired outputs',
            reviewBody: 'Compare the source action with diplomacy coding, information brief, routing, paired preview, and supporting rationale.',
            reviewNarrative: 'Diplomacy and Information clear together. Approve or override only after both routed tracks are supportable.',
            decisionDetails: ['A non-routed track is evidence, not a missing approval.', 'One decision finalizes the paired seat.', 'Send back identifies what must be corrected.']
        },
        [SME_ROLES.TSJ]: {
            summary: 'Carry the finalized Tribe Street Journal narrative across the controlled external TSJ handoff boundary.',
            reviewTitle: 'Complete the TSJ handoff',
            reviewBody: 'Read the source metadata and narrative, copy the prepared text to the external TSJ workflow, then mark the handoff done.',
            reviewNarrative: 'Copy preserves the provided narrative; Mark done is the explicit acknowledgement that the external handoff was completed.',
            decisionDetails: ['Do not rewrite the source record in this queue.', 'Copy and Mark done are separate actions.', 'Show done reveals acknowledged history.']
        },
        [SME_ROLES.VERBA]: {
            summary: 'Carry the finalized population-sentiment narrative across the controlled external Verba handoff boundary.',
            reviewTitle: 'Complete the Verba handoff',
            reviewBody: 'Read the source metadata and narrative, copy the prepared text to the external Verba workflow, then mark the handoff done.',
            reviewNarrative: 'Copy preserves the provided narrative; Mark done is the explicit acknowledgement that the external handoff was completed.',
            decisionDetails: ['Do not rewrite the source record in this queue.', 'Copy and Mark done are separate actions.', 'Show done reveals acknowledged history.']
        }
    };
    return configurations[smeRole]
        ? Object.freeze({ label, opening: commonOpening, ...configurations[smeRole] })
        : null;
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
        this.onboarding = null;
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
            this.mountFollowAlongOnboarding();
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
    }

    mountRoleQueue() {
        const host = document.getElementById('smeQueuePanel');
        if (!host) {
            throw new Error('SME queue host #smeQueuePanel is missing from sme.html');
        }

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
        } else {
            throw new Error(`Unsupported SME role for queue mount: ${this.smeRole || 'unknown'}`);
        }

        if (!this.panel?.refresh) {
            throw new Error(`SME queue panel for ${this.smeRole} did not expose refresh()`);
        }

        this.refreshQueue();
    }

    mountFollowAlongOnboarding() {
        const content = getSmeOnboardingContent(this.smeRole);
        if (!content) return null;
        const queueSelector = '.sidebar-link[data-section="smeQueue"]';
        this.onboarding?.destroy?.();
        this.onboarding = mountFollowAlong({
            storageKey: `followalong:sme:${this.smeRole}`,
            title: `${content.label} guide`,
            roleLabel: content.label,
            summary: content.summary,
            anchor: null,
            steps: [
                content.opening,
                {
                    title: 'Read queue state',
                    body: 'The queue badge, pending count, reviewed-history toggle, and Refresh control show what is ready for this specialist seat.',
                    narrative: 'Refresh deliberately when coordinating a handoff; the background refresh does not change a decision or clear an unread item.',
                    details: ['Pending means the seat still requires action.', 'Locked or empty rows are not approval failures.', 'Reviewed history remains read-only.'],
                    targetLabel: 'SME queue',
                    highlight: queueSelector,
                    action: { label: 'Open SME queue', selector: queueSelector }
                },
                {
                    title: content.reviewTitle,
                    body: content.reviewBody,
                    narrative: content.reviewNarrative,
                    details: content.decisionDetails,
                    targetLabel: 'Current review card',
                    highlight: '.pli-sme-card'
                },
                {
                    title: 'Use the explicit decision controls',
                    body: this.smeRole === SME_ROLES.TSJ || this.smeRole === SME_ROLES.VERBA
                        ? 'Use Copy, then Mark done, on the current handoff card.'
                        : 'Use Approve, Override, or Send back only after reviewing the complete specialist evidence.',
                    narrative: 'The chosen control records the workflow outcome; reading, scrolling, or refreshing never finalizes the seat.',
                    details: content.decisionDetails,
                    targetLabel: 'Specialist actions',
                    highlight: this.smeRole === SME_ROLES.TSJ || this.smeRole === SME_ROLES.VERBA
                        ? '.pli-sme-actions'
                        : '.pli-sme-footer'
                },
                {
                    title: 'Complete the specialist loop',
                    body: 'Verify the source record, decision or acknowledgement, reviewer identity, and resulting queue state before leaving the console.',
                    narrative: 'Your specialist action becomes evidence for White Cell and later reporting; it does not replace White Cell’s separate operational responsibilities.',
                    details: ['Resolve or document every exception.', 'Confirm the item leaves the pending queue.', 'Start Here remains available in the sidebar.'],
                    targetLabel: 'Queue status',
                    highlight: '.pli-sme-toolbar'
                }
            ]
        });
        return this.onboarding;
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
        this.onboarding?.destroy?.();
        this.panel?.destroy?.();
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
