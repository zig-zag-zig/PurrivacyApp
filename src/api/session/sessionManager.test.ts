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
