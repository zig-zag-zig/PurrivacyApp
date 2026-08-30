import { SESSION_ID_BYTES } from '../../../core/constants';
import { BadRequestError, AuthError } from '../../../utils/errors';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { GeneratedRefreshToken } from './sessionTypes';

export const TOKEN_ID_HEX_LENGTH = SESSION_ID_BYTES * 2;
export const MAX_ACCESS_TOKEN_LENGTH = 1024;

const MAX_DEVICE_ID_LENGTH = 256;

export const generateOpaqueToken = (): string => {
    return CryptoUtils.randomBase64Url(SESSION_ID_BYTES);
};

export const generateRefreshToken = (): GeneratedRefreshToken => {
    const tokenId = CryptoUtils.randomHex(TOKEN_ID_HEX_LENGTH);
    const secret = CryptoUtils.randomBase64Url(SESSION_ID_BYTES);
    const rawToken = `${tokenId}.${secret}`;

    return {
        tokenId,
        rawToken,
        tokenHash: CryptoUtils.sha256(rawToken),
    };
};

export const parseRefreshTokenId = (refreshToken: string): string => {
    const parts = typeof refreshToken === 'string' ? refreshToken.split('.') : [];
    const [tokenId, secret] = parts;

    if (
        parts.length !== 2 ||
        !tokenId ||
        !secret ||
        tokenId.length !== TOKEN_ID_HEX_LENGTH ||
        !/^[0-9a-f]+$/i.test(tokenId) ||
        !/^[A-Za-z0-9_-]+$/.test(secret)
    ) {
        throw new AuthError('Invalid refresh token', { refreshTokenInvalid: true }, 401);
    }

    return tokenId;
};

export const normalizeDeviceId = (deviceId?: string): string | undefined => {
    if (deviceId === undefined) {
        return undefined;
    }

    const normalized = deviceId.trim();
    if (!normalized) {
        return undefined;
    }

    if (normalized.length > MAX_DEVICE_ID_LENGTH) {
        throw new BadRequestError('Invalid input: deviceId is too long.');
    }

    return normalized;
};

