import { useEffect } from 'react';
import { Platform, TextInput, TextInputProps, View } from 'react-native';

import { IsolatedTextInput } from '../IsolatedTextInput';
import { useNativeAutofillSuppression } from './useNativeAutofillSuppression';

type UseInputFieldAdaptersParams = {
    allowPasteOverride: boolean;
    autoCapitalize?: TextInputProps['autoCapitalize'];
    autoComplete?: TextInputProps['autoComplete'];
    autoCorrect?: boolean;
    enableAutofill: boolean;
    forwardedRef?: React.Ref<TextInput>;
    importantForAutofill?: TextInputProps['importantForAutofill'];
    isIsolated: boolean;
    isRevealed: boolean;
    multiline?: boolean;
    onInputWrapperRef?: (node: View | null) => void;
    secureTextEntry?: boolean;
    showToggleSecureText?: boolean;
    textContentType?: TextInputProps['textContentType'];
};

/**
 * Android/iOS isolated-input and autofill adapter concerns for InputField
 * (APP-ARCH-002): platform autofill policy resolution, native suppression
 * wiring, isolated-input component selection and context-menu gating.
 * Pure extraction from InputField.tsx; no behavior changes.
 */
export function useInputFieldAdapters({
    allowPasteOverride,
    autoCapitalize,
    autoComplete,
    autoCorrect,
    enableAutofill,
    forwardedRef,
    importantForAutofill,
    isIsolated,
    isRevealed,
    multiline,
    onInputWrapperRef,
    secureTextEntry,
    showToggleSecureText,
    textContentType,
}: UseInputFieldAdaptersParams) {
    const androidAutofillMode = importantForAutofill ?? (
        enableAutofill ? 'yes' : 'noExcludeDescendants'
    );
    const isAndroidAutofillDisabled = androidAutofillMode === 'no' || androidAutofillMode === 'noExcludeDescendants';
    const resolvedAutoComplete = Platform.OS === 'android'
        ? isAndroidAutofillDisabled ? 'off' : autoComplete
        : textContentType ? undefined : autoComplete;
    const secureTextHidden = showToggleSecureText ? !isRevealed : Boolean(secureTextEntry);
    const shouldSuppressNativeAutofill = Platform.OS === 'android' && !enableAutofill;
    const {
        applyNativeAutofillSuppression,
        assignInputRef,
        assignInputWrapperRef,
        inputRef,
        inputWrapperRef,
    } = useNativeAutofillSuppression({
        forwardedRef,
        onInputWrapperRef,
        secureTextEntry,
        secureTextHidden,
        shouldSuppressNativeAutofill,
    });

    useEffect(() => {
        applyNativeAutofillSuppression();
    }, [applyNativeAutofillSuppression]);

    const useIsolated = Platform.OS === 'android' && isIsolated && !multiline;
    const InputComponent = useIsolated ? IsolatedTextInput : TextInput;
    const shouldHideContextMenu = allowPasteOverride ? false : (Boolean(secureTextEntry) && secureTextHidden);
    const isAndroid = Platform.OS === 'android';
    const isIosIsolatedDecoy = Platform.OS === 'ios' && isIsolated;
    // Verbatim extraction: the original keyed these on isIsolated alone
    // (not the Android-only useIsolated flag) -- keep that behavior.
    const isolatedAutoCapitalize = isIsolated ? 'none' : autoCapitalize;
    const isolatedAutoCorrect = isIsolated ? false : autoCorrect;

    return {
        androidAutofillMode,
        applyNativeAutofillSuppression,
        assignInputRef,
        assignInputWrapperRef,
        InputComponent,
        inputRef,
        inputWrapperRef,
        isAndroid,
        isAndroidAutofillDisabled,
        isIosIsolatedDecoy,
        isolatedAutoCapitalize,
        isolatedAutoCorrect,
        resolvedAutoComplete,
        secureTextHidden,
        shouldHideContextMenu,
    };
}
