import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';

const readHeaderValue = (value: string | string[] | undefined): string | undefined => (
    Array.isArray(value) ? value[0] : value
);

export function requestMetadata(req: Request, res: Response, next: NextFunction): void {
    const deviceId = readHeaderValue(req.headers['x-device-id']);
    req.deviceId = typeof deviceId === 'string' ? deviceId : undefined;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    const origin = req.headers.origin;
    if (origin && env.allowedOrigins.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && env.allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID, X-Device-ID');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    next();
}

