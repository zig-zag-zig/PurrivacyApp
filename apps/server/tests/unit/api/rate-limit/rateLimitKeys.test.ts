import { createHash } from 'crypto';
import { Request } from 'express';
import { getClientIp } from '../../../../src/api/rate-limit/clientIp';
import { rateLimitKeys } from '../../../../src/api/rate-limit/rateLimitKeys';

const request = (overrides: Record<string, unknown> = {}): Request => ({
  method: 'POST',
  path: '/v1/session/refresh',
  headers: {},
  socket: {
    remoteAddress: '203.0.113.10',
  },
  ...overrides,
} as Request);

describe('rate-limit key helpers', () => {
  it('uses the socket address when no Express-resolved req.ip is present', () => {
    expect(getClientIp(request({
      headers: { 'x-forwarded-for': '198.51.100.7, 198.51.100.8' },
    }))).toBe('203.0.113.10');
  });

  it('does not trust forwarded headers from local peers without a trusted proxy (spoof protection)', () => {
    // Express only sets req.ip from X-Forwarded-For when the immediate peer
    // is trusted; raw header inspection is deliberately avoided.
    expect(getClientIp(request({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '198.51.100.7, 198.51.100.8' },
    }))).toBe('unknown');
  });

  it('keys username attempts case-insensitively and without surrounding whitespace', () => {
    expect(rateLimitKeys.byUsername()(request({
      body: { username: '  Alice@Example.COM  ' },
    }))).toBe('203.0.113.10:alice@example.com:POST:/v1/session/refresh');
  });

  it('hashes refresh tokens in rate-limit keys instead of embedding bearer material', () => {
    const refreshToken = 'token-id.secret-value';
    const expectedHash = createHash('sha256').update(refreshToken).digest('hex').substring(0, 24);
    const key = rateLimitKeys.byRefreshToken()(request({
      body: { refreshToken },
    }));

    expect(key).toBe(`203.0.113.10:${expectedHash}:POST:/v1/session/refresh`);
    expect(key).not.toContain(refreshToken);
    expect(rateLimitKeys.byRefreshToken()(request({ body: {} }))).toBe(
      '203.0.113.10:missing:POST:/v1/session/refresh',
    );
  });

  it('includes user and device dimensions only when requested', () => {
    expect(rateLimitKeys.byUser()(request({ userId: 'user-1' }))).toBe(
      '203.0.113.10:user-1:POST:/v1/session/refresh',
    );
    expect(rateLimitKeys.byUser(true)(request({
      userId: 'user-1',
      headers: { 'x-device-id': 'device-header' },
    }))).toBe('203.0.113.10:user-1:device-header:POST:/v1/session/refresh');
    expect(rateLimitKeys.byDevice()(request({ deviceId: 'device-req' }))).toBe(
      '203.0.113.10:device-req:POST:/v1/session/refresh',
    );
  });
});
