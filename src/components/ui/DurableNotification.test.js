import { describe, expect, it, vi } from 'vitest';

import { DurableNotificationCenter } from './DurableNotification.js';

function createMemoryStorage() {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, value)
    };
}

function workflowNotification(id = 'communication-1') {
    return {
        id,
        family: 'direct-communication',
        source: 'White Cell',
        artifact: 'Direct communication',
        requiredAction: 'Open and read the message.',
        destinationLabel: 'Open communication',
        destination: { surface: 'facilitator', slideKey: `communication-${id}`, recordId: id },
        createdAt: '2026-08-10T12:00:00.000Z'
    };
}

describe('DurableNotificationCenter', () => {
    it('suppresses startup history and deduplicates realtime plus reconciliation delivery', () => {
        const render = vi.fn();
        const center = new DurableNotificationCenter({ scope: 'session:facilitator', storage: createMemoryStorage(), render });
        const historical = workflowNotification('historical');
        const live = workflowNotification('live');

        center.seed([historical]);
        expect(center.notify(historical)).toBeNull();
        expect(center.notify(live)).not.toBeNull();
        expect(center.notify(live)).toBeNull();
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('persists dismissal without clearing unread state', () => {
        const storage = createMemoryStorage();
        const render = vi.fn();
        const center = new DurableNotificationCenter({ scope: 'session:whitecell', storage, render });
        const notification = workflowNotification('dismiss-me');

        center.notify(notification);
        render.mock.calls[0][0].onDismiss();

        const restored = new DurableNotificationCenter({ scope: 'session:whitecell', storage, render: vi.fn() });
        expect(restored.isUnread(notification.id)).toBe(true);
        expect(restored.restore()).toEqual([]);
    });

    it('marks unread clear only when the destination is opened and transfers through the callback', () => {
        const focusTarget = { focus: vi.fn() };
        const onOpen = vi.fn(() => focusTarget.focus());
        const render = vi.fn();
        const center = new DurableNotificationCenter({ scope: 'session:facilitator', storage: createMemoryStorage(), render });
        const notification = workflowNotification('open-me');

        center.notify(notification, { onOpen });
        const renderedConfig = render.mock.calls[0][0];
        renderedConfig.onAction();

        expect(center.isUnread(notification.id)).toBe(false);
        expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: notification.id }));
        expect(focusTarget.focus).toHaveBeenCalledTimes(1);
    });

    it('clears and removes only notices matching a directly opened destination', () => {
        const firstElement = { remove: vi.fn() };
        const secondElement = { remove: vi.fn() };
        const render = vi.fn()
            .mockReturnValueOnce(firstElement)
            .mockReturnValueOnce(secondElement);
        const center = new DurableNotificationCenter({
            scope: 'session:facilitator',
            storage: createMemoryStorage(),
            render
        });
        const opened = workflowNotification('opened');
        const remaining = workflowNotification('remaining');

        center.notify(opened);
        center.notify(remaining);
        center.markDestinationRead({ slideKey: opened.destination.slideKey });

        expect(center.isUnread(opened.id)).toBe(false);
        expect(center.isUnread(remaining.id)).toBe(true);
        expect(firstElement.remove).toHaveBeenCalledTimes(1);
        expect(secondElement.remove).not.toHaveBeenCalled();
    });

    it('restores an undismissed unread notice after reload', () => {
        const storage = createMemoryStorage();
        const first = new DurableNotificationCenter({ scope: 'session:facilitator', storage, render: vi.fn() });
        first.notify(workflowNotification('reload-me'));

        const render = vi.fn();
        const restored = new DurableNotificationCenter({ scope: 'session:facilitator', storage, render });
        restored.restore();

        expect(render).toHaveBeenCalledTimes(1);
        expect(render).toHaveBeenCalledWith(expect.objectContaining({
            notificationId: 'reload-me',
            source: 'White Cell',
            requiredAction: 'Open and read the message.'
        }));
    });
});
