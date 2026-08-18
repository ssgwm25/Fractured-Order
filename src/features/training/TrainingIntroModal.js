import { showModal } from '../../components/ui/Modal.js';
import introPosterUrl from '../../img/fractured_order_poster_.png?url';
import introVideoUrl from '../../../Plenum Briefing/PLenum Onboarding Video.mp4?url';
import { normalizeStoredTrainingContext } from './trainingContext.js';

export const TRAINING_INTRO_DURATION_SECONDS = 148;
export const TRAINING_INTRO_TRANSCRIPT = Object.freeze([
    'Fractured Order is a live economic statecraft simulation. Multiple actors interpret a changing strategic environment, make decisions, communicate, and adapt across several phases of play.',
    'A complex simulation can quickly become difficult to coordinate. Decisions, communications, timing, facilitation, adjudication, and observation may be scattered across disconnected tools and informal processes. That makes it harder to know what is current, who owns the next action, and how an event changed the course of play.',
    'Plenum addresses this problem by providing a shared browser-based operating layer for the exercise. It connects participant workspaces with the control-cell tools needed to run, monitor, document, and review the simulation.',
    'Each role has a defined responsibility within the shared session state. The Scribe records orientations, forecasts, actions, proposals, responses, and Requests for Information. The Facilitator supports team discussion, reviews received proposals, and helps manage interaction. The Notetaker captures team dynamics, alliances, turning points, and the decision process behind the outcome. White Cell manages timing, phases, updates, review, and adjudication, while the Game Master administers sessions and exports the evidence.',
    'During Strategic Orientation and Moves One through Three, Plenum links decisions to timing, communication, review, adjudication, and consequences. Teams can record what they choose, why they choose it, how they coordinate, and how they adapt when new information arrives.',
    'The result is more than a live interface. It is a structured record of the exercise: what teams believed, what they decided, what information they received, how they interacted, and how outcomes developed over time.',
    'Plenum does not replace strategic judgment or facilitation. It gives Statecraft Simulations Group the operational structure to focus on them. It turns a complex exercise into a coordinated, observable, and reviewable simulation.'
]);

const TEAM_LABELS = Object.freeze({
    blue: 'Blue Team',
    red: 'Red Team',
    green: 'Green Team',
    industry: 'Industry Team'
});

const ROLE_LABELS = Object.freeze({
    scribe: 'Scribe',
    facilitator: 'Facilitator',
    notetaker: 'Notetaker'
});

const MEDIA_COPY = Object.freeze({
    loading: 'Loading the introduction video. You can read the transcript or continue while it loads.',
    ready: 'Video ready. Choose Play introduction with sound, or use the transcript and continue without playing it.',
    playing: 'Introduction video playing. The same information is available in captions and the transcript.',
    ended: 'Introduction complete. Continue to confirm your training profile, or replay the video.',
    missing: 'The introduction video is unavailable. Read the text transcript, retry the video, or continue.',
    decode: 'This browser could not decode the introduction video. Read the text transcript, retry, or continue.',
    offline: 'You appear to be offline, so the introduction video may be unavailable. The transcript and Continue action still work.',
    timeout: 'The introduction video is taking longer than expected to load. You can retry, read the transcript, or continue.'
});

let introInstanceCounter = 0;
let activeIntroController = null;

function getDefaultSessionStorage() {
    try {
        return typeof window !== 'undefined' ? window.sessionStorage : null;
    } catch (_error) {
        return null;
    }
}

function getPublicAssetUrl(path, baseUrl = import.meta.env?.BASE_URL || '/') {
    const normalizedBase = String(baseUrl || '/').endsWith('/')
        ? String(baseUrl || '/')
        : `${baseUrl}/`;
    return `${normalizedBase}${String(path || '').replace(/^\/+/, '')}`;
}

function createElement(documentRef, tagName, className = '', textContent = '') {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    if (textContent) element.textContent = textContent;
    return element;
}

function pauseVideo(video) {
    try {
        video?.pause?.();
    } catch (_error) {
        // Closing and navigation must remain safe even in incomplete media mocks.
    }
}

export function getTrainingIntroViewedKey(context = {}) {
    const normalized = normalizeStoredTrainingContext(context);
    if (!normalized) return null;
    return `training:intro-viewed:${encodeURIComponent(normalized.curriculumVersion)}:${encodeURIComponent(normalized.attemptId)}`;
}

