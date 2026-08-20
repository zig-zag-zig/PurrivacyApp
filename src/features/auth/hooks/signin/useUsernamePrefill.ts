import { useEffect } from 'react';
import type { LastSignedInUser } from '../../../../types/types';

/**
 * Username prefill on the signin form: when the screen is focused and a last
 * signed-in user exists, the username field is prefilled from it.
 */
export const getUsernamePrefill = (
    isFocused: boolean,
    lastSignedInUser: LastSignedInUser | null,
): string | null => (isFocused && lastSignedInUser?.username ? lastSignedInUser.username : null);

export const useUsernamePrefill = (
    isFocused: boolean,
    lastSignedInUser: LastSignedInUser | null,
    setUsername: (value: string) => void,
    usernamePrefillHandledRef: { current: boolean },
): void => {
    useEffect(() => {
        const prefill = getUsernamePrefill(isFocused, lastSignedInUser);
        if (prefill !== null) {
            usernamePrefillHandledRef.current = true;
            setUsername(prefill);
        }
    }, [isFocused, lastSignedInUser, setUsername, usernamePrefillHandledRef]);
};
