const SCRIBE_DECK_STORAGE_DB = 'esg-scribe-decks';
const SCRIBE_DECK_STORAGE_STORE = 'uploaded-decks';
const SCRIBE_DECK_STORAGE_VERSION = 1;
export const SCRIBE_DECK_STORAGE_TIMEOUT_MS = 5000;

function createScribeDeckStorageTimeoutError(operation = 'accessing uploaded facilitator deck storage') {
    return new Error(
        `Uploaded facilitator deck browser storage timed out while ${operation}. Check browser storage permissions and try again.`
    );
}

function resolveIndexedDb() {
    return globalThis.indexedDB
        || globalThis.window?.indexedDB
        || null;
}

function requireIndexedDb() {
    const indexedDb = resolveIndexedDb();
    if (!indexedDb) {
        throw new Error('Uploaded facilitator decks require browser storage support.');
    }

    return indexedDb;
}

function openDeckStorageDatabase() {
    const indexedDb = requireIndexedDb();

    return new Promise((resolve, reject) => {
        let settled = false;
        let request = null;
        let timeoutId = null;

        const settle = (handler, value) => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timeoutId);
            handler(value);
        };

        timeoutId = setTimeout(() => {
            settle(reject, createScribeDeckStorageTimeoutError('opening storage'));
        }, SCRIBE_DECK_STORAGE_TIMEOUT_MS);

        try {
            request = indexedDb.open(SCRIBE_DECK_STORAGE_DB, SCRIBE_DECK_STORAGE_VERSION);
        } catch (error) {
            settle(reject, error);
            return;
        }

        if (!request) {
            settle(reject, new Error('Uploaded facilitator deck storage open request did not start.'));
            return;
        }

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(SCRIBE_DECK_STORAGE_STORE)) {
                database.createObjectStore(SCRIBE_DECK_STORAGE_STORE, {
                    keyPath: 'storageKey'
                });
            }
        };

        request.onsuccess = () => {
            if (settled) {
                request.result?.close?.();
                return;
            }

            settle(resolve, request.result);
        };

        request.onerror = () => {
            settle(reject, request.error || new Error('Unable to open uploaded facilitator deck storage.'));
        };

        request.onblocked = () => {
            settle(
                reject,
                new Error('Uploaded facilitator deck storage is blocked by another open tab. Close other Fractured Order tabs and try again.')
            );
        };
    });
}

async function runDeckStorageRequest(mode, callback) {
    const database = await openDeckStorageDatabase();

    return new Promise((resolve, reject) => {
        let transaction = null;
        let request = null;
        let settled = false;
        let timeoutId = null;

        const closeDatabase = () => {
            try {
                database.close();
            } catch (_error) {
                // Ignore close errors.
            }
        };

        const settle = (handler, value) => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timeoutId);
            closeDatabase();
            handler(value);
        };

        try {
            transaction = database.transaction(SCRIBE_DECK_STORAGE_STORE, mode);
            const store = transaction.objectStore(SCRIBE_DECK_STORAGE_STORE);
            request = callback(store);
        } catch (error) {
            settle(reject, error);
            return;
        }

        if (!request) {
            settle(reject, new Error('Uploaded facilitator deck storage request did not start.'));
            return;
        }

        timeoutId = setTimeout(() => {
            try {
                transaction.abort?.();
            } catch (_error) {
                // Ignore abort errors after a timeout.
            }

            settle(reject, createScribeDeckStorageTimeoutError('reading or writing storage'));
        }, SCRIBE_DECK_STORAGE_TIMEOUT_MS);

        request.onsuccess = () => {
            settle(resolve, request.result ?? null);
        };

        request.onerror = () => {
            settle(reject, request.error || new Error('Uploaded facilitator deck storage request failed.'));
        };

        transaction.onabort = () => {
            settle(reject, transaction.error || new Error('Uploaded facilitator deck storage transaction failed.'));
        };

        transaction.onerror = () => {
            settle(reject, transaction.error || new Error('Uploaded facilitator deck storage transaction failed.'));
        };

        transaction.oncomplete = () => {
            if (!settled) {
                settle(resolve, request.result ?? null);
            }
        };
    });
}

export function buildUploadedScribeDeckStorageKey(sessionId = '', teamId = '') {
    const normalizedSessionId = String(sessionId || '').trim();
    const normalizedTeamId = String(teamId || '').trim().toLowerCase();

    if (!normalizedSessionId || !normalizedTeamId) {
        throw new Error('Uploaded facilitator decks require both a session ID and team ID.');
    }

    return `scribe-deck:${normalizedSessionId}:${normalizedTeamId}`;
}

export async function saveUploadedScribeDeck({
    storageKey = '',
    sessionId = '',
    teamId = '',
    deckLabel = '',
    fileName = '',
    slides = [],
    uploadedAt = new Date().toISOString()
} = {}) {
    const normalizedStorageKey = String(storageKey || '').trim();
    if (!normalizedStorageKey) {
        throw new Error('Uploaded facilitator deck storage key is required.');
    }

    if (!Array.isArray(slides) || !slides.length) {
        throw new Error('Uploaded facilitator decks must include at least one slide.');
    }

    const payload = {
        storageKey: normalizedStorageKey,
        sessionId: String(sessionId || '').trim(),
        teamId: String(teamId || '').trim().toLowerCase(),
        deckLabel: String(deckLabel || '').trim(),
        fileName: String(fileName || '').trim(),
        slides,
        uploadedAt,
        updatedAt: new Date().toISOString()
    };

    await runDeckStorageRequest('readwrite', (store) => store.put(payload));
    return payload;
}

export async function getUploadedScribeDeck(storageKey = '') {
    const normalizedStorageKey = String(storageKey || '').trim();
    if (!normalizedStorageKey) {
        return null;
    }

    return runDeckStorageRequest('readonly', (store) => store.get(normalizedStorageKey));
}

export async function deleteUploadedScribeDeck(storageKey = '') {
    const normalizedStorageKey = String(storageKey || '').trim();
    if (!normalizedStorageKey) {
        return false;
    }

    await runDeckStorageRequest('readwrite', (store) => store.delete(normalizedStorageKey));
    return true;
}