export function hasViewedTrainingIntro(context, storage = getDefaultSessionStorage()) {
    const key = getTrainingIntroViewedKey(context);
    if (!key || !storage) return false;

    try {
        return storage.getItem(key) === 'viewed';
    } catch (_error) {
        return false;
    }
}

export function markTrainingIntroViewed(context, storage = getDefaultSessionStorage()) {
    const key = getTrainingIntroViewedKey(context);
    if (!key || !storage) return false;

    try {
        storage.setItem(key, 'viewed');
        return true;
    } catch (_error) {
        return false;
    }
}

export function resolveTrainingIntroMediaState(mediaError, { online = true } = {}) {
    if (!online) return 'offline';
    if (mediaError?.code === 3) return 'decode';
    return 'missing';
}

/**
 * Open the video-first training introduction.
 *
 * The first-run dialog is intentionally closable: Escape, the close button,
 * and backdrop dismissal all mean "continue without the video". Replay opens
 * the same dialog without changing first-run progress.
 */
export function showTrainingIntroModal({
    context,
    forceReplay = false,
    documentRef = typeof document !== 'undefined' ? document : null,
    windowRef = typeof window !== 'undefined' ? window : null,
    navigatorRef = typeof navigator !== 'undefined' ? navigator : { onLine: true },
    storage = getDefaultSessionStorage(),
    showModalRef = showModal,
    videoUrl = introVideoUrl,
    posterUrl = introPosterUrl,
    captionsUrl = getPublicAssetUrl('training/intro/plenum-onboarding.en.vtt'),
    setTimeoutRef = typeof setTimeout === 'function' ? setTimeout : null,
    clearTimeoutRef = typeof clearTimeout === 'function' ? clearTimeout : null,
    onMediaDegraded = () => {},
    onContinue = () => {},
    onChangeProfile = () => {}
} = {}) {
    const normalizedContext = normalizeStoredTrainingContext(context);
    if (!normalizedContext || !documentRef?.createElement) return null;
    if (!forceReplay && hasViewedTrainingIntro(normalizedContext, storage)) return null;

    activeIntroController?.close?.();
    introInstanceCounter += 1;
    const idPrefix = `training-intro-${introInstanceCounter}`;
    const statusId = `${idPrefix}-status`;
    const transcriptId = `${idPrefix}-transcript`;
    const captionStatusId = `${idPrefix}-caption-status`;

    const root = createElement(documentRef, 'section', 'training-intro');
    root.dataset.stage = 'video';
    root.dataset.mediaState = 'loading';
    root.dataset.expectedDurationSeconds = String(TRAINING_INTRO_DURATION_SECONDS);

    const introCopy = createElement(documentRef, 'p', 'training-intro-lead');
    introCopy.textContent = 'Start with the complete Plenum overview. Playback with sound begins only when you choose it.';

    const mediaFrame = createElement(documentRef, 'div', 'training-intro-media');
    mediaFrame.setAttribute('aria-busy', 'true');
    const video = createElement(documentRef, 'video', 'training-intro-video');
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.autoplay = false;
    video.poster = posterUrl;
    video.setAttribute('aria-label', 'Plenum training introduction video');
    video.setAttribute('aria-describedby', `${statusId} ${captionStatusId}`);

    const source = createElement(documentRef, 'source');
    source.src = videoUrl;
    source.type = 'video/mp4';
    const captionTrack = createElement(documentRef, 'track');
    captionTrack.kind = 'captions';
    captionTrack.src = captionsUrl;
    captionTrack.srclang = 'en';
    captionTrack.label = 'English';
    captionTrack.default = true;
    video.append(source, captionTrack);
    mediaFrame.appendChild(video);

    const status = createElement(documentRef, 'p', 'training-intro-status', MEDIA_COPY.loading);
    status.id = statusId;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');

    const captionStatus = createElement(documentRef, 'p', 'training-intro-caption-status');
    captionStatus.id = captionStatusId;
    captionStatus.hidden = true;
    captionStatus.setAttribute('role', 'status');
    captionStatus.setAttribute('aria-live', 'polite');

    const mediaActions = createElement(documentRef, 'div', 'training-intro-actions');
    const playButton = createElement(
        documentRef,
        'button',
        'btn btn-primary',
        'Play introduction with sound'
    );
    playButton.type = 'button';
    const replayButton = createElement(documentRef, 'button', 'btn btn-secondary', 'Replay video');
    replayButton.type = 'button';
    const transcriptButton = createElement(documentRef, 'button', 'btn btn-secondary', 'Show video transcript');
    transcriptButton.type = 'button';
    transcriptButton.setAttribute('aria-expanded', 'false');
    transcriptButton.setAttribute('aria-controls', transcriptId);
    const retryButton = createElement(documentRef, 'button', 'btn btn-secondary', 'Retry video');
    retryButton.type = 'button';
    retryButton.hidden = true;
    mediaActions.append(playButton, replayButton, transcriptButton, retryButton);

    const transcript = createElement(documentRef, 'section', 'training-intro-transcript');
    transcript.id = transcriptId;
    transcript.hidden = true;
    transcript.setAttribute('aria-labelledby', `${transcriptId}-title`);
    transcript.tabIndex = -1;
    const transcriptTitle = createElement(documentRef, 'h3', 'training-intro-section-title', 'Video transcript');
    transcriptTitle.id = `${transcriptId}-title`;
    transcript.appendChild(transcriptTitle);
    TRAINING_INTRO_TRANSCRIPT.forEach((paragraph) => {
        transcript.appendChild(createElement(documentRef, 'p', '', paragraph));
    });

    const continueActions = createElement(documentRef, 'div', 'training-intro-continue-actions');
    const continueButton = createElement(
        documentRef,
        'button',
        'btn btn-primary',
        'Continue to profile confirmation'
    );
    continueButton.type = 'button';
    continueActions.appendChild(continueButton);

    root.append(
        introCopy,
        mediaFrame,
        status,
        captionStatus,
        mediaActions,
        transcript,
        continueActions
    );

    let mediaState = 'loading';
    let loadingTimer = null;
    let actionHandled = false;
    let modalController = null;
    let controller = null;
    const reportedDegradedStates = new Set();

    function clearLoadingTimer() {
        if (loadingTimer !== null && clearTimeoutRef) {
            clearTimeoutRef(loadingTimer);
        }
        loadingTimer = null;
    }

    function armLoadingTimeout() {
        clearLoadingTimer();
        if (!setTimeoutRef) return;
        loadingTimer = setTimeoutRef(() => {
            if (mediaState === 'loading') setMediaState('timeout');
        }, 10000);
    }

    function setMediaState(nextState) {
        mediaState = MEDIA_COPY[nextState] ? nextState : 'missing';
        root.dataset.mediaState = mediaState;
        status.textContent = MEDIA_COPY[mediaState];
        mediaFrame.setAttribute('aria-busy', String(mediaState === 'loading'));
        retryButton.hidden = !['missing', 'decode', 'offline', 'timeout'].includes(mediaState);
        if (['missing', 'decode', 'offline', 'timeout'].includes(mediaState)
            && !reportedDegradedStates.has(mediaState)) {
            reportedDegradedStates.add(mediaState);
            onMediaDegraded(mediaState);
        }
        if (mediaState !== 'loading') clearLoadingTimer();
    }

    async function play({ restart = false } = {}) {
        if (navigatorRef?.onLine === false) {
            setMediaState('offline');
            return false;
        }

        if (restart) video.currentTime = 0;
        video.muted = false;
        try {
            await Promise.resolve(video.play?.());
            setMediaState('playing');
            return true;
        } catch (_error) {
            setMediaState(resolveTrainingIntroMediaState(video.error, {
                online: navigatorRef?.onLine !== false
            }));
            return false;
        }
    }

    function retry() {
        if (navigatorRef?.onLine === false) {
            setMediaState('offline');
            return;
        }
        setMediaState('loading');
        armLoadingTimeout();
        try {
            video.load?.();
        } catch (_error) {
            setMediaState('missing');
        }
    }

    function showProfileConfirmation() {
        pauseVideo(video);
        root.dataset.stage = 'profile';
        root.replaceChildren();

        const heading = createElement(
            documentRef,
            'h3',
            'training-intro-section-title',
            'Confirm your training profile'
        );
        heading.tabIndex = -1;
        const profileLead = createElement(
            documentRef,
            'p',
            'training-intro-lead',
            'The guided walkthrough will use this team and semantic role.'
        );
        const profileList = createElement(documentRef, 'dl', 'training-intro-profile');
        const teamTerm = createElement(documentRef, 'dt', '', 'Team');
        const teamValue = createElement(
            documentRef,
            'dd',
            '',
            TEAM_LABELS[normalizedContext.team] || normalizedContext.team
        );
        const roleTerm = createElement(documentRef, 'dt', '', 'Role');
        const roleValue = createElement(
            documentRef,
            'dd',
            '',
            ROLE_LABELS[normalizedContext.semanticRole] || normalizedContext.semanticRole
        );
        profileList.append(teamTerm, teamValue, roleTerm, roleValue);

        const boundary = createElement(
            documentRef,
            'p',
            'training-intro-boundary',
            'This is practice only. Your activity stays isolated from live sessions.'
        );
        const actions = createElement(documentRef, 'div', 'training-intro-continue-actions');
        const changeButton = createElement(
            documentRef,
            'button',
            'btn btn-secondary',
            'Change team or role'
        );
        changeButton.type = 'button';
        const beginButton = createElement(
            documentRef,
            'button',
            'btn btn-primary',
            'Start guided walkthrough'
        );
        beginButton.type = 'button';
        actions.append(changeButton, beginButton);
        root.append(heading, profileLead, profileList, boundary, actions);

        changeButton.addEventListener('click', () => {
            actionHandled = true;
            modalController?.close?.();
            onChangeProfile(normalizedContext);
        });
        beginButton.addEventListener('click', () => {
            actionHandled = true;
            markTrainingIntroViewed(normalizedContext, storage);
            modalController?.close?.();
            onContinue(normalizedContext, { reason: 'confirmed' });
        });
        heading.focus?.();
    }

    function handleMediaError() {
        setMediaState(resolveTrainingIntroMediaState(video.error, {
            online: navigatorRef?.onLine !== false
        }));
    }

    function handleOffline() {
        pauseVideo(video);
        setMediaState('offline');
    }

    function handleOnline() {
        if (mediaState === 'offline') retry();
    }

    function handlePageHide() {
        pauseVideo(video);
    }

    function handleVisibilityChange() {
        if (documentRef.visibilityState === 'hidden') pauseVideo(video);
    }

    function cleanup() {
        clearLoadingTimer();
        pauseVideo(video);
        windowRef?.removeEventListener?.('offline', handleOffline);
        windowRef?.removeEventListener?.('online', handleOnline);
        windowRef?.removeEventListener?.('pagehide', handlePageHide);
        documentRef.removeEventListener?.('visibilitychange', handleVisibilityChange);
        if (activeIntroController === controller) activeIntroController = null;
    }

    playButton.addEventListener('click', () => void play());
    replayButton.addEventListener('click', () => void play({ restart: true }));
    retryButton.addEventListener('click', retry);
    transcriptButton.addEventListener('click', () => {
        const willShow = transcript.hidden;
        transcript.hidden = !willShow;
        transcriptButton.setAttribute('aria-expanded', String(willShow));
        transcriptButton.textContent = willShow ? 'Hide video transcript' : 'Show video transcript';
        if (willShow) transcript.focus?.();
    });
    continueButton.addEventListener('click', showProfileConfirmation);
    video.addEventListener('loadedmetadata', () => setMediaState('ready'));
    video.addEventListener('play', () => setMediaState('playing'));
    video.addEventListener('ended', () => setMediaState('ended'));
    video.addEventListener('error', handleMediaError);
    source.addEventListener('error', handleMediaError);
    captionTrack.addEventListener('load', () => {
        captionStatus.hidden = true;
        captionStatus.textContent = '';
    });
    captionTrack.addEventListener('error', () => {
        captionStatus.hidden = false;
        captionStatus.textContent = 'The separate caption track is unavailable. If the video plays, synchronized captions are also embedded in the picture. The complete text transcript is available below.';
        if (!reportedDegradedStates.has('captions')) {
            reportedDegradedStates.add('captions');
            onMediaDegraded('captions');
        }
    });
    windowRef?.addEventListener?.('offline', handleOffline);
    windowRef?.addEventListener?.('online', handleOnline);
    windowRef?.addEventListener?.('pagehide', handlePageHide);
    documentRef.addEventListener?.('visibilitychange', handleVisibilityChange);

    modalController = showModalRef({
        title: forceReplay ? 'Replay training introduction' : 'Welcome to Fractured Order training',
        content: root,
        size: 'xl',
        closable: true,
        initialFocus: playButton,
        onClose: () => {
            cleanup();
            if (!actionHandled && !forceReplay) {
                actionHandled = true;
                markTrainingIntroViewed(normalizedContext, storage);
                onContinue(normalizedContext, { reason: 'dismissed' });
            }
        }
    });

    controller = {
        element: modalController?.element || root,
        overlay: modalController?.overlay || null,
        content: root,
        video,
        close: () => modalController?.close?.(),
        replay: () => play({ restart: true })
    };
    activeIntroController = controller;
    armLoadingTimeout();
    return controller;
}

export default showTrainingIntroModal;
