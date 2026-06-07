import { Platform, TextInput, View } from 'react-native';

const DISABLED_AUTOFILL_PROPS = {
    autoComplete: 'off',
    importantForAutofill: 'noExcludeDescendants',
    textContentType: 'none',
} as const;

type NativePropTarget = {
    setNativeProps?: (props: Record<string, unknown>) => void;
};

const setAndroidAutofillProps = (target: NativePropTarget | null): void => {
    if (Platform.OS !== 'android' || !target?.setNativeProps) return;

    target.setNativeProps(DISABLED_AUTOFILL_PROPS);
};

export function suppressNativeTextInputAutofill(textInput: TextInput | null): void {
    setAndroidAutofillProps(textInput);
}

export function configureNativeNonAutofillTextInput(
    textInput: TextInput | null,
    _maskText: boolean,
): void {
    setAndroidAutofillProps(textInput);
}

export function suppressNativeAutofillTree(view: View | null): void {
    setAndroidAutofillProps(view);
}
