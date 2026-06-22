import React from 'react';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { RootStackParamList, RootNavigationProps } from '../../../app/navigation/types';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../../../app/state/ToastContext';
import { SeedVerification } from '../components/SeedVerification';
import { ERROR_MESSAGES, getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { logger } from '../../../utils/logger';
import { sanitizeUsernameInput } from '../domain/usernameIdentity';

type Route = RouteProp<RootStackParamList, 'SignupSeedVerification'>;

export const SignupSeedVerificationScreen = () => {
    const route = useRoute<Route>();
    const navigation = useNavigation<RootNavigationProps>();
    const { signUp, isAuthLoading } = useAuth();
    const { showToast } = useToast();
    const { seed, username, password } = route.params;

    const handleVerified = async () => {
        try {
            await signUp(sanitizeUsernameInput(username), password, seed);
        } catch (error: any) {
            logger.warn('sign-up failed', { error });
            showToast(getUserFacingErrorMessage(error, ERROR_MESSAGES.SIGN_UP_FAILED), 'error');
            navigation.replace('Signup');
        }
    };

    return (
        <SeedVerification
            seed={seed}
            onVerified={handleVerified}
            isLoading={isAuthLoading}
        />
    );
};
