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
import { ACCOUNT_PASSWORD_MIN_LENGTH } from '../../../config/inputLimits';
import { ApiRequestError } from '../../../api/apiError';

export type SecurityActionResult = {
    success: boolean;
    requiresSignout?: boolean;
    requiresMfa?: boolean;
    mfaError?: string;
    cleanupWarning?: string;
};

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
            else if (newValue.length < ACCOUNT_PASSWORD_MIN_LENGTH) errors.newValue = `Minimum ${ACCOUNT_PASSWORD_MIN_LENGTH} characters`;
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
    ): Promise<SecurityActionResult> => {
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
            let cleanupWarning: string | undefined;

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
                const deletion = await deleteAccount();
                success = deletion.success;
                cleanupWarning = deletion.cleanupWarning;
            }

            if (success && type === 'password') {
                await ApiClient.revokeAllSessions();
            }
            return {
                success,
                requiresSignout: success && type === 'password',
                cleanupWarning,
            };
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
        const currentUser = getUser();
        if (!currentUser) {
            throw new Error('Failed to delete account: user in AuthContext cannot be null');
        }

        let backendAccountWasDeleted = false;
        let cleanupWarning: string | undefined;
        try {
            await ApiClient.delete();
            backendAccountWasDeleted = true;
        } catch (error: any) {
            const completedSteps = error instanceof ApiRequestError && Array.isArray(error.errorData.completedSteps)
                ? error.errorData.completedSteps.filter((step): step is string => typeof step === 'string')
                : [];
            const remainingSteps = error instanceof ApiRequestError && Array.isArray(error.errorData.remainingSteps)
                ? error.errorData.remainingSteps.filter((step): step is string => typeof step === 'string')
                : [];
            backendAccountWasDeleted = completedSteps.includes('deleteUserDocuments');

            if (!backendAccountWasDeleted) {
                logger.warn('failed to delete account', { error });
                throw new Error(error.message || 'Failed to delete account');
            }

            // The backend deletes in ordered steps. Once the user documents
            // are gone the account is irreversibly deleted, even when a later
            // cleanup step (keys, push tokens, Firebase identity) reports a
            // retryable transition error. The remaining steps are surfaced so
            // the residual cleanup issue is never silently hidden.
            logger.warn('account deleted with incomplete backend cleanup', {
                error,
                completedSteps,
                remainingSteps,
            });
            cleanupWarning = remainingSteps.includes('deleteFirebaseUser')
                ? 'Account data was deleted, but the Firebase identity could not be removed. The issue was logged.'
                : 'Account data was deleted, but some backend cleanup steps could not be completed. The issue was logged.';
        }

        try {
            await deleteCurrentAccount(currentUser);
        } catch (error) {
            if (!backendAccountWasDeleted) {
                throw error;
            }

            logger.warn('backend account deleted but client identity cleanup was incomplete', { error });
            cleanupWarning = cleanupWarning
                ?? 'Account data was deleted, but Firebase or local identity cleanup failed. The issue was logged.';
        }

        return { success: true, cleanupWarning };
    }

    return {
        isLoading,
        formErrors,
        handleSecurityAction,
    };
};
