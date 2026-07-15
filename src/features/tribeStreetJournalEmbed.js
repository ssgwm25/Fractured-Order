export const TRIBE_STREET_JOURNAL_EMBED_URL = 'https://tribestreetjournal.com/';

export function createTribeStreetJournalEmbedMarkup({
    title = 'Tribe Street Journal live site'
} = {}) {
    return `
        <div class="tribe-street-journal-embed">
            <div class="tribe-street-journal-embed-toolbar">
                <div>
                    <h3 class="tribe-street-journal-embed-title">tribestreetjournal.com</h3>
                    <p class="tribe-street-journal-embed-description">
                        Embedded live view of Tribe Street Journal. If the site is blocked from loading in a frame,
                        use the direct link to open it in a new tab.
                    </p>
                </div>
                <a
                    class="btn btn-secondary btn-sm"
                    href="${TRIBE_STREET_JOURNAL_EMBED_URL}"
                    target="_blank"
                    rel="noopener noreferrer"
                >Open in new tab</a>
            </div>
            <div class="tribe-street-journal-embed-viewport">
                <iframe
                    class="tribe-street-journal-embed-frame"
                    src="${TRIBE_STREET_JOURNAL_EMBED_URL}"
                    title="${title}"
                    loading="lazy"
                    referrerpolicy="strict-origin-when-cross-origin"
                ></iframe>
            </div>
        </div>
    `;
}
