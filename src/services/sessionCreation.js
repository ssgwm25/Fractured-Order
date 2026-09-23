const STORAGE_KEY = 'gc08.pending-session-creation';

// Persist intent before sending. A timeout is not permission to mint a new key.
export class SessionCreation {
    constructor({ database, storage, newKey = () => crypto.randomUUID() }) {
        this.database = database;
        try { this.storage = storage === undefined ? globalThis.sessionStorage : storage; }
        catch { this.storage = null; }
        this.newKey = newKey;
        this.inFlight = null;
    }

    pending() {
        try {
            const value = this.storage?.getItem(STORAGE_KEY);
            const pending = value ? JSON.parse(value) : null;
            if (pending && (!pending.key || !pending.input?.name || !pending.input?.session_code
                || !['unified_v1', 'shared_facilitator_v1'].includes(pending.input.green_configuration))) {
                throw new Error('Invalid saved intent');
            }
            this.recoveryUnavailable = false;
            return pending;
        } catch {
            this.recoveryUnavailable = true;
            return null;
        }
    }

    submit(input) {
        if (this.inFlight) return this.inFlight;
        this.inFlight = this.perform(input).finally(() => { this.inFlight = null; });
        return this.inFlight;
    }

    async perform(input) {
        let pending = this.pending();
        if (this.recoveryUnavailable || !this.storage) throw Object.assign(
            new Error('Recovery storage is unavailable. Check the session list before attempting a new creation.'),
            { code: 'GC08_RECOVERY_STORAGE' }
        );
        if (!pending) {
            pending = { key: this.newKey(), input };
            try { this.storage.setItem(STORAGE_KEY, JSON.stringify(pending)); }
            catch { throw Object.assign(new Error('Recovery storage is unavailable.'), { code: 'GC08_RECOVERY_STORAGE' }); }
        }
        try {
            const session = await this.database.createConfiguredSession(pending.input, pending.key);
            this.storage.removeItem(STORAGE_KEY);
            return session;
        } catch (error) {
            const code = error.originalError?.code || error.code;
            // These errors definitively rolled back; transport errors retain intent.
            if (['22023', '23514', '23505'].includes(code)) this.storage.removeItem(STORAGE_KEY);
            throw error;
        }
    }
}

export function sessionConfigurationLabel(session = {}) {
    if (session.green_seat_model === 'shared_facilitator_v1') {
        return `Regional Green: Asia-Pacific Scribe, Europe Scribe, one Shared Green Facilitator. Roster: ${session.green_roster_version}`;
    }
    if (session.session_topology_version === 2) return 'Regional Green: existing paired Scribe / Facilitator seats';
    return 'Unified Green';
}

export function creationErrorMessage(error) {
    const code = error.originalError?.code || error.code;
    if (code === 'GC08_RECOVERY_STORAGE') return 'Recovery storage is unavailable or invalid. No request was sent. Check the session list for an earlier creation before restoring session storage and retrying.';
    if (code === '42501') return 'Game Master permission is required. Restore operator access, then retry this request.';
    if (code === '23514') return 'The selected approved roster is unavailable or invalid. Reload rosters and select an approved version. Unified creation remains available.';
    if (code === '23505') return 'This session code is already in use. Check the session list before choosing another code.';
    if (code === '22023') return 'Check the session name, code, Green configuration and approved roster, then retry.';
    return 'Creation is unconfirmed. Do not distribute the join code. Retry to recover the same request; its configuration is locked until resolved.';
}
