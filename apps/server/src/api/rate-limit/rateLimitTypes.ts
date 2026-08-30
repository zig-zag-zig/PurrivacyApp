import { Request, Response } from 'express';

type RateLimitKeyGenerator = (req: Request) => string;
type RateLimitSkipResponse = (req: Request, res: Response) => boolean;

export interface RateLimitConfig {
    name?: string;
    windowMs: number;
    maxRequests: number;
    keyGenerator?: RateLimitKeyGenerator;
    skipSuccessfulRequests?: boolean;
    skipResponse?: RateLimitSkipResponse;
    message?: string;
    /**
     * Marks a limiter as security-critical (brute-force/recovery/MFA/session
     * boundaries). When the shared rate limit store is unavailable and
     * `RATE_LIMIT_FAIL_CLOSED` is enabled, critical limiters reject requests
     * instead of silently falling back to a process-local store.
     */
    critical?: boolean;
}
