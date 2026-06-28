/**
 * Landing Page Controller
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Handles session joining and role selection on the landing page.
 */

import { sessionStore } from '../stores/session.js';
import { database } from '../services/database.js';
import { syncService } from '../services/sync.js';
import { ensureBrowserIdentity, getRuntimeConfigStatus } from '../services/supabase.js';
import { createLogger } from '../utils/logger.js';
import { showToast } from '../components/ui/Toast.js';
import { validateSessionCode } from '../utils/validation.js';
import { navigateToApp } from '../core/navigation.js';
import { getUserMessage } from '../core/errors.js';
import {
    OPERATOR_SURFACES,
    TEAM_OPTIONS,
    WHITE_CELL_OPERATOR_ROLES,
    isPublicRoleSurface,
    ROLE_SURFACES,
    buildTeamRole,
    buildWhiteCellOperatorRole,
    getRoleDisplayName,
    getRoleRoute,
    getRoleSurfaceDisplayLabel,
    parseTeamRole
} from '../core/teamContext.js';

const logger = createLogger('Landing');

const titleCase = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');
const FIELD_ERROR_MAP = {
    sessionCode: 'sessionCodeError',
    displayName: 'displayNameError',
    roleSelection: 'roleSelectionError',
    operatorAccessCode: 'operatorAccessCodeError'
};

// No-op join overlay controller used when there is no real DOM (unit tests)
// or when an operator-auth method is called without an overlay.
const NOOP_CONFIRMATION = { confirm: () => Promise.resolve(), dismiss: () => {} };

/**
 * Landing Page Controller Class
 */
export class LandingController {
    constructor() {
        this.selectedTeam = TEAM_OPTIONS[0].id;
        this.selectedRoleSurface = null;
        this.selectedRole = null;
    }

    /**
     * Initialize the landing page
     */
    init() {
        logger.info('Initializing landing page');

        if (!getRuntimeConfigStatus().ready) {
            logger.error('Landing page blocked: backend configuration is missing');
            return;
        }

        // Check if already in a session
        const existingSession = sessionStore.getSessionId();
        if (existingSession) {
            this.showResumeOption(existingSession);
        }

        this.bindEventListeners();
        this.selectDefaultTeam();
        void this.prewarmBrowserIdentity();
        logger.info('Landing page initialized');
    }

