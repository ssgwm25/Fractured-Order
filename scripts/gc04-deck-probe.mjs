// Browser test helpers: insert actual IndexedDB records, observe real deletion.
export async function seedDeckProbe(page, deckKey) {
    await page.evaluate(async deckKey => {
        await new Promise((resolve, reject) => {
            const request = indexedDB.open('esg-scribe-decks', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('uploaded-decks', { keyPath: 'storageKey' });
            request.onerror = () => reject(new Error('Deck fixture open failed'));
            request.onblocked = () => reject(new Error('Deck fixture blocked'));
            request.onsuccess = () => {
                const db = request.result, tx = db.transaction('uploaded-decks', 'readwrite');
                for (const key of [deckKey, `gc04-retained:${deckKey}`]) {
                    tx.objectStore('uploaded-decks').put({ storageKey: key, slides: ['synthetic deck probe'] });
                }
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Deck fixture transaction failed')); };
            };
        });
    }, deckKey);
}

export async function readDeckProbe(page, deckKey) {
    return page.evaluate(deckKey => new Promise((resolve, reject) => {
        const request = indexedDB.open('esg-scribe-decks', 1);
        request.onerror = request.onblocked = () => reject(new Error('Deck verification open failed'));
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('uploaded-decks', 'readonly'), store = tx.objectStore('uploaded-decks');
            const own = store.get(deckKey), retained = store.get(`gc04-retained:${deckKey}`);
            tx.oncomplete = () => { db.close(); resolve({ own: own.result !== undefined, retained: retained.result !== undefined }); };
            tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Deck verification read failed')); };
        };
    }), deckKey);
}
