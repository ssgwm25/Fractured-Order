const NOTETAKER_LEDGER_SCHEMA_VERSION = 2;
const LEGACY_PARTICIPANT_KEY = 'legacy';

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalString(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue || null;
}

function clonePlainObject(value) {
    if (!isPlainObject(value)) {
        return {};
    }

    return { ...value };
}

function normalizeParticipantEntries(entries = {}) {
    return Object.fromEntries(
        Object.entries(isPlainObject(entries) ? entries : {})
            .filter(([participantKey, entry]) => participantKey && isPlainObject(entry))
            .map(([participantKey, entry]) => [
                participantKey,
                {
                    participant_key: normalizeOptionalString(entry.participant_key) || participantKey,
                    participant_id: normalizeOptionalString(entry.participant_id),
                    client_id: normalizeOptionalString(entry.client_id),
                    participant_label: normalizeOptionalString(entry.participant_label),
                    updated_at: normalizeOptionalString(entry.updated_at),
                    data: clonePlainObject(entry.data)
                }
            ])
    );
}

function normalizeTeamEntries(teamEntries = {}) {
    return Object.fromEntries(
        Object.entries(isPlainObject(teamEntries) ? teamEntries : {})
            .filter(([teamId, teamEntry]) => teamId && isPlainObject(teamEntry))
            .map(([teamId, teamEntry]) => [
                teamId,
                {
                    participant_entries: normalizeParticipantEntries(teamEntry.participant_entries)
                }
            ])
    );
}

function isTeamScopedNotetakerSection(section) {
    return isPlainObject(section) && isPlainObject(section.team_entries);
}

function normalizeLegacySection(section = {}, fallbackTeamId = null) {
    const legacyData = clonePlainObject(section);
    if (!Object.keys(legacyData).length || !fallbackTeamId) {
        return {
            schema_version: NOTETAKER_LEDGER_SCHEMA_VERSION,
            team_entries: {}
        };
    }

    return {
        schema_version: NOTETAKER_LEDGER_SCHEMA_VERSION,
        team_entries: {
            [fallbackTeamId]: {
                participant_entries: {
                    [LEGACY_PARTICIPANT_KEY]: {
                        participant_key: LEGACY_PARTICIPANT_KEY,
                        participant_id: null,
                        client_id: null,
                        participant_label: 'Legacy shared notes',
                        updated_at: null,
                        data: legacyData
                    }
                }
            }
        }
    };
}

function getLatestParticipantEntry(participantEntries = {}) {
    const scopedEntries = Object.values(participantEntries)
        .filter((entry) => isPlainObject(entry) && isPlainObject(entry.data));

    if (!scopedEntries.length) {
        return null;
    }

    return scopedEntries.sort((left, right) => {
        const leftTimestamp = new Date(left.updated_at || 0).getTime();
        const rightTimestamp = new Date(right.updated_at || 0).getTime();
        return rightTimestamp - leftTimestamp;
    })[0];
}

function buildObservationEntrySignature(entry = {}) {
    if (entry.id) {
        return `id:${entry.id}`;
    }

    return [
        entry.team || '',
        entry.participant_key || '',
        entry.timestamp || '',
        entry.type || '',
        entry.content || ''
    ].join('|');
}

export function normalizeObservationTimelineEntries(entries) {
    return Array.isArray(entries)
        ? entries.filter((entry) => entry && typeof entry === 'object').map((entry) => ({ ...entry }))
        : [];
}

export function resolveNotetakerParticipantKey(context = {}, { fallbackClientId = null } = {}) {
    const candidates = [
        context.participant_key,
        context.participantKey,
        context.session_participant_id,
        context.participantSessionId,
        context.participant_id,
        context.participantId,
        context.client_id,
        context.clientId,
        fallbackClientId
    ];

    return candidates
        .map((candidate) => normalizeOptionalString(candidate))
        .find(Boolean) || null;
}

export function buildNotetakerParticipantContext(context = {}, {
    fallbackClientId = null,
    fallbackParticipantLabel = null
} = {}) {
    return {
        participantKey: resolveNotetakerParticipantKey(context, { fallbackClientId }),
        participantId: normalizeOptionalString(
            context.participantId
            ?? context.participant_id
            ?? context.sessionParticipantId
            ?? context.session_participant_id
            ?? context.participantSessionId
        ),
        clientId: normalizeOptionalString(context.clientId ?? context.client_id) || normalizeOptionalString(fallbackClientId),
        participantLabel: normalizeOptionalString(
            context.participantLabel
            ?? context.participant_label
            ?? context.display_name
            ?? context.displayName
        ) || normalizeOptionalString(fallbackParticipantLabel)
    };
}

