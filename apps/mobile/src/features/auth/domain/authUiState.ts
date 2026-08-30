import type { LastSignedInUser } from '../../../types/types';

export const shouldShowUnlockScreen = (
    isLocalSessionLocked: boolean,
    lastSignedInUser: LastSignedInUser | null,
): boolean => isLocalSessionLocked && Boolean(lastSignedInUser?.username);
