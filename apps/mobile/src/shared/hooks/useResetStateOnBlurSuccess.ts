import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef } from 'react';

/**
 * Extracted shared pattern from useEncryptPage / useDecryptPage:
 * resets the page state when the screen regains focus if it was successful
 * before losing focus.
 *
 * @param wasSuccessful - whether the last operation succeeded (from reducer state)
 * @param resetAction - the reset dispatch function (e.g. () => dispatch({ type: 'resetAfterSuccess' }))
 */
export function useResetStateOnBlurSuccess(
    wasSuccessful: boolean,
    resetAction: () => void,
): void {
    const shouldResetOnFocus = useRef(false);
    // Callers pass inline lambdas; keep action out of focus-effect deps to match
    // pre-extraction dependency list (only wasSuccessful).
    const resetActionRef = useRef(resetAction);
    resetActionRef.current = resetAction;

    useFocusEffect(
        useCallback(() => {
            if (shouldResetOnFocus.current) {
                resetActionRef.current();
                shouldResetOnFocus.current = false;
            }

            return () => {
                if (wasSuccessful) {
                    shouldResetOnFocus.current = true;
                }
            };
        }, [wasSuccessful]),
    );
}
