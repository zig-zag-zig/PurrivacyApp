import { useEffect } from 'react';
import { User } from 'firebase/auth';
import { AppState } from 'react-native';

import { logger } from '../../../utils/logger';
import { BiometricAuthService } from '../../security/services/biometricAuthService';
import {
    inactiveTooLong,
    resetSessionTimer,
} from '../../security/services/activityService';
import { getUsernameFromUser } from '../domain/usernameIdentity';

type UseAppInactivityLockParams = {
    user: User | null;
    lock: () => Promise<void>;
    setAppStateIsBackground: (value: boolean) => void;
    setIsCheckingInactivity: (value: boolean) => void;
};

export const useAppInactivityLock = ({
    user,
    lock,
    setAppStateIsBackground,
    setIsCheckingInactivity,
}: UseAppInactivityLockParams): void => {
    useEffect(() => {
        let hasCheckedAppState = false;
        const handleAppStateChange = async (nextState: string) => {
            try {
                if (nextState === 'active') {
                    if (hasCheckedAppState) return;
                    hasCheckedAppState = true;
                    setAppStateIsBackground(false);

                    if (user) {
                        await BiometricAuthService.isBiometricDisabledInPhoneSettings(getUsernameFromUser(user) || '');
                        if (await inactiveTooLong(user.uid)) {
                            await lock();
                        } else {
                            setIsCheckingInactivity(false);
                            await resetSessionTimer(user.uid, lock);
                        }
                    } else {
                        setIsCheckingInactivity(false);
                    }
                } else {
                    hasCheckedAppState = false;
                    setAppStateIsBackground(true);
                    setIsCheckingInactivity(Boolean(user));
                }
            } catch (error) {
                logger.warn('failed to handle app inactivity lock transition', { error });
                setIsCheckingInactivity(false);
            }
        };

        const sub = AppState.addEventListener('change', handleAppStateChange);
        return () => sub.remove();
    }, [lock, user, setAppStateIsBackground, setIsCheckingInactivity]);
};
