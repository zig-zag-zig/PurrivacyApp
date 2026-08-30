import { db } from '../../../infrastructure/firebase';
import { REFRESH_TOKEN_LIFETIME_MS } from '../../../core/constants';
import { RefreshToken, RefreshTokenFamily, SessionResponse } from '../../../core/types';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { createLogger } from '../../../utils/logger';
import { sessionCollections } from './sessionCollections';
import { buildSessionResponse } from './sessionResponse';
import { createAccessTokenForFamily, deleteStaleDeviceFamilies } from './sessionRecordStore';
import { CreateSessionOptions } from './sessionTypes';
import {
    generateRefreshToken,
    normalizeDeviceId,
    TOKEN_ID_HEX_LENGTH,
} from './sessionTokenUtils';

const logger = createLogger('features.session.create');

export const createBackendSession = async (
    userId: string,
    options: CreateSessionOptions = {},
): Promise<SessionResponse> => {
    const familyId = CryptoUtils.randomHex(TOKEN_ID_HEX_LENGTH);
    const refreshToken = generateRefreshToken();
    const now = new Date();
    const refreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS);
    const mfaTrusted = options.userHasMfa === true && options.mfaTrusted === true;
    const deviceId = normalizeDeviceId(options.deviceId);

    const family: RefreshTokenFamily = {
        familyId,
        userId,
        ...(deviceId ? { deviceId } : {}),
        createdAt: now,
        lastUsedAt: now,
        expiresAt: refreshTokenExpiresAt,
        userHasMfa: options.userHasMfa === true,
        mfaTrusted,
        mfaVerifiedAt: options.userHasMfa === true ? now : null,
        label: options.label,
        platform: options.platform,
    };

    const refreshTokenData: RefreshToken = {
        tokenId: refreshToken.tokenId,
        familyId,
        userId,
        tokenHash: refreshToken.tokenHash,
        createdAt: now,
        expiresAt: refreshTokenExpiresAt,
    };

    // The new family and refresh token are committed first in one small
    // atomic batch (always well below the Firestore 500-write cap), so
    // session creation cannot fail because a device accumulated many stale
    // families.
    const batch = db.batch();
    batch.set(sessionCollections.refreshTokenFamilies.doc(familyId), family);
    batch.set(sessionCollections.refreshTokens.doc(refreshToken.tokenId), refreshTokenData);
    await batch.commit();

    if (deviceId && options.sweepStaleFamilies !== false) {
        // Stale families for the same device are swept afterwards in bounded,
        // chunked pages. A failure here must not fail the login: the sweep is
        // best-effort and is retried on the next session creation for the
        // device. MFA state transitions opt out (sweepStaleFamilies: false)
        // so the CURRENT family survives a failed code verification.
        try {
            await deleteStaleDeviceFamilies(userId, deviceId, familyId);
        } catch (error) {
            logger.warn('stale device family cleanup failed; will be retried on next session creation', {
                userId,
                deviceId,
                error,
            });
        }
    }

    const access = await createAccessTokenForFamily(family);

    return buildSessionResponse(
        access.accessToken,
        access.accessTokenExpiresAt,
        refreshToken.rawToken,
        refreshTokenExpiresAt,
        family,
    );
};