    /**
     * Bind event listeners
     */
    bindEventListeners() {
        // Join session form
        const joinForm = document.getElementById('joinForm');
        if (joinForm) {
            joinForm.addEventListener('submit', (e) => this.handleJoinSession(e));
        }

        const displayNameInput = document.getElementById('displayName');
        const sessionCodeInput = document.getElementById('sessionCode');
        sessionCodeInput?.addEventListener('input', () => this.clearFieldError('sessionCode'));
        displayNameInput?.addEventListener('input', () => this.clearFieldError('displayName'));

        const operatorUsernameInput = document.getElementById('operatorAccessUsername');
        if (displayNameInput && operatorUsernameInput) {
            const syncOperatorUsername = () => {
                operatorUsernameInput.value = displayNameInput.value.trim();
            };

            displayNameInput.addEventListener('input', syncOperatorUsername);
            syncOperatorUsername();
        }

        // Role selection buttons
        const teamButtons = document.querySelectorAll('.chip[data-team]');
        teamButtons.forEach((button) => {
            button.addEventListener('click', () => this.selectTeam(button));
        });

        const roleButtons = document.querySelectorAll('.chip[data-role-surface]');
        roleButtons.forEach((button) => {
            button.addEventListener('click', () => this.selectRole(button));
        });

        const operatorAccessCodeInput = document.getElementById('operatorAccessCode');
        operatorAccessCodeInput?.addEventListener('input', () => this.clearFieldError('operatorAccessCode'));

        const gameMasterAccessBtn = document.getElementById('operatorGameMasterBtn');
        gameMasterAccessBtn?.addEventListener('click', () => {
            void this.handleOperatorAccess(OPERATOR_SURFACES.GAME_MASTER);
        });

        const whiteCellLeadAccessBtn = document.getElementById('operatorWhiteCellLeadBtn');
        whiteCellLeadAccessBtn?.addEventListener('click', () => {
            void this.handleOperatorAccess(OPERATOR_SURFACES.WHITE_CELL, {
                operatorRole: WHITE_CELL_OPERATOR_ROLES.LEAD
            });
        });

        const whiteCellSupportAccessBtn = document.getElementById('operatorWhiteCellSupportBtn');
        whiteCellSupportAccessBtn?.addEventListener('click', () => {
            void this.handleOperatorAccess(OPERATOR_SURFACES.WHITE_CELL, {
                operatorRole: WHITE_CELL_OPERATOR_ROLES.SUPPORT
            });
        });

        const legacyWhiteCellAccessBtn = document.getElementById('operatorWhiteCellBtn');
        legacyWhiteCellAccessBtn?.addEventListener('click', () => {
            void this.handleOperatorAccess(OPERATOR_SURFACES.WHITE_CELL, {
                operatorRole: WHITE_CELL_OPERATOR_ROLES.LEAD
            });
        });

        // Leave session button (if shown)
        const leaveBtn = document.getElementById('leaveSessionBtn');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', () => this.leaveSession());
        }
    }

    selectDefaultTeam() {
        const defaultTeamButton = document.querySelector(`.chip[data-team="${this.selectedTeam}"]`);
        if (defaultTeamButton) {
            this.selectTeam(defaultTeamButton);
        }
    }

    selectTeam(button) {
        document.querySelectorAll('.chip[data-team]').forEach((candidate) => {
            candidate.classList.remove('selected');
            candidate.setAttribute('aria-pressed', 'false');
        });

        button.classList.add('selected');
        button.setAttribute('aria-pressed', 'true');

        this.selectedTeam = button.dataset.team || TEAM_OPTIONS[0].id;

        const teamInput = document.getElementById('selectedTeam');
        if (teamInput) {
            teamInput.value = this.selectedTeam;
        }

        this.updateSelectedRole();
        logger.debug('Team selected:', this.selectedTeam);
    }

    getValidationTarget(fieldName) {
        if (fieldName === 'roleSelection') {
            return document.getElementById('roleSelectionGroup')
                || document.querySelector?.('.chip[data-role-surface]');
        }

        return document.getElementById(fieldName);
    }

    setFieldError(fieldName, message, { focus = false } = {}) {
        const target = this.getValidationTarget(fieldName);
        const errorElement = document.getElementById(FIELD_ERROR_MAP[fieldName]);

        target?.setAttribute?.('aria-invalid', 'true');
        target?.classList?.add?.('is-invalid');

        if (errorElement) {
            errorElement.textContent = message;
            errorElement.hidden = false;
        }

        if (focus) {
            const focusTarget = fieldName === 'roleSelection'
                ? document.querySelector?.('.chip[data-role-surface]')
                : target;
            focusTarget?.focus?.();
        }
    }

    clearFieldError(fieldName) {
        const target = this.getValidationTarget(fieldName);
        const errorElement = document.getElementById(FIELD_ERROR_MAP[fieldName]);

        target?.setAttribute?.('aria-invalid', 'false');
        target?.classList?.remove?.('is-invalid');

        if (errorElement) {
            errorElement.textContent = '';
            errorElement.hidden = true;
        }
    }

    clearValidationErrors(fields = Object.keys(FIELD_ERROR_MAP)) {
        fields.forEach((fieldName) => this.clearFieldError(fieldName));
    }

    /**
     * Show resume session option
     * @param {string} sessionId - Existing session ID
     */
    showResumeOption(sessionId) {
        const resumeSection = document.getElementById('resumeSection');
        if (!resumeSection) return;

        const sessionData = sessionStore.getSessionData();

        resumeSection.innerHTML = `
            <div class="card card-bordered" style="padding: var(--space-4); margin-bottom: var(--space-6); background: var(--color-primary-50);">
                <h3 class="font-semibold mb-2">Active Session Detected</h3>
                <p class="text-sm text-gray-600 mb-3">
                    You have an active session: <strong>${sessionData?.name || sessionId.slice(0, 8) + '...'}</strong>
                </p>
                <div style="display: flex; gap: var(--space-2);">
                    <button class="btn btn-primary btn-sm" id="resumeSessionBtn">Resume Session</button>
                    <button class="btn btn-ghost btn-sm" id="leaveSessionBtn">Leave Session</button>
                </div>
            </div>
        `;

        resumeSection.style.display = 'block';

        // Bind resume button
        const resumeBtn = document.getElementById('resumeSessionBtn');
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => this.resumeSession());
        }

        // Rebind leave button
        const leaveBtn = document.getElementById('leaveSessionBtn');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', () => this.leaveSession());
        }
    }

    /**
     * Select a role
     * @param {HTMLElement} button - Role button element
     */
    selectRole(button) {
        const requestedSurface = button.dataset.roleSurface || null;
        if (!isPublicRoleSurface(requestedSurface)) {
            showToast({
                message: 'White Cell and Game Master require operator authorization.',
                type: 'error'
            });
            return;
        }

        // Deselect all
        document.querySelectorAll('.chip[data-role-surface]').forEach(btn => {
            btn.classList.remove('selected');
            btn.setAttribute('aria-pressed', 'false');
        });

        // Select this one
        button.classList.add('selected');
        button.setAttribute('aria-pressed', 'true');
        this.selectedRoleSurface = requestedSurface;
        this.updateSelectedRole();
        this.clearFieldError('roleSelection');

        logger.debug('Role selected:', this.selectedRole);
    }

    updateSelectedRole() {
        if (!this.selectedRoleSurface) {
            this.selectedRole = null;
        } else {
            this.selectedRole = buildTeamRole(this.selectedTeam, this.selectedRoleSurface);
        }

        const roleInput = document.getElementById('selectedRole');
        if (roleInput) {
            roleInput.value = this.selectedRole || '';
        }
    }

    resolveRequestedPublicRole() {
        if (!this.selectedRoleSurface || !isPublicRoleSurface(this.selectedRoleSurface)) {
            return this.selectedRole;
        }

        const parsedRole = parseTeamRole(this.selectedRole);
        const resolvedTeamId = parsedRole.teamId || this.selectedTeam;
        const resolvedSurface = parsedRole.surface || this.selectedRoleSurface;

        return buildTeamRole(resolvedTeamId, resolvedSurface);
    }

    async prewarmBrowserIdentity({ interactive = false } = {}) {
        try {
            await ensureBrowserIdentity({
                clientId: sessionStore.getClientId()
            });
        } catch (error) {
            logger.warn('Browser identity bootstrap failed:', error);
            if (interactive) {
                throw error;
            }
        }
    }

    /**
     * Handle join session form submission
     * @param {Event} e - Submit event
     */
    async handleJoinSession(e) {
        e.preventDefault();

        const codeInput = document.getElementById('sessionCode');
        const nameInput = document.getElementById('displayName');

        const sessionCode = codeInput?.value?.trim().toUpperCase();
        const displayName = nameInput?.value?.trim();
        this.clearValidationErrors(['sessionCode', 'displayName', 'roleSelection']);

        // Validate session code
        const codeError = validateSessionCode(sessionCode);
        if (codeError) {
            this.setFieldError('sessionCode', codeError, { focus: true });
            showToast({ message: codeError, type: 'error' });
            return;
        }

        // Validate display name (simple check since validateRequired throws)
        if (!displayName) {
            this.setFieldError('displayName', 'Display name is required', { focus: true });
            showToast({ message: 'Display name is required', type: 'error' });
            return;
        }

        if (!isPublicRoleSurface(this.selectedRoleSurface)) {
            this.setFieldError('roleSelection', 'Choose Scribe, Facilitator, or Notetaker to join as a participant.', { focus: true });
            showToast({
                message: 'White Cell and Game Master use the operator access flow.',
                type: 'error'
            });
            return;
        }

        const requestedRole = this.resolveRequestedPublicRole();
        if (!requestedRole) {
            this.setFieldError('roleSelection', 'Please select a role', { focus: true });
            showToast({ message: 'Please select a role', type: 'error' });
            return;
        }

        // Show the single green overlay straight away (in its "Joining..." state)
        // instead of the generic spinner - the seat details are already known
        // from the form. It is confirmed on success or dismissed on failure.
        const parsedRole = parseTeamRole(requestedRole);
        const participantTeam = parsedRole.teamId || this.selectedTeam;
        const teamConfig = TEAM_OPTIONS.find((option) => option.id === participantTeam);
        const teamLabel = teamConfig?.shortLabel || titleCase(participantTeam);
        const roleLabel = getRoleSurfaceDisplayLabel(parsedRole.surface || this.selectedRoleSurface);
        const confirmation = this.showJoinConfirmation({
            displayName,
            metaLabel: [teamLabel, roleLabel].filter(Boolean).join(' | '),
            accent: participantTeam ? `var(--color-team-${participantTeam})` : 'var(--color-gold)'
        });

        try {
            await this.prewarmBrowserIdentity({ interactive: true });
            const session = await this.findSessionByCode(sessionCode);
            const sessionCodeFromLookup = session.session_code || sessionCode;

            const participant = await database.claimParticipantSeat(session.id, requestedRole, displayName);
            this.selectedRole = requestedRole;

            // Store session data
            sessionStore.clearOperatorAuth();
            sessionStore.setSessionId(session.id);
            sessionStore.setRole(requestedRole);
            sessionStore.setUserName(displayName);
            sessionStore.setSessionData({
                id: session.id,
                name: session.name,
                code: sessionCodeFromLookup,
                participantId: participant.id,
                participantSessionId: participant.id,
                role: requestedRole,
                displayName,
                team: participantTeam,
                roleSurface: this.selectedRoleSurface,
                seatClaimStatus: participant.claim_status || 'claimed'
            });

            // Load game state
            try {
                const gameState = await database.getGameState(session.id);
                if (gameState) {
                    sessionStore.setGameState(gameState);
                }
            } catch (e) {
                // Game state might not exist yet for new sessions
            }

            await syncService.initialize(session.id, {
                participantId: participant.id
            });

            logger.info('Joined session:', session.id, 'as', requestedRole);

            // Reveal the success checkmark, hold a beat, then hand off. The
            // overlay stays up through navigation, covering the page load.
            await confirmation.confirm();
            this.redirectToRole(requestedRole);

        } catch (err) {
            confirmation.dismiss();
            logger.error('Failed to join session:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to join session. Check the session code and role availability, then try again.'
                }),
                type: 'error'
            });
        }
    }

    /**
     * Show the single, branded join/auth overlay. It appears immediately in a
     * "Joining..." state (replacing the generic spinner so there is only one green
     * screen between the login and the interface), then reveals the success
     * checkmark on confirm() before the caller hands off to the destination.
     * The overlay is opaque and stays in the DOM through navigation.
     * @param {Object} options
     * @param {string} [options.displayName] - Name shown as the headline.
     * @param {string} [options.metaLabel] - Seat summary, e.g. "Blue | Scribe".
     * @param {string} [options.accent] - CSS colour for the check/dot accent.
     * @returns {{ confirm: () => Promise<void>, dismiss: () => void }}
     */
    showJoinConfirmation({
        displayName,
        metaLabel = '',
        accent = 'var(--color-gold)'
    } = {}) {
        const HOLD_MS = 950;

        // No real DOM (e.g. unit tests) - return a no-op controller.
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
            return NOOP_CONFIRMATION;
        }

        const overlay = document.createElement('div');
        overlay.id = 'joinConfirm';
        overlay.className = 'join-confirm';
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');

        const card = document.createElement('div');
        card.className = 'jc-card';

        const check = document.createElement('div');
        check.className = 'jc-check';
        check.style.setProperty('--jc-accent', accent);
        check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            + 'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + '<polyline points="20 6 9 17 4 12"/></svg>';

        const name = document.createElement('p');
        name.className = 'jc-name';
        name.textContent = displayName || '';

        const meta = document.createElement('p');
        meta.className = 'jc-meta';
        const dot = document.createElement('span');
        dot.className = 'jc-dot';
        dot.style.background = accent;
        const metaText = document.createElement('span');
        metaText.textContent = metaLabel;
        meta.append(dot, metaText);

        const status = document.createElement('p');
        status.className = 'jc-status';
        status.textContent = 'Joining session...';

        card.append(check, name, meta, status);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        const raf = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (cb) => setTimeout(cb, 16);
        raf(() => overlay.classList.add('is-visible'));

        let settled = false;
        return {
            confirm: () => {
                if (settled) return Promise.resolve();
                settled = true;
                overlay.classList.add('is-confirmed');
                status.textContent = 'Entering session...';
                return new Promise((resolve) => setTimeout(resolve, HOLD_MS));
            },
            dismiss: () => {
                if (settled) return;
                settled = true;
                overlay.remove();
            }
        };
    }

    async handleOperatorAccess(surface, { operatorRole = WHITE_CELL_OPERATOR_ROLES.LEAD } = {}) {
        const operatorCodeInput = document.getElementById('operatorAccessCode');
        const operatorCode = operatorCodeInput?.value?.trim();
        this.clearValidationErrors(['sessionCode', 'operatorAccessCode']);

        if (!this.validateOperatorAccessCode(operatorCode)) {
            this.setFieldError('operatorAccessCode', 'A valid operator access code is required.', { focus: true });
            showToast({
                message: 'A valid operator access code is required.',
                type: 'error'
            });
            return;
        }

        // Show the single green overlay (in its "Joining..." state) instead of the
        // generic spinner, then confirm on success or dismiss on failure.
        if (surface === OPERATOR_SURFACES.WHITE_CELL) {
            const sessionCodeInput = document.getElementById('sessionCode');
            const sessionCode = sessionCodeInput?.value?.trim().toUpperCase();
            const codeError = validateSessionCode(sessionCode);
            if (codeError) {
                this.setFieldError('sessionCode', codeError, { focus: true });
                showToast({ message: codeError, type: 'error' });
                return;
            }
        }

        const isGameMaster = surface === OPERATOR_SURFACES.GAME_MASTER;
        const operatorName = document.getElementById('displayName')?.value?.trim()
            || (isGameMaster
                ? 'Game Master Operator'
                : getRoleDisplayName(buildWhiteCellOperatorRole(operatorRole)));
        const metaLabel = isGameMaster
            ? 'Game Master'
            : `White Cell | ${operatorRole === WHITE_CELL_OPERATOR_ROLES.SUPPORT ? 'Support' : 'Lead'}`;
        const confirmation = this.showJoinConfirmation({ displayName: operatorName, metaLabel });

        try {
            if (isGameMaster) {
                await this.authorizeGameMaster(operatorCode, confirmation);
            } else {
                await this.authorizeWhiteCell(operatorRole, operatorCode, confirmation);
            }
        } catch (err) {
            confirmation.dismiss();
            logger.error('Failed to authorize operator access:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to authorize operator access. Check the access code and try again.'
                }),
                type: 'error'
            });
        }
    }

    validateOperatorAccessCode(operatorCode) {
        return Boolean(operatorCode?.trim());
    }

    async findSessionByCode(sessionCode) {
        // Operator note: public participants must resolve session codes through the
        // authenticated server-side RPC. Do not reintroduce browser-side session listing.
        return database.lookupJoinableSessionByCode(sessionCode);
    }

    async authorizeGameMaster(operatorCode, confirmation = NOOP_CONFIRMATION) {
        const operatorName = document.getElementById('displayName')?.value?.trim() || 'Game Master Operator';
        const grant = await database.authorizeOperatorAccess({
            surface: OPERATOR_SURFACES.GAME_MASTER,
            accessCode: operatorCode,
            operatorName
        });

        sessionStore.clear();
        sessionStore.setRole('white');
        sessionStore.setUserName(operatorName);
        sessionStore.setOperatorAuth(grant);

        await confirmation.confirm();
        navigateToApp('master.html');
    }

    async authorizeWhiteCell(operatorRole = WHITE_CELL_OPERATOR_ROLES.LEAD, operatorCode, confirmation = NOOP_CONFIRMATION) {
        const codeInput = document.getElementById('sessionCode');
        const sessionCode = codeInput?.value?.trim().toUpperCase();
        const operatorName = document.getElementById('displayName')?.value?.trim()
            || getRoleDisplayName(buildWhiteCellOperatorRole(operatorRole));

        const codeError = validateSessionCode(sessionCode);
        if (codeError) {
            this.setFieldError('sessionCode', codeError, { focus: true });
            throw new Error(codeError);
        }

        await this.prewarmBrowserIdentity({ interactive: true });
        const session = await this.findSessionByCode(sessionCode);
        const sessionCodeFromLookup = session.session_code || sessionCode;
        const whiteCellRole = buildWhiteCellOperatorRole(operatorRole);
        const grant = await database.authorizeOperatorAccess({
            surface: OPERATOR_SURFACES.WHITE_CELL,
            accessCode: operatorCode,
            sessionId: session.id,
            role: whiteCellRole,
            operatorName
        });
        const participant = await database.claimParticipantSeat(session.id, whiteCellRole, operatorName);

        sessionStore.clear();
        sessionStore.setSessionId(session.id);
        sessionStore.setRole(whiteCellRole);
        sessionStore.setUserName(operatorName);
        sessionStore.setSessionData({
            id: session.id,
            name: session.name,
            code: sessionCodeFromLookup,
            participantId: participant.id,
            participantSessionId: participant.id,
            role: whiteCellRole,
            displayName: operatorName,
            team: 'white_cell',
            roleSurface: ROLE_SURFACES.WHITECELL,
            operatorMode: true,
            seatClaimStatus: participant.claim_status || 'claimed'
        });
        sessionStore.setOperatorAuth({
            ...grant,
            sessionId: grant?.sessionId || session.id,
            sessionCode: sessionCodeFromLookup,
            teamId: grant?.teamId || null,
            role: grant?.role || whiteCellRole,
            operatorName: grant?.operatorName || operatorName
        });

        try {
            const gameState = await database.getGameState(session.id);
            if (gameState) {
                sessionStore.setGameState(gameState);
            }
        } catch (error) {
            logger.warn('Failed to preload White Cell game state:', error);
        }

        await syncService.initialize(session.id, {
            participantId: participant.id
        });

        await confirmation.confirm();
        this.redirectToRole(whiteCellRole);
    }

    /**
     * Resume existing session
     */
    resumeSession() {
        const sessionData = sessionStore.getSessionData();
        if (!sessionData?.role) {
            showToast({ message: 'Could not determine role. Please rejoin.', type: 'error' });
            this.leaveSession();
            return;
        }

        this.redirectToRole(sessionData.role);
    }

    /**
     * Leave current session
     */
    async leaveSession() {
        const participantId = sessionStore.getSessionParticipantId?.() || sessionStore.getSessionData()?.participantId;

        // Mark participant as inactive
        if (participantId) {
            try {
                const sessionId = sessionStore.getSessionId();
                if (sessionId) {
                    await database.disconnectParticipant(sessionId, participantId);
                }
            } catch (err) {
                logger.error('Failed to mark participant inactive:', err);
            }
        }

        sessionStore.clear();

        // Hide resume section
        const resumeSection = document.getElementById('resumeSection');
        if (resumeSection) {
            resumeSection.style.display = 'none';
        }

        showToast({ message: 'Left session', type: 'info' });
    }

    /**
     * Redirect to role-specific page
     * @param {string} role - Role identifier
     */
    redirectToRole(role) {
        const observerTeamId = sessionStore.getSessionData()?.team || this.selectedTeam;
        const route = getRoleRoute(role, { observerTeamId });
        if (route) {
            window.location.assign(route);
        } else {
            showToast({ message: 'Unknown role', type: 'error' });
        }
    }
}

// Initialize
export const landingController = new LandingController();

if (!globalThis.__ESG_DISABLE_AUTO_INIT__) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => landingController.init());
    } else {
        landingController.init();
    }
}

export default landingController;
