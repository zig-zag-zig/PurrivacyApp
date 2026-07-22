import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ApiRuntime } from '../runtime';

const mockRuntime: Partial<ApiRuntime> = {};
const identityMock = { getUserId: () => 'user-id', getUser: () => null };
const sessionStoreMock = {
  clearStoredSession: vi.fn(),
  getStoredSession: vi.fn(),
  storeSession: vi.fn(),
  updateStoredSessionMfaState: vi.fn(),
  updateStoredSessionMfaTrust: vi.fn(),
};

vi.mock('../runtime', () => ({
  getApiRuntime: () => mockRuntime,
  configureApiRuntime: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  logger: { warn: vi.fn() },
}));

import { isSensitiveAndRequiresMfa } from './mfaSensitivity';

describe('isSensitiveAndRequiresMfa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockRuntime, {
      identity: identityMock,
      sessionStore: sessionStoreMock,
      mfa: {
        getIsInMfaHandler: () => false,
        handleRateLimitError: vi.fn(),
        handleSensitiveMfaError: vi.fn(),
        handleSessionMfaError: vi.fn(),
        handleMissingHeadersError: vi.fn(),
      },
    });
  });

  it('returns true for sensitive endpoint with MFA enabled', async () => {
    sessionStoreMock.getStoredSession.mockResolvedValue({ mfaEnabled: true, mfaTrusted: false });
    expect(await isSensitiveAndRequiresMfa('/user/change-password', 'POST')).toBe(true);
  });

  it('returns false for non-sensitive endpoint', async () => {
    sessionStoreMock.getStoredSession.mockResolvedValue({ mfaEnabled: true, mfaTrusted: false });
    expect(await isSensitiveAndRequiresMfa('/user', 'GET')).toBe(false);
  });

  it('returns false when session check fails', async () => {
    sessionStoreMock.getStoredSession.mockRejectedValue(new Error('no session'));
    expect(await isSensitiveAndRequiresMfa('/user/change-password', 'POST')).toBe(false);
  });

  it('returns false for /mfa/enable when no stored session exists', async () => {
    sessionStoreMock.getStoredSession.mockResolvedValue(null);
    expect(await isSensitiveAndRequiresMfa('/mfa/enable', 'POST')).toBe(false);
  });

  it('returns true for method-specific sensitive endpoint', async () => {
    sessionStoreMock.getStoredSession.mockResolvedValue({ mfaEnabled: true, mfaTrusted: false });
    expect(await isSensitiveAndRequiresMfa('/user', 'DELETE')).toBe(true);
  });

  it('returns false when MFA is not enabled', async () => {
    sessionStoreMock.getStoredSession.mockResolvedValue({ mfaEnabled: false, mfaTrusted: false });
    expect(await isSensitiveAndRequiresMfa('/user/change-password', 'POST')).toBe(false);
  });
});
