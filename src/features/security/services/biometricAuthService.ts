import { getUserId } from '../../auth/domain/authUtils';
import { securityService } from './securityService';
import {
    clearBiometricsConfig,
    setHasBeenPromptedForBiometric,
    FIRST_TIME_PROMPT_PREFIX,
    LAST_USED_AUTH_WAS_BIOMETRIC_PREFIX
} from '../domain/secureStorageUtils';
import { logger } from '../../../utils/logger';
import { SecureStorageModule } from './biometricSecureStorage';

/**
 * Service for handling biometric unlock operations
 */
export class BiometricAuthService {
    /**
     * Check if biometric unlock is available and enabled for a user
     */
    static async getBiometricState(username: string): Promise<{ available: boolean; enabled: boolean }> {
        try {
            const available = await SecureStorageModule.isBiometricAvailable();
            const enabled = await BiometricAuthService.isBiometricEnabled(username);
            return { available, enabled };
        } catch (error) {
            logger.warn('failed to get biometric state', { error });
            return { available: false, enabled: false };
        }
    }

    /**
     * Toggle biometric unlock for a user
     */
    static async toggleBiometric(username: string, enabled: boolean): Promise<void> {
        if (enabled) {
            await BiometricAuthService.enableBiometric(username);
        } else {
            await BiometricAuthService.disableBiometric(username);
        }
    }

    /**
     * Prompt user to enable biometric unlock if not already prompted
     */
    static async promptBiometric(username: string) {
        if (username.trim().length === 0) {
            return;
        }

        const biometricEnabled = await BiometricAuthService.isBiometricEnabled(username);
        if (biometricEnabled) {
            return;
        }

        const hasBeenPrompted = await BiometricAuthService.hasBeenPromptedForBiometric(username);
        if (hasBeenPrompted) {
            return;
        }

        try {
            const success = await BiometricAuthService.enableBiometric(username);
            if (success) {
                await BiometricAuthService.setLastUsedBiometricSignIn(username, true);
            }
        } catch (error) {
            logger.warn('failed while prompting biometric unlock', { error });
            return false;
        }
    }

    /**
     * Check if biometrics is disabled in phone settings
     */
    static async isBiometricDisabledInPhoneSettings(username: string): Promise<boolean> {
        try {
            const disabled = await BiometricAuthService.biometricsDisabledInPhoneSettings(username) === true;
            return disabled;
        } catch (error) {
            logger.warn('failed to check biometric phone settings', { error });
            return false;
        }
    }

    /**
     * Get last used biometric unlock status
     */
    static async getLastUsedBiometricSignIn(username: string): Promise<boolean> {
        try {
            const lastUsed = await BiometricAuthService.lastUsedBiometricSignIn(username);
            return lastUsed;
        } catch (error) {
            logger.warn('failed to get last used biometric unlock', { error });
            return false;
        }
    }

    /**
     * Set last used biometric unlock status
     */
    static async setLastUsedBiometricSignIn(username: string, value: boolean): Promise<void> {
        try {
            await BiometricAuthService.setLastUsedAuthWasBiometricSignIn(username, value);
        } catch (error) {
            logger.warn('failed to set last used biometric unlock', { error });
        }
    }

    // ========== Core Implementation Methods ==========

    /**
     * Check if user has been prompted for biometric before
     */
    static async hasBeenPromptedForBiometric(username: string): Promise<boolean> {
        if (username.trim() === '') return false;
        return await SecureStorageModule.getValue(`${FIRST_TIME_PROMPT_PREFIX}${username}`) === 'true';
    }

    /**
     * Get last used biometric unlock status
     */
    private static async lastUsedBiometricSignIn(username: string): Promise<boolean> {
        if (username.trim() === '') return false;
        return await SecureStorageModule.getValue(`${LAST_USED_AUTH_WAS_BIOMETRIC_PREFIX}${username}`) === 'true';
    }

    /**
     * Set last used biometric unlock status
     */
    static async setLastUsedAuthWasBiometricSignIn(username: string, wasBiometric: boolean): Promise<void> {
        if (username.trim() === '') return;
        await SecureStorageModule.setValue(`${LAST_USED_AUTH_WAS_BIOMETRIC_PREFIX}${username}`, String(wasBiometric));
    }

    /**
     * Check if biometric is enabled for a user
     */
    static async isBiometricEnabled(username: string): Promise<boolean> {
        if (username.trim() === '') return false;
        try {
            const userId = getUserId();
            const enabled = await securityService.hasBiometricDek(userId);
            return enabled;
        } catch (error) {
            return false;
        }
    }

    /**
     * Disable biometric unlock for a user
     */
    static async disableBiometric(username: string): Promise<void> {
        const userId = getUserId();
        await clearBiometricsConfig(username, false);
        await securityService.clearBiometricUnlock(userId);
    }

    /**
     * Enable biometric unlock for a user
     */
    static async enableBiometric(username: string): Promise<boolean> {
        return new Promise((resolve) => {
            const attemptEnable = async (retryCount = 0) => {
                try {
                    if (username.trim() === '') {
                        resolve(false);
                        return;
                    }
                    const promptText = "Authenticate to enable biometric unlock";

                    const available = await SecureStorageModule.isBiometricAvailable();
                    const alreadyEnabled = await BiometricAuthService.isBiometricEnabled(username);

                    if (available && !alreadyEnabled) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                        await setHasBeenPromptedForBiometric(username, true);
                        const persistedDek = await securityService.persistCachedDekWithBiometric(getUserId(), promptText);
                        if (!persistedDek) {
                            await clearBiometricsConfig(username, false);
                            resolve(false);
                            return;
                        }
                        await BiometricAuthService.setLastUsedBiometricSignIn(username, true);
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                } catch (error: any) {
                    if (error?.message?.includes('main thread') && retryCount < 3) {
                        // Retry after a short delay
                        setTimeout(() => attemptEnable(retryCount + 1), 300 * (retryCount + 1));
                    } else if (securityService.isBiometricAuthCancelled(error)) {
                        resolve(false);
                    } else {
                        logger.warn("failed to enable biometrics", { error });
                        resolve(false);
                    }
                }
            };

            // Use requestAnimationFrame for better timing
            requestAnimationFrame(() => {
                attemptEnable();
            });
        });
    }

    /**
     * Check if biometrics is disabled in phone settings
     */
    static async biometricsDisabledInPhoneSettings(username: string): Promise<boolean | null> {
        if (username.trim() === '') return null;
        const isEnabled = await BiometricAuthService.isBiometricEnabled(username);
        if (!isEnabled) return null;

        const enabledOnPhone = await SecureStorageModule.isBiometricEnabledOnPhone();
        if (!enabledOnPhone) {
            return true;
        }

        return false;
    }
}