export function normalizeNotetakerSection(section = {}, { fallbackTeamId = null } = {}) {
    if (isTeamScopedNotetakerSection(section)) {
        return {
            schema_version: Number(section.schema_version) || NOTETAKER_LEDGER_SCHEMA_VERSION,
            team_entries: normalizeTeamEntries(section.team_entries)
        };
    }

    return normalizeLegacySection(section, fallbackTeamId);
}

export function mergeParticipantScopedNotetakerSection(existingSection = {}, incomingData = {}, {
    teamId = null,
    timestamp = new Date().toISOString(),
    participantKey = null,
    participantId = null,
    clientId = null,
    participantLabel = null
} = {}) {
    const normalizedIncomingData = clonePlainObject(incomingData);

    if (!teamId || !participantKey) {
        return normalizedIncomingData;
    }

    const normalizedSection = normalizeNotetakerSection(existingSection, {
        fallbackTeamId: teamId
    });
    const currentTeamEntry = normalizedSection.team_entries[teamId] || {
        participant_entries: {}
    };
    const existingParticipantEntry = currentTeamEntry.participant_entries[participantKey] || null;

    return {
        schema_version: NOTETAKER_LEDGER_SCHEMA_VERSION,
        team_entries: {
            ...normalizedSection.team_entries,
            [teamId]: {
                participant_entries: {
                    ...currentTeamEntry.participant_entries,
                    [participantKey]: {
                        participant_key: participantKey,
                        participant_id: participantId ?? existingParticipantEntry?.participant_id ?? null,
                        client_id: clientId ?? existingParticipantEntry?.client_id ?? null,
                        participant_label: participantLabel ?? existingParticipantEntry?.participant_label ?? null,
                        updated_at: timestamp,
                        data: normalizedIncomingData
                    }
                }
            }
        }
    };
}

export function readParticipantScopedNotetakerSection(section = {}, defaults = {}, {
    teamId = null,
    participantKey = null,
    fallbackTeamId = null
} = {}) {
    if (!isTeamScopedNotetakerSection(section)) {
        return {
            ...defaults,
            ...clonePlainObject(section)
        };
    }

    const normalizedSection = normalizeNotetakerSection(section, {
        fallbackTeamId
    });
    const teamEntry = normalizedSection.team_entries[teamId] || null;
    const participantEntries = teamEntry?.participant_entries || {};
    const selectedEntry = participantKey
        ? (participantEntries[participantKey] || participantEntries[LEGACY_PARTICIPANT_KEY] || null)
        : (participantEntries[LEGACY_PARTICIPANT_KEY] || getLatestParticipantEntry(participantEntries));

    return {
        ...defaults,
        ...clonePlainObject(selectedEntry?.data)
    };
}

export function annotateObservationTimelineEntries(entries = [], {
    teamId = null,
    timestamp = new Date().toISOString(),
    participantKey = null,
    participantId = null,
    clientId = null,
    participantLabel = null
} = {}) {
    return normalizeObservationTimelineEntries(entries).map((entry) => ({
        ...entry,
        team: normalizeOptionalString(entry.team) || teamId || null,
        participant_key: normalizeOptionalString(entry.participant_key) || participantKey || null,
        participant_id: normalizeOptionalString(entry.participant_id) || participantId || null,
        client_id: normalizeOptionalString(entry.client_id) || clientId || null,
        participant_label: normalizeOptionalString(entry.participant_label) || participantLabel || null,
        timestamp: normalizeOptionalString(entry.timestamp) || timestamp
    }));
}

export function mergeObservationTimeline(existingEntries = [], {
    replacementEntries = null,
    appendedEntries = []
} = {}) {
    const baseEntries = Array.isArray(replacementEntries)
        ? normalizeObservationTimelineEntries(replacementEntries)
        : normalizeObservationTimelineEntries(existingEntries);
    const incomingEntries = Array.isArray(replacementEntries)
        ? []
        : normalizeObservationTimelineEntries(appendedEntries);
    const mergedEntries = [...baseEntries];
    const knownEntrySignatures = new Set(baseEntries.map((entry) => buildObservationEntrySignature(entry)));

    incomingEntries.forEach((entry) => {
        const signature = buildObservationEntrySignature(entry);
        if (knownEntrySignatures.has(signature)) {
            return;
        }

        knownEntrySignatures.add(signature);
        mergedEntries.push(entry);
    });

    return mergedEntries;
}

export function filterObservationTimelineByTeam(entries = [], {
    teamId = null,
    fallbackTeamId = null
} = {}) {
    return normalizeObservationTimelineEntries(entries).filter((entry) => {
        if (!teamId) {
            return true;
        }

        const entryTeam = normalizeOptionalString(entry.team);
        if (entryTeam) {
            return entryTeam === teamId;
        }

        return fallbackTeamId === teamId;
    });
}

export {
    LEGACY_PARTICIPANT_KEY,
    NOTETAKER_LEDGER_SCHEMA_VERSION
};
