import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountFollowAlong } from './followAlong.js';

class FakeClassList {
    constructor(owner, initial = '') {
        this.owner = owner;
        this.tokens = new Set(String(initial).split(/\s+/).filter(Boolean));
    }

    sync() {
        this.owner.className = [...this.tokens].join(' ');
    }

    add(...tokens) {
        tokens.filter(Boolean).forEach((token) => this.tokens.add(token));
        this.sync();
    }

    remove(...tokens) {
        tokens.filter(Boolean).forEach((token) => this.tokens.delete(token));
        this.sync();
    }

    contains(token) {
        return this.tokens.has(token);
    }

    toggle(token, force) {
        if (typeof force === 'boolean') {
            if (force) {
                this.tokens.add(token);
            } else {
                this.tokens.delete(token);
            }
            this.sync();
            return force;
        }

        if (this.tokens.has(token)) {
            this.tokens.delete(token);
            this.sync();
            return false;
        }

        this.tokens.add(token);
        this.sync();
        return true;
    }
}

class FakeElement {
    constructor(tagName = 'div', { id = '', className = '' } = {}) {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.className = className;
        this.classList = new FakeClassList(this, className);
        this.children = [];
        this.parentNode = null;
        this.dataset = {};
        this.attributes = new Map();
        this.listeners = new Map();
        this.textContent = '';
        this.disabled = false;
        this.hidden = false;
        this.removed = false;
    }

    set innerHTML(value) {
        const html = String(value || '');
        this.children = [];

        if (html.includes('follow-along-bar')) {
            [
                ['button', 'follow-along-bar'],
                ['span', 'follow-along-bar-title'],
                ['span', 'follow-along-progress'],
                ['span', 'follow-along-chevron'],
                ['div', 'follow-along-body'],
                ['h4', 'follow-along-step-title'],
                ['p', 'follow-along-step-text'],
                ['div', 'follow-along-dots'],
                ['div', 'follow-along-actions'],
                ['button', 'follow-along-skip'],
                ['span', 'follow-along-spacer'],
                ['button', 'follow-along-back'],
                ['button', 'follow-along-next']
            ].forEach(([tagName, className]) => {
                this.appendChild(new FakeElement(tagName, { className }));
            });
            return;
        }

        if (html.includes('follow-along-dot')) {
            const count = html.match(/follow-along-dot/g)?.length || 0;
            for (let index = 0; index < count; index += 1) {
                this.appendChild(new FakeElement('span', { className: 'follow-along-dot' }));
            }
        }
    }

    get innerHTML() {
        return '';
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) || null;
    }

    addEventListener(type, callback) {
        this.listeners.set(type, callback);
    }

    click() {
        this.listeners.get('click')?.({
            stopPropagation: vi.fn(),
            currentTarget: this
        });
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    insertBefore(child, anchor) {
        child.parentNode = this;
        const anchorIndex = this.children.indexOf(anchor);
        if (anchorIndex === -1) {
            this.children.push(child);
        } else {
            this.children.splice(anchorIndex, 0, child);
        }
        return child;
    }

    remove() {
        this.removed = true;
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        const matches = [];
        const predicate = selector.startsWith('.')
            ? (element) => {
                const className = selector.slice(1);
                return element.classList.contains(className)
                    || String(element.className).split(/\s+/).includes(className);
            }
            : selector.startsWith('#')
                ? (element) => element.id === selector.slice(1)
                : () => false;

        function walk(element) {
            element.children.forEach((child) => {
                if (predicate(child)) {
                    matches.push(child);
                }
                walk(child);
            });
        }

        walk(this);
        return matches;
    }
}

function createStorage() {
    const values = new Map();

    return {
        getItem: vi.fn((key) => values.get(key) || null),
        setItem: vi.fn((key, value) => {
            values.set(key, String(value));
        })
    };
}

function createSidebar() {
    const sidebar = new FakeElement('aside', { id: 'sidebar' });
    const session = new FakeElement('div', { className: 'sidebar-session' });
    sidebar.appendChild(session);
    return { sidebar, session };
}

describe('mountFollowAlong', () => {
    let storage;

    beforeEach(() => {
        storage = createStorage();
        global.window = { localStorage: storage };
        global.document = {
            createElement: (tagName) => new FakeElement(tagName),
            getElementById: vi.fn(() => null),
            querySelector: vi.fn(() => null)
        };
    });

    afterEach(() => {
        delete global.window;
        delete global.document;
    });

    it('keeps a previously completed guide mounted above the session footer', () => {
        storage.setItem('tour', JSON.stringify({ done: true, step: 1 }));
        const { sidebar, session } = createSidebar();

        const instance = mountFollowAlong({
            storageKey: 'tour',
            sidebar,
            steps: [
                { title: 'First', body: 'One' },
                { title: 'Second', body: 'Two' }
            ]
        });

        const root = sidebar.querySelector('.follow-along');
        expect(instance).toBeTruthy();
        expect(root).toBeTruthy();
        expect(sidebar.children[0]).toBe(root);
        expect(sidebar.children[1]).toBe(session);
        expect(root.dataset.minimized).toBe('true');
        expect(root.querySelector('.follow-along-bar-title').textContent).toBe('Start Here');
        expect(root.querySelector('.follow-along-progress').textContent).toBe('');
        expect(root.querySelector('.follow-along-progress').hidden).toBe(true);

        root.querySelector('.follow-along-bar').click();

        expect(root.dataset.minimized).toBe('false');
        expect(root.querySelector('.follow-along-bar-title').textContent).toBe('Getting started');
        expect(root.querySelector('.follow-along-progress').textContent).toBe('1 / 2');
        expect(root.querySelector('.follow-along-progress').hidden).toBe(false);
        expect(JSON.parse(storage.getItem('tour'))).toEqual({
            step: 0,
            minimized: false
        });
    });

    it('collapses instead of removing the guide when the final step is done', () => {
        const { sidebar, session } = createSidebar();

        mountFollowAlong({
            storageKey: 'tour',
            sidebar,
            steps: [{ title: 'Only step', body: 'Reference stays available.' }]
        });

        const root = sidebar.querySelector('.follow-along');
        root.querySelector('.follow-along-next').click();

        expect(root.removed).toBe(false);
        expect(sidebar.children[0]).toBe(root);
        expect(sidebar.children[1]).toBe(session);
        expect(root.dataset.minimized).toBe('true');
        expect(root.querySelector('.follow-along-bar-title').textContent).toBe('Start Here');
        expect(root.querySelector('.follow-along-progress').textContent).toBe('');
        expect(root.querySelector('.follow-along-progress').hidden).toBe(true);
        expect(JSON.parse(storage.getItem('tour'))).toEqual({
            step: 0,
            minimized: true
        });
    });
});
