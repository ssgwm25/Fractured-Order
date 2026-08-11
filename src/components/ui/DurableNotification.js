/**
 * Durable inbound workflow notifications.
 *
 * Delivery, read, and dismissal are intentionally separate states:
 * dismissing the floating notice does not clear the destination's unread cue;
 * only opening the destination marks the record read.
 */

const STORAGE_VERSION = 1;
const DEFAULT_MAX_RECORDS = 120;

function resolveStorage() {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null;
    }
}

function normalizeText(value = '') {
    return String(value || '').trim();
}

export function normalizeDurableNotification(notification = {}) {
    const id = normalizeText(notification.id || notification.eventId || notification.communicationId);
    const source = normalizeText(notification.source);
    const artifact = normalizeText(notification.artifact);
    const requiredAction = normalizeText(notification.requiredAction);
    const destinationLabel = normalizeText(notification.destinationLabel || 'Open record');

    if (!id || !source || !artifact || !requiredAction) {
        return null;
    }

    return {
        id,
        family: normalizeText(notification.family || 'workflow'),
        source,
        artifact,
        requiredAction,
        destinationLabel,
        destination: notification.destination && typeof notification.destination === 'object'
            ? { ...notification.destination }
            : {},
        createdAt: normalizeText(notification.createdAt) || new Date().toISOString(),
        type: normalizeText(notification.type || 'warning')
    };
}

function parseState(storage, storageKey) {
    if (!storage?.getItem) {
        return { version: STORAGE_VERSION, records: {} };
    }

    try {
        const parsed = JSON.parse(storage.getItem(storageKey) || 'null');
        if (parsed?.version === STORAGE_VERSION && parsed.records && typeof parsed.records === 'object') {
            return parsed;
        }
    } catch {
        // A corrupt optional browser preference must not block workflow UI.
    }

    return { version: STORAGE_VERSION, records: {} };
}

export class DurableNotificationCenter {
    constructor({
        scope,
        storage = resolveStorage(),
        render = () => null,
        maxRecords = DEFAULT_MAX_RECORDS
    } = {}) {
        this.scope = normalizeText(scope || 'session');
        this.storage = storage;
        this.render = render;
        this.maxRecords = Math.max(20, Number(maxRecords) || DEFAULT_MAX_RECORDS);
        this.storageKey = `statecraft:durable-notifications:${this.scope}`;
        this.state = parseState(this.storage, this.storageKey);
        this.deliveredIds = new Set();
        this.activeElements = new Map();
    }

    persist() {
        if (!this.storage?.setItem) return;

        const sortedEntries = Object.entries(this.state.records)
            .sort(([, left], [, right]) => (
                new Date(right.notification?.createdAt || right.updatedAt || 0)
                - new Date(left.notification?.createdAt || left.updatedAt || 0)
            ));
        const unreadEntries = sortedEntries.filter(([, record]) => record.read !== true);
        const settledEntries = sortedEntries
            .filter(([, record]) => record.read === true)
            .slice(0, Math.max(0, this.maxRecords - unreadEntries.length));
        const entries = [...unreadEntries, ...settledEntries];
        this.state.records = Object.fromEntries(entries);

        try {
            this.storage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch {
            // Persistence is progressive enhancement; the in-memory contract remains valid.
        }
    }

    seed(notifications = []) {
        notifications.forEach((notification) => {
            const normalized = normalizeDurableNotification(notification);
            if (normalized) this.deliveredIds.add(normalized.id);
        });
    }

    getRecord(id) {
        return this.state.records[normalizeText(id)] || null;
    }

    isUnread(id) {
        const record = this.getRecord(id);
        return Boolean(record && record.read !== true);
    }

    getUnreadIds() {
        return Object.entries(this.state.records)
            .filter(([, record]) => record.read !== true)
            .map(([id]) => id);
    }

    getNotifications({ unreadOnly = false } = {}) {
        return Object.values(this.state.records)
            .filter((record) => !unreadOnly || record.read !== true)
            .map((record) => record.notification)
            .filter(Boolean);
    }

    markDestinationRead({ recordId = '', communicationId = '', slideKey = '' } = {}) {
        const normalizedRecordId = normalizeText(recordId);
        const normalizedCommunicationId = normalizeText(communicationId);
        const normalizedSlideKey = normalizeText(slideKey);
        let changed = false;
        Object.entries(this.state.records).forEach(([id, record]) => {
            const destination = record.notification?.destination || {};
            const matchesRecord = normalizedRecordId && normalizeText(destination.recordId) === normalizedRecordId;
            const matchesCommunication = normalizedCommunicationId
                && normalizeText(destination.communicationId) === normalizedCommunicationId;
            const matchesSlide = normalizedSlideKey && normalizeText(destination.slideKey) === normalizedSlideKey;
            if (!matchesRecord && !matchesCommunication && !matchesSlide) return;
            this.activeElements.get(id)?.remove?.();
            this.activeElements.delete(id);
            record.read = true;
            record.dismissed = true;
            record.updatedAt = new Date().toISOString();
            changed = true;
        });
        if (changed) this.persist();
        return changed;
    }

    markRead(id) {
        const record = this.getRecord(id);
        if (!record) return false;
        record.read = true;
        record.updatedAt = new Date().toISOString();
        this.persist();
        return true;
    }

    dismiss(id) {
        const record = this.getRecord(id);
        if (!record) return false;
        record.dismissed = true;
        record.updatedAt = new Date().toISOString();
        this.activeElements.delete(normalizeText(id));
        this.persist();
        return true;
    }

    open(id, onOpen = null) {
        const record = this.getRecord(id);
        if (!record) return false;

        const activeElement = this.activeElements.get(normalizeText(id));
        activeElement?.remove?.();
        record.read = true;
        record.dismissed = true;
        record.updatedAt = new Date().toISOString();
        this.activeElements.delete(normalizeText(id));
        this.persist();
        onOpen?.(record.notification);
        return true;
    }

    renderRecord(notification, onOpen = null) {
        const element = this.render({
            notificationId: notification.id,
            source: notification.source,
            artifact: notification.artifact,
            requiredAction: notification.requiredAction,
            destinationLabel: notification.destinationLabel,
            type: notification.type,
            onDismiss: () => this.dismiss(notification.id),
            onAction: () => this.open(notification.id, onOpen)
        });
        if (element) this.activeElements.set(notification.id, element);
        return element;
    }

    notify(notification, { onOpen = null } = {}) {
        const normalized = normalizeDurableNotification(notification);
        if (!normalized || this.deliveredIds.has(normalized.id)) return null;

        const existing = this.getRecord(normalized.id);
        this.deliveredIds.add(normalized.id);
        if (existing?.dismissed === true || existing?.read === true) return null;

        this.state.records[normalized.id] = {
            notification: normalized,
            read: false,
            dismissed: false,
            updatedAt: new Date().toISOString()
        };
        this.persist();
        return {
            notification: normalized,
            element: this.renderRecord(normalized, onOpen)
        };
    }

    restore({ onOpen = null } = {}) {
        const restored = [];
        Object.values(this.state.records)
            .filter((record) => record.read !== true && record.dismissed !== true)
            .sort((left, right) => (
                new Date(left.notification?.createdAt || 0) - new Date(right.notification?.createdAt || 0)
            ))
            .forEach((record) => {
                const notification = normalizeDurableNotification(record.notification);
                if (!notification || this.activeElements.has(notification.id)) return;
                this.deliveredIds.add(notification.id);
                restored.push(this.renderRecord(notification, onOpen));
            });
        return restored;
    }
}

export default DurableNotificationCenter;
