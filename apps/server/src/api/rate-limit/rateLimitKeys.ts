import { createHash } from 'crypto';
import { Request } from 'express';
import { getClientIp } from './clientIp';

const requestParts = (req: Request): string => `${req.method}:${req.path}`;

export const rateLimitKeys = {
    default: (req: Request): string => {
        return `${getClientIp(req)}:${requestParts(req)}`;
    },

    byUser: (includeDevice = false) => (req: Request): string => {
        const ip = getClientIp(req);
        const userId = req.userId || 'anonymous';

        if (!includeDevice) {
            return `${ip}:${userId}:${requestParts(req)}`;
        }

        const deviceId = req.deviceId || req.headers['x-device-id'] as string || 'unknown';
        return `${ip}:${userId}:${deviceId}:${requestParts(req)}`;
    },

    byUsername: () => (req: Request): string => {
        const username = typeof req.body?.username === 'string'
            ? req.body.username.trim().toLowerCase()
            : 'unknown';
        return `${getClientIp(req)}:${username}:${requestParts(req)}`;
    },

    byDevice: () => (req: Request): string => {
        const deviceId = req.deviceId || req.headers['x-device-id'] as string || 'unknown';
        return `${getClientIp(req)}:${deviceId}:${requestParts(req)}`;
    },

    byRefreshToken: () => (req: Request): string => {
        const refreshToken = req.body?.refreshToken;
        const tokenHash = typeof refreshToken === 'string' && refreshToken.length > 0
            ? createHash('sha256').update(refreshToken).digest('hex').substring(0, 24)
            : 'missing';

        return `${getClientIp(req)}:${tokenHash}:${requestParts(req)}`;
    },

    bySession: () => (req: Request): string => {
        const authHeader = req.headers.authorization || 'no-auth';
        const authHash = Buffer.from(String(authHeader)).toString('base64').substring(0, 20);
        return `${getClientIp(req)}:${authHash}:${requestParts(req)}`;
    },
};
