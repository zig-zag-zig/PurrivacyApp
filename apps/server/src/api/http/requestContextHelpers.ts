import { Request } from 'express';
import { AuthErrorDetails } from '../../core/types';
import { AuthError } from '../../utils/errors';

type UserMfaState = { mfaEnabled: boolean };
type ErrorDetails = Record<string, unknown> & {
    timestamp?: string;
    requestId?: string;
};

declare global {
    namespace Express {
        interface Request {
            deviceId?: string;
            sessionFamilyId?: string;
            userData?: UserMfaState;
            userId?: string;
        }

        interface Locals {
            errorDetails?: ErrorDetails | AuthErrorDetails;
            newRecoveryCodes?: string[];
            requestId?: string;
            startedAt?: number;
        }
    }
}

export const requireAuthenticatedUserId = (req: Request): string => {
    if (!req.userId) {
        throw new AuthError('Session authentication required', { sessionInvalid: true }, 401);
    }

    return req.userId;
};

export const requireSessionFamilyId = (req: Request): string => {
    if (!req.sessionFamilyId) {
        throw new AuthError('Session not found', { sessionInvalid: true }, 401);
    }

    return req.sessionFamilyId;
};

