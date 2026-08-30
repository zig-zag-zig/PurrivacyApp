import { RefreshTokenFamily, SessionResponse } from '../../../core/types';

export const buildSessionResponse = (
    accessToken: string,
    accessTokenExpiresAt: Date,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
    family: RefreshTokenFamily,
): SessionResponse => {
    return {
        accessToken,
        refreshToken,
        accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
        refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
        mfaTrusted: family.mfaTrusted === true,
        mfaEnabled: family.userHasMfa === true,
        sessionFamilyId: family.familyId,
    };
};

