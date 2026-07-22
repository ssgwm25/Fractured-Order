import { describe, expect, it } from 'vitest';
import {
    niDomainDelta,
    sumNiDeltas,
    formatSigned,
    renderOverallNiScore
} from './NiEscalationReview.js';

describe('Overall NI score helpers', () => {
    it('reads deltas from numbers and { delta } objects', () => {
        expect(niDomainDelta(2)).toBe(2);
        expect(niDomainDelta({ delta: -1 })).toBe(-1);
        expect(niDomainDelta(null)).toBeNull();
        expect(niDomainDelta({ })).toBeNull();
    });

    it('sums present NI-1…NI-6 deltas and formats signed net', () => {
        const domains = {
            'NI-1': { delta: 1 },
            'NI-2': { delta: 2 },
            'NI-3': { delta: -1 },
            'NI-4': 0,
            'NI-5': { delta: 3 },
            'NI-6': { delta: 0 }
        };
        expect(sumNiDeltas(domains)).toBe(5);
        expect(formatSigned(5)).toBe('+5');
        expect(formatSigned(-2)).toBe('-2');
        expect(formatSigned(0)).toBe('0');
    });

    it('returns null sum when no domain deltas are present', () => {
        expect(sumNiDeltas({})).toBeNull();
        expect(sumNiDeltas({ 'NI-1': {} })).toBeNull();
    });

    it('renders Overall NI net + score bar when domains are present', () => {
        const html = renderOverallNiScore({
            'NI-1': { delta: 1 },
            'NI-2': { delta: -1 },
            'NI-3': { delta: 2 },
            'NI-4': { delta: 0 },
            'NI-5': { delta: 1 },
            'NI-6': { delta: 2 }
        });
        expect(html).toContain('Overall NI');
        expect(html).toContain('pli-ni-score-bar');
        expect(html).toContain('Net <strong>+5</strong>');
        expect(html).toContain('pli-ni-score-step is-positive');
        expect(html).toContain('pli-ni-score-step is-negative');
    });

    it('shows needs-human / empty states instead of a fake zero', () => {
        const needsHuman = renderOverallNiScore({}, { needs_human: true, needs_human_reason: 'Ambiguous NI path' });
        expect(needsHuman).toContain('Overall NI');
        expect(needsHuman).toContain('Ambiguous NI path');
        expect(needsHuman).not.toContain('pli-ni-score-bar');
        expect(needsHuman).not.toContain('Net <strong>0</strong>');

        const empty = renderOverallNiScore({});
        expect(empty).toContain('No domain deltas on record.');
        expect(empty).not.toContain('pli-ni-score-bar');
    });
});
