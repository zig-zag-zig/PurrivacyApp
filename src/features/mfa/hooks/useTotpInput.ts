import { useCallback, useRef } from 'react';
import { TextInput } from 'react-native';
import { useToast } from '../../../app/state/ToastContext';
import Clipboard from '@react-native-clipboard/clipboard';
import { logger } from '../../../utils/logger';

const TOTP_LENGTH = 6;

export const useTotpInput = () => {
    const totpInputRef = useRef<TextInput | null>(null);
    const { showToast } = useToast();

    const focusInput = useCallback(() => {
        setTimeout(() => {
            totpInputRef.current?.focus();
        }, 10);
    }, []);

    const focusOnFirstBox = useCallback(() => {
        setTimeout(() => {
            totpInputRef.current?.focus();
        }, 100);
    }, []);

    const pasteFromClipboard = useCallback(async (): Promise<string[]> => {
        try {
            const clipboardContent = await Clipboard.getString();
            const trimmedContent = clipboardContent.trim();
            const isSixDigits = /^\d{6}$/.test(trimmedContent);

            if (!isSixDigits) {
                showToast('Clipboard does not contain a valid 6-digit code', 'error');
                return [];
            }

            const digits = trimmedContent.replace(/[^0-9]/g, '').split('');
            if (digits.length < TOTP_LENGTH) {
                showToast('Clipboard does not contain enough digits', 'error');
                return [];
            }

            const newCode = Array(TOTP_LENGTH).fill('');
            digits.slice(0, TOTP_LENGTH).forEach((digit, index) => {
                newCode[index] = digit;
            });

            focusInput();
            return newCode;
        } catch (error) {
            logger.warn('totp paste failed', { error });
            showToast('Could not paste from clipboard', 'error');
            return [];
        }
    }, [showToast, focusInput]);

    const handleTotpChangeText = useCallback((
        text: string,
        setTotpCode: (code: string[]) => void,
        setFocusedIndex: (index: number) => void,
    ) => {
        const digits = text.replace(/[^0-9]/g, '');
        const updatedCode = Array(TOTP_LENGTH).fill('');
        const digitsArray = digits.split('').slice(0, TOTP_LENGTH);
        digitsArray.forEach((digit, i) => {
            updatedCode[i] = digit;
        });
        setTotpCode(updatedCode);
        setFocusedIndex(Math.min(digitsArray.length, TOTP_LENGTH - 1));
    }, []);

    return {
        totpInputRef,
        pasteFromClipboard,
        handleTotpChangeText,
        focusInput,
        focusOnFirstBox
    };
};
