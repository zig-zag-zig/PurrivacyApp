import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../utils/logger';

const logger = createLogger('api.request');

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
    res.once('finish', () => {
        if (req.path === '/health') {
            return;
        }

        const durationMs = Date.now() - (Number(res.locals.startedAt) || Date.now());
        const meta = {
            requestId: res.locals.requestId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs,
            userId: req.userId,
            hasDeviceId: Boolean(req.deviceId),
        };

        if (res.statusCode >= 500) {
            logger.error('request failed', meta);
        } else if (res.statusCode >= 400) {
            logger.warn('request rejected', meta);
        } else {
            logger.info('request completed', meta);
        }
    });

    next();
};
