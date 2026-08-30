import { env } from '../../../config/env';
import { UserMfaSecurity } from '../../../core/types';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { MfaNotEnabledError } from '../../../utils/errors';
import { UserService } from '../../user/application/UserService';
import { getMfaSecurityRef } from './mfaRefs';
import { verifyMfaTotp } from './mfaTotp';

export const verifyMfaTotpCode = async (
    userId: string,
    mfaCode: string,
): Promise<boolean> => {
    const { mfaEnabled } = await UserService.getUserMfaState(userId);
    if (!mfaEnabled) {
        throw new MfaNotEnabledError();
    }

    const mfaSecurityDoc = await getMfaSecurityRef(userId).get();
    const mfaSecurity = mfaSecurityDoc.data() as UserMfaSecurity | undefined;
    if (!mfaSecurity?.mfaSecret || !mfaSecurity.mfaSecretIv || !mfaSecurity.mfaSecretTag) {
        return false;
    }

    const secret = CryptoUtils.decryptSecret(
        mfaSecurity.mfaSecret,
        mfaSecurity.mfaSecretIv,
        mfaSecurity.mfaSecretTag,
        env.mfaKek,
    );

    return verifyMfaTotp(secret, mfaCode);
};

