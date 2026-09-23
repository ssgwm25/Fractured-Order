import { createLogger } from '../utils/logger.js';
const logger = createLogger('RegionalOperations');
const lastReported = new Map();
const allowed = new Set(['invalid_scope', 'scope_rejected', 'seat_contention', 'reconciliation_missed']);

export function regionalDiagnostic(reason, now = Date.now()) {
    if (!allowed.has(reason)) return;
    if (lastReported.has(reason) && now - lastReported.get(reason) < 60000) return;
    lastReported.set(reason, now);
    logger.warn('Regional operation requires recovery', { reason });
}

export function diagnoseRegionalError(error) {
    const message = String(error?.message || '');
    if (/requested role is full|SEAT.*FULL/.test(message)) regionalDiagnostic('seat_contention');
    else if (/GC\d+[A-Z_]*(SCOPE_DENIED|SCOPE_MISMATCH|ROLE_MISMATCH|RECIPIENT_MODEL_MISMATCH)/.test(message)) regionalDiagnostic('scope_rejected');
    else if (/GC\d+[A-Z_]*(UNKNOWN_TOPOLOGY|INVALID_SETUP|APPROVED_ROSTER_REQUIRED)/.test(message)) regionalDiagnostic('invalid_scope');
}
