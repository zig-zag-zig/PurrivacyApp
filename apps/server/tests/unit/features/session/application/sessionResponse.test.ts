import { createRefreshTokenFamily } from '../../../../helpers/testFixtures';
import { buildSessionResponse } from '../../../../../src/features/session/application/sessionResponse';

describe('buildSessionResponse', () => {
    it('returns ISO timestamps and derives MFA fields from the family', () => {
        const family = createRefreshTokenFamily({ userHasMfa: true, mfaTrusted: true });
        const result = buildSessionResponse(
            'access-token',
            new Date('2026-01-01T00:15:00.000Z'),
            'refresh-token',
            new Date('2026-04-01T00:00:00.000Z'),
            family,
        );

        expect(result.accessToken).toBe('access-token');
        expect(result.refreshToken).toBe('refresh-token');
        expect(result.accessTokenExpiresAt).toBe('2026-01-01T00:15:00.000Z');
        expect(result.refreshTokenExpiresAt).toBe('2026-04-01T00:00:00.000Z');
        expect(result.mfaEnabled).toBe(true);
        expect(result.mfaTrusted).toBe(true);
        expect(result.sessionFamilyId).toBe('family-1');
    });

    it('is falsey for MFA when userHasMfa is false', () => {
        const family = createRefreshTokenFamily({ userHasMfa: false, mfaTrusted: false });
        const result = buildSessionResponse('at', new Date(), 'rt', new Date(), family);

        expect(result.mfaEnabled).toBe(false);
        expect(result.mfaTrusted).toBe(false);
    });

    it('mfaTrusted is false when userHasMfa is true but mfaTrusted is false', () => {
        const family = createRefreshTokenFamily({ userHasMfa: true, mfaTrusted: false });
        const result = buildSessionResponse('at', new Date(), 'rt', new Date(), family);

        expect(result.mfaEnabled).toBe(true);
        expect(result.mfaTrusted).toBe(false);
    });
});
