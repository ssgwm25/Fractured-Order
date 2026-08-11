import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { normalizeToastArgs } from './Toast.js';

describe('normalizeToastArgs', () => {
    it('keeps ordinary feedback timed while the explicit durable model has no timeout', () => {
        expect(normalizeToastArgs({ message: 'Saved', type: 'success' })).toMatchObject({
            persistent: false,
            dismissible: true
        });
        expect(normalizeToastArgs({
            message: '', persistent: true, duration: 0, notificationId: 'event-1'
        })).toMatchObject({
            persistent: true,
            duration: 0,
            notificationId: 'event-1'
        });
    });

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

    it('ships polite announcements, keyboard controls, focus styles, and reduced-motion dismissal', () => {
        const source = readFileSync(new URL('./Toast.js', import.meta.url), 'utf8');
        const css = readFileSync(new URL('../../../styles/components/modals.css', import.meta.url), 'utf8');

        expect(source).toContain("toast.setAttribute('aria-live', urgent ? 'assertive' : 'polite')");
        expect(source).toContain('class="toast-action"');
        expect(source).toContain('aria-label="Dismiss notification"');
        expect(source).toContain("if (event.key !== 'Escape') return");
        expect(css).toContain('.toast-action:focus-visible');
        expect(css).toMatch(/\.toast\.toast-durable\s*\{[^}]*pointer-events:\s*none;/);
        expect(css).toMatch(/\.toast-durable \.toast-action,[\s\S]*?\.toast-durable \.toast-dismiss\s*\{[^}]*pointer-events:\s*auto;/);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.toast,[\s\S]*?transform: none !important;/);
    });
});
