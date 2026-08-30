import * as admin from 'firebase-admin';
import { RefreshTokenFamily } from '../../../core/types';
import { AuthError } from '../../../utils/errors';
import { sessionCollections } from './sessionCollections';
import { deleteFamilyRecords } from './sessionRecordStore';

const getOwnedFamilyRef = async (familyId: string, userId: string) => {
    if (!familyId) {
        throw new AuthError('Session not found', { sessionInvalid: true }, 401);
    }

    const familyRef = sessionCollections.refreshTokenFamilies.doc(familyId);
    const familyDoc = await familyRef.get();

    if (!familyDoc.exists) {
        throw new AuthError('Session not found', { sessionInvalid: true }, 401);
    }

    const familyData = familyDoc.data() as RefreshTokenFamily;
    if (familyData.userId !== userId || familyData.revokedAt) {
        throw new AuthError('Session invalid', { sessionInvalid: true }, 401);
    }

    return { familyRef, familyData };
};

export const setSessionFamilyMfaTrust = async (
    familyId: string,
    userId: string,
    mfaTrusted: boolean,
): Promise<{ mfaTrusted: boolean }> => {
    const { familyRef, familyData } = await getOwnedFamilyRef(familyId, userId);
    const now = new Date();
    const nextMfaTrusted = familyData.userHasMfa === true && mfaTrusted === true;

    await familyRef.update({
        mfaTrusted: nextMfaTrusted,
        mfaVerifiedAt: familyData.userHasMfa === true
            ? now
            : admin.firestore.FieldValue.delete(),
        mfaSessionExpiresAt: admin.firestore.FieldValue.delete(),
        lastUsedAt: now,
    });

    return { mfaTrusted: nextMfaTrusted };
};

export const markSessionFamilyMfaVerified = async (
    familyId: string,
    userId: string,
): Promise<void> => {
    const { familyRef, familyData } = await getOwnedFamilyRef(familyId, userId);

    await familyRef.update({
        mfaVerifiedAt: familyData.userHasMfa === true
            ? new Date()
            : admin.firestore.FieldValue.delete(),
        mfaSessionExpiresAt: admin.firestore.FieldValue.delete(),
    });
};

export const revokeSessionFamily = async (
    familyId: string,
    userId: string,
): Promise<void> => {
    const familyRef = sessionCollections.refreshTokenFamilies.doc(familyId);
    const familyDoc = await familyRef.get();

    if (!familyDoc.exists) {
        return;
    }

    const familyData = familyDoc.data() as RefreshTokenFamily;
    if (familyData.userId !== userId) {
        throw new AuthError('Session invalid', { sessionInvalid: true }, 401);
    }

    // The family document is deleted first (revocation point), then its
    // child records are swept in bounded, chunked pages below the Firestore
    // 500-write batch cap.
    await deleteFamilyRecords(familyId, familyRef);
};

