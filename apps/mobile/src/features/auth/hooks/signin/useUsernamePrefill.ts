import { useEffect } from 'react';
import type { LastSignedInUser } from '../../../../types/types';

/**
 * Username prefill on the signin form: when the screen is focused and a last
 * signed-in user exists, the username field is prefilled from it. When the
 * remembered user disappears (e.g. account deletion or sign-out while the
 * screen is mounted), the prefilled username is cleared again.
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
        } else if (usernamePrefillHandledRef.current) {
            // The remembered user is gone (deleted account / sign-out): drop
            // whatever the prefill had filled so a deleted user's username
            // does not linger in the field.
            usernamePrefillHandledRef.current = false;
            setUsername('');
        }
    }, [isFocused, lastSignedInUser, setUsername, usernamePrefillHandledRef]);
};
