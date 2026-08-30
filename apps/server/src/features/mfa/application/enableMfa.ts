import { db } from '../../../infrastructure/firebase';
import { env } from '../../../config/env';
import { UserMfaSecurity } from '../../../core/types';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import {
    AuthError,
    BadRequestError,
    MfaSetupExpiredError,
    NotFoundError,
} from '../../../utils/errors';
import { NotificationService } from '../../notification/application/NotificationService';
import { UserService } from '../../user/application/UserService';
import { getMfaSecurityRef, getMfaSetupRef } from './mfaRefs';
import { verifyMfaTotp } from './mfaTotp';


export const verifyAndEnableMfa = async (
    userId: string,
    code: string,
    currentDeviceId?: string,
): Promise<boolean> => {
    const setupDoc = await getMfaSetupRef(userId).get();
    if (!setupDoc.exists) {
        throw new NotFoundError('No MFA setup found. Please start setup again.');
    }

    const setupData = setupDoc.data()!;

    if (setupData.expiresAt.toDate() < new Date()) {
        await setupDoc.ref.delete();
        throw new MfaSetupExpiredError();
    }

    if (!/^\d{6}$/.test(code)) {
        throw new BadRequestError('Invalid code format. Please use a 6-digit TOTP code from your authenticator app. Recovery codes cannot be used to enable MFA.');
    }

    const secret = CryptoUtils.decryptSecret(
        setupData.encryptedSecret,
        setupData.iv,
        setupData.tag,
        env.mfaKek,
    );

    if (!verifyMfaTotp(secret, code)) {
        throw new AuthError('Invalid MFA code', { wrongMfaCode: true, mfaRequired: true }, 403);
    }

    const batch = db.batch();
    UserService.queueMfaEnabledUpdate(batch, userId, true);
    batch.set(getMfaSecurityRef(userId), {
        mfaSecret: setupData.encryptedSecret,
        mfaSecretIv: setupData.iv,
        mfaSecretTag: setupData.tag,
        mfaRecoveryCodes: setupData.hashedRecoveryCodes,
    } satisfies UserMfaSecurity);
    await batch.commit();

    await NotificationService.sendDataOnlyNotificationSafe(
        userId,
        'mfaState',
        'mfa enable',
        { mfaEnabled: true, mfaTrusted: false },
        { excludeDeviceId: currentDeviceId },
    );

    await setupDoc.ref.delete();
    return true;
};
