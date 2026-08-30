import * as admin from 'firebase-admin';
import { db } from '../../../infrastructure/firebase';
import { REFRESH_TOKEN_LIFETIME_MS } from '../../../core/constants';
import { RefreshToken, RefreshTokenFamily, SessionResponse } from '../../../core/types';
import { AuthError } from '../../../utils/errors';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { requiresMfaForRefresh } from './sessionMfaPolicy';
import { buildSessionResponse } from './sessionResponse';
import { createAccessTokenForFamily, getValidActiveAccessSession } from './sessionRecordStore';
import { sessionCollections } from './sessionCollections';
import { toDate } from './firestoreDate';
import { generateRefreshToken, parseRefreshTokenId } from './sessionTokenUtils';

export const rotateBackendRefreshToken = async (
    refreshToken: string,
    currentAccessToken?: string,
): Promise<SessionResponse> => {
    if (!refreshToken) {
        throw new AuthError('Refresh token was not provided', { refreshTokenMissing: true }, 401);
    }

    const tokenId = parseRefreshTokenId(refreshToken);
    const incomingHash = CryptoUtils.sha256(refreshToken);
    const newRefreshToken = generateRefreshToken();
    const now = new Date();
    const refreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS);

    const result = await db.runTransaction(async transaction => {
        const tokenRef = sessionCollections.refreshTokens.doc(tokenId);
        const tokenDoc = await transaction.get(tokenRef);

        if (!tokenDoc.exists) {
            throw new AuthError('Invalid refresh token', { refreshTokenInvalid: true }, 401);
        }

        const tokenData = tokenDoc.data() as RefreshToken;

        if (!tokenData.tokenHash || !CryptoUtils.timingSafeEqual(tokenData.tokenHash, incomingHash)) {
            throw new AuthError('Invalid refresh token', { refreshTokenInvalid: true }, 401);
        }

        const familyRef = sessionCollections.refreshTokenFamilies.doc(tokenData.familyId);
        const familyDoc = await transaction.get(familyRef);

        if (!familyDoc.exists) {
            throw new AuthError('Invalid refresh token family', { refreshTokenInvalid: true }, 401);
        }

        const familyData = familyDoc.data() as RefreshTokenFamily;
        const tokenExpiresAt = toDate(tokenData.expiresAt);
        const familyExpiresAt = toDate(familyData.expiresAt);
        const activeAccessSession = await getValidActiveAccessSession(
            transaction,
            currentAccessToken,
            familyData,
            now,
        );

        if (tokenData.usedAt || tokenData.revokedAt) {
            transaction.update(familyRef, { revokedAt: now, lastUsedAt: now });
            return {
                error: new AuthError('Refresh token was reused', { refreshTokenInvalid: true, refreshTokenReuse: true }, 401),
            };
        }

        if (familyData.revokedAt) {
            throw new AuthError('Refresh token family revoked', { refreshTokenInvalid: true }, 401);
        }

        if (tokenExpiresAt < now || familyExpiresAt < now) {
            transaction.delete(tokenRef);
            transaction.delete(familyRef);
            return {
                error: new AuthError('Refresh token expired', { refreshTokenExpired: true, refreshTokenInvalid: true }, 401),
            };
        }

        if (requiresMfaForRefresh(familyData, activeAccessSession, now)) {
            throw new AuthError('MFA required', { mfaRequired: true }, 403);
        }

        const newTokenData: RefreshToken = {
            tokenId: newRefreshToken.tokenId,
            familyId: familyData.familyId,
            userId: familyData.userId,
            tokenHash: newRefreshToken.tokenHash,
            createdAt: now,
            expiresAt: refreshTokenExpiresAt,
        };

        const updatedFamily: RefreshTokenFamily = {
            ...familyData,
            lastUsedAt: now,
            expiresAt: refreshTokenExpiresAt,
        };

        transaction.update(tokenRef, {
            usedAt: now,
            replacedByTokenId: newRefreshToken.tokenId,
        });
        transaction.set(sessionCollections.refreshTokens.doc(newRefreshToken.tokenId), newTokenData);
        transaction.update(familyRef, {
            lastUsedAt: now,
            expiresAt: refreshTokenExpiresAt,
            mfaSessionExpiresAt: admin.firestore.FieldValue.delete(),
        });

        return { family: updatedFamily };
    });

    if ('error' in result) {
        throw result.error;
    }

    const access = await createAccessTokenForFamily(result.family);

    return buildSessionResponse(
        access.accessToken,
        access.accessTokenExpiresAt,
        newRefreshToken.rawToken,
        refreshTokenExpiresAt,
        result.family,
    );
};

