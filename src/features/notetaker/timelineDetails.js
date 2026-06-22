export const NOTETAKER_TIMELINE_EVENT_SOURCE = 'notetaker_save';

const NOTETAKER_SCOPE_LABELS = Object.freeze({
    dynamics: 'Team Dynamics',
    alliance: 'Alliance Tracking'
});

const NOTETAKER_DETAIL_DEFINITIONS = Object.freeze({
    dynamics: [
        { key: 'emergingLeaders', label: 'Emerging Leaders' },
        { key: 'decisionStyle', label: 'Decision Making Style' },
        {
            key: 'frictionLevel',
            label: 'Friction Level',
            format: (value) => `${value}/10`
        },
        { key: 'frictionSources', label: 'Friction Sources' },
        {
            key: 'consensusLevel',
            label: 'Consensus Level',
            format: (value) => `${value}/10`
        },
        { key: 'dynamicsSummary', label: 'Summary Notes' }
    ],
    alliance: [
        { key: 'allianceNotes', label: 'Alliance Coordination Notes' },
        { key: 'externalPressures', label: 'External Pressures' }
    ]
});

function normalizeDetailValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value !== 'string') {
        return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue || null;
}

export function getNotetakerTimelineScopeLabel(noteScope = null) {
    return NOTETAKER_SCOPE_LABELS[noteScope] || 'Notetaker Notes';
}

export function buildNotetakerTimelineDetailItems(noteScope, noteData = {}) {
    const definitions = NOTETAKER_DETAIL_DEFINITIONS[noteScope];
    if (!definitions) {
        throw new Error(`Unsupported notetaker timeline scope: ${noteScope}`);
    }

    return definitions.flatMap(({ key, label, format }) => {
        const normalizedValue = normalizeDetailValue(noteData?.[key]);
        if (!normalizedValue) {
            return [];
        }

        const formattedValue = typeof format === 'function'
            ? format(normalizedValue)
            : normalizedValue;

        return formattedValue
            ? [{ key, label, value: formattedValue }]
            : [];
    });
}

export function isNotetakerSaveTimelineEvent(event = {}) {
    const metadata = event?.metadata && typeof event.metadata === 'object'
        ? event.metadata
        : {};

    return metadata.source === NOTETAKER_TIMELINE_EVENT_SOURCE
        && Boolean(NOTETAKER_SCOPE_LABELS[metadata.note_scope]);
}

export function getNotetakerSaveTimelineDetailItems(event = {}) {
    const metadata = event?.metadata && typeof event.metadata === 'object'
        ? event.metadata
        : {};

    return Array.isArray(metadata.note_details)
        ? metadata.note_details.filter((detail) => (
            detail
            && typeof detail === 'object'
            && typeof detail.label === 'string'
            && typeof detail.value === 'string'
            && detail.label.trim()
            && detail.value.trim()
        ))
        : [];
}

