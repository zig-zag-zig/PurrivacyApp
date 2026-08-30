import { auth } from '../../../infrastructure/firebase';
import { deleteAllUserSessions } from './sessionDeletion';
import { NotificationService } from '../../notification/application/NotificationService';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('features.session.revocation');

/**
 * Revoke the Firebase refresh tokens for a user with a single retry.
 * Failure to revoke is logged but never thrown: the backend session records
 * are already deleted at this point, and Firebase tokens expire on their
 * own lifetime. Throwing here would turn a successful revocation into an
 * error response for no security benefit.
 */
const revokeFirebaseTokensWithRetry = async (userId: string): Promise<void> => {
    try {
        await auth.revokeRefreshTokens(userId);
    } catch (error) {
        logger.warn('firebase refresh token revocation failed; retrying once', { userId, error });
        await auth.revokeRefreshTokens(userId);
    }
};

/**
 * Service for handling session revocation and user logout operations
 */
export class SessionRevocationService {
    /**
     * Delete all sessions for a user and send session revoked notification.
     *
     * Backend record deletion is the source of truth for revocation, and its
     * failure is surfaced to the caller (the operation is safe to retry —
     * deletions are idempotent). Once the records are gone, the remaining
     * steps — Firebase refresh-token revocation (with one retry) and the
     * data-only notification — are best-effort and never throw, so a
     * notification or Firebase failure cannot turn a completed revocation
     * into an error response.
     *
     * `excludeFamilyId` keeps one refresh-token family (and its session
     * records) alive; MFA state transitions use it to preserve the newly
     * created post-transition session while revoking everything else.
     */
    static async revokeAllUserSessions(
        userId: string,
        revokeFbTokenAndSendDataOnlyNotification: boolean,
        options: { excludeFamilyId?: string } = {},
    ): Promise<void> {
        await deleteAllUserSessions(userId, options);

        if (!revokeFbTokenAndSendDataOnlyNotification) {
            logger.info('all user sessions revoked', { userId });
            return;
        }

        try {
            await revokeFirebaseTokensWithRetry(userId);
        } catch (error) {
            logger.error('firebase refresh token revocation failed after retry; tokens remain valid until expiry', {
                userId,
                error,
            });
        }

        try {
            await NotificationService.sendDataOnlyNotificationSafe(
                userId,
                'sessionRevoked',
                'session revoked',
            );
        } catch (error) {
            // Defense in depth: even if the safe wrapper itself is bypassed or
            // replaced, a notification failure must never fail a revocation.
            logger.warn('session revoked notification failed', { userId, error });
        }

        logger.info('all user sessions revoked', { userId });
    }
}
