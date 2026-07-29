/**
 * White Cell notifications for PLI SME send-back.
 */

import { database } from '../../services/database.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('pliNotify');

/**
 * Notify White Cell when an SME sends a PLI seat back (timeline + communication).
 * Failures are logged and do not fail the seat write.
 */
export async function notifyPliSeatSentBack({
    sessionId,
    actionId,
    seatId,
    notes,
    reviewerName = 'SME',
    move = 1,
    phase = 1
} = {}) {
    if (!sessionId || !actionId || !seatId) return;

    const trimmedNotes = String(notes || '').trim();
    const seatLabel = String(seatId).replace(/_/g, ' ');
    const content = trimmedNotes
        ? `PLI ${seatLabel} sent back by ${reviewerName}: ${trimmedNotes}`
        : `PLI ${seatLabel} sent back by ${reviewerName}`;

    try {
        await database.createTimelineEvent({
            session_id: sessionId,
            team: 'white_cell',
            type: 'PLI_SENT_BACK',
            content,
            metadata: {
                related_id: actionId,
                action_id: actionId,
                seat: seatId,
                notes: trimmedNotes || null,
                sme_reviewer: reviewerName,
                role: 'sme'
            },
            move,
            phase
        });
    } catch (err) {
        logger.warn('Failed to write PLI_SENT_BACK timeline event', err);
    }

    try {
        await database.createCommunication({
            session_id: sessionId,
            type: 'system',
            from_role: 'sme',
            to_role: 'white_cell',
            title: `PLI returned: ${seatLabel}`,
            content: trimmedNotes || content,
            metadata: {
                action_id: actionId,
                seat: seatId,
                kind: 'pli_sent_back'
            }
        });
    } catch (err) {
        logger.warn('Failed to write PLI send-back communication', err);
    }
}
