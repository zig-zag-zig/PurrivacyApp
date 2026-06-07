import { ForwardedRef, useCallback, useRef } from 'react';
import { TextInput, View } from 'react-native';

import {
    configureNativeNonAutofillTextInput,
    suppressNativeAutofillTree,
} from '../../native/textInputAutofill';

type UseNativeAutofillSuppressionParams = {
    forwardedRef: ForwardedRef<TextInput>;
    onInputWrapperRef?: (node: View | null) => void;
    secureTextEntry?: boolean;
    secureTextHidden: boolean;
    shouldSuppressNativeAutofill: boolean;
};

const assignForwardedRef = (
    forwardedRef: ForwardedRef<TextInput>,
    node: TextInput | null,
): void => {
    if (typeof forwardedRef === 'function') {
        forwardedRef(node);
        return;
    }

    if (forwardedRef) {
        forwardedRef.current = node;
    }
};

export function useNativeAutofillSuppression({
    forwardedRef,
    onInputWrapperRef,
    secureTextEntry,
    secureTextHidden,
    shouldSuppressNativeAutofill,
}: UseNativeAutofillSuppressionParams) {
    const inputRef = useRef<TextInput | null>(null);
    const inputWrapperRef = useRef<View | null>(null);

    const applyNativeAutofillSuppression = useCallback(() => {
        if (!shouldSuppressNativeAutofill) return;

        configureNativeNonAutofillTextInput(
            inputRef.current,
            Boolean(secureTextEntry) && secureTextHidden,
        );
        suppressNativeAutofillTree(inputWrapperRef.current);
    }, [secureTextEntry, secureTextHidden, shouldSuppressNativeAutofill]);

    const assignInputRef = useCallback((node: TextInput | null) => {
        inputRef.current = node;
        assignForwardedRef(forwardedRef, node);
        if (node) {
            applyNativeAutofillSuppression();
        }
    }, [applyNativeAutofillSuppression, forwardedRef]);

    const assignInputWrapperRef = useCallback((node: View | null) => {
        inputWrapperRef.current = node;
        if (node && shouldSuppressNativeAutofill) {
            suppressNativeAutofillTree(node);
        }
        onInputWrapperRef?.(node);
    }, [onInputWrapperRef, shouldSuppressNativeAutofill]);

    return {
        applyNativeAutofillSuppression,
        assignInputRef,
        assignInputWrapperRef,
        inputRef,
        inputWrapperRef,
    };
}
