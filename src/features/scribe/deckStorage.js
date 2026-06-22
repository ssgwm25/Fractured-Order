const SCRIBE_DECK_STORAGE_DB = 'esg-scribe-decks';
const SCRIBE_DECK_STORAGE_STORE = 'uploaded-decks';
const SCRIBE_DECK_STORAGE_VERSION = 1;

function resolveIndexedDb() {
    return globalThis.indexedDB
        || globalThis.window?.indexedDB
        || null;
}

function requireIndexedDb() {
    const indexedDb = resolveIndexedDb();
    if (!indexedDb) {
        throw new Error('Uploaded scribe decks require browser storage support.');
    }

    return indexedDb;
}

function openDeckStorageDatabase() {
    const indexedDb = requireIndexedDb();

    return new Promise((resolve, reject) => {
        const request = indexedDb.open(SCRIBE_DECK_STORAGE_DB, SCRIBE_DECK_STORAGE_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(SCRIBE_DECK_STORAGE_STORE)) {
                database.createObjectStore(SCRIBE_DECK_STORAGE_STORE, {
                    keyPath: 'storageKey'
                });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error || new Error('Unable to open uploaded scribe deck storage.'));
        };
    });
}

async function runDeckStorageRequest(mode, callback) {
    const database = await openDeckStorageDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(SCRIBE_DECK_STORAGE_STORE, mode);
        const store = transaction.objectStore(SCRIBE_DECK_STORAGE_STORE);
        const request = callback(store);
        let settled = false;

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
            closeDatabase();
            handler(value);
        };

        request.onsuccess = () => {
            settle(resolve, request.result ?? null);
        };

        request.onerror = () => {
            settle(reject, request.error || new Error('Uploaded scribe deck storage request failed.'));
        };

        transaction.onabort = () => {
            settle(reject, transaction.error || new Error('Uploaded scribe deck storage transaction failed.'));
        };

        transaction.onerror = () => {
            settle(reject, transaction.error || new Error('Uploaded scribe deck storage transaction failed.'));
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
        throw new Error('Uploaded scribe decks require both a session ID and team ID.');
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
        throw new Error('Uploaded scribe deck storage key is required.');
    }

    if (!Array.isArray(slides) || !slides.length) {
        throw new Error('Uploaded scribe decks must include at least one slide.');
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
