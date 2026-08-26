/**
 * Persistent, role-aware sidebar orientation.
 *
 * The guide explains one real role surface at a time, can open the associated
 * native surface on request, and keeps the local platform overview available
 * without autoplaying or depending on a network embed.
 */

import { PLATFORM_OVERVIEW_MEDIA } from './platformOverview.js';
import { buildFollowAlongNarration } from './audioGuide.js';
import { resolveApprovedStartHereAudioUrl } from './startHereAudioManifest.js';

const HIGHLIGHT_CLASS = 'is-onboarding-target';
const LEGACY_COMPLETION_KEY = 'done';

const CHEVRON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4"/></svg>';
const COMPASS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.25"/><path d="M10.6 5.4 9.1 9.1 5.4 10.6 6.9 6.9z" fill="currentColor" stroke="none"/></svg>';
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m3.5 8.5 2.7 2.7 6.3-6.4"/></svg>';
const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 2.75v10.5L13 8z" fill="currentColor"/></svg>';
const PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 2.5h3v11h-3zm6 0h3v11h-3z" fill="currentColor"/></svg>';
const STOP = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 3h10v10H3z" fill="currentColor"/></svg>';

let instanceCounter = 0;

function createElement(documentRef, tagName, className = '', text = '') {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function getDefaultStorage(windowRef) {
    try {
        return windowRef?.localStorage || null;
    } catch (_error) {
        return null;
    }
}

function readState(storage, storageKey) {
    if (!storageKey || !storage) return {};
    try {
        const raw = storage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeState(storage, storageKey, state) {
    if (!storageKey || !storage) return;
    try {
        storage.setItem(storageKey, JSON.stringify(state));
    } catch (_error) {
        // Persistence is progressive enhancement (private mode and quota safe).
    }
}

function clampStep(value, length) {
    const index = Number.isFinite(value) ? Math.trunc(value) : 0;
    return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

function normalizeSelectors(value) {
    const values = Array.isArray(value) ? value : [value];
    return values.filter((selector) => typeof selector === 'string' && selector.trim());
}

function pauseMedia(video) {
    try {
        video?.pause?.();
    } catch (_error) {
        // Teardown and collapse remain safe in incomplete browser media mocks.
    }
}

/**
 * Mount the persistent Start Here guide above a role sidebar's session block.
 * Each step may provide `narrative`, up to four `details`, a `targetLabel`,
 * selectors in `highlight`, and an `action` with a label and selector.
 * The expanded guide is presented in a modeless viewport popup by default;
 * orientation and role focus are separate opening slides, and minimizing
 * returns the same guide to its original sidebar position.
 */
export function mountFollowAlong({
    steps = [],
    storageKey,
    sidebar = null,
    anchor = '.sidebar-session',
    title = 'Role walkthrough',
    roleLabel = title,
    summary = 'Follow the role workflow from live context through handoff and review.',
    collapsedTitle = 'Start Here',
    documentRef = typeof document !== 'undefined' ? document : null,
    windowRef = documentRef?.defaultView || (typeof window !== 'undefined' ? window : null),
    storage = getDefaultStorage(windowRef),
    overviewMedia = PLATFORM_OVERVIEW_MEDIA,
    popup = true,
    AudioConstructor = windowRef?.Audio || (typeof Audio !== 'undefined' ? Audio : null),
    resolveAudioUrl = resolveApprovedStartHereAudioUrl
} = {}) {
    const resolvedSidebar = sidebar || documentRef?.getElementById?.('sidebar');
    if (!resolvedSidebar || !documentRef?.createElement || !Array.isArray(steps) || steps.length === 0) return null;
    if (resolvedSidebar.dataset?.followAlongMounted === 'true' || resolvedSidebar.querySelector?.('.follow-along')) return null;

    resolvedSidebar.dataset.followAlongMounted = 'true';

    const hasOverviewSlide = Boolean(overviewMedia && overviewMedia.videoUrl);
    const roleFocusIndex = hasOverviewSlide ? 1 : 0;
    const roleStepOffset = roleFocusIndex + 1;
    const totalSlides = steps.length + roleStepOffset;
    const persisted = readState(storage, storageKey);
    const completed = persisted.completed === true || persisted[LEGACY_COMPLETION_KEY] === true;
    let current = clampStep(completed ? 0 : persisted.step ?? 0, totalSlides);
    let minimized = Boolean(persisted.minimized || completed);
    let isComplete = completed;
    let highlightedEls = [];

    instanceCounter += 1;
    const idPrefix = `follow-along-${instanceCounter}`;
    const bodyId = `${idPrefix}-body`;
    const mediaId = `${idPrefix}-media`;
    const transcriptId = `${idPrefix}-transcript`;

    const root = createElement(documentRef, 'section', 'follow-along');
    root.dataset.minimized = String(minimized);
    root.dataset.completed = String(isComplete);
    root.setAttribute('aria-label', `${roleLabel} Start Here walkthrough`);

    const supportsPopup = popup !== false && Boolean(documentRef.body?.appendChild);
    const popupHost = supportsPopup ? createElement(documentRef, 'div', 'follow-along-popup-host') : null;
    if (popupHost && resolvedSidebar.classList?.contains?.('scribe-sidebar')) {
        popupHost.classList.add('scribe-sidebar');
    }
    if (popupHost) {
        popupHost.hidden = true;
        popupHost.setAttribute('aria-hidden', 'true');
        documentRef.body.appendChild(popupHost);
    }

    const bar = createElement(documentRef, 'button', 'follow-along-bar');
    bar.type = 'button';
    bar.setAttribute('aria-expanded', String(!minimized));
    bar.setAttribute('aria-controls', bodyId);
    const icon = createElement(documentRef, 'span', 'follow-along-icon');
    icon.innerHTML = COMPASS;
    const barCopy = createElement(documentRef, 'span', 'follow-along-bar-copy');
    const barEyebrow = createElement(documentRef, 'span', 'follow-along-bar-eyebrow', 'Start here');
    const barTitle = createElement(documentRef, 'span', 'follow-along-bar-title', minimized ? collapsedTitle : title);
    barCopy.append(barEyebrow, barTitle);
    const progress = createElement(documentRef, 'span', 'follow-along-progress');
    const completeIcon = createElement(documentRef, 'span', 'follow-along-complete-icon');
    completeIcon.innerHTML = CHECK;
    completeIcon.setAttribute('aria-label', 'Walkthrough completed');
    const chevron = createElement(documentRef, 'span', 'follow-along-chevron');
    chevron.innerHTML = CHEVRON;
    bar.append(icon, barCopy, progress, completeIcon, chevron);

    const track = createElement(documentRef, 'div', 'follow-along-track');
    track.setAttribute('aria-hidden', 'true');
    const trackFill = createElement(documentRef, 'span', 'follow-along-track-fill');
    track.appendChild(trackFill);

    const body = createElement(documentRef, 'div', 'follow-along-body');
    body.id = bodyId;
    body.setAttribute('aria-hidden', String(minimized));
    body.inert = minimized;
    const bodyInner = createElement(documentRef, 'div', 'follow-along-body-inner');
    const bodyPad = createElement(documentRef, 'div', 'follow-along-body-pad');
    const roleBrief = createElement(documentRef, 'section', 'follow-along-role-brief');
    roleBrief.setAttribute('aria-label', `${roleLabel} role focus`);
    const roleBriefLabel = createElement(documentRef, 'p', 'follow-along-section-label', 'Role focus');
    const roleBriefTitle = createElement(documentRef, 'h2', 'follow-along-role-title', roleLabel);
    const roleSummary = createElement(documentRef, 'p', 'follow-along-role-summary', summary);
    roleBrief.append(roleBriefLabel, roleBriefTitle, roleSummary);
    const stepPanel = createElement(documentRef, 'section', 'follow-along-step-panel');
    stepPanel.setAttribute('aria-label', 'Walkthrough step');
    const stepMeta = createElement(documentRef, 'p', 'follow-along-step-meta');
    const stepTitle = createElement(documentRef, 'h2', 'follow-along-step-title');
    const stepText = createElement(documentRef, 'p', 'follow-along-step-text');
    const narrative = createElement(documentRef, 'p', 'follow-along-step-narrative');
    const details = createElement(documentRef, 'ul', 'follow-along-step-details');
    const target = createElement(documentRef, 'p', 'follow-along-target');
    target.setAttribute('role', 'status');
    target.setAttribute('aria-live', 'polite');
    const nativeAction = createElement(documentRef, 'button', 'follow-along-open-surface');
    nativeAction.type = 'button';

    const dots = createElement(documentRef, 'div', 'follow-along-dots');
    dots.setAttribute('aria-hidden', 'true');
    const dotEls = [];
    if (totalSlides <= 9) {
        Array.from({ length: totalSlides }).forEach(() => {
            const dot = createElement(documentRef, 'span', 'follow-along-dot');
            dots.appendChild(dot);
            dotEls.push(dot);
        });
    } else {
        dots.hidden = true;
    }

    const actions = createElement(documentRef, 'div', 'follow-along-actions');
    const collapseButton = createElement(documentRef, 'button', 'follow-along-skip', supportsPopup ? 'Minimize to sidebar' : 'Collapse');
    collapseButton.type = 'button';
    const spacer = createElement(documentRef, 'span', 'follow-along-spacer');
    const backButton = createElement(documentRef, 'button', 'follow-along-back', 'Back');
    backButton.type = 'button';
    const nextButton = createElement(documentRef, 'button', 'follow-along-next', 'Next');
    nextButton.type = 'button';
    actions.append(collapseButton, spacer, backButton, nextButton);
    stepPanel.append(stepMeta, stepTitle, stepText, narrative, details, target, nativeAction);
    const slideFooter = createElement(documentRef, 'footer', 'follow-along-slide-footer');
    const slideTools = createElement(documentRef, 'div', 'follow-along-slide-tools');
    const audioGuide = createElement(documentRef, 'section', 'follow-along-audio-guide');
    audioGuide.setAttribute('aria-label', 'Audio guide');
    const playAudioButton = createElement(documentRef, 'button', 'follow-along-audio-button');
    playAudioButton.type = 'button';
    playAudioButton.innerHTML = PLAY;
    playAudioButton.setAttribute('aria-label', 'Play audio guide');
    const pauseAudioButton = createElement(documentRef, 'button', 'follow-along-audio-button');
    pauseAudioButton.type = 'button';
    pauseAudioButton.innerHTML = PAUSE;
    pauseAudioButton.setAttribute('aria-label', 'Pause audio guide');
    const stopAudioButton = createElement(documentRef, 'button', 'follow-along-audio-button');
    stopAudioButton.type = 'button';
    stopAudioButton.innerHTML = STOP;
    stopAudioButton.setAttribute('aria-label', 'Stop audio guide');
    const audioStatus = createElement(documentRef, 'p', 'sr-only', 'AI-generated Kokoro audio guide ready.');
    audioStatus.setAttribute('role', 'status');
    audioStatus.setAttribute('aria-live', 'polite');
    audioStatus.setAttribute('aria-atomic', 'true');
    audioGuide.append(playAudioButton, pauseAudioButton, stopAudioButton, audioStatus);
    const audioTranscript = createElement(documentRef, 'details', 'follow-along-audio-transcript');
    const audioTranscriptSummary = createElement(documentRef, 'summary', '', 'Audio transcript');
    const audioTranscriptText = createElement(documentRef, 'p');
    audioTranscript.append(audioTranscriptSummary, audioTranscriptText);
    slideTools.append(dots, audioGuide);
    slideFooter.append(slideTools, audioTranscript, actions);

    let video = null;
    const audio = AudioConstructor ? new AudioConstructor() : createElement(documentRef, 'audio');
    audio.preload = 'metadata';
    audio.hidden = true;
    audio.setAttribute?.('aria-hidden', 'true');
    audio.setAttribute?.('data-generated-voice', 'kokoro-af-heart');
    bodyPad.appendChild(audio);
    let mediaPanel = null;
    let overview = null;
    if (hasOverviewSlide) {
        overview = createElement(documentRef, 'section', 'follow-along-overview');
        overview.setAttribute('aria-label', 'Platform orientation');
        const overviewHeader = createElement(documentRef, 'div', 'follow-along-overview-header');
        const overviewCopy = createElement(documentRef, 'div', 'follow-along-overview-copy');
        const overviewEyebrow = createElement(documentRef, 'p', 'follow-along-section-label', `Orientation · ${overviewMedia.durationLabel || '2:28'}`);
        const overviewTitle = createElement(documentRef, 'h2', 'follow-along-overview-title', 'Platform overview');
        const overviewText = createElement(documentRef, 'p', 'follow-along-overview-text', 'See the shared exercise flow before you work through your role.');
        overviewCopy.append(overviewEyebrow, overviewTitle, overviewText);
        const mediaToggle = createElement(documentRef, 'button', 'follow-along-overview-toggle', 'Watch');
        mediaToggle.type = 'button';
        mediaToggle.setAttribute('aria-expanded', 'false');
        mediaToggle.setAttribute('aria-controls', mediaId);
        mediaToggle.setAttribute('aria-label', `Watch the ${overviewMedia.durationLabel || '2:28'} platform overview`);
        overviewHeader.append(overviewCopy, mediaToggle);
        mediaPanel = createElement(documentRef, 'div', 'follow-along-media');
        mediaPanel.id = mediaId;
        mediaPanel.hidden = true;
        video = createElement(documentRef, 'video', 'follow-along-video');
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;
        video.autoplay = false;
        video.poster = overviewMedia.posterUrl || '';
        video.setAttribute('aria-label', overviewMedia.label || 'Platform overview video');
        const mediaStatus = createElement(documentRef, 'p', 'follow-along-media-status', 'Captions and a full transcript are included.');
        mediaStatus.setAttribute('role', 'status');
        mediaStatus.setAttribute('aria-live', 'polite');
        const source = createElement(documentRef, 'source');
        source.src = overviewMedia.videoUrl;
        source.type = 'video/mp4';
        video.appendChild(source);
        if (overviewMedia.captionsUrl) {
            const captions = createElement(documentRef, 'track');
            captions.kind = 'captions';
            captions.src = overviewMedia.captionsUrl;
            captions.srclang = 'en';
            captions.label = 'English';
            captions.default = true;
            captions.addEventListener('error', () => {
                mediaStatus.textContent = 'Captions are unavailable. Use the transcript below.';
                root.dataset.captionState = 'unavailable';
            });
            video.appendChild(captions);
        }
        video.addEventListener('error', () => {
            mediaStatus.textContent = 'Video unavailable. The transcript remains available.';
            root.dataset.mediaState = 'unavailable';
        });
        video.addEventListener('playing', () => {
            mediaStatus.textContent = 'Playing. Captions are available.';
            root.dataset.mediaState = 'playing';
        });
        video.addEventListener('ended', () => {
            mediaStatus.textContent = 'Overview complete.';
            root.dataset.mediaState = 'ended';
        });
        const transcriptToggle = createElement(documentRef, 'button', 'follow-along-transcript-toggle', 'View transcript');
        transcriptToggle.type = 'button';
        transcriptToggle.setAttribute('aria-expanded', 'false');
        transcriptToggle.setAttribute('aria-controls', transcriptId);
        const transcript = createElement(documentRef, 'section', 'follow-along-transcript');
        transcript.id = transcriptId;
        transcript.hidden = true;
        transcript.setAttribute('aria-label', 'Platform overview transcript');
        (overviewMedia.transcript || []).forEach((paragraph) => transcript.appendChild(createElement(documentRef, 'p', '', paragraph)));
        mediaPanel.append(video, mediaStatus, transcriptToggle, transcript);
        overview.append(overviewHeader, mediaPanel);
        bodyPad.appendChild(overview);
        mediaToggle.addEventListener('click', () => {
            const willOpen = mediaPanel.hidden;
            mediaPanel.hidden = !willOpen;
            mediaToggle.setAttribute('aria-expanded', String(willOpen));
            mediaToggle.textContent = willOpen ? 'Hide' : 'Watch';
            mediaToggle.setAttribute('aria-label', willOpen ? 'Hide the platform overview' : `Watch the ${overviewMedia.durationLabel || '2:28'} platform overview`);
            if (!willOpen) pauseMedia(video);
        });
        transcriptToggle.addEventListener('click', () => {
            const willOpen = transcript.hidden;
            transcript.hidden = !willOpen;
            transcriptToggle.setAttribute('aria-expanded', String(willOpen));
            transcriptToggle.textContent = willOpen ? 'Hide transcript' : 'View transcript';
        });
    }

    bodyPad.append(roleBrief, stepPanel, slideFooter);

    const announcement = createElement(documentRef, 'p', 'sr-only');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    bodyPad.appendChild(announcement);
    bodyInner.appendChild(bodyPad);
    body.appendChild(bodyInner);
    root.append(bar, track, body);

    function clearHighlight() {
        highlightedEls.forEach((element) => element.classList?.remove?.(HIGHLIGHT_CLASS));
        highlightedEls = [];
    }

    function resolveSelector(selector) {
        try {
            return documentRef.querySelector?.(selector) || null;
        } catch (_error) {
            return null;
        }
    }

    function applyHighlight() {
        clearHighlight();
        if (minimized || current < roleStepOffset) return;
        const roleStep = steps[current - roleStepOffset];
        normalizeSelectors(roleStep?.highlight).forEach((selector) => {
            const element = resolveSelector(selector);
            if (!element || highlightedEls.includes(element)) return;
            element.classList?.add?.(HIGHLIGHT_CLASS);
            highlightedEls.push(element);
        });
    }

    function persist() {
        writeState(storage, storageKey, { step: current, minimized, completed: isComplete });
    }

    const anchorEl = anchor ? resolvedSidebar.querySelector?.(anchor) : null;

    function pauseAudio() {
        try {
            audio.pause?.();
        } catch (_error) {
            // Page transitions remain safe in incomplete browser media mocks.
        }
    }

    function stopAudio({ announce = false } = {}) {
        pauseAudio();
        try {
            audio.currentTime = 0;
        } catch (_error) {
            // Some browsers reject currentTime changes before metadata loads.
        }
        root.dataset.audioState = 'stopped';
        playAudioButton.setAttribute('aria-pressed', 'false');
        pauseAudioButton.setAttribute('aria-pressed', 'false');
        if (announce) audioStatus.textContent = 'Audio guide stopped.';
    }

    function configureAudio({ isOrientation, isRoleFocus, step }) {
        audioGuide.hidden = isOrientation;
        audioTranscript.hidden = isOrientation;
        if (isOrientation) {
            stopAudio();
            audioTranscript.open = false;
            audioTranscriptText.textContent = '';
            return;
        }

        const narration = buildFollowAlongNarration({
            storageKey,
            roleLabel,
            summary,
            step: isRoleFocus ? null : step
        });
        const sourceUrl = typeof resolveAudioUrl === 'function' ? resolveAudioUrl(narration) : null;
        audioTranscriptText.textContent = narration;
        const sourceChanged = sourceUrl && audio.dataset?.sourceUrl !== sourceUrl;
        if (sourceChanged) {
            stopAudio();
            audioTranscript.open = false;
            audio.src = sourceUrl;
            if (audio.dataset) audio.dataset.sourceUrl = sourceUrl;
            audio.load?.();
        }

        const unavailable = !sourceUrl;
        playAudioButton.disabled = unavailable;
        pauseAudioButton.disabled = unavailable;
        stopAudioButton.disabled = unavailable;
        root.dataset.audioState = unavailable ? 'unavailable' : 'ready';
        audioStatus.textContent = unavailable
            ? 'Audio guide unavailable for this slide.'
            : 'AI-generated Kokoro audio guide ready.';
    }

    function moveRoot() {
        const showAsPopup = supportsPopup && !minimized;
        root.dataset.presentation = showAsPopup ? 'popup' : 'sidebar';
        root.setAttribute('role', showAsPopup ? 'dialog' : 'region');
        root.setAttribute('aria-modal', 'false');

        if (showAsPopup) {
            popupHost.hidden = false;
            popupHost.setAttribute('aria-hidden', 'false');
            popupHost.appendChild(root);
            return;
        }

        if (anchorEl) resolvedSidebar.insertBefore(root, anchorEl);
        else resolvedSidebar.appendChild(root);
        if (popupHost) {
            popupHost.hidden = true;
            popupHost.setAttribute('aria-hidden', 'true');
        }
    }

    function render({ announce = false } = {}) {
        const isOrientation = hasOverviewSlide && current === 0;
        const isRoleFocus = current === roleFocusIndex;
        const isRoleStep = current >= roleStepOffset;
        const roleStepIndex = clampStep(current - roleStepOffset, steps.length);
        const step = steps[roleStepIndex];
        const isLast = current === totalSlides - 1;
        const slideTitle = isOrientation ? 'Platform overview' : isRoleFocus ? `${roleLabel} role focus` : step.title;
        const previousTitle = stepTitle.textContent;
        const detailItems = Array.isArray(step.details) ? step.details.filter(Boolean).slice(0, 4) : [];
        const selectors = isRoleStep ? normalizeSelectors(step.highlight) : [];
        const hasTarget = !isRoleStep || selectors.length === 0 || selectors.some((selector) => Boolean(resolveSelector(selector)));
        root.dataset.minimized = String(minimized);
        root.dataset.completed = String(isComplete);
        root.dataset.targetState = hasTarget ? 'available' : 'unavailable';
        root.dataset.slide = isOrientation ? 'orientation' : isRoleFocus ? 'role-focus' : 'role-surface';
        moveRoot();
        bar.setAttribute('aria-expanded', String(!minimized));
        bar.setAttribute('aria-label', minimized ? `Open ${roleLabel} Start Here walkthrough` : `Minimize ${roleLabel} Start Here walkthrough to sidebar`);
        barTitle.textContent = minimized ? collapsedTitle : title;
        progress.textContent = minimized ? '' : `${current + 1} / ${totalSlides}`;
        progress.hidden = minimized;
        completeIcon.hidden = !isComplete || !minimized;
        body.setAttribute('aria-hidden', String(minimized));
        body.inert = minimized;
        if (overview) overview.hidden = !isOrientation;
        roleBrief.hidden = !isRoleFocus;
        stepPanel.hidden = !isRoleStep;
        if (!isOrientation) pauseMedia(video);
        configureAudio({ isOrientation, isRoleFocus, step });
        stepTitle.textContent = step.title || '';
        stepMeta.textContent = `${current + 1} of ${totalSlides}${step.targetLabel ? ` / ${step.targetLabel}` : ''}`;
        stepText.textContent = step.body || '';
        narrative.textContent = step.narrative || '';
        narrative.hidden = !step.narrative;
        details.replaceChildren();
        detailItems.forEach((item) => details.appendChild(createElement(documentRef, 'li', '', item)));
        details.hidden = detailItems.length === 0;
        target.textContent = !hasTarget ? 'Not available in this view. Continue, or return when this surface appears.' : '';
        target.hidden = hasTarget;
        nativeAction.hidden = !step.action?.label || !step.action?.selector;
        nativeAction.textContent = step.action?.label || '';
        nativeAction.dataset.selector = step.action?.selector || '';
        nativeAction.dataset.activate = String(step.action?.activate !== false);
        trackFill.style.transform = `scaleX(${(current + 1) / totalSlides})`;
        dotEls.forEach((dot, index) => {
            dot.classList.toggle('is-active', index === current);
            dot.classList.toggle('is-done', index < current);
        });
        backButton.disabled = current === 0;
        nextButton.textContent = isLast ? 'Finish' : 'Next';
        if (bodyInner && isRoleStep && !minimized && step.title !== previousTitle) {
            bodyInner.classList.remove('is-stepping');
            void bodyInner.offsetWidth;
            bodyInner.classList.add('is-stepping');
        }
        applyHighlight();
        if (announce && !minimized) announcement.textContent = `${current + 1} of ${totalSlides}. ${slideTitle}.`;
    }

    function setMinimized(nextMinimized, { reset = false } = {}) {
        clearHighlight();
        stopAudio();
        if (reset) current = 0;
        minimized = nextMinimized === true;
        if (minimized) pauseMedia(video);
        persist();
        render();
        bar.focus?.({ preventScroll: true });
    }

    function goToSlide(index) {
        const nextIndex = clampStep(index, totalSlides);
        if (nextIndex === current) return false;
        const wasMinimized = minimized;
        stopAudio();
        current = nextIndex;
        minimized = false;
        persist();
        render({ announce: true });
        if (wasMinimized) bar.focus?.({ preventScroll: true });
        return true;
    }

    function goToStep(index) {
        return goToSlide(roleStepOffset + clampStep(index, steps.length));
    }

    bar.addEventListener('click', () => setMinimized(!minimized));
    collapseButton.addEventListener('click', (event) => {
        event.stopPropagation();
        setMinimized(true);
    });
    backButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (current > 0) goToSlide(current - 1);
    });
    nextButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (current === totalSlides - 1) {
            isComplete = true;
            announcement.textContent = `${roleLabel} walkthrough completed. Start Here remains available for review.`;
            setMinimized(true, { reset: true });
            return;
        }
        goToSlide(current + 1);
    });
    nativeAction.addEventListener('click', () => {
        const selector = nativeAction.dataset.selector;
        const surface = selector ? resolveSelector(selector) : null;
        if (!surface) {
            target.hidden = false;
            target.textContent = 'Not available in this view. Continue, or return when this surface appears.';
            root.dataset.targetState = 'unavailable';
            return;
        }
        if (nativeAction.dataset.activate !== 'false') surface.click?.();
        surface.focus?.({ preventScroll: true });
    });

    playAudioButton.addEventListener('click', () => {
        if (playAudioButton.disabled) return;
        const playback = audio.play?.();
        if (playback?.catch) {
            playback.catch(() => {
                root.dataset.audioState = 'unavailable';
                audioStatus.textContent = 'Audio guide unavailable. Continue with the visible slide text.';
            });
        }
    });
    pauseAudioButton.addEventListener('click', () => {
        if (pauseAudioButton.disabled) return;
        pauseAudio();
        root.dataset.audioState = 'paused';
        playAudioButton.setAttribute('aria-pressed', 'false');
        pauseAudioButton.setAttribute('aria-pressed', 'true');
        audioStatus.textContent = 'Audio guide paused.';
    });
    stopAudioButton.addEventListener('click', () => {
        if (stopAudioButton.disabled) return;
        stopAudio({ announce: true });
    });
    audio.addEventListener?.('playing', () => {
        root.dataset.audioState = 'playing';
        playAudioButton.setAttribute('aria-pressed', 'true');
        pauseAudioButton.setAttribute('aria-pressed', 'false');
        audioStatus.textContent = 'Audio guide playing.';
    });
    audio.addEventListener?.('ended', () => {
        stopAudio();
        audioStatus.textContent = 'Audio guide complete.';
    });
    audio.addEventListener?.('error', () => {
        root.dataset.audioState = 'unavailable';
        audioStatus.textContent = 'Audio guide unavailable. Continue with the visible slide text.';
    });

    const handlePageHide = () => {
        pauseMedia(video);
        stopAudio();
    };
    const handleVisibilityChange = () => {
        if (documentRef.visibilityState === 'hidden') {
            pauseMedia(video);
            stopAudio();
        }
    };
    const handleKeyDown = (event) => {
        if (event.key !== 'Escape' || minimized || !supportsPopup) return;
        event.preventDefault?.();
        setMinimized(true);
        bar.focus?.({ preventScroll: true });
    };
    windowRef?.addEventListener?.('pagehide', handlePageHide);
    documentRef.addEventListener?.('visibilitychange', handleVisibilityChange);
    documentRef.addEventListener?.('keydown', handleKeyDown);

    if (anchorEl) resolvedSidebar.insertBefore(root, anchorEl);
    else resolvedSidebar.appendChild(root);
    render();
    if (!minimized) bar.focus?.({ preventScroll: true });

    return Object.freeze({
        open: () => setMinimized(false),
        close: () => setMinimized(true),
        goToStep,
        destroy() {
            clearHighlight();
            pauseMedia(video);
            stopAudio();
            windowRef?.removeEventListener?.('pagehide', handlePageHide);
            documentRef.removeEventListener?.('visibilitychange', handleVisibilityChange);
            documentRef.removeEventListener?.('keydown', handleKeyDown);
            root.remove?.();
            popupHost?.remove?.();
            delete resolvedSidebar.dataset.followAlongMounted;
        }
    });
}

export default mountFollowAlong;
