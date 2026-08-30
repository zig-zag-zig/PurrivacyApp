import { ACCESS_TOKEN_LIFETIME_MS } from '../../../core/constants';
import { RefreshTokenFamily, Session } from '../../../core/types';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { deletePagedQueryResults } from '../../../infrastructure/firebase/chunkedWrites';
import { generateOpaqueToken, MAX_ACCESS_TOKEN_LENGTH } from './sessionTokenUtils';
import { isValidDate, toDate } from './firestoreDate';
import { sessionCollections } from './sessionCollections';

const getAccessTokenExpiresAt = (now: Date): Date => {
    return new Date(now.getTime() + ACCESS_TOKEN_LIFETIME_MS);
};

export const createAccessTokenForFamily = async (
    family: RefreshTokenFamily,
): Promise<{ accessToken: string; accessTokenExpiresAt: Date }> => {
    const accessToken = generateOpaqueToken();
    const accessTokenHash = CryptoUtils.sha256(accessToken);
    const now = new Date();
    const accessTokenExpiresAt = getAccessTokenExpiresAt(now);

    const sessionData: Session = {
        accessTokenHash,
        userId: family.userId,
        refreshTokenFamilyId: family.familyId,
        createdAt: now,
        expiresAt: accessTokenExpiresAt,
        userHasMfa: family.userHasMfa,
    };

    await sessionCollections.sessions.doc(accessTokenHash).set(sessionData);

    return { accessToken, accessTokenExpiresAt };
};

export const getValidActiveAccessSession = async (
    transaction: FirebaseFirestore.Transaction,
    currentAccessToken: string | undefined,
    family: RefreshTokenFamily,
    now: Date,
): Promise<Session | null> => {
    if (!currentAccessToken || currentAccessToken.length > MAX_ACCESS_TOKEN_LENGTH) {
        return null;
    }

    const accessTokenHash = CryptoUtils.sha256(currentAccessToken);
    const sessionRef = sessionCollections.sessions.doc(accessTokenHash);
    const sessionDoc = await transaction.get(sessionRef);
    if (!sessionDoc.exists) {
        return null;
    }

    const data = sessionDoc.data();
    if (!data) {
        return null;
    }

    const expiresAt = toDate(data.expiresAt);
    if (!isValidDate(expiresAt) || expiresAt <= now) {
        transaction.delete(sessionRef);
        return null;
    }

    if (data.userId !== family.userId || data.refreshTokenFamilyId !== family.familyId) {
        return null;
    }

    return {
        accessTokenHash,
        userId: data.userId,
        refreshTokenFamilyId: data.refreshTokenFamilyId,
        createdAt: toDate(data.createdAt),
        expiresAt,
        userHasMfa: data.userHasMfa,
    };
};

/**
 * Delete a refresh-token family and every record that belongs to it.
 *
 * Ordering note: the family document itself is deleted first. It is the
 * revocation point — `validateBackendSession` rejects access sessions whose
 * family document is missing, and refresh tokens can no longer resolve it —
 * so revocation takes effect immediately, before the (potentially large)
 * child-record sweep. Child records are then deleted in bounded, chunked
 * pages below the Firestore 500-write batch cap; leftover orphaned records
 * from a truncated sweep are harmless and are swept by later revocation or
 * cleanup runs.
 *
 * Idempotent by construction: deleting missing documents is a no-op.
 *
 * Returns the total number of documents deleted, including the family
 * document itself.
 */
export const deleteFamilyRecords = async (
    familyId: string,
    familyRef: FirebaseFirestore.DocumentReference,
): Promise<number> => {
    await familyRef.delete();

    let deletedCount = 1; // the family document itself

    const queries = [
        sessionCollections.sessions.where('refreshTokenFamilyId', '==', familyId),
        sessionCollections.refreshTokens.where('familyId', '==', familyId),
    ];

    for (const query of queries) {
        const result = await deletePagedQueryResults(query);
        deletedCount += result.deletedCount;
    }

    return deletedCount;
};

/**
 * Delete every refresh-token family (and its records) registered to the same
 * device that is not the newly created family. Each stale family is removed
 * via {@link deleteFamilyRecords}, so arbitrarily many stale families can be
 * swept without exceeding Firestore batch limits.
 *
 * Returns the total number of documents deleted.
 */
export const deleteStaleDeviceFamilies = async (
    userId: string,
    deviceId: string,
    newFamilyId: string,
): Promise<number> => {
    const familiesSnapshot = await sessionCollections.refreshTokenFamilies
        .where('deviceId', '==', deviceId)
        .get();

    const staleFamilyDocs = familiesSnapshot.docs.filter(doc => {
        const familyData = doc.data() as RefreshTokenFamily;
        return familyData.userId === userId && familyData.familyId !== newFamilyId;
    });

    let deletedCount = 0;
    for (const doc of staleFamilyDocs) {
        const familyData = doc.data() as RefreshTokenFamily;
        deletedCount += await deleteFamilyRecords(familyData.familyId || doc.id, doc.ref);
    }

    return deletedCount;
};
