import { useCallback, useEffect, useRef } from 'react';
import { Platform, TextInput, View } from 'react-native';

import {
    configureNativeNonAutofillTextInput,
    suppressNativeAutofillTree,
} from '../../native/textInputAutofill';

interface UseNativeAutofillSuppressionParams {
    forwardedRef?: React.Ref<TextInput>;
    onInputWrapperRef?: (ref: View | null) => void;
    secureTextEntry?: boolean;
    secureTextHidden: boolean;
    shouldSuppressNativeAutofill: boolean;
}

export function useNativeAutofillSuppression({
    forwardedRef,
    onInputWrapperRef,
    secureTextEntry,
    secureTextHidden,
    shouldSuppressNativeAutofill,
}: UseNativeAutofillSuppressionParams) {
    const inputRef = useRef<TextInput>(null);
    const inputWrapperRef = useRef<View>(null);

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
        if (typeof forwardedRef === 'function') {
            forwardedRef(node);
        } else if (forwardedRef) {
            (forwardedRef as React.MutableRefObject<TextInput | null>).current = node;
        }
        applyNativeAutofillSuppression();
    }, [forwardedRef, applyNativeAutofillSuppression]);

    const assignInputWrapperRef = useCallback((node: View | null) => {
        inputWrapperRef.current = node;
        onInputWrapperRef?.(node);
    }, [onInputWrapperRef]);

    useEffect(() => {
        applyNativeAutofillSuppression();
    }, [applyNativeAutofillSuppression]);

    return {
        applyNativeAutofillSuppression,
        assignInputRef,
        assignInputWrapperRef,
        inputRef,
        inputWrapperRef,
    };
}
