import { MFA_SETUP_EXPIRY_MINUTES, RECOVERY_CODE_COUNT } from '../../../core/constants';
import { auth } from '../../../infrastructure/firebase';
import { env } from '../../../config/env';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { MfaAlreadyEnabledError } from '../../../utils/errors';
import { UsernameIdentity } from '../../auth/identity/UsernameIdentity';
import { UserService } from '../../user/application/UserService';
import { createMfaTotp } from './mfaTotp';
import { getMfaSetupRef } from './mfaRefs';
import { consumeMfaSetupNonce } from './mfaSetupNonce';

export const setupMfa = async (
    userId: string,
    sessionFamilyId: string,
    nonce: unknown,
): Promise<{ secret: string; otpauthUrl: string; recoveryCodes: string[] }> => {
    const { mfaEnabled } = await UserService.getUserMfaState(userId);
    if (mfaEnabled) {
        throw new MfaAlreadyEnabledError();
    }

    // Fresh-auth proof: the single-use nonce must be valid and bound to this
    // user and session family, otherwise the secret/recovery codes are not
    // issued (API-SEC-006). Throws MfaSetupNonceError (401) on any failure.
    await consumeMfaSetupNonce(userId, sessionFamilyId, nonce);

    const user = await auth.getUser(userId);
    const label = UsernameIdentity.fromFirebaseEmail(user.email) ?? userId;
    const totp = createMfaTotp(label);
    const secret = totp.secret.base32;
    const recoveryCodes = CryptoUtils.generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const encrypted = CryptoUtils.encryptSecret(secret, env.mfaKek);

    await getMfaSetupRef(userId).set({
        encryptedSecret: encrypted.encryptedData,
        iv: encrypted.iv,
        tag: encrypted.tag,
        hashedRecoveryCodes: recoveryCodes.map(CryptoUtils.sha256),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + MFA_SETUP_EXPIRY_MINUTES * 60 * 1000),
    });

    return {
        secret,
        otpauthUrl: totp.toString(),
        recoveryCodes,
    };
};

