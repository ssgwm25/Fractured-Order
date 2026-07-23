import { describe, expect, it } from 'vitest';
import {
    niDomainDelta,
    sumNiDeltas,
    formatSigned,
    summarizeNiPath,
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
        expect(summarizeNiPath(domains)).toBe('NI-1:+1 · NI-2:+2 · NI-3:-1 · NI-4:0 · NI-5:+3 · NI-6:0');
    });

    it('returns null sum when no domain deltas are present', () => {
        expect(sumNiDeltas({})).toBeNull();
        expect(sumNiDeltas({ 'NI-1': {} })).toBeNull();
    });

    it('renders numbered NI score with narrative under Glasl-style layout', () => {
        const html = renderOverallNiScore({
            'NI-1': { delta: 1 },
            'NI-2': { delta: -1 },
            'NI-3': { delta: 2 },
            'NI-4': { delta: 0 },
            'NI-5': { delta: 1 },
            'NI-6': { delta: 2 }
        });
        expect(html).toContain('NI score');
        expect(html).toContain('pli-ni-score-bar');
        expect(html).toContain('Net <strong>+5</strong>');
        expect(html).toContain('pli-ni-overall-narrative');
        expect(html).toContain('NI-1:+1 · NI-2:-1 · NI-3:+2 · NI-4:0 · NI-5:+1 · NI-6:+2');
        expect(html).toContain('>1</span>');
        expect(html).toContain('>6</span>');
        expect(html).toContain('pli-ni-score-step is-positive is-active');
        expect(html).toContain('pli-ni-score-step is-negative is-active');
    });

    it('shows needs-human / empty states instead of a fake zero', () => {
        const needsHuman = renderOverallNiScore({}, { needs_human: true, needs_human_reason: 'Ambiguous NI path' });
        expect(needsHuman).toContain('NI score');
        expect(needsHuman).toContain('Ambiguous NI path');
        expect(needsHuman).not.toContain('pli-ni-score-bar');
        expect(needsHuman).not.toContain('Net <strong>0</strong>');

        const empty = renderOverallNiScore({});
        expect(empty).toContain('No domain deltas on record.');
        expect(empty).not.toContain('pli-ni-score-bar');
    });
});
