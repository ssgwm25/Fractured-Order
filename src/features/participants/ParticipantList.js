/**
 * Participant List Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Displays active and inactive participants.
 */

import { participantsStore } from '../../stores/index.js';
import { createBadge } from '../../components/ui/Badge.js';
import { showInlineLoader } from '../../components/ui/Loader.js';
import { formatRelativeTime } from '../../utils/formatting.js';
import { getRoleLimit } from '../../core/config.js';
import { createLogger } from '../../utils/logger.js';
import { TEAM_OPTIONS, normalizeWhiteCellOperatorRole } from '../../core/teamContext.js';

const logger = createLogger('ParticipantList');

const UNKNOWN_ROLE_CONFIG = Object.freeze({
    label: 'Participant',
    color: 'default',
    icon: 'P'
});

const ROLE_CONFIG = {
    white: { label: 'Game Master', color: 'primary', icon: 'GM' },
    viewer: { label: 'Observer', color: 'default', icon: 'OB' },
    whitecell_lead: { label: 'White Cell Lead', color: 'warning', icon: 'WL' },
    whitecell_support: { label: 'White Cell Support', color: 'warning', icon: 'WS' },
    ...Object.fromEntries(
        TEAM_OPTIONS.flatMap((team) => ([
            [`${team.id}_facilitator`, { label: `${team.shortLabel} Facilitator`, color: 'info', icon: team.shortLabel.slice(0, 1) }],
            [`${team.id}_scribe`, { label: `${team.shortLabel} Scribe`, color: 'info', icon: team.shortLabel.slice(0, 1) }],
            [`${team.id}_notetaker`, { label: `${team.shortLabel} Notetaker`, color: 'success', icon: team.shortLabel.slice(0, 1) }]
        ]))
    )
};

function normalizeParticipantRoleKey(role) {
    return normalizeWhiteCellOperatorRole(role) || role;
}

export function getParticipantRoleConfig(role) {
    return ROLE_CONFIG[normalizeParticipantRoleKey(role)] || UNKNOWN_ROLE_CONFIG;
}

export function getParticipantRoleCountEntries(activeParticipants = []) {
    const activeRoleKeys = new Set(
        activeParticipants
            .map((participant) => normalizeParticipantRoleKey(participant.role))
            .filter(Boolean)
    );

    return Object.entries(ROLE_CONFIG).filter(([role]) => {
        if (role === 'viewer') {
            return activeRoleKeys.has(role);
        }

        return getRoleLimit(role) > 0;
    });
}

/**
 * Create a participant list component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {boolean} options.showInactive - Show inactive participants
 * @param {boolean} options.showRoleCounts - Show role counts summary
 * @returns {Object} Component controller
 */
