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

/* Compass needle — signals "guided tour" without leaning on an emoji. */
const COMPASS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M10.6 5.4 9.1 9.1 5.4 10.6 6.9 6.9z" fill="currentColor" stroke="none"/></svg>';

/* Stable, unique ids so each bar's aria-controls points at its own body. */
let instanceCounter = 0;

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

    instanceCounter += 1;
    const bodyId = `follow-along-body-${instanceCounter}`;

    const root = document.createElement('section');
    root.className = 'follow-along';
    root.setAttribute('aria-label', `${title} tour`);
    root.dataset.minimized = String(minimized);
    root.innerHTML = `
        <button type="button" class="follow-along-bar" aria-expanded="${!minimized}" aria-controls="${bodyId}">
            <span class="follow-along-icon">${COMPASS}</span>
            <span class="follow-along-bar-title">${title}</span>
            <span class="follow-along-progress"></span>
            <span class="follow-along-chevron">${CHEVRON}</span>
        </button>
        <div class="follow-along-track" aria-hidden="true"><span class="follow-along-track-fill"></span></div>
        <div class="follow-along-body" id="${bodyId}" aria-live="polite">
            <div class="follow-along-body-inner">
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
        </div>
    `;

    const bar = root.querySelector('.follow-along-bar');
    const barTitleEl = root.querySelector('.follow-along-bar-title');
    const progressEl = root.querySelector('.follow-along-progress');
    const trackFillEl = root.querySelector('.follow-along-track-fill');
    const bodyEl = root.querySelector('.follow-along-body');
    const bodyInnerEl = root.querySelector('.follow-along-body-inner');
    const stepTitleEl = root.querySelector('.follow-along-step-title');
    const stepTextEl = root.querySelector('.follow-along-step-text');
    const dotsEl = root.querySelector('.follow-along-dots');
    const skipBtn = root.querySelector('.follow-along-skip');
    const backBtn = root.querySelector('.follow-along-back');
    const nextBtn = root.querySelector('.follow-along-next');

    // Dots stay as a compact "you are here" marker for short tours; longer tours
    // lean on the linear track + counter, which scale past what dots can show.
    const showDots = dotsEl && steps.length <= 7;
    if (showDots) {
        dotsEl.innerHTML = steps.map(() => '<span class="follow-along-dot"></span>').join('');
    } else if (dotsEl) {
        dotsEl.hidden = true;
    }
    const dots = dotsEl ? Array.from(dotsEl.querySelectorAll('.follow-along-dot')) : [];

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
        const previousTitle = stepTitleEl.textContent;

        root.dataset.minimized = String(minimized);
        bar.setAttribute('aria-expanded', String(!minimized));
        barTitleEl.textContent = minimized ? collapsedTitle : title;
        progressEl.textContent = minimized ? '' : `${current + 1} / ${steps.length}`;
        progressEl.hidden = minimized;
        stepTitleEl.textContent = step.title || '';
        stepTextEl.textContent = step.body || '';

        // The collapsed body is inert to screen readers; the live region only
        // announces step copy while the tour is open.
        if (bodyEl) bodyEl.setAttribute('aria-hidden', String(minimized));

        // Linear track fills from the first step through "Done" on the last.
        if (trackFillEl) {
            const ratio = (current + 1) / steps.length;
            trackFillEl.style.transform = `scaleX(${ratio})`;
        }

        dots.forEach((dot, index) => {
            dot.classList.toggle('is-active', index === current);
            dot.classList.toggle('is-done', index < current);
        });

        backBtn.disabled = current === 0;
        nextBtn.textContent = isLast ? 'Done' : 'Next';

        // Re-trigger the step-in animation when the copy actually changes while
        // the tour is open (skipped under reduced motion via CSS).
        if (bodyInnerEl && !minimized && step.title !== previousTitle) {
            bodyInnerEl.classList.remove('is-stepping');
            void bodyInnerEl.offsetWidth;
            bodyInnerEl.classList.add('is-stepping');
        }

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
