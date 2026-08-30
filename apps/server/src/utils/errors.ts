/**
 * Custom error classes for consistent error handling
 */

import { AuthErrorDetails } from "../core/types";

export class AppError<T extends object = Record<string, unknown>> extends Error {
    public readonly statusCode: number;
    public readonly details?: T;

    constructor(message: string, statusCode: number, details?: T) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;

        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}

export class BadRequestError extends AppError {
    constructor(message: string = 'Bad Request', details?: Record<string, unknown>) {
        super(message, 400, details);
    }
}

export class NotFoundError extends AppError {
    constructor(message: string = 'Not Found', details?: Record<string, unknown>) {
        super(message, 404, details);
    }
}

export class ConflictError extends AppError {
    constructor(message: string = 'Conflict', details?: Record<string, unknown>) {
        super(message, 409, details);
    }
}

export class RateLimitError extends AppError {
    constructor(message: string = 'Too Many Requests', details?: Record<string, unknown>) {
        super(message, 429, details);
    }
}

/**
 * Raised when a security-critical rate limit store is unavailable and the
 * deployment runs fail-closed. A 503 tells clients to back off and retry
 * rather than treating the request as rate-limited (429).
 */
export class RateLimitUnavailableError extends AppError {
    constructor(message: string = 'Rate limiting service temporarily unavailable', details?: Record<string, unknown>) {
        super(message, 503, details);
    }
}

export class AuthError extends AppError<AuthErrorDetails> {
    constructor(message: string, sessionError: AuthErrorDetails, statusCode: 403 | 401) {
        super(message, statusCode, sessionError);
    }
}

export class MfaAlreadyEnabledError extends ConflictError {
    constructor(details?: Record<string, unknown>) {
        super('MFA is already enabled for this user', details);
    }
}

export class MfaSetupExpiredError extends BadRequestError {
    constructor(details?: Record<string, unknown>) {
        super('MFA setup expired. Please start again.', details);
    }
}

export class MfaNotEnabledError extends BadRequestError {
    constructor(details?: Record<string, unknown>) {
        super('MFA is not enabled for this user', details);
    }
}

export class KeyQuotaExceededError extends ConflictError {
    constructor(details?: Record<string, unknown>) {
        super('Key record quota exceeded', details);
    }
}

export class TransitionError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 500, details);
    }
}
