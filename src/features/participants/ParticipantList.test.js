import { describe, expect, it, vi } from 'vitest';

vi.mock('../../stores/index.js', () => ({
    participantsStore: {
        getActive: vi.fn(() => []),
        getAll: vi.fn(() => []),
        subscribe: vi.fn(() => vi.fn()),
        loadParticipants: vi.fn()
    }
}));

vi.mock('../../components/ui/Badge.js', () => ({
    createBadge: vi.fn(() => {
        const badge = global.document?.createElement?.('span') ?? { outerHTML: '<span></span>' };
        badge.textContent = 'Active';
        return badge;
    })
}));

vi.mock('../../components/ui/Loader.js', () => ({
    showInlineLoader: vi.fn(() => ({ hide: vi.fn() }))
}));

vi.mock('../../utils/formatting.js', () => ({
    formatRelativeTime: vi.fn(() => 'just now')
}));

vi.mock('../../utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

import {
    getParticipantRoleConfig,
    getParticipantRoleCountEntries
} from './ParticipantList.js';

describe('ParticipantList role contract', () => {
    it('returns corrected role labels for legacy scribe and facilitator keys', () => {
        expect(getParticipantRoleConfig('blue_scribe')).toEqual(
            expect.objectContaining({
                label: 'Blue Facilitator',
                icon: 'B'
            })
        );
        expect(getParticipantRoleConfig('blue_facilitator')).toEqual(
            expect.objectContaining({
                label: 'Blue Scribe',
                icon: 'B'
            })
        );
    });

    it('hides removed observer counts unless a legacy observer seat is actually present', () => {
        expect(
            getParticipantRoleCountEntries([{ role: 'blue_facilitator' }]).map(([role]) => role)
        ).not.toContain('viewer');

        expect(
            getParticipantRoleCountEntries([{ role: 'viewer' }]).map(([role]) => role)
        ).toContain('viewer');
    });
});
