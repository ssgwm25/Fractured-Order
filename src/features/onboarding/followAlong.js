/**
 * Follow-along onboarding.
 *
 * A minimizable, guided stepper that sits just above the sidebar session block.
 * Advancing a step highlights the relevant sidebar nav item/area so the user
 * follows along in place. Progress and the minimized state are persisted in
 * localStorage so the tour stays available without nagging on every visit.
 *
 * Reusable across role surfaces — pass role-specific `steps` and a `storageKey`.
 */

const HIGHLIGHT_CLASS = 'is-onboarding-target';

function readState(storageKey) {
    if (!storageKey) return {};
    try {
        const raw = window.localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        return {};
    }
}

function writeState(storageKey, state) {
    if (!storageKey) return;
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
        /* Persistence is best-effort (private mode, quota); ignore failures. */
    }
}

function clampStep(value, length) {
    const index = Number.isFinite(value) ? Math.trunc(value) : 0;
    return Math.min(Math.max(index, 0), length - 1);
}

const CHEVRON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';

/**
 * Mount the follow-along onboarding into a sidebar.
 *
 * @param {Object} options
 * @param {Array<{title: string, body: string, highlight?: string}>} options.steps
 * @param {string} options.storageKey - localStorage key (scope per role/team).
 * @param {HTMLElement} [options.sidebar] - sidebar container (defaults to #sidebar).
 * @param {string} [options.anchor] - selector the card is inserted before.
 * @param {string} [options.title] - heading shown in the bar.
 * @param {string} [options.collapsedTitle] - label shown when minimized.
 * @returns {{ destroy: () => void } | null}
 */
export function mountFollowAlong({
    steps = [],
    storageKey,
    sidebar = document.getElementById('sidebar'),
    anchor = '.sidebar-session',
    title = 'Getting started',
    collapsedTitle = 'Start Here'
} = {}) {
    if (!sidebar || !Array.isArray(steps) || steps.length === 0) return null;
    // Avoid duplicate mounts (e.g. re-init).
    if (sidebar.querySelector('.follow-along')) return null;

    const persisted = readState(storageKey);

    let current = clampStep(persisted.done ? 0 : persisted.step ?? 0, steps.length);
    let minimized = Boolean(persisted.minimized || persisted.done);

    const root = document.createElement('section');
    root.className = 'follow-along';
    root.setAttribute('aria-label', `${title} tour`);
    root.dataset.minimized = String(minimized);
    root.innerHTML = `
        <button type="button" class="follow-along-bar" aria-expanded="${!minimized}">
            <span class="follow-along-bar-title">${title}</span>
            <span class="follow-along-progress"></span>
            <span class="follow-along-chevron">${CHEVRON}</span>
        </button>
        <div class="follow-along-body">
            <h4 class="follow-along-step-title"></h4>
            <p class="follow-along-step-text"></p>
            <div class="follow-along-dots" aria-hidden="true"></div>
            <div class="follow-along-actions">
                <button type="button" class="follow-along-skip">Collapse</button>
                <span class="follow-along-spacer"></span>
                <button type="button" class="follow-along-back">Back</button>
                <button type="button" class="follow-along-next">Next</button>
            </div>
        </div>
    `;

    const bar = root.querySelector('.follow-along-bar');
    const barTitleEl = root.querySelector('.follow-along-bar-title');
    const progressEl = root.querySelector('.follow-along-progress');
    const stepTitleEl = root.querySelector('.follow-along-step-title');
    const stepTextEl = root.querySelector('.follow-along-step-text');
    const dotsEl = root.querySelector('.follow-along-dots');
    const skipBtn = root.querySelector('.follow-along-skip');
    const backBtn = root.querySelector('.follow-along-back');
    const nextBtn = root.querySelector('.follow-along-next');

    dotsEl.innerHTML = steps.map(() => '<span class="follow-along-dot"></span>').join('');
    const dots = Array.from(dotsEl.querySelectorAll('.follow-along-dot'));

    let highlightedEl = null;

    function clearHighlight() {
        if (highlightedEl) {
            highlightedEl.classList.remove(HIGHLIGHT_CLASS);
            highlightedEl = null;
        }
    }

    function applyHighlight() {
        clearHighlight();
        if (minimized) return;
        const selector = steps[current]?.highlight;
        if (!selector) return;
        const target = document.querySelector(selector);
        if (target) {
            target.classList.add(HIGHLIGHT_CLASS);
            highlightedEl = target;
        }
    }

    function persist(extra = {}) {
        writeState(storageKey, { step: current, minimized, ...extra });
    }

    function render() {
        const step = steps[current];
        const isLast = current === steps.length - 1;

        root.dataset.minimized = String(minimized);
        bar.setAttribute('aria-expanded', String(!minimized));
        barTitleEl.textContent = minimized ? collapsedTitle : title;
        progressEl.textContent = minimized ? '' : `${current + 1} / ${steps.length}`;
        progressEl.hidden = minimized;
        stepTitleEl.textContent = step.title || '';
        stepTextEl.textContent = step.body || '';

        dots.forEach((dot, index) => {
            dot.classList.toggle('is-active', index === current);
            dot.classList.toggle('is-done', index < current);
        });

        backBtn.disabled = current === 0;
        nextBtn.textContent = isLast ? 'Done' : 'Next';

        applyHighlight();
    }

    function collapseTour({ reset = false } = {}) {
        clearHighlight();
        if (reset) {
            current = 0;
        }
        minimized = true;
        persist();
        render();
    }

    bar.addEventListener('click', () => {
        minimized = !minimized;
        persist();
        render();
    });

    skipBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        collapseTour();
    });

    backBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (current === 0) return;
        current -= 1;
        persist();
        render();
    });

    nextBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (current === steps.length - 1) {
            collapseTour({ reset: true });
            return;
        }
        current += 1;
        persist();
        render();
    });

    const anchorEl = anchor ? sidebar.querySelector(anchor) : null;
    if (anchorEl) {
        sidebar.insertBefore(root, anchorEl);
    } else {
        sidebar.appendChild(root);
    }

    render();

    return {
        destroy() {
            clearHighlight();
            root.remove();
        }
    };
}
