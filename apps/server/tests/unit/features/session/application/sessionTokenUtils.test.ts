import { AuthError, BadRequestError } from '../../../../../src/utils/errors';
import {
  MAX_ACCESS_TOKEN_LENGTH,
  TOKEN_ID_HEX_LENGTH,
  generateRefreshToken,
  normalizeDeviceId,
  parseRefreshTokenId,
} from '../../../../../src/features/session/application/sessionTokenUtils';
import { buildSessionResponse } from '../../../../../src/features/session/application/sessionResponse';
import { createRefreshTokenFamily } from '../../../../helpers/testFixtures';

describe('sessionTokenUtils', () => {
  it('generates parseable refresh tokens while exposing only the token id for lookup', () => {
    const refreshToken = generateRefreshToken();

    expect(refreshToken.tokenId).toHaveLength(TOKEN_ID_HEX_LENGTH);
    expect(refreshToken.rawToken).toMatch(new RegExp(`^${refreshToken.tokenId}\\.[A-Za-z0-9_-]+$`));
    expect(refreshToken.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(parseRefreshTokenId(refreshToken.rawToken)).toBe(refreshToken.tokenId);
  });

  it('rejects malformed refresh token ids with a session-safe auth error', () => {
    const invalidTokens = [
      '',
      'missing-secret',
      `${'a'.repeat(TOKEN_ID_HEX_LENGTH)}.`,
      `${'g'.repeat(TOKEN_ID_HEX_LENGTH)}.secret`,
      `${'a'.repeat(TOKEN_ID_HEX_LENGTH)}.not+url+safe`,
    ];

    for (const token of invalidTokens) {
      expect(() => parseRefreshTokenId(token)).toThrow(AuthError);
      try {
        parseRefreshTokenId(token);
      } catch (error) {
        expect((error as AuthError).statusCode).toBe(401);
        expect((error as AuthError).details).toEqual({ refreshTokenInvalid: true });
      }
    }
  });

  it('normalizes optional device ids and caps their size', () => {
    expect(normalizeDeviceId(undefined)).toBeUndefined();
    expect(normalizeDeviceId('   ')).toBeUndefined();
    expect(normalizeDeviceId('  ios-device  ')).toBe('ios-device');
    expect(() => normalizeDeviceId('x'.repeat(257))).toThrow(BadRequestError);
  });

  it('builds session responses with ISO timestamps and MFA state derived from the token family', () => {
    expect(MAX_ACCESS_TOKEN_LENGTH).toBe(1024);
    expect(buildSessionResponse(
      'access',
      new Date('2026-01-01T00:15:00.000Z'),
      'refresh',
      new Date('2026-04-01T00:00:00.000Z'),
      createRefreshTokenFamily({ userHasMfa: true, mfaTrusted: false }),
    )).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      accessTokenExpiresAt: '2026-01-01T00:15:00.000Z',
      refreshTokenExpiresAt: '2026-04-01T00:00:00.000Z',
      mfaEnabled: true,
      mfaTrusted: false,
      sessionFamilyId: 'family-1',
    });
  });
});
