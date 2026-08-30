import {
    requiresMfaForRefresh,
} from '../../../../../src/features/session/application/sessionMfaPolicy';
import { UNTRUSTED_MFA_MAX_AGE_MS } from '../../../../../src/core/constants';
import { RefreshTokenFamily, Session } from '../../../../../src/core/types';

const family = (overrides: Partial<RefreshTokenFamily> = {}): RefreshTokenFamily => ({
    familyId: 'fam-1', userId: 'user-1',
    createdAt: new Date(), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 86400000),
    userHasMfa: true, mfaTrusted: false,
    ...overrides,
});

const session = (overrides: Partial<Session> = {}): Session => ({
    accessTokenHash: 'hash', userId: 'user-1', refreshTokenFamilyId: 'fam-1',
    createdAt: new Date(), expiresAt: new Date(Date.now() + 900000),
    ...overrides,
});

describe('sessionMfaPolicy', () => {
    describe('requiresMfaForRefresh', () => {
        const now = new Date();

        it('returns false when user does not have MFA', () => {
            expect(requiresMfaForRefresh(family({ userHasMfa: false }), null, now)).toBe(false);
        });

        it('returns false when MFA is trusted', () => {
            expect(requiresMfaForRefresh(family({ mfaTrusted: true }), null, now)).toBe(false);
        });

        it('returns false when active session has fresh MFA verification', () => {
            expect(requiresMfaForRefresh(
                family({ mfaVerifiedAt: new Date(now.getTime() - 1000) }),
                session(),
                now,
            )).toBe(false);
        });

        it('returns true when MFA verification is expired', () => {
            expect(requiresMfaForRefresh(
                family({ mfaVerifiedAt: new Date(now.getTime() - UNTRUSTED_MFA_MAX_AGE_MS - 1) }),
                session(),
                now,
            )).toBe(true);
        });

        it('returns true when no active session exists and MFA is untrusted', () => {
            expect(requiresMfaForRefresh(
                family({ mfaVerifiedAt: new Date(now.getTime() - 1000) }),
                null,
                now,
            )).toBe(true);
        });

        it('returns true for invalid mfaVerifiedAt date', () => {
            expect(requiresMfaForRefresh(
                family({ mfaVerifiedAt: new Date('invalid') }),
                session(),
                now,
            )).toBe(true);
        });
    });
});
