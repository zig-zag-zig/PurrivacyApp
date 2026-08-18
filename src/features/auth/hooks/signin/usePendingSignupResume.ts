import { useEffect } from 'react';
import { consumePendingSignup, PendingSignupPayload } from '../../../../native/autofillCommit';
import { pendingSignupSession } from '../../services/pendingSignupSession';
import type { RootNavigationProps } from '../../../../app/navigation/types';

/**
 * Post-restart signup resume (APP-SEC-007): after the Android activity
 * restart, the signup secrets are consumed from the Keystore-encrypted
 * envelope and re-entered into the in-process pendingSignupSession.
 * Navigation carries no secrets.
 */
export const resumePendingSignupAfterRestart = async (deps: {
    consume: () => Promise<PendingSignupPayload | null>;
    setSession: (payload: PendingSignupPayload) => void;
    navigate: (route: 'SignupSeedVerification') => void;
}): Promise<void> => {
    const data = await deps.consume();
    if (!data) {
        return;
    }
    deps.setSession(data);
    deps.navigate('SignupSeedVerification');
};

export const usePendingSignupResume = (navigation: RootNavigationProps): void => {
    useEffect(() => {
        void resumePendingSignupAfterRestart({
            consume: consumePendingSignup,
            setSession: (payload) => pendingSignupSession.set(payload),
            navigate: (route) => navigation.navigate(route),
        });
    }, [navigation]);
};
