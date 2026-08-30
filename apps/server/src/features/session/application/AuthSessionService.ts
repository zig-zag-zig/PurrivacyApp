import { auth } from '../../../infrastructure/firebase';
import { verifyMfaCode } from '../../mfa/application/verifyMfaCode';
import { createBackendSession } from './createSession';
import { rotateBackendRefreshToken } from './rotateRefreshToken';
import { UserService } from '../../user/application/UserService';
import { SessionResponse } from '../../../core/types';
import { AuthError } from '../../../utils/errors';

interface CreateSessionRequest {
    mfaCode?: string;
    mfaTrusted?: boolean;
    label?: string;
    platform?: string;
    deviceId?: string;
}

/**
 * Service for handling authentication session creation and refresh
 */
export class AuthSessionService {
    /**
     * Extract and verify Firebase ID token from Authorization header
     */
    static async extractUserIdFromToken(authHeader: string | undefined): Promise<string> {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AuthError('Bearer authentication header with the token was not provided', { bearerHeaderMissing: true }, 401);
        }

        const idToken = authHeader.split('Bearer ')[1];
        try {
            const decodedToken = await auth.verifyIdToken(idToken, true);
            return decodedToken.uid;
        } catch {
            throw new AuthError('Invalid bearer token', { bearerTokenInvalid: true }, 401);
        }
    }

    /**
     * Create a new session for a user (main logic from authController POST /session)
     */
    static async createSession(
        userId: string,
        request: CreateSessionRequest = {}
    ): Promise<{ sessionResponse: SessionResponse; newRecoveryCodes?: string[] }> {
        const { mfaEnabled } = await UserService.getUserMfaState(userId);
        let mfaTrusted = false;
        let newRecoveryCodes: string[] | undefined;

        if (mfaEnabled) {
            newRecoveryCodes = await verifyMfaCode(userId, false, request.mfaCode);
            mfaTrusted = request.mfaTrusted === true;
        }

        const sessionResponse = await createBackendSession(userId, {
            userHasMfa: mfaEnabled,
            mfaTrusted,
            label: request.label,
            platform: request.platform,
            deviceId: request.deviceId,
        });

        return { sessionResponse, newRecoveryCodes };
    }

    /**
     * Refresh an existing session (main logic from authController POST /session/refresh)
     */
    static async refreshSession(
        refreshToken: string,
        currentAccessToken?: string
    ): Promise<SessionResponse> {
        return rotateBackendRefreshToken(refreshToken, currentAccessToken);
    }
}
