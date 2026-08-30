import { createRateLimiter } from '../rate-limit/createRateLimiter';
import { rateLimitKeys } from '../rate-limit/rateLimitKeys';
import { apiMessages } from '../http/apiMessages';

const MINUTE = 60 * 1000;

export const rateLimiter = {
    mfaVerification: createRateLimiter({
        name: 'mfaVerification',
        windowMs: 15 * MINUTE,
        maxRequests: 5,
        keyGenerator: rateLimitKeys.byUser(true),
        skipSuccessfulRequests: true,
        critical: true,
        message: apiMessages.rateLimit.mfaVerification,
    }),

    authentication: createRateLimiter({
        name: 'authentication',
        windowMs: 60 * MINUTE,
        maxRequests: 10,
        keyGenerator: rateLimitKeys.byUsername(),
        critical: true,
        message: apiMessages.rateLimit.authentication,
    }),

    general: createRateLimiter({
        name: 'general',
        windowMs: 15 * MINUTE,
        maxRequests: 100,
        message: apiMessages.rateLimit.default,
    }),

    authenticatedRead: createRateLimiter({
        name: 'authenticatedRead',
        windowMs: 15 * MINUTE,
        maxRequests: 120,
        keyGenerator: rateLimitKeys.byUser(),
        message: apiMessages.rateLimit.default,
    }),

    authenticatedWrite: createRateLimiter({
        name: 'authenticatedWrite',
        windowMs: 15 * MINUTE,
        maxRequests: 30,
        keyGenerator: rateLimitKeys.byUser(),
        message: apiMessages.rateLimit.updates,
    }),

    sessionCreation: createRateLimiter({
        name: 'sessionCreation',
        windowMs: 15 * MINUTE,
        maxRequests: 5,
        keyGenerator: rateLimitKeys.byUser(),
        skipSuccessfulRequests: true,
        critical: true,
        skipResponse: (_req, res) => {
            const details = res.locals.errorDetails;
            return res.statusCode === 403 && details?.mfaRequired === true && details?.wrongMfaCode !== true;
        },
        message: apiMessages.rateLimit.login,
    }),

    sessionCreationIp: createRateLimiter({
        name: 'sessionCreationIp',
        windowMs: 15 * MINUTE,
        maxRequests: 30,
        message: apiMessages.rateLimit.login,
    }),

    sessionRefresh: createRateLimiter({
        name: 'sessionRefresh',
        windowMs: 15 * MINUTE,
        maxRequests: 20,
        keyGenerator: rateLimitKeys.byRefreshToken(),
        skipSuccessfulRequests: true,
        critical: true,
        message: apiMessages.rateLimit.sessionRefresh,
    }),

    sensitiveOperations: createRateLimiter({
        name: 'sensitiveOperations',
        windowMs: 15 * MINUTE,
        maxRequests: 5,
        keyGenerator: rateLimitKeys.byUser(true),
        critical: true,
        message: apiMessages.rateLimit.sensitiveOperations,
    }),

    create: createRateLimiter,
};
