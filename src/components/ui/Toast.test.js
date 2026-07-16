import { describe, expect, it } from 'vitest';

import { normalizeToastArgs } from './Toast.js';

describe('normalizeToastArgs', () => {
    it('gives error notifications a plain-language summary and recovery copy', () => {
        expect(normalizeToastArgs({
            message: 'Failed to save action. Check the form and try again.',
            type: 'error'
        })).toMatchObject({
            title: 'That didn\'t work',
            message: 'We couldn\'t save action. Check the form and try again.',
            type: 'error',
            urgent: false
        });
    });
});
