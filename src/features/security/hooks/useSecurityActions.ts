import { useState } from 'react';
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
} from 'firebase/auth';
import { AuthService } from '../../auth/services/authService';
import { useAuth } from '../../auth/state/AuthContext';
import { ApiClient } from '../../../api/client';
import { getUser } from '../../auth/domain/authUtils';
import { logger } from '../../../utils/logger';

export const useSecurityActions = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const { setLoginWithReauthenticateWithCredential, deleteCurrentAccount } = useAuth();

    const validateForm = (
        type: 'password' | 'delete',
        currentPassword: string,
        newValue?: string,
        confirmValue?: string
    ) => {
        const errors: Record<string, string> = {};

        if (!currentPassword) {
            errors.currentPassword = 'Current password is required';
        }

        if (type === 'password') {
            if (!newValue) errors.newValue = 'New password is required';
            else if (newValue.length < 8) errors.newValue = 'Minimum 8 characters';
            if (!confirmValue) errors.confirmValue = 'Please confirm password';
            else if (newValue !== confirmValue) errors.confirmValue = 'Passwords must match';
            if (newValue === currentPassword) errors.newValue = 'New password must be different';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSecurityAction = async (
        type: 'password' | 'delete',
        currentPassword: string,
        newValue?: string,
        confirmValue?: string,
        userDecrypted?: any,
    ) => {
        if (!validateForm(type, currentPassword, newValue, confirmValue)) {
            return { success: false };
        }

        setIsLoading(true);
        try {
            const user = getUser();
            if (!user || !user.email) {
                throw new Error('User not authenticated');
            }

            setLoginWithReauthenticateWithCredential(true);
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            let success = false;

            if (type === 'password' && userDecrypted) {
                await AuthService.changePassword(
                    user.uid,
                    userDecrypted,
                    currentPassword,
                    newValue!,
                );
                await updatePassword(user, newValue!);
                success = true;
            }
            else if (type === 'delete') {
                success = await deleteAccount();
            }

            if (success && type === 'password') {
                await ApiClient.revokeAllSessions();
            }
            return { success, requiresSignout: success && type === 'password' };
        } catch (error: any) {
            if (error.code === 'auth/invalid-credential') {
                setFormErrors({ currentPassword: 'Incorrect password' });
            } else if (error.code === 'auth/requires-recent-login') {
                return { success: false, requiresSignout: true };
            } else if (error.mfaError?.mfaRequired || error.sessionError?.mfaRequired) {
                // Server indicates MFA is required for this action
                return {
                    success: false,
                    requiresMfa: true,
                    mfaError: error.mfaError?.error || error.sessionError?.error || 'MFA verification required'
                };
            } else {
                throw error;
            }
            return { success: false };
        } finally {
            setLoginWithReauthenticateWithCredential(false);
            setIsLoading(false);
        }
    };

    const deleteAccount = async () => {
        try {
            const currentUser = getUser();
            if (!currentUser) {
                throw new Error('Failed to delete account: user in AuthContext cannot be null');
            }
            await ApiClient.delete();
            await deleteCurrentAccount(currentUser);
            return true;
        } catch (error: any) {
            logger.warn('failed to delete account', { error });
            throw new Error(error.message || 'Failed to delete account');
        }
    }

    return {
        isLoading,
        formErrors,
        handleSecurityAction,
    };
};
