import { AuthError } from '../../../utils/errors';
import { getInvalidMfaError } from './mfaErrors';
import { getMfaCodeKind } from './mfaCodeFormats';
import { verifyAndConsumeRecoveryCode } from './mfaRecoveryCodes';
import { verifyMfaTotpCode } from './verifyMfaTotpCode';

export const verifyMfaCode = async (
    userId: string,
    isSensitive: boolean,
    mfaCode?: unknown,
): Promise<string[] | undefined> => {
    if (typeof mfaCode !== 'string' || !mfaCode.trim()) {
        throw new AuthError('MFA code required', isSensitive ? { mfaRequiredSensitive: true } : { mfaRequired: true }, 403);
    }

    const normalizedMfaCode = mfaCode.trim();
    const codeKind = getMfaCodeKind(normalizedMfaCode);

    if (codeKind === 'recovery') {
        const recoveryCodesResult = await verifyAndConsumeRecoveryCode(userId, normalizedMfaCode);
        if (!recoveryCodesResult.valid) {
            throw getInvalidMfaError(isSensitive);
        }
        return recoveryCodesResult.newRecoveryCodes;
    }

    if (codeKind !== 'totp') {
        throw getInvalidMfaError(isSensitive);
    }

    if (await verifyMfaTotpCode(userId, normalizedMfaCode)) {
        return undefined;
    }

    throw getInvalidMfaError(isSensitive);
};
