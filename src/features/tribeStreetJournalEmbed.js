export const TRIBE_STREET_JOURNAL_EMBED_URL = 'https://tribestreetjournal.com/';

export function createTribeStreetJournalEmbedMarkup({
    title = 'Tribe Street Journal live site'
} = {}) {
    return `
        <div class="card card-bordered" style="padding: var(--space-3); margin-bottom: var(--space-4);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-3); flex-wrap: wrap;">
                <div>
                    <h3 class="text-sm" style="margin: 0 0 var(--space-1); font-weight: 600;">tribestreetjournal.com</h3>
                    <p class="text-xs text-gray-500" style="margin: 0;">
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
            <div style="border: 1px solid var(--color-gray-200, #e5e7eb); border-radius: 12px; overflow: hidden; background: #ffffff; min-height: 640px;">
                <iframe
                    src="${TRIBE_STREET_JOURNAL_EMBED_URL}"
                    title="${title}"
                    loading="lazy"
                    referrerpolicy="strict-origin-when-cross-origin"
                    style="display: block; width: 100%; min-height: 640px; height: 70vh; border: 0; background: #ffffff;"
                ></iframe>
            </div>
        </div>
    `;
}
