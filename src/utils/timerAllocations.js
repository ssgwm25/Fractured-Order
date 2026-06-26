import { CONFIG } from '../core/config.js';
import { isStrategicOrientationHeaderState } from './gameStateDisplay.js';

export const TIMER_ALLOCATION_MIN_SECONDS = 60;
export const TIMER_ALLOCATION_MAX_SECONDS = 36000;

export const TIMER_ALLOCATION_MARKS = Object.freeze([
    {
        key: 'strategic_orientation',
        label: 'Strategic Orientation',
        shortLabel: 'Orientation'
    },
    {
        key: 'move_1',
        label: 'Move 1',
        shortLabel: 'Move 1'
    },
    {
        key: 'move_2',
        label: 'Move 2',
        shortLabel: 'Move 2'
    },
    {
        key: 'move_3',
        label: 'Move 3',
        shortLabel: 'Move 3'
    }
]);

const TIMER_ALLOCATION_MARK_KEYS = new Set(TIMER_ALLOCATION_MARKS.map((mark) => mark.key));

function clampSeconds(value) {
    return Math.min(
        TIMER_ALLOCATION_MAX_SECONDS,
        Math.max(TIMER_ALLOCATION_MIN_SECONDS, value)
    );
}

function normalizeSeconds(value, fallbackSeconds) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
        return fallbackSeconds;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return fallbackSeconds;
    }

    return clampSeconds(Math.round(numericValue));
}

export function buildDefaultTimerAllocations(defaultSeconds = CONFIG.DEFAULT_TIMER_SECONDS) {
    const normalizedDefault = normalizeSeconds(defaultSeconds, CONFIG.DEFAULT_TIMER_SECONDS);

    return Object.fromEntries(
        TIMER_ALLOCATION_MARKS.map((mark) => [mark.key, normalizedDefault])
    );
}

export function normalizeTimerAllocations(value = {}, {
    defaultSeconds = CONFIG.DEFAULT_TIMER_SECONDS
} = {}) {
    const input = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    const defaults = buildDefaultTimerAllocations(defaultSeconds);

    return Object.fromEntries(
        TIMER_ALLOCATION_MARKS.map((mark) => [
            mark.key,
            normalizeSeconds(input[mark.key], defaults[mark.key])
        ])
    );
}

export function getTimerAllocationMark(key) {
    return TIMER_ALLOCATION_MARKS.find((mark) => mark.key === key) || TIMER_ALLOCATION_MARKS[1];
}

export function getMoveTimerAllocationKey(move = 1) {
    const normalizedMove = Number(move);
    const key = `move_${normalizedMove}`;

    return TIMER_ALLOCATION_MARK_KEYS.has(key) ? key : 'move_1';
}

export function resolveGameStateTimerMark(gameState = null, actions = []) {
    if (isStrategicOrientationHeaderState(gameState, actions)) {
        return TIMER_ALLOCATION_MARKS[0];
    }

    return getTimerAllocationMark(getMoveTimerAllocationKey(gameState?.move ?? 1));
}

export function getTimerAllocationSeconds(allocations = {}, markKey = 'move_1') {
    const normalizedAllocations = normalizeTimerAllocations(allocations);
    const resolvedMark = getTimerAllocationMark(markKey);

    return normalizedAllocations[resolvedMark.key];
}

export function secondsToWholeMinutes(seconds) {
    return Math.max(1, Math.round(Number(seconds || 0) / 60));
}

export function minutesToAllocationSeconds(minutes) {
    return normalizeSeconds(Number(minutes) * 60, CONFIG.DEFAULT_TIMER_SECONDS);
}
