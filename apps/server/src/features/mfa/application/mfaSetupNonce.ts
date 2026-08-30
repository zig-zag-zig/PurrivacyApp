import { db } from '../../../infrastructure/firebase';
import { sessionCollections } from '../../session/application/sessionCollections';
import { isValidDate, toDate } from '../../session/application/firestoreDate';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { AuthError } from '../../../utils/errors';
import { NotificationService } from '../../notification/application/NotificationService';
import { UserService } from '../../user/application/UserService';
import { getMfaSetupNonceRef } from './mfaRefs';
import { FreshAuthRequiredError, MfaSetupNonceError } from './mfaErrors';
import { verifyMfaCode } from './verifyMfaCode';

/**
 * Fresh-authentication proof for MFA enrollment (API-SEC-006).
 *
 * MFA setup returns a TOTP secret and recovery codes, so it must not be
 * reachable with a long-lived stolen session token alone. A client therefore
 * first mints a short-lived, single-use nonce that proves recent primary
 * authentication (the session family was created within FRESH_SESSION_WINDOW_MS
 * by a Firebase-authenticated login), or — when MFA is already enabled — proves
 * current MFA possession with a valid code. POST /mfa/setup then requires this
 * nonce, bound to the same user and session family.
 */

export const MFA_SETUP_NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FRESH_SESSION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MFA_SETUP_NONCE_MIN_LENGTH = 32;
const MFA_SETUP_NONCE_MAX_LENGTH = 128;

interface MfaSetupNonceRecord {
    userId: string;
    sessionFamilyId: string;
    createdAt: Date;
    expiresAt: Date;
    consumedAt: Date | null;
}

const getFamilyCreatedAt = (family: FirebaseFirestore.DocumentData | undefined): Date | null => {
    const createdAt = toDate(family?.createdAt);
    return isValidDate(createdAt) ? createdAt : null;
};

const assertFamilyFreshOrMfaProved = async (
    userId: string,
    sessionFamilyId: string,
    mfaCode?: string,
): Promise<void> => {
    const familyRef = sessionCollections.refreshTokenFamilies.doc(sessionFamilyId);
    const familyDoc = await familyRef.get();

    if (!familyDoc.exists) {
        throw new AuthError('Invalid session family', { sessionInvalid: true }, 401);
    }

    const family = familyDoc.data();
    if (!family || family.userId !== userId) {
        throw new AuthError('Invalid session family', { sessionInvalid: true }, 401);
    }

    const familyCreatedAt = getFamilyCreatedAt(family);
    const isFresh = familyCreatedAt !== null
        && Date.now() - familyCreatedAt.getTime() <= FRESH_SESSION_WINDOW_MS;

    if (isFresh) {
        return;
    }

    const { mfaEnabled } = await UserService.getUserMfaState(userId);
    if (!mfaEnabled) {
        throw new FreshAuthRequiredError();
    }

    // MFA is enabled: require current MFA proof (TOTP or recovery code) before
    // allowing enrollment to start. Throws a 403 AuthError on missing/wrong codes.
    await verifyMfaCode(userId, true, mfaCode);
};

/**
 * Mint a short-lived, single-use nonce that proves fresh primary authentication.
 * The nonce is bound to (userId, sessionFamilyId) and stored only as a hash.
 */
export const mintMfaSetupNonce = async (
    userId: string,
    sessionFamilyId: string,
    mfaCode?: string,
): Promise<{ nonce: string; expiresAt: string }> => {
    await assertFamilyFreshOrMfaProved(userId, sessionFamilyId, mfaCode);

    const nonce = CryptoUtils.randomBase64Url(32);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MFA_SETUP_NONCE_TTL_MS);

    await getMfaSetupNonceRef(CryptoUtils.sha256(nonce)).set({
        userId,
        sessionFamilyId,
        createdAt: now,
        expiresAt,
        consumedAt: null,
    } satisfies MfaSetupNonceRecord);

    // Best-effort: never block nonce minting on notification delivery.
    await NotificationService.sendDataOnlyNotificationSafe(
        userId,
        'mfaEnrollmentStarted',
        'mfa enrollment started',
        { mfaEnrollmentStarted: true },
    );

    return { nonce, expiresAt: expiresAt.toISOString() };
};

/**
 * Verify and atomically consume a setup nonce. Single-use enforcement runs in a
 * Firestore transaction so concurrent replays cannot both succeed. Throws
 * MfaSetupNonceError (401) for missing, malformed, expired, replayed, or
 * non-matching nonces.
 */
export const consumeMfaSetupNonce = async (
    userId: string,
    sessionFamilyId: string,
    nonce: unknown,
): Promise<void> => {
    if (
        typeof nonce !== 'string'
        || nonce.length < MFA_SETUP_NONCE_MIN_LENGTH
        || nonce.length > MFA_SETUP_NONCE_MAX_LENGTH
    ) {
        throw new MfaSetupNonceError();
    }

    const nonceRef = getMfaSetupNonceRef(CryptoUtils.sha256(nonce));

    await db.runTransaction(async (transaction) => {
        const nonceDoc = await transaction.get(nonceRef);
        if (!nonceDoc.exists) {
            throw new MfaSetupNonceError();
        }

        const data = nonceDoc.data() as MfaSetupNonceRecord | undefined;
        if (!data) {
            throw new MfaSetupNonceError();
        }

        if (data.userId !== userId || data.sessionFamilyId !== sessionFamilyId) {
            throw new MfaSetupNonceError();
        }

        if (data.consumedAt) {
            throw new MfaSetupNonceError();
        }

        const expiresAt = toDate(data.expiresAt);
        if (!isValidDate(expiresAt) || expiresAt.getTime() <= Date.now()) {
            throw new MfaSetupNonceError();
        }

        transaction.update(nonceRef, { consumedAt: new Date() });
    });
};
