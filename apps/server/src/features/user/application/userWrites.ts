import { auth, db } from '../../../infrastructure/firebase';
import { env } from '../../../config/env';
import { ConflictError, TransitionError } from '../../../utils/errors';
import { createLogger } from '../../../utils/logger';
import { NotificationService } from '../../notification/application/NotificationService';
import { EncryptedUserDataValidator } from '../domain/EncryptedUserDataValidator';
import { deleteUserEncryptedKeys, initializeUserEncryptedKeyRecords } from '../infrastructure/UserKeyRepository';
import { getUserRef, getUserWithFieldMask } from '../infrastructure/UserRepository';
import { deleteUserPushTokensFromDb } from '../../notification/infrastructure/pushTokenStore';
import { pepperRecoveryVerifierHash } from '../../auth/recovery/recoveryVerifierHash';
import { SessionRevocationService } from '../../session/application/SessionRevocationService';
import { executeTransition, TransitionStep } from '../../../core/transitions/transitionRunner';

const logger = createLogger('features.user.writes');

/**
 * True when the Firebase Admin Auth SDK reports that the identity is already
 * gone. Deleting a user account is idempotent, so a retried deletion that
 * finds no Firebase identity is still a success.
 */
const isAuthUserNotFoundError = (error: unknown): boolean => (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'auth/user-not-found'
);

const notifyUserDataChanged = (userId: string): void => {
    void NotificationService.sendDataOnlyNotificationSafe(userId, 'user', 'user update');
};

export const queueUserMfaEnabledUpdate = (
    batch: FirebaseFirestore.WriteBatch,
    userId: string,
    mfaEnabled: boolean,
): void => {
    batch.update(getUserRef(userId), { mfaEnabled });
};

export const createUser = async (
    user: unknown,
    userId: string,
): Promise<{ success: boolean }> => {
    const userRef = getUserRef(userId);
    const doc = await userRef.get();
    if (doc.exists) {
        throw new ConflictError('User already exists');
    }

    const sanitizedUser = EncryptedUserDataValidator.sanitizeUserForCreate(user, env.userMaxKeyRecords);
    const { keys, ...userDocument } = sanitizedUser;
    // Store the recovery verifier hash server-side peppered and versioned (API-SEC-010).
    userDocument.recoveryVerifierHash = pepperRecoveryVerifierHash(userDocument.recoveryVerifierHash);
    await userRef.create(userDocument);

    try {
        await initializeUserEncryptedKeyRecords(userId, keys);
    } catch (error) {
        await userRef.delete().catch((deleteError) => (
            logger.warn('failed to roll back user after key storage failure', { userId, deleteError })
        ));
        throw error;
    }

    notifyUserDataChanged(userId);
    return { success: true };
};

export const changeDekPassword = async (
    userId: string,
    value: unknown,
): Promise<{ success: boolean }> => {
    await getUserWithFieldMask(userId, ['mfaEnabled']);

    const sanitizedValue = EncryptedUserDataValidator.sanitizeSaltedEncryptedPayload(value, 'dekPassword');
    await getUserRef(userId).update({ dekPassword: sanitizedValue });

    notifyUserDataChanged(userId);
    return { success: true };
};

export const deleteUser = async (userId: string): Promise<void> => {
    // Ordered, idempotent steps (API-SEC-008): sessions are revoked first to
    // cut access, then user/MFA documents, then the RTDB key records and push
    // tokens, and finally the Firebase Auth identity. Deleting the identity
    // last keeps the operation retryable: if any earlier step fails, the user
    // can still authenticate to re-issue the request. Once the identity is
    // gone, every other record is already deleted, so no orphaned Firebase
    // account can remain. Each step is independently retryable, so a
    // partially failed deletion is completed by re-issuing the request. The
    // structured error identifies the remaining steps for logging and for
    // the caller.
    const steps: TransitionStep[] = [
        {
            name: 'revokeSessions',
            run: () => SessionRevocationService.revokeAllUserSessions(userId, true),
        },
        {
            name: 'deleteUserDocuments',
            run: async () => {
                const userRef = getUserRef(userId);
                const batch = db.batch();
                batch.delete(userRef.collection('security').doc('mfa'));
                batch.delete(userRef);
                await batch.commit();
            },
        },
        {
            name: 'deleteEncryptedKeys',
            run: () => deleteUserEncryptedKeys(userId),
        },
        {
            name: 'deletePushTokens',
            run: () => deleteUserPushTokensFromDb(userId),
        },
        {
            name: 'deleteFirebaseUser',
            run: async () => {
                try {
                    await auth.deleteUser(userId);
                } catch (error) {
                    // Idempotent retry: a previous attempt may already have
                    // removed the identity; a missing Firebase user must not
                    // turn a completed deletion into an error response.
                    if (isAuthUserNotFoundError(error)) {
                        return;
                    }
                    throw error;
                }
            },
        },
    ];

    const execution = await executeTransition(steps);

    if (execution.status === 'failed') {
        const remainingSteps = steps
            .map(step => step.name)
            .filter(name => !execution.completedSteps.includes(name));
        logger.error('user deletion partially failed; remaining steps must be retried', {
            userId,
            failedStep: execution.failedStep,
            completedSteps: execution.completedSteps,
            remainingSteps,
        });
        throw new TransitionError(
            'User deletion failed. Retry the request to complete the remaining cleanup steps.',
            {
                failedStep: execution.failedStep,
                completedSteps: execution.completedSteps,
                remainingSteps,
                retryable: true,
            },
        );
    }
};

const PASSPHRASE_STORAGE_FIELD = 'passphraseStorageEnabled';

export const setPassphraseStorage = async (
    userId: string,
    enabled: boolean,
    deviceId?: string,
): Promise<void> => {
    const userRef = getUserRef(userId);
    await userRef.update({ [PASSPHRASE_STORAGE_FIELD]: enabled });

    // Notify all user devices to re-fetch keys with updated passphrase state
    await NotificationService.sendDataOnlyNotificationSafe(
        userId,
        'user',
        'passphrase storage toggle',
        { enabled },
        { excludeDeviceId: deviceId },
    );
};
