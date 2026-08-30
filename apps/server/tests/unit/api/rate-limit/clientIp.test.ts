import { Request } from 'express';
import { getClientIp } from '../../../../src/api/rate-limit/clientIp';

const request = (overrides: Record<string, unknown> = {}): Request => ({
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
} as unknown as Request);

describe('getClientIp', () => {
    it('prefers req.ip when Express resolved a non-local address', () => {
        const req = request({
            ip: '203.0.113.10',
            socket: { remoteAddress: '127.0.0.1' },
            headers: { 'x-forwarded-for': '198.51.100.7' },
        });
        expect(getClientIp(req)).toBe('203.0.113.10');
    });

    it('ignores spoofed X-Forwarded-For when the immediate peer is not trusted', () => {
        // Express with trust proxy disabled sets req.ip to the socket address;
        // the forwarded header must be ignored.
        const req = request({
            ip: '203.0.113.10',
            socket: { remoteAddress: '203.0.113.10' },
            headers: { 'x-forwarded-for': '198.51.100.7' },
        });
        expect(getClientIp(req)).toBe('203.0.113.10');
    });

    it('falls back to the socket address when req.ip is missing', () => {
        const req = request({ socket: { remoteAddress: '203.0.113.10' } });
        expect(getClientIp(req)).toBe('203.0.113.10');
    });

    it('treats a localhost req.ip as unusable and falls through to the socket', () => {
        const req = request({
            ip: '127.0.0.1',
            socket: { remoteAddress: '203.0.113.10' },
        });
        expect(getClientIp(req)).toBe('203.0.113.10');
    });

    it('filters localhost-mapped IPv4 addresses', () => {
        const req = request({
            ip: '::ffff:127.0.0.1',
            socket: { remoteAddress: '10.0.0.1' },
        });
        expect(getClientIp(req)).toBe('10.0.0.1');
    });

    it('filters the IPv6 loopback address', () => {
        const req = request({
            ip: '::1',
            socket: { remoteAddress: '10.0.0.1' },
        });
        expect(getClientIp(req)).toBe('10.0.0.1');
    });

    it('returns "unknown" when only localhost addresses are visible', () => {
        const req = request({ ip: '127.0.0.1' });
        expect(getClientIp(req)).toBe('unknown');
    });

    it('returns "unknown" when no IP source is available', () => {
        const req = request({ ip: undefined, socket: {} });
        expect(getClientIp(req)).toBe('unknown');
    });
});
