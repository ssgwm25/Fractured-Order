import { TEAM_OPTIONS } from '../../core/teamContext.js';

export const DEFAULT_SCRIBE_DECK_FILE = 'fractured-order-facilitator-deck.html';
export const DEFAULT_SCRIBE_DECK_TEAM = 'blue';
export const DEFAULT_SCRIBE_DECK_PATH = `decks/${DEFAULT_SCRIBE_DECK_TEAM}/${DEFAULT_SCRIBE_DECK_FILE}`;
export const DEFAULT_SCRIBE_DECK_LABEL = 'Fractured Order Facilitator Deck';
export const SCRIBE_DECK_ASSIGNMENT_CONTENT_KIND = 'SCRIBE_DECK_ASSIGNMENT';
export const SCRIBE_DECK_SOURCE_REPO = 'repo_path';
export const SCRIBE_DECK_SOURCE_UPLOAD = 'browser_upload';
const SCRIBE_DECK_TEAM_IDS = new Set(TEAM_OPTIONS.map((team) => team.id));

function normalizeScribeDeckTeamId(teamId = DEFAULT_SCRIBE_DECK_TEAM) {
    return SCRIBE_DECK_TEAM_IDS.has(teamId)
        ? teamId
        : DEFAULT_SCRIBE_DECK_TEAM;
}

export function buildDefaultScribeDeckPath(teamId = DEFAULT_SCRIBE_DECK_TEAM) {
    const resolvedTeamId = normalizeScribeDeckTeamId(teamId);
    return `decks/${resolvedTeamId}/${DEFAULT_SCRIBE_DECK_FILE}`;
}

export const SCRIBE_DECK_SECTIONS = Object.freeze([
    {
        id: 'actions',
        label: 'Actions',
        description: 'Live facilitator decisions and White Cell deliberation updates for the scribe seat.',
        slideNumbers: Object.freeze([])
    },
    {
        id: 'overview',
        label: 'Overview',
        description: 'Exercise framing, objectives, world timeline, and closing context.',
        slideNumbers: Object.freeze([1, 2, 3, 4, 49, 51, 52, 61])
    },
    {
        id: 'schedule',
        label: 'Schedule',
        description: 'Game-day flow, plenaries, room setup, and hot wash timing.',
        slideNumbers: Object.freeze([5, 6, 7, 8, 9, 10, 11, 44, 45, 58])
    },
    {
        id: 'roles-objectives',
        label: 'Roles and Objectives',
        description: 'Actor relationships, blue objectives, team tasks, and role assignments.',
        slideNumbers: Object.freeze([12, 13, 14, 22])
    },
    {
        id: 'brics-context',
        label: 'BRICS+ Context',
        description: 'Strategic sovereign systems framing and alliance composition.',
        slideNumbers: Object.freeze([19, 20, 21])
    },
    {
        id: 'gameplay',
        label: 'Gameplay',
        description: 'Interaction patterns, move flow, prompts, and support-cell framing.',
        slideNumbers: Object.freeze([23, 24, 46, 47, 48, 50])
    },
    {
        id: 'support-materials',
        label: 'Support Materials',
        description: 'Reference materials and sector exploration prompts.',
        slideNumbers: Object.freeze([25, 26])
    },
    {
        id: 'supply-chain-data',
        label: 'Supply Chain Data',
        description: 'Supply-chain maps plus extraction, refinement, and manufacturing datasets.',
        slideNumbers: Object.freeze([27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39])
    },
    {
        id: 'economic-tools',
        label: 'Economic Tools',
        description: 'U.S. instruments, authorities, and tool-selection reference.',
        slideNumbers: Object.freeze([41, 42, 43])
    },
    {
        id: 'communications',
        label: 'Communications',
        description: 'Tribe Street Journal and support-cell communications context.',
        slideNumbers: Object.freeze([40, 53, 54, 55, 56, 57])
    }
]);

export function parseScribeDeckHtml(html = '') {
    const slidesMatch = html.match(/const\s+SLIDES\s*=\s*(\[[\s\S]*?\]);\s*const\s+SECTIONS\s*=/);
    if (!slidesMatch?.[1]) {
        throw new Error('Scribe deck payload is missing slide data.');
    }

    const slides = JSON.parse(slidesMatch[1]);
    if (!Array.isArray(slides) || !slides.length) {
        throw new Error('Scribe deck payload did not contain any slides.');
    }

    return slides;
}

