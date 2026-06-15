import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const securityServiceMock = vi.hoisted(() => ({
  clearStoredSession: vi.fn(),
  getStoredSession: vi.fn(),
  storeSession: vi.fn(),
  updateStoredSessionMfaState: vi.fn(),
}));

vi.mock('../../features/auth/domain/authUtils', () => ({
  getUserId: () => 'user-id',
}));

vi.mock('../../features/security/services/securityService', () => ({
  securityService: securityServiceMock,
}));

vi.mock('../core/buildApiUrl', () => ({
  buildApiUrl: (endpoint: string) => `https://api.example.test/v1${endpoint}`,
}));

vi.mock('../requestHelpers', () => ({
  processResponse: vi.fn(),
}));

describe('SessionManager', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns stored local session when available', async () => {
    const { SessionManager } = await import('./sessionManager');
    const manager = new SessionManager(vi.fn());
    const accessTokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const refreshTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const sessionResponse = {
      accessToken: 'stored-at',
      refreshToken: 'stored-rt',
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      mfaEnabled: false,
      mfaTrusted: false,
    };

    await manager.storeSessionResponse(sessionResponse, 'user-id');
    securityServiceMock.getStoredSession.mockResolvedValue({
      refreshToken: 'stored-rt',
      refreshTokenExpiresAt: new Date(refreshTokenExpiresAt),
      mfaEnabled: false,
      mfaTrusted: false,
    });

    const result = await manager.createSession(false);
    expect(result.accessToken).toBe('stored-at');
  });

  it('calls API directly when forceNewSession is true', async () => {
    const requestFn = vi.fn(async () => ({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
      accessTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      mfaEnabled: false,
      mfaTrusted: false,
    }));
    const { SessionManager } = await import('./sessionManager');
    const manager = new SessionManager(requestFn);

    const result = await manager.createSession(false, undefined, true);
    expect(result.accessToken).toBe('new-at');
    expect(requestFn).toHaveBeenCalledWith(
      '/auth/session',
      'POST',
      {},
      true,
      expect.objectContaining({ useSessionAuth: false, includeDeviceId: true }),
      false,
    );
  });

  it('throws for terminal stored session errors', async () => {
    const { processResponse } = await import('../requestHelpers');
    vi.mocked(processResponse).mockRejectedValueOnce({ requiresSignOut: true, refreshTokenMissing: true });

    const { SessionManager } = await import('./sessionManager');
    const manager = new SessionManager(vi.fn());

    securityServiceMock.getStoredSession.mockResolvedValue({
      refreshToken: 'expired-rt',
      refreshTokenExpiresAt: new Date(),
      mfaEnabled: false,
      mfaTrusted: false,
    });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(null, { status: 401 }),
    );

    await expect(manager.createSession(true)).rejects.toMatchObject({
      requiresSignOut: true,
    });
    expect(securityServiceMock.clearStoredSession).toHaveBeenCalled();
  });

  it('handles rate limit errors from stored session', async () => {
    const { processResponse } = await import('../requestHelpers');
    vi.mocked(processResponse).mockRejectedValueOnce({ rateLimited: true, retryAfter: '60' });

    const { SessionManager } = await import('./sessionManager');
    const manager = new SessionManager(vi.fn());

    securityServiceMock.getStoredSession.mockResolvedValue({
      refreshToken: 'rt',
      refreshTokenExpiresAt: new Date(),
      mfaEnabled: false,
      mfaTrusted: false,
    });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(null, { status: 429 }),
    );

    await expect(manager.createSession(true)).rejects.toMatchObject({
      rateLimited: true,
    });
  });

  it('sends an explicit empty JSON body when signing out remotely', async () => {
    const { SessionManager } = await import('./sessionManager');
    const manager = new SessionManager(vi.fn());
    const accessTokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const refreshTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await manager.storeSessionResponse({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      mfaEnabled: false,
      mfaTrusted: false,
    }, 'user-id');

    await manager.signOut();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/sign-out'),
      expect.objectContaining({
        body: '{}',
        method: 'POST',
      }),
    );

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(init?.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
    }));
  });
});
