import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, TextInput } from 'react-native';
import { useToast } from '../../../app/state/ToastContext';
import * as Clipboard from 'expo-clipboard';
import { logger } from '../../../utils/logger';
import { applyTotpEdit } from '../domain/totpEdit';

/**
 * Focuses the hidden TOTP input, re-showing the keyboard when needed.
 *
 * Android keeps the focused input focused after the keyboard is dismissed
 * (back button or swipe), so a later focus() on the already-focused input is
 * a no-op and the keyboard never reappears. When the keyboard is hidden,
 * blur() first and then focus() to force the IME back up. When the keyboard
 * is already visible, a plain focus() avoids any flicker.
 */
const focusWithKeyboard = (input: TextInput, keyboardVisible: boolean): void => {
    if (keyboardVisible) {
        input.focus();
        return;
    }
    input.blur();
    setTimeout(() => {
        input.focus();
    }, 60);
};

export const useTotpInput = () => {
    const totpInputRef = useRef<TextInput | null>(null);
    const { showToast } = useToast();
    // Ref (not state) on purpose: the focus helpers must stay referentially
    // stable so effects that depend on them never re-run on keyboard events.
    const keyboardVisibleRef = useRef(true);

    useEffect(() => {
        const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
            keyboardVisibleRef.current = true;
        });
        const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
            keyboardVisibleRef.current = false;
        });
        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    const focusInput = useCallback(() => {
        setTimeout(() => {
            const input = totpInputRef.current;
            if (!input) {
                return;
            }
            focusWithKeyboard(input, keyboardVisibleRef.current);
        }, 10);
    }, []);

    const focusOnFirstBox = useCallback(() => {
        setTimeout(() => {
            const input = totpInputRef.current;
            if (!input) {
                return;
            }
            focusWithKeyboard(input, keyboardVisibleRef.current);
        }, 100);
    }, []);

    const pasteFromClipboard = useCallback(async (): Promise<string[]> => {
        try {
            const clipboardContent = await Clipboard.getStringAsync();
            const trimmedContent = clipboardContent.trim();
            const isSixDigits = /^\d{6}$/.test(trimmedContent);

            if (!isSixDigits) {
                showToast('Clipboard does not contain a valid 6-digit code', 'error');
                return [];
            }

            const digits = trimmedContent.replace(/[^0-9]/g, '').split('');
            if (digits.length < 6) {
                showToast('Clipboard does not contain enough digits', 'error');
                return [];
            }

            const newCode = Array(6).fill('');
            digits.slice(0, 6).forEach((digit, index) => {
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

    /**
     * Applies a keystroke to the boxes using the tapped box as the edit
     * target, instead of wherever the hidden input's native caret happens
     * to be (which is what made every edit land at the end of the code).
     */
    const handleTotpChangeText = useCallback((
        text: string,
        previousCode: string[],
        activeIndex: number,
        setTotpCode: (code: string[]) => void,
        setFocusedIndex: (index: number) => void,
    ) => {
        const { code, activeIndex: nextActiveIndex } = applyTotpEdit(
            previousCode,
            text,
            activeIndex,
        );
        setTotpCode(code);
        setFocusedIndex(nextActiveIndex);
    }, []);

    return {
        totpInputRef,
        pasteFromClipboard,
        handleTotpChangeText,
        focusInput,
        focusOnFirstBox,
    };
};
