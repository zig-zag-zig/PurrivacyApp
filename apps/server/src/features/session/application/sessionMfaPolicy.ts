import { UNTRUSTED_MFA_MAX_AGE_MS } from '../../../core/constants';
import { RefreshTokenFamily, Session } from '../../../core/types';
import { isValidDate, toDate } from './firestoreDate';

const getMfaVerifiedAt = (family: RefreshTokenFamily): Date | null => {
    const mfaVerifiedAt = family.mfaVerifiedAt ? toDate(family.mfaVerifiedAt) : null;
    return isValidDate(mfaVerifiedAt) ? mfaVerifiedAt : null;
};

const isMfaVerificationFresh = (family: RefreshTokenFamily, now: Date): boolean => {
    const mfaVerifiedAt = getMfaVerifiedAt(family);
    if (!mfaVerifiedAt) {
        return false;
    }

    return now.getTime() - mfaVerifiedAt.getTime() <= UNTRUSTED_MFA_MAX_AGE_MS;
};

export const requiresMfaForRefresh = (
    family: RefreshTokenFamily,
    activeAccessSession: Session | null,
    now: Date,
): boolean => {
    if (family.userHasMfa !== true || family.mfaTrusted === true) {
        return false;
    }

    return !activeAccessSession || !isMfaVerificationFresh(family, now);
};
