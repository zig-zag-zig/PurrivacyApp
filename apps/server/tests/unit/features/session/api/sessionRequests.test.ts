import { BadRequestError } from '../../../../../src/utils/errors';
import {
  getBearerToken,
  parseCreateSessionRequest,
  parseMfaSetupNonceMintRequest,
  parseRecoveryChallengeRequest,
  parseRecoveryTokenRequest,
  parseRefreshSessionRequest,
} from '../../../../../src/features/session/api/sessionRequests';
import {
  parseMfaEnableRequest,
  parseSessionTrustRequest,
} from '../../../../../src/features/mfa/api/mfaRequests';
import {
  parseCreateUserRequest,
  parseKeyRecordRequest,
  parseSavePushTokenRequest,
  parseDeletePushTokenRequest,
} from '../../../../../src/features/user/api/userRequests';
import { MAX_PUSH_TOKEN_LENGTH } from '../../../../../src/core/constants';
import { normalizePushToken } from '../../../../../src/features/notification/infrastructure/pushTokens/pushTokenNormalization';

describe('session and MFA request parsing', () => {
  it('extracts only non-empty Bearer tokens', () => {
    expect(getBearerToken('Bearer  access-token  ')).toBe('access-token');
    expect(getBearerToken('Basic access-token')).toBeUndefined();
    expect(getBearerToken('Bearer    ')).toBeUndefined();
    expect(getBearerToken(undefined)).toBeUndefined();
  });

  it('normalizes create-session metadata and explicit MFA trust', () => {
    expect(parseCreateSessionRequest({
      label: '  Pixel 9  ',
      platform: '  Android  ',
      mfaCode: '123456',
      mfaTrusted: true,
    })).toEqual({
      label: 'Pixel 9',
      platform: 'Android',
      mfaCode: '123456',
      mfaTrusted: true,
    });

    expect(parseCreateSessionRequest({
      label: '   ',
      platform: null,
      mfaTrusted: 'true',
    })).toEqual({
      label: undefined,
      platform: undefined,
      mfaCode: undefined,
      mfaTrusted: false,
    });
  });

  it('accepts recovery-code format during session creation but rejects malformed MFA codes', () => {
    expect(parseCreateSessionRequest({ mfaCode: 'A1B2C3D4E5F6' }).mfaCode).toBe('A1B2C3D4E5F6');

    expect(() => parseCreateSessionRequest({ mfaCode: '12345' })).toThrow(BadRequestError);
    expect(() => parseCreateSessionRequest({ mfaCode: 'a1b2c3d4e5f6' })).toThrow(BadRequestError);
    expect(() => parseCreateSessionRequest({ mfaCode: 123456 })).toThrow(BadRequestError);
  });

  it('parses the optional MFA code for the setup-nonce mint endpoint', () => {
    expect(parseMfaSetupNonceMintRequest({ mfaCode: ' 123456 ' })).toEqual({ mfaCode: '123456' });
    expect(parseMfaSetupNonceMintRequest({})).toEqual({ mfaCode: undefined });
    expect(parseMfaSetupNonceMintRequest({ mfaCode: 'A1B2C3D4E5F6' })).toEqual({ mfaCode: 'A1B2C3D4E5F6' });

    expect(() => parseMfaSetupNonceMintRequest({ mfaCode: '12345' })).toThrow(BadRequestError);
    expect(() => parseMfaSetupNonceMintRequest({ mfaCode: 123456 })).toThrow(BadRequestError);
  });

  it('enforces refresh-token presence and length before session refresh', () => {
    expect(parseRefreshSessionRequest({ refreshToken: '  token-id.secret  ' })).toBe('token-id.secret');
    expect(() => parseRefreshSessionRequest({})).toThrow(BadRequestError);
    expect(() => parseRefreshSessionRequest({ refreshToken: 'x'.repeat(513) })).toThrow(BadRequestError);
  });

  it('requires recovery challenge and token credentials', () => {
    expect(parseRecoveryChallengeRequest({ username: '  alice  ' })).toBe('  alice  ');
    expect(parseRecoveryTokenRequest({
      username: 'alice',
      recoveryVerifier: 'verifier',
    })).toEqual({
      username: 'alice',
      recoveryVerifier: 'verifier',
    });

    expect(() => parseRecoveryChallengeRequest({ username: '   ' })).toThrow(BadRequestError);
    expect(() => parseRecoveryTokenRequest({ username: 'alice' })).toThrow(BadRequestError);
  });

  it('keeps MFA enablement to six-digit TOTP codes and boolean trust', () => {
    expect(parseMfaEnableRequest({ mfaCode: ' 123456 ', mfaTrusted: true })).toEqual({
      mfaCode: '123456',
      mfaTrusted: true,
    });
    expect(parseSessionTrustRequest({ mfaTrusted: false })).toBe(false);

    expect(() => parseMfaEnableRequest({ mfaCode: 'A1B2C3D4E5F6' })).toThrow(BadRequestError);
    expect(() => parseSessionTrustRequest({})).toThrow(BadRequestError);
  });

  it('validates push-token request shape without normalizing external token semantics', () => {
    expect(parseSavePushTokenRequest({ pushToken: ' ExpoPushToken[test] ' }, ' device-1 ')).toEqual({
      pushToken: ' ExpoPushToken[test] ',
      deviceId: ' device-1 ',
    });
    expect(parseDeletePushTokenRequest({ pushToken: 'token' })).toBe('token');

    expect(() => parseSavePushTokenRequest({ pushToken: 1 }, 'device-1')).toThrow(BadRequestError);
    expect(() => parseSavePushTokenRequest({ pushToken: 'token' }, '   ')).toThrow(BadRequestError);
    expect(() => parseDeletePushTokenRequest({})).toThrow(BadRequestError);
  });

  it('requires explicit userData and key request wrappers for user-key mutations', () => {
    const userData = { dekPassword: { encryptedData: 'x', iv: 'y', tag: 'z' } };
    const key = { encryptedData: 'x', iv: 'y', tag: 'z' };

    expect(parseCreateUserRequest({ userData })).toBe(userData);
    expect(parseKeyRecordRequest({ key })).toBe(key);

    expect(() => parseCreateUserRequest({ user: userData })).toThrow(BadRequestError);
    expect(() => parseKeyRecordRequest(key)).toThrow(BadRequestError);
  });

  it('limits stored push-token length', () => {
    expect(normalizePushToken(' token ')).toBe('token');
    expect(() => normalizePushToken('x'.repeat(MAX_PUSH_TOKEN_LENGTH + 1))).toThrow(BadRequestError);
  });
});
