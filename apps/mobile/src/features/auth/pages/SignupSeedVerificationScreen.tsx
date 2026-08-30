import React from 'react';
import { useNavigation } from '@react-navigation/native';

import { RootNavigationProps } from '../../../app/navigation/types';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../../../app/state/ToastContext';
import { SeedVerification } from '../components/SeedVerification';
import { ERROR_MESSAGES, getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { logger } from '../../../utils/logger';
import { sanitizeUsernameInput } from '../domain/usernameIdentity';
import { pendingSignupSession } from '../services/pendingSignupSession';

/**
 * Verifies the generated recovery seed, then completes signup. The secrets
 * come from the in-process pendingSignupSession coordinator (APP-SEC-007),
 * never from route params, and are cleared on every exit path.
 */
export const SignupSeedVerificationScreen = () => {
    const navigation = useNavigation<RootNavigationProps>();
    const { signUp, isAuthLoading } = useAuth();
    const { showToast } = useToast();
    const [pending] = React.useState(() => pendingSignupSession.consume());

    React.useEffect(() => {
        if (!pending) {
            // Session lost (expiry/restart without persist): restart signup safely.
            navigation.replace('Signup');
        }
    }, [pending, navigation]);

    if (!pending) {
        return null;
    }

    const handleVerified = async () => {
        try {
            await signUp(sanitizeUsernameInput(pending.username), pending.password, pending.seed);
        } catch (error: any) {
            logger.warn('sign-up failed', { error });
            showToast(getUserFacingErrorMessage(error, ERROR_MESSAGES.SIGN_UP_FAILED), 'error');
            navigation.replace('Signup', { username: pending.username });
        }
    };

    return (
        <SeedVerification
            seed={pending.seed}
            onVerified={handleVerified}
            isLoading={isAuthLoading}
        />
    );
};
