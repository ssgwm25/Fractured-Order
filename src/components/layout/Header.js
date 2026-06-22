/**
 * Header Component
 * Page header with navigation and status indicators
 */

import { sessionStore } from '../../stores/session.js';
import { formatRoleName } from '../../utils/formatting.js';
import { ICONS } from '../ui/Button.js';

/**
 * Create a page header
 * @param {Object} options - Header options
 * @param {string} options.title - Page title
 * @param {string} options.subtitle - Optional subtitle
 * @param {boolean} options.showSessionInfo - Show session information
 * @param {boolean} options.showTimer - Show game timer
 * @param {boolean} options.showGameState - Show move/phase indicators
 * @param {HTMLElement[]} options.actions - Action buttons to display
 * @param {Function} options.onMenuClick - Mobile menu click handler
 * @returns {HTMLElement} Header element
 */
export function createHeader({
    title = '',
    subtitle = '',
    showSessionInfo = true,
    showTimer = false,
    showGameState = false,
    actions = [],
    onMenuClick = null
} = {}) {
    const header = document.createElement('header');
    header.className = 'page-header';
    header.setAttribute('role', 'banner');

    // Left section - menu button and title
    const leftSection = document.createElement('div');
    leftSection.className = 'header-left';

    // Mobile menu button
    if (onMenuClick) {
        const menuBtn = document.createElement('button');
        menuBtn.className = 'header-menu-btn btn btn-ghost btn-icon-only';
        menuBtn.setAttribute('aria-label', 'Toggle menu');
        menuBtn.innerHTML = ICONS.menu;
        menuBtn.addEventListener('click', onMenuClick);
        leftSection.appendChild(menuBtn);
    }

    // Title section
    const titleSection = document.createElement('div');
    titleSection.className = 'header-title-section';
    titleSection.innerHTML = `
        <h1 class="header-title">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="header-subtitle">${escapeHtml(subtitle)}</p>` : ''}
    `;
    leftSection.appendChild(titleSection);

    header.appendChild(leftSection);

    // Center section - game state
    if (showGameState || showTimer) {
        const centerSection = document.createElement('div');
        centerSection.className = 'header-center';

        if (showGameState) {
            const gameStateEl = document.createElement('div');
            gameStateEl.className = 'header-game-state';
            gameStateEl.id = 'header-game-state';
            gameStateEl.innerHTML = `
                <div class="game-state-item">
                    <span class="game-state-label">Move</span>
                    <span class="game-state-value" id="header-move">1</span>
                </div>
                <div class="game-state-item">
                    <span class="game-state-label">Phase</span>
                    <span class="game-state-value" id="header-phase">1</span>
                </div>
            `;
            centerSection.appendChild(gameStateEl);
        }

        if (showTimer) {
            const timerEl = document.createElement('div');
            timerEl.className = 'header-timer';
            timerEl.id = 'header-timer';
            timerEl.innerHTML = `
                <span class="timer-display" id="timer-display">90:00</span>
                <span class="timer-status" id="timer-status">Paused</span>
            `;
            centerSection.appendChild(timerEl);
        }

        header.appendChild(centerSection);
    }

    // Right section - session info and actions
    const rightSection = document.createElement('div');
    rightSection.className = 'header-right';

    if (showSessionInfo) {
        const sessionInfo = document.createElement('div');
        sessionInfo.className = 'header-session-info';
        sessionInfo.id = 'header-session-info';

        const state = sessionStore.getState();
        sessionInfo.innerHTML = `
            <span class="session-role">${formatRoleName(state.role || '')}</span>
            <span class="session-indicator ${state.isAuthenticated ? 'connected' : 'disconnected'}"></span>
        `;
        rightSection.appendChild(sessionInfo);
    }

    // Action buttons
    if (actions.length > 0) {
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'header-actions';
        actions.forEach(action => {
            actionsContainer.appendChild(action);
        });
        rightSection.appendChild(actionsContainer);
    }

    header.appendChild(rightSection);

    return header;
}

/**
 * Update header game state display
 * @param {Object} state - Game state
 * @param {number} state.move - Current move
 * @param {number} state.phase - Current phase
 */
export function updateHeaderGameState({ move, phase }) {
    const moveEl = document.getElementById('header-move');
    const phaseEl = document.getElementById('header-phase');

    if (moveEl) moveEl.textContent = move;
    if (phaseEl) phaseEl.textContent = phase;
}

/**
 * Update header timer display
 * @param {number} seconds - Remaining seconds
 * @param {boolean} running - Whether timer is running
 */
export function updateHeaderTimer(seconds, running) {
    const displayEl = document.getElementById('timer-display');
    const statusEl = document.getElementById('timer-status');

    if (displayEl) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        displayEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        // Add warning class if time is low
        if (seconds < 300) { // Less than 5 minutes
            displayEl.classList.add('timer-warning');
        } else {
            displayEl.classList.remove('timer-warning');
        }
    }

    if (statusEl) {
        statusEl.textContent = running ? 'Running' : 'Paused';
        statusEl.classList.toggle('timer-running', running);
    }
}

/**
 * Update header session info
 * @param {Object} state - Session state
 */
export function updateHeaderSessionInfo(state) {
    const sessionInfo = document.getElementById('header-session-info');
    if (!sessionInfo) return;

    sessionInfo.innerHTML = `
        <span class="session-role">${formatRoleName(state.role || '')}</span>
        <span class="session-indicator ${state.isAuthenticated ? 'connected' : 'disconnected'}"></span>
    `;
}

/**
 * Create a simple header for non-authenticated pages
 * @param {Object} options - Header options
 * @param {string} options.title - Page title
 * @param {string} options.logoUrl - Logo URL (optional)
 * @returns {HTMLElement} Header element
 */
export function createSimpleHeader({ title = 'ESG Simulation', logoUrl = null } = {}) {
    const header = document.createElement('header');
    header.className = 'page-header page-header-simple';

    header.innerHTML = `
        <div class="header-brand">
            ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" class="header-logo">` : ''}
            <span class="header-brand-name">${escapeHtml(title)}</span>
        </div>
    `;

    return header;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export default {
    create: createHeader,
    createSimple: createSimpleHeader,
    updateGameState: updateHeaderGameState,
    updateTimer: updateHeaderTimer,
    updateSessionInfo: updateHeaderSessionInfo
};