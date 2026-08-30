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
import type { AuthDispatch } from '../state/authStateMachine';

type UseAppInactivityLockParams = {
    user: User | null;
    lock: () => Promise<void>;
    dispatch: AuthDispatch;
};

export const useAppInactivityLock = ({
    user,
    lock,
    dispatch,
}: UseAppInactivityLockParams): void => {
    useEffect(() => {
        let hasCheckedAppState = false;
        const handleAppStateChange = async (nextState: string) => {
            try {
                if (nextState === 'active') {
                    if (hasCheckedAppState) return;
                    hasCheckedAppState = true;
                    dispatch({ type: 'APP_STATE_CHANGED', isBackground: false });

                    if (user) {
                        await BiometricAuthService.isBiometricDisabledInPhoneSettings(getUsernameFromUser(user) || '');
                        if (await inactiveTooLong(user.uid)) {
                            await lock();
                        } else {
                            dispatch({ type: 'CHECKING_INACTIVITY', checking: false });
                            await resetSessionTimer(user.uid, lock);
                        }
                    } else {
                        dispatch({ type: 'CHECKING_INACTIVITY', checking: false });
                    }
                } else {
                    hasCheckedAppState = false;
                    dispatch({ type: 'APP_STATE_CHANGED', isBackground: true });
                    dispatch({ type: 'CHECKING_INACTIVITY', checking: Boolean(user) });
                }
            } catch (error) {
                logger.warn('failed to handle app inactivity lock transition', { error });
                dispatch({ type: 'CHECKING_INACTIVITY', checking: false });
            }
        };

        const sub = AppState.addEventListener('change', handleAppStateChange);
        return () => sub.remove();
    }, [lock, user, dispatch]);
};
