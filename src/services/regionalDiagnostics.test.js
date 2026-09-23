import { describe, expect, it, vi } from 'vitest';
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ createLogger: () => ({ warn }) }));
import { regionalDiagnostic, diagnoseRegionalError } from './regionalDiagnostics.js';
describe('GC08 bounded diagnostics', () => {
    it('emits only bounded reasons and suppresses repeated warnings for a minute', () => {
        regionalDiagnostic('reconciliation_missed', 0);
        regionalDiagnostic('reconciliation_missed', 1);
        regionalDiagnostic('untrusted proposal content', 2);
        expect(warn).toHaveBeenCalledTimes(1);
        regionalDiagnostic('reconciliation_missed', 60000);
        expect(warn).toHaveBeenCalledTimes(2);
        diagnoseRegionalError({ message: 'GC07_RFI_SCOPE_DENIED private draft title' });
        expect(warn).toHaveBeenLastCalledWith('Regional operation requires recovery', { reason: 'scope_rejected' });
        expect(JSON.stringify(warn.mock.calls)).not.toContain('private draft');
    });
});
