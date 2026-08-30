import { OutgoingHttpHeader, OutgoingHttpHeaders } from 'http';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { RateLimitError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';
import { apiMessages } from '../http/apiMessages';
import { getClientIp } from './clientIp';
import { rateLimitKeys } from './rateLimitKeys';
import { MemoryRateLimitStore } from './memoryRateLimitStore';
import { getRateLimitStore } from './rateLimitStoreFactory';
import { RateLimitUnavailableError } from '../../utils/errors';
import { RateLimitConfig } from './rateLimitTypes';
import { RateLimitCounterResult, RateLimitStore } from './rateLimitStoreTypes';

const logger = createLogger('api.rateLimit');
type WriteHeadHeaders = OutgoingHttpHeaders | OutgoingHttpHeader[];

/** Retry-After advertised when a critical limiter is unavailable. */
const UNAVAILABLE_RETRY_AFTER_SECONDS = 60;

/**
 * Process-local fallback used for non-critical limiters when the configured
 * shared store is unavailable (fail-open). Bounded like any memory store.
 */
const fallbackStore = new MemoryRateLimitStore();

const setHeaders = (
    res: Response,
    config: RateLimitConfig,
    counter: RateLimitCounterResult,
    remaining: number,
): void => {
    res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(counter.resetTime / 1000).toString());
    res.setHeader('X-RateLimit-Policy', `${config.maxRequests};w=${config.windowMs / 1000}`);
};

const limitExceeded = (
    req: Request,
    res: Response,
    config: RateLimitConfig,
    counter: RateLimitCounterResult,
): RateLimitError => {
    const retryAfter = Math.max(1, Math.ceil((counter.resetTime - Date.now()) / 1000));
    logger.warn('rate limit exceeded', {
        requestId: res.locals.requestId,
        limiter: config.name || req.path,
        method: req.method,
        path: req.path,
        ip: getClientIp(req),
        userId: req.userId,
        hasDeviceId: Boolean(req.deviceId || req.headers['x-device-id']),
        retryAfter,
        limit: config.maxRequests,
        windowSeconds: config.windowMs / 1000,
    });

    res.setHeader('Retry-After', retryAfter.toString());
    setHeaders(res, config, counter, 0);

    return new RateLimitError(config.message || apiMessages.rateLimit.default, {
        retryAfter,
        limit: config.maxRequests,
        window: config.windowMs / 1000,
    });
};

const attachResponseAdjustment = (
    req: Request,
    res: Response,
    store: RateLimitStore,
    key: string,
    config: RateLimitConfig,
    counter: RateLimitCounterResult,
): void => {
    let adjustedCount = counter.count;
    const originalWriteHead = res.writeHead.bind(res);

    res.writeHead = ((
        statusCode: number,
        statusMessageOrHeaders?: string | WriteHeadHeaders,
        headers?: WriteHeadHeaders,
    ): Response => {
        setHeaders(res, config, counter, config.maxRequests - adjustedCount);
        if (typeof statusMessageOrHeaders === 'string') {
            return headers === undefined
                ? originalWriteHead(statusCode, statusMessageOrHeaders)
                : originalWriteHead(statusCode, statusMessageOrHeaders, headers);
        }

        return statusMessageOrHeaders === undefined
            ? originalWriteHead(statusCode)
            : originalWriteHead(statusCode, statusMessageOrHeaders);
    }) as Response['writeHead'];

    res.once('finish', () => {
        const shouldSkip =
            (config.skipSuccessfulRequests && res.statusCode >= 200 && res.statusCode < 300) ||
            config.skipResponse?.(req, res) === true;

        if (!shouldSkip) {
            return;
        }

        void store.decrement(key, config.windowMs)
            .then(() => {
                adjustedCount = Math.max(0, adjustedCount - 1);
            })
            .catch((error: unknown) => {
                logger.warn('failed to adjust rate limit count', {
                    limiter: config.name || req.path,
                    error,
                });
            });
    });
};

export const createRateLimiter = (config: RateLimitConfig, storeOverride?: RateLimitStore) => {
    const sharedStore = storeOverride ?? getRateLimitStore();
    const failClosed = config.critical === true && env.rateLimitFailClosed;
    const limiterName = config.name || 'rateLimit';

    const run = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const key = config.keyGenerator ? config.keyGenerator(req) : rateLimitKeys.default(req);

        let counter: RateLimitCounterResult;
        let activeStore = sharedStore;

        try {
            counter = await activeStore.increment(key, config.windowMs);
        } catch (error) {
            logger.error('rate limit store unavailable', {
                limiter: limiterName,
                store: activeStore.kind,
                failClosed,
                error,
            });

            if (failClosed) {
                res.setHeader('Retry-After', UNAVAILABLE_RETRY_AFTER_SECONDS.toString());
                next(new RateLimitUnavailableError(undefined, {
                    limiter: limiterName,
                    retryAfter: UNAVAILABLE_RETRY_AFTER_SECONDS,
                }));
                return;
            }

            activeStore = fallbackStore;
            counter = await activeStore.increment(key, config.windowMs);
        }

        if (counter.count > config.maxRequests) {
            next(limitExceeded(req, res, config, counter));
            return;
        }

        if (config.skipSuccessfulRequests || config.skipResponse) {
            attachResponseAdjustment(req, res, activeStore, key, config, counter);
        } else {
            setHeaders(res, config, counter, config.maxRequests - counter.count);
        }

        next();
    };

    return (req: Request, res: Response, next: NextFunction): void => {
        void run(req, res, next).catch((error: unknown) => {
            logger.error('rate limiter failed unexpectedly', {
                limiter: limiterName,
                error,
            });
            next(error instanceof Error ? error : new Error('Rate limiter failure'));
        });
    };
};
