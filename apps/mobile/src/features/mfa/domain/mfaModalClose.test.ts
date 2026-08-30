import { describe, expect, it } from 'vitest';

import { shouldCloseMfaModal } from './mfaModalClose';

describe('shouldCloseMfaModal', () => {
    it('keeps login MFA visible for generic close events during auth handoff', () => {
        expect(shouldCloseMfaModal(true)).toBe(false);
    });

    it('closes login MFA after the authenticated UI is ready', () => {
        expect(shouldCloseMfaModal(true, { delayMs: 75 })).toBe(true);
    });

    it('allows explicit failure and cancellation closes', () => {
        expect(shouldCloseMfaModal(true, { force: true })).toBe(true);
    });

    it('closes non-login MFA for generic successful requests', () => {
        expect(shouldCloseMfaModal(false)).toBe(true);
    });
});
