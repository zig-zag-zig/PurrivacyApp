import { describe, expect, it } from 'vitest';

import { normalizeMfaState, nextMfaState } from './mfaState';

describe('normalizeMfaState', () => {
    it('returns MfaState for valid payload', () => {
        expect(normalizeMfaState({ mfaEnabled: true, mfaTrusted: false })).toEqual({
            mfaEnabled: true,
            mfaTrusted: false,
        });
    });

    it('extracts from nested mfaState', () => {
        expect(
            normalizeMfaState({ mfaState: { mfaEnabled: false, mfaTrusted: true } }),
        ).toEqual({ mfaEnabled: false, mfaTrusted: true });
    });

    it('returns null for invalid payload', () => {
        expect(normalizeMfaState({ mfaEnabled: 'yes' })).toBeNull();
    });

    it('returns null for missing mfaTrusted', () => {
        expect(normalizeMfaState({ mfaEnabled: true })).toBeNull();
    });

    it('returns null for null/undefined', () => {
        expect(normalizeMfaState(null)).toBeNull();
        expect(normalizeMfaState(undefined)).toBeNull();
    });
});

describe('nextMfaState', () => {
    it('returns reference-equal current when states match', () => {
        const current = { mfaEnabled: true, mfaTrusted: false };
        const next = { mfaEnabled: true, mfaTrusted: false };
        expect(nextMfaState(current, next)).toBe(current);
    });

    it('returns next when states differ', () => {
        const current = { mfaEnabled: true, mfaTrusted: false };
        const next = { mfaEnabled: true, mfaTrusted: true };
        expect(nextMfaState(current, next)).toBe(next);
    });
});
