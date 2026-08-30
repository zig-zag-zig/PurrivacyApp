import { Session } from '../../../core/types';
import { AuthError } from '../../../utils/errors';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { toDate } from './firestoreDate';
import { sessionCollections } from './sessionCollections';

export const validateBackendSession = async (accessToken: string): Promise<Session> => {
    const accessTokenHash = CryptoUtils.sha256(accessToken);
    const sessionDoc = await sessionCollections.sessions.doc(accessTokenHash).get();

    if (!sessionDoc.exists) {
        throw new AuthError('Access token not found', { accessTokenInvalid: true, sessionInvalid: true }, 401);
    }

    const data = sessionDoc.data();
    if (!data) {
        throw new AuthError('Access token data missing', { accessTokenInvalid: true, sessionInvalid: true }, 401);
    }

    const now = new Date();
    const expiresAt = toDate(data.expiresAt);

    if (expiresAt < now) {
        await sessionDoc.ref.delete();
        throw new AuthError('Access token expired', { accessTokenExpired: true, sessionExpired: true }, 401);
    }

    const familyDoc = await sessionCollections.refreshTokenFamilies.doc(data.refreshTokenFamilyId).get();
    if (!familyDoc.exists || familyDoc.data()?.revokedAt) {
        await sessionDoc.ref.delete();
        throw new AuthError('Session revoked', { accessTokenInvalid: true, sessionInvalid: true }, 401);
    }

    return {
        accessTokenHash: data.accessTokenHash,
        userId: data.userId,
        refreshTokenFamilyId: data.refreshTokenFamilyId,
        createdAt: toDate(data.createdAt),
        expiresAt,
        userHasMfa: data.userHasMfa,
    };
};

