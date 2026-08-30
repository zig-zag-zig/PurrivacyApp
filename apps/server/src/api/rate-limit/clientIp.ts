import { Request } from 'express';

const LOCALHOST_ADDRESSES = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1']);

/**
 * Resolve the client IP for rate limiting.
 *
 * Prefers `req.ip`, which Express computes from the precise `trust proxy`
 * configuration: with a trusted proxy in front, `req.ip` is the first
 * untrusted hop (the real client); with no trusted proxy, it is the socket
 * address and spoofed `X-Forwarded-For` headers are ignored. Falls back to
 * the raw socket address for direct connections and returns `'unknown'`
 * when nothing usable is available.
 */
export const getClientIp = (req: Request): string => {
    if (typeof req.ip === 'string' && req.ip.length > 0 && !LOCALHOST_ADDRESSES.has(req.ip)) {
        return req.ip;
    }

    const socketAddress = req.socket?.remoteAddress;
    if (typeof socketAddress === 'string' && !LOCALHOST_ADDRESSES.has(socketAddress)) {
        return socketAddress;
    }

    return 'unknown';
};
