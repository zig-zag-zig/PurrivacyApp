import { Request, Response, NextFunction } from 'express';
import { ResponseUtils } from '../../utils/responseUtils';
import { AppError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';
import { apiMessages } from '../http/apiMessages';

const logger = createLogger('api.error');

/**
 * Global error handling middleware
 */
export function errorMiddleware(err: unknown, req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
        next(err);
        return;
    }

    const error = err instanceof Error ? err : new Error('Unknown request error');
    const errorLike = err !== null && typeof err === 'object'
        ? err as { details?: Record<string, unknown>; status?: number; statusCode?: number; type?: string }
        : {};
    const timestamp = new Date().toISOString();
    const requestId = res.locals.requestId;
    const details = errorLike.details ? { ...errorLike.details, timestamp, requestId } : { timestamp, requestId };
    const responseDetails = res.locals.newRecoveryCodes
        ? { ...details, newRecoveryCodes: res.locals.newRecoveryCodes }
        : details;
    errorLike.details = details;
    res.locals.errorDetails = details;

    // Expected client-input failures (malformed JSON / oversized body) are
    // routine 4xx errors: log concise metadata at warn level without a stack
    // trace instead of classifying them as unhandled server errors
    // (API-ARCH-002).
    if (err instanceof SyntaxError && 'body' in err) {
        logger.warn('invalid JSON request body', {
            requestId,
            path: req.path,
            method: req.method,
            statusCode: 400,
        });
        ResponseUtils.error(res, apiMessages.body.invalidJson, 400, responseDetails);
        return;
    }

    if (errorLike.type === 'entity.too.large') {
        const statusCode = errorLike.status || 413;
        logger.warn('request body too large', {
            requestId,
            path: req.path,
            method: req.method,
            statusCode,
        });
        ResponseUtils.error(res, apiMessages.body.tooLarge, statusCode, responseDetails);
        return;
    }

    const logMeta = {
        requestId,
        message: error.message,
        name: error.name,
        statusCode: errorLike.statusCode,
        path: req.path,
        method: req.method,
        userId: req.userId,
        details,
        stack: error.stack,
    };

    if (err instanceof AppError && err.statusCode < 500) {
        logger.warn('request error', logMeta);
    } else {
        logger.error('unhandled request error', logMeta);
    }

    // Handle AppError and its subclasses
    if (err instanceof AppError) {
        ResponseUtils.error(res, err.message, err.statusCode, responseDetails);
        return;
    }

    const statusCode = errorLike.statusCode || errorLike.status || 500;
    const message = statusCode >= 500
        ? apiMessages.server.internalError
        : error.message || apiMessages.server.requestFailed;

    ResponseUtils.error(res, message, statusCode, responseDetails);
}
