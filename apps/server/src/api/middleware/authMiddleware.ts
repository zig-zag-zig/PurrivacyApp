import { Request, Response, NextFunction } from 'express';
import { validateBackendSession } from '../../features/session/application/validateSession';
import { deleteAccessSession } from '../../features/session/application/sessionDeletion';
import { markSessionFamilyMfaVerified } from '../../features/session/application/sessionFamilyMutations';
import { verifyMfaCode } from '../../features/mfa/application/verifyMfaCode';
import { AuthSessionService } from '../../features/session/application/AuthSessionService';
import { UserService } from '../../features/user/application/UserService';
import { AppError, AuthError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';
import { getBearerToken } from '../http/requestParsing';
import { requireAuthenticatedUserId } from '../http/requestContextHelpers';

const logger = createLogger('api.auth');

/**
 * Express middleware for session-based authentication with optional MFA verification.
 */
export function authenticate(method: 'firebase' | 'session' | 'sessionSensitive') {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (method === "firebase") {
                const userId = await AuthSessionService.extractUserIdFromToken(req.headers.authorization);
                req.userId = userId;
                next();
                return;
            }

            const accessToken = getBearerToken(req.headers.authorization);
            if (!accessToken) {
                throw new AuthError('Bearer access token was not provided', { sessionHeaderMissing: true }, 401);
            }

            const session = await validateBackendSession(accessToken);
            req.userId = session.userId;
            req.sessionFamilyId = session.refreshTokenFamilyId;

            try {
                req.userData = await UserService.getUserMfaState(session.userId);
            } catch (error) {
                if (error instanceof AppError && error.statusCode === 404) {
                    await deleteAccessSession(accessToken);
                }
                throw error;
            }

            if (method === "session") {
                next();
                return;
            }

            await verifySensitiveMfa(req, res, next);
        } catch (error) {
            logger.warn('session authentication failed', {
                requestId: res.locals.requestId,
                path: req.path,
                method: req.method,
                error,
            });
            next(error);
        }
    };
}

export async function verifySensitiveMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const userId = requireAuthenticatedUserId(req);

        let userData = req.userData;
        if (!userData) {
            userData = await UserService.getUserMfaState(userId);
            req.userData = userData;
        }

        if (userData.mfaEnabled !== true) {
            next();
            return;
        }

        res.locals.newRecoveryCodes = await verifyMfaCode(userId, true, req.body.mfaCode);
        const sessionFamilyId = req.sessionFamilyId;
        if (sessionFamilyId) {
            await markSessionFamilyMfaVerified(sessionFamilyId, userId);
        }
        next();
    } catch (error) {
        logger.warn('sensitive mfa verification failed', {
            requestId: res.locals.requestId,
            path: req.path,
            method: req.method,
            userId: req.userId,
            error,
        });
        next(error);
    }
}
