import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { useAuth } from '../../features/auth/state/AuthContext';
import { TabNavigator } from './TabNavigator';
import { RootStackParamList } from './types';
import { SecurityScreen } from '../../features/security/pages/SecurityScreen';
import { MfaSetupScreen } from '../../features/mfa/pages/MfaSetupScreen';
import { RecoverAccountScreen } from '../../features/auth/pages/RecoverAccountScreen';
import { SigninScreen } from '../../features/auth/pages/SigninScreen';
import { SignupScreen } from '../../features/auth/pages/SignupScreen';
import { useNotificationService } from '../../hooks/useNotificationService';
import { logger } from '../../utils/logger';
import { theme } from '../../styles/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const StackNavigator = () => {
    const { user, authCompleted } = useAuth();
    useNotificationService({ enabled: authCompleted });

    if (!authCompleted) {
        return null;
    }

    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                animation: 'none',
                contentStyle: { backgroundColor: theme.colors.background },
            }}
        >
            {user ? (
                // User is authenticated with Firebase
                <>
                    <Stack.Screen name="Home" component={TabNavigator} />
                    <Stack.Screen name="Security" component={SecurityScreen} />
                    <Stack.Screen name="MfaSetup" component={MfaSetupScreen} />
                </>
            ) : (
                // No user authenticated - show auth screens
                <>
                    <Stack.Screen name="Signin" component={SigninScreen} />
                    <Stack.Screen name="Signup" component={SignupScreen} />
                    <Stack.Screen name="RecoverAccount" component={RecoverAccountScreen} />
                </>
            )}
        </Stack.Navigator>
    );
};
