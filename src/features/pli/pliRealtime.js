/**
 * PLI SME realtime subscription.
 *
 * One Supabase Realtime channel per SME console listening to the three PLI
 * delivery tables for the current session. Changes are debounced into a single
 * `onChange` call so the console refreshes once per adjudication batch instead
 * of once per row. Polling in the SME console remains the fallback when the
 * channel cannot subscribe (e.g. backend unavailable, RLS filtered, offline).
 *
 * The tables are published on `supabase_realtime` by
 * `data/2026-10-02_pli_regional_dispatch_and_realtime.sql`; RLS still filters
 * every event, so an SME only sees rows they could already read.
 */

import { supabase } from '../../services/supabase.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PliRealtime');

export const PLI_REALTIME_TABLES = Object.freeze([
    'pli_adjudications',
    'sme_handoffs',
    'sme_pli_packets'
]);
export const PLI_REALTIME_DEBOUNCE_MS = 500;

const NOOP_UNSUBSCRIBE = () => {};

export function pliRealtimeChannelName(sessionId) {
    return `pli_sme:${sessionId}`;
}

/**
 * Subscribe to PLI SME table changes for one session.
 *
 * @param {object} options
 * @param {string} options.sessionId
 * @param {(detail: { tables: string[], events: number }) => void} options.onChange
 * @param {(status: string, error?: unknown) => void} [options.onStatus]
 * @param {number} [options.debounceMs]
 * @param {object} [options.client] Supabase client (injected in tests)
 * @returns {() => void} unsubscribe
 */
export function subscribePliSmeChanges({
    sessionId,
    onChange,
    onStatus,
    debounceMs = PLI_REALTIME_DEBOUNCE_MS,
    client = supabase
} = {}) {
    if (!sessionId || typeof onChange !== 'function') {
        return NOOP_UNSUBSCRIBE;
    }

    let channel;
    try {
        channel = client.channel(pliRealtimeChannelName(sessionId));
    } catch (error) {
        logger.warn('PLI realtime unavailable; SME console will rely on polling', error);
        return NOOP_UNSUBSCRIBE;
    }

    let closed = false;
    let timer = null;
    let eventCount = 0;
    const touchedTables = new Set();

    const flush = () => {
        timer = null;
        if (closed) return;
        const detail = { tables: Array.from(touchedTables), events: eventCount };
        touchedTables.clear();
        eventCount = 0;
        try {
            onChange(detail);
        } catch (error) {
            logger.warn('PLI realtime onChange handler failed', error);
        }
    };

    const schedule = (table) => {
        if (closed) return;
        touchedTables.add(table);
        eventCount += 1;
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, debounceMs);
    };

    try {
        for (const table of PLI_REALTIME_TABLES) {
            channel = channel.on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table,
                    filter: `session_id=eq.${sessionId}`
                },
                () => schedule(table)
            );
        }
        channel.subscribe((status, error) => {
            if (closed) return;
            if (status === 'SUBSCRIBED') {
                logger.info('PLI realtime subscribed for session', sessionId);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                logger.warn(`PLI realtime ${status}; SME console will rely on polling`, error);
            }
            onStatus?.(status, error);
        });
    } catch (error) {
        logger.warn('PLI realtime subscribe failed; SME console will rely on polling', error);
        closed = true;
        return NOOP_UNSUBSCRIBE;
    }

    return () => {
        if (closed) return;
        closed = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        try {
            const removal = client.removeChannel?.(channel);
            if (removal && typeof removal.catch === 'function') {
                removal.catch((error) => logger.warn('PLI realtime channel removal failed', error));
            }
        } catch (error) {
            logger.warn('PLI realtime channel removal failed', error);
        }
    };
}