export function createParticipantList(options = {}) {
    const {
        container,
        showInactive = false,
        showRoleCounts = true
    } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let unsubscribe = null;

    const wrapper = document.createElement('div');
    wrapper.className = 'participant-list-wrapper';

    wrapper.innerHTML = `
        ${showRoleCounts ? `
            <div class="participant-role-counts" id="roleCounts"></div>
        ` : ''}
        <div class="participant-list" id="participantList"></div>
        ${showInactive ? `
            <div class="participant-list-inactive" id="inactiveList">
                <h4 class="participant-list-inactive-header">Inactive Participants</h4>
                <div id="inactiveParticipants"></div>
            </div>
        ` : ''}
    `;

    container.appendChild(wrapper);

    const roleCountsContainer = wrapper.querySelector('#roleCounts');
    const listContainer = wrapper.querySelector('#participantList');
    const inactiveContainer = wrapper.querySelector('#inactiveParticipants');

    function render() {
        const active = participantsStore.getActive();
        const all = participantsStore.getAll();
        const inactive = all.filter((participant) => !active.find((candidate) => candidate.id === participant.id));

        if (showRoleCounts && roleCountsContainer) {
            renderRoleCounts(active);
        }

        if (active.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state empty-state-sm">
                    <p class="empty-state-message">No active participants</p>
                </div>
            `;
        } else {
            listContainer.innerHTML = '';
            active.forEach((participant) => {
                listContainer.appendChild(createParticipantCard(participant, { isActive: true }));
            });
        }

        if (showInactive && inactiveContainer) {
            if (inactive.length === 0) {
                inactiveContainer.innerHTML = '<p class="text-sm text-gray-500">None</p>';
            } else {
                inactiveContainer.innerHTML = '';
                inactive.forEach((participant) => {
                    inactiveContainer.appendChild(createParticipantCard(participant, { isActive: false }));
                });
            }
        }
    }

    function renderRoleCounts(activeParticipants) {
        const counts = {};
        activeParticipants.forEach((participant) => {
            const normalizedRole = normalizeParticipantRoleKey(participant.role);
            counts[normalizedRole] = (counts[normalizedRole] || 0) + 1;
        });

        roleCountsContainer.innerHTML = getParticipantRoleCountEntries(activeParticipants).map(([role, config]) => {
            const count = counts[role] || 0;
            const limit = getRoleLimit(role);
            const hasFiniteSeatLimit = Number.isFinite(limit) && limit > 0;
            const isFull = hasFiniteSeatLimit && count >= limit;
            const limitDisplay = hasFiniteSeatLimit ? limit : 'legacy';

            return `
                <div class="role-count-item ${isFull ? 'role-count-full' : ''}">
                    <span class="role-count-icon">${config.icon}</span>
                    <span class="role-count-label">${config.label}</span>
                    <span class="role-count-value">${count}/${limitDisplay}</span>
                </div>
            `;
        }).join('');
    }

    function init() {
        unsubscribe = participantsStore.subscribe(() => {
            render();
        });

        render();
    }

    async function refresh() {
        const loader = showInlineLoader(listContainer, { message: 'Loading...' });
        try {
            await participantsStore.loadParticipants();
            render();
        } catch (err) {
            logger.error('Failed to refresh participant list:', err);
            throw err;
        } finally {
            loader?.hide();
        }
    }

    function destroy() {
        unsubscribe?.();
        wrapper.remove();
    }

    init();

    return {
        render,
        refresh,
        destroy,
        getActiveCount: () => participantsStore.getActive().length
    };
}

/**
 * Create a participant card
 * @param {Object} participant - Participant data
 * @param {Object} options - Card options
 * @returns {HTMLElement}
 */
function createParticipantCard(participant, options = {}) {
    const { isActive = true } = options;
    const config = getParticipantRoleConfig(participant.role);

    const card = document.createElement('div');
    card.className = `participant-card ${isActive ? '' : 'participant-card-inactive'}`;
    card.dataset.participantId = participant.id;

    const statusBadge = createBadge({
        text: isActive ? 'Active' : 'Inactive',
        variant: isActive ? 'success' : 'default',
        size: 'sm'
    });

    card.innerHTML = `
        <div class="participant-card-avatar">
            <span class="participant-card-icon">${config.icon}</span>
        </div>
        <div class="participant-card-info">
            <span class="participant-card-name">${escapeHtml(participant.display_name || 'Unknown')}</span>
            <span class="participant-card-role">${config.label}</span>
        </div>
        <div class="participant-card-status">
            ${statusBadge.outerHTML}
            <span class="participant-card-heartbeat">${formatRelativeTime(participant.heartbeat_at)}</span>
        </div>
    `;

    return card;
}

/**
 * Create a compact participant indicator
 * @param {Object} options
 * @returns {Object}
 */
export function createParticipantIndicator(options = {}) {
    const { container } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'participant-indicator';
    wrapper.innerHTML = `
        <span class="participant-indicator-icon">P</span>
        <span class="participant-indicator-count" id="participantCount">0</span>
        <span class="participant-indicator-label">active</span>
    `;

    container.appendChild(wrapper);

    const countSpan = wrapper.querySelector('#participantCount');

    const unsubscribe = participantsStore.subscribe(() => {
        countSpan.textContent = participantsStore.getActive().length;
    });

    countSpan.textContent = participantsStore.getActive().length;

    function destroy() {
        unsubscribe();
        wrapper.remove();
    }

    return { destroy };
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export default createParticipantList;
