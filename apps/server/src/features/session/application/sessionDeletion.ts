import { CryptoUtils } from '../../../utils/cryptoUtils';
import { deletePagedQueryResults } from '../../../infrastructure/firebase/chunkedWrites';
import { sessionCollections } from './sessionCollections';

export const deleteAccessSession = async (accessToken: string): Promise<void> => {
    await sessionCollections.sessions.doc(CryptoUtils.sha256(accessToken)).delete();
};

/**
 * Delete every session, refresh token and refresh-token family record for a
 * user, optionally keeping the records of one refresh-token family (used by
 * MFA state transitions that create the post-transition session before
 * revoking the old ones). Records are deleted in bounded, chunked pages so
 * the operation works regardless of how many records have accumulated
 * (Firestore batches cap at 500 writes). Idempotent by construction: a
 * second run simply deletes what remains.
 *
 * The excluded family's records are filtered IN CODE rather than with a
 * `where(familyId, '!=', ...)` query: `!=` requires a composite Firestore
 * index in production (silently missing = every revoke fails with
 * FAILED_PRECONDITION), while the emulator does not enforce indexes at all.
 */
export const deleteAllUserSessions = async (
    userId: string,
    options: { excludeFamilyId?: string } = {},
): Promise<number> => {
    const { excludeFamilyId } = options;

    // Per-collection family field names: sessions carry refreshTokenFamilyId,
    // the token/family collections carry familyId.
    const familyFieldByCollection: Record<string, string> = {
        sessions: 'refreshTokenFamilyId',
        refreshTokens: 'familyId',
        refreshTokenFamilies: 'familyId',
    };

    let deletedCount = 0;
    for (const [name, collection] of Object.entries(sessionCollections)) {
        const familyField = familyFieldByCollection[name];
        const result = await deletePagedQueryResults(
            collection.where('userId', '==', userId),
            {
                filter: excludeFamilyId
                    ? (doc) => doc.get(familyField) !== excludeFamilyId
                    : undefined,
            },
        );
        deletedCount += result.deletedCount;
    }

    return deletedCount;
};
