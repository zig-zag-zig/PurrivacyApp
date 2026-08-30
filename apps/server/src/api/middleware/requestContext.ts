import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export const requestContext = (req: Request, res: Response, next: NextFunction): void => {
    const requestIdHeader = req.headers['x-request-id'];
    const requestId = typeof requestIdHeader === 'string' && requestIdHeader.trim()
        ? requestIdHeader.trim().slice(0, 80)
        : randomUUID();

    res.locals.requestId = requestId;
    res.locals.startedAt = Date.now();
    res.setHeader('X-Request-ID', requestId);
    next();
};
