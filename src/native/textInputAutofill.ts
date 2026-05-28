import { findNodeHandle, NativeModules, Platform, TextInput, View } from 'react-native';

type NativeTextInputAutofillModule = {
    suppressAutofill: (reactTag: number) => void;
    suppressAutofillTree: (reactTag: number) => void;
    configureNonAutofillInput: (reactTag: number, maskText: boolean) => void;
};

const nativeTextInputAutofillModule =
    NativeModules.TextInputMaskingModule as NativeTextInputAutofillModule | null | undefined;

type NativeAutofillTarget = TextInput | View | null;

function getReactTag(target: NativeAutofillTarget): number | null {
    if (Platform.OS !== 'android' || !nativeTextInputAutofillModule) return null;

    const reactTag = findNodeHandle(target);
    return typeof reactTag === 'number' ? reactTag : null;
}

export function suppressNativeTextInputAutofill(textInput: TextInput | null): void {
    const reactTag = getReactTag(textInput);
    if (reactTag === null) return;

    nativeTextInputAutofillModule?.suppressAutofill(reactTag);
}

export function configureNativeNonAutofillTextInput(textInput: TextInput | null, maskText: boolean): void {
    const reactTag = getReactTag(textInput);
    if (reactTag === null) return;

    nativeTextInputAutofillModule?.configureNonAutofillInput(reactTag, maskText);
}

export function suppressNativeAutofillTree(view: View | null): void {
    const reactTag = getReactTag(view);
    if (reactTag === null) return;

    nativeTextInputAutofillModule?.suppressAutofillTree(reactTag);
}
