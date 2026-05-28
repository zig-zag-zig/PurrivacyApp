import React, { useState } from 'react';
import { useRoute } from '@react-navigation/native';
import { SecurityForm } from '../components/SecurityForm';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { theme } from '../../../styles/theme';
import { useSecurityActions } from '../hooks/useSecurityActions';
import { useAuth } from '../../auth/state/AuthContext';
import { SecurityScreenRouteProp } from '../../../app/navigation/types';
import { View } from 'react-native';
import { useToast } from '../../../app/state/ToastContext';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { getUsernameFromUser } from '../../auth/domain/usernameIdentity';

export const SecurityScreen = () => {
    const route = useRoute<SecurityScreenRouteProp>();
    const { type } = route.params;
    const { user, userDecrypted, signOut } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newValue, setNewValue] = useState('');
    const [confirmValue, setConfirmValue] = useState('');
    const { isLoading, formErrors, handleSecurityAction } = useSecurityActions();
    const { showToast } = useToast();

    const handleSubmit = async () => {
        try {
            const result = await handleSecurityAction(
                type,
                currentPassword,
                newValue,
                confirmValue,
                userDecrypted
            );

            if (result.success) {
                let message = '';
                switch (type) {
                    case 'password':
                        message = 'Password changed successfully';
                        break;
                    case 'delete':
                        message = 'Account deleted successfully';
                        break;
                }
                message += result.requiresSignout ? '. Please sign in again.' : '';

                showToast(message, 'success');

                if (result.requiresSignout) {
                    await signOut();
                }
            } else if (result.requiresSignout) {
                showToast('Session expired. Please sign in again to continue.', 'error');
                await signOut();
            }
        } catch (error: any) {
            showToast(getUserFacingErrorMessage(error, `Failed to ${type === 'delete' ? 'delete account' : 'update'}`), 'error');
        }
    };

    return (
        <ScreenContainer>
            <View style={{ gap: theme.spacing.md }}>
                <SecurityForm
                    type={type}
                    username={getUsernameFromUser(user)}
                    currentPassword={currentPassword}
                    newValue={newValue}
                    confirmValue={confirmValue}
                    onCurrentPasswordChange={setCurrentPassword}
                    onNewValueChange={setNewValue}
                    onConfirmValueChange={setConfirmValue}
                    onSubmit={handleSubmit}
                    isLoading={isLoading}
                    formErrors={formErrors}
                />
            </View>
        </ScreenContainer>
    );
};