export function normalizeScribeDeckPath(
    deckPath = '',
    {
        teamId = DEFAULT_SCRIBE_DECK_TEAM
    } = {}
) {
    const resolvedTeamId = normalizeScribeDeckTeamId(teamId);
    const defaultDeckPath = buildDefaultScribeDeckPath(resolvedTeamId);
    const rawPath = String(deckPath || '').trim();
    if (!rawPath) {
        return defaultDeckPath;
    }

    if (/^[a-z]+:/i.test(rawPath) || rawPath.startsWith('//')) {
        throw new Error('Scribe deck paths must stay inside this app.');
    }

    const normalizedPath = rawPath
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/^\/+/, '');

    if (normalizedPath.includes('..')) {
        throw new Error('Scribe deck paths cannot traverse outside the app bundle.');
    }

    if (!/\.html(?:[?#].*)?$/i.test(normalizedPath)) {
        throw new Error('Scribe deck paths must point to an HTML deck file.');
    }

    if (
        normalizedPath === DEFAULT_SCRIBE_DECK_FILE
        || normalizedPath === DEFAULT_SCRIBE_DECK_PATH
    ) {
        return defaultDeckPath;
    }

    if (!normalizedPath.includes('/')) {
        return `decks/${resolvedTeamId}/${normalizedPath}`;
    }

    if (!normalizedPath.startsWith(`decks/${resolvedTeamId}/`)) {
        throw new Error(`Scribe deck paths must stay inside decks/${resolvedTeamId}/.`);
    }

    return normalizedPath;
}

export function normalizeScribeDeckLabel(
    deckLabel = '',
    deckPath = '',
    {
        teamId = DEFAULT_SCRIBE_DECK_TEAM
    } = {}
) {
    const trimmedLabel = typeof deckLabel === 'string' ? deckLabel.trim() : '';
    if (trimmedLabel) {
        return trimmedLabel;
    }

    const normalizedPath = normalizeScribeDeckPath(deckPath, { teamId });
    if (normalizedPath === buildDefaultScribeDeckPath(teamId)) {
        return DEFAULT_SCRIBE_DECK_LABEL;
    }

    const pathWithoutSuffix = normalizedPath.split(/[?#]/, 1)[0];
    const fileName = pathWithoutSuffix.split('/').pop() || normalizedPath;
    const label = fileName
        .replace(/\.html$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();

    return label || DEFAULT_SCRIBE_DECK_LABEL;
}

export function normalizeUploadedScribeDeckFileName(fileName = '') {
    return String(fileName || '')
        .trim()
        .replaceAll('\\', '/')
        .split('/')
        .pop()
        || 'uploaded-scribe-deck.html';
}

export function normalizeUploadedScribeDeckLabel(
    deckLabel = '',
    fileName = ''
) {
    const trimmedLabel = typeof deckLabel === 'string' ? deckLabel.trim() : '';
    if (trimmedLabel) {
        return trimmedLabel;
    }

    const normalizedFileName = normalizeUploadedScribeDeckFileName(fileName);
    const label = normalizedFileName
        .replace(/\.html$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();

    return label || 'Uploaded Scribe Deck';
}

export function getScribeDeckAssignmentDetails(communication = {}) {
    const metadata = communication?.metadata && typeof communication.metadata === 'object'
        ? communication.metadata
        : null;

    if (!metadata || metadata.content_kind !== SCRIBE_DECK_ASSIGNMENT_CONTENT_KIND) {
        return null;
    }

    const recipientTeam = typeof metadata.recipient_team === 'string'
        ? metadata.recipient_team.trim().toLowerCase()
        : '';
    if (!recipientTeam) {
        return null;
    }

    const deckSource = metadata.deck_source === SCRIBE_DECK_SOURCE_UPLOAD
        ? SCRIBE_DECK_SOURCE_UPLOAD
        : SCRIBE_DECK_SOURCE_REPO;

    if (deckSource === SCRIBE_DECK_SOURCE_UPLOAD) {
        const deckStorageKey = typeof metadata.deck_storage_key === 'string'
            ? metadata.deck_storage_key.trim()
            : '';
        if (!deckStorageKey) {
            return null;
        }

        const deckFileName = normalizeUploadedScribeDeckFileName(metadata.deck_file_name || '');

        return {
            communicationId: communication?.id || null,
            recipientTeam,
            deckSource,
            deckStorageKey,
            deckFileName,
            deckPath: null,
            deckLabel: normalizeUploadedScribeDeckLabel(metadata.deck_label, deckFileName),
            assignedAt: communication?.created_at || communication?.updated_at || null
        };
    }

    try {
        const deckPath = normalizeScribeDeckPath(metadata.deck_path || '', {
            teamId: recipientTeam
        });
        return {
            communicationId: communication?.id || null,
            recipientTeam,
            deckSource,
            deckStorageKey: null,
            deckFileName: null,
            deckPath,
            deckLabel: normalizeScribeDeckLabel(metadata.deck_label, deckPath, {
                teamId: recipientTeam
            }),
            assignedAt: communication?.created_at || communication?.updated_at || null
        };
    } catch (_error) {
        return null;
    }
}

export function expandScribeDeckSections(slides = []) {
    const slideMap = new Map(
        slides
            .filter((slide) => Number.isFinite(slide?.n))
            .map((slide) => [slide.n, {
                ...slide,
                slideKey: `deck-${slide.n}`,
                slideType: 'image',
                sortOrder: slide.n
            }])
    );

    return SCRIBE_DECK_SECTIONS.map((section) => ({
        ...section,
        slides: section.slideNumbers
            .map((slideNumber) => slideMap.get(slideNumber))
            .filter(Boolean)
    }));
}

export function flattenScribeDeckSlides(sections = []) {
    const seenSlideKeys = new Set();

    return sections
        .flatMap((section) => section?.slides || [])
        .filter((slide) => {
            const slideKey = slide?.slideKey || (Number.isFinite(slide?.n) ? `deck-${slide.n}` : null);
            if (!slide || !slideKey || seenSlideKeys.has(slideKey)) {
                return false;
            }

            seenSlideKeys.add(slideKey);
            return true;
        })
        .sort((left, right) => {
            const leftOrder = Number.isFinite(left?.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
            const rightOrder = Number.isFinite(right?.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;

            if (leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }

            return String(left?.slideKey || '').localeCompare(String(right?.slideKey || ''));
        });
}

export function getSectionIndexForSlideNumber(sections = [], slideNumber = null) {
    return sections.findIndex((section) => (
        (section?.slides || []).some((slide) => slide.n === slideNumber)
    ));
}

export function getSectionIndexForSlideKey(sections = [], slideKey = '') {
    return sections.findIndex((section) => (
        (section?.slides || []).some((slide) => (slide?.slideKey || '') === slideKey)
    ));
}
