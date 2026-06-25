import {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useRef,
} from 'react';
import {
    findNodeHandle,
    NativeSyntheticEvent,
    Platform,
    requireNativeComponent,
    TextInput,
    TextInputChangeEventData,
    TextInputFocusEventData,
    TextInputProps,
    UIManager,
} from 'react-native';

export type IsolatedTextInputProps = TextInputProps;

const NativeIsolatedTextInput =
    Platform.OS === 'android'
        ? requireNativeComponent<any>('IsolatedTextInput')
        : undefined;

// Module-level tracker for the currently-focused isolated input.
// Bypasses TextInput.State entirely (which doesn't track requireNativeComponent
// views in Fabric). ScreenContainer calls blurAllIsolatedInputs() on tap-outside.
type FocusedEntry = { blur: () => void; focusedAt: number; lastFocusAt: number };
const focusedEntryRef: { current: FocusedEntry | null } = { current: null };
const FOCUS_GUARD_MS = 250;
let suppressBlurUntil = 0;

// Called by the reveal-toggle button in InputField. When the user taps the
// eye icon, handleTouchEnd on the ScrollView fires blurAllIsolatedInputs,
// which would blur the input ~90ms later (after the toggle's state update).
// This suppression window prevents that blur so the input keeps focus.
export function suppressBlurForToggle(): void {
    suppressBlurUntil = Date.now() + 250;
}

export function blurAllIsolatedInputs(): void {
    // Skip if a reveal-toggle press was recent — the toggle is inside the
    // input wrapper, so handleTouchEnd fires blurAllIsolatedInputs, but we
    // don't want to blur the input we just toggled reveal on.
    if (Date.now() < suppressBlurUntil) {
        console.log('[ISOLATED_JS] skipping blur (toggle pressed)');
        return;
    }
    const entry = focusedEntryRef.current;
    console.log('[ISOLATED_JS] blurAllIsolatedInputs called', { hasEntry: entry != null });
    if (!entry) return;
    const now = Date.now();

    // Only blur if the input has been focused for a sustained time (>FOCUS_GUARD_MS).
    if (now - entry.focusedAt < FOCUS_GUARD_MS) {
        console.log('[ISOLATED_JS] skipping recently focused input');
        return;
    }

    // Delay the blur slightly so that if this touch event was actually
    // tapping on another TextInput, the natural focus shift has time
    // to fire handleBlur and clear focusedEntryRef before we force it.
    setTimeout(() => {
        if (focusedEntryRef.current === entry) {
            entry.blur();
        }
    }, 100);
}

export const IsolatedTextInput = forwardRef<TextInput, IsolatedTextInputProps>(
    function IsolatedTextInput(
        {
            value,
            defaultValue,
            onChangeText,
            onChange,
            onFocus,
            onBlur,
            secureTextEntry,
            ...rest
        },
        ref,
    ) {
        const nativeRef = useRef<any>(null);
        const eventCountRef = useRef(0);
        const focusedRef = useRef(false);

        const dispatchCommand = useCallback(
            (command: string, args: unknown[]) => {
                const node = nativeRef.current;
                console.log('[ISOLATED_JS] dispatchCommand', { command, hasNode: node != null });
                if (node == null) return;
                const config = UIManager.getViewManagerConfig('IsolatedTextInput');
                const commands = config?.Commands as Record<string, number> | undefined;
                const commandId = commands?.[command] ?? command;
                // In Fabric, findNodeHandle returns null for requireNativeComponent
                // refs. Use _nativeTag (the internal Fabric node handle) instead.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tag = (node as any)?._nativeTag ?? findNodeHandle(node);
                console.log('[ISOLATED_JS] dispatchViewManagerCommand', { commandId, tag });
                if (tag == null) return;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                UIManager.dispatchViewManagerCommand(tag as any, commandId as any, args as any);
            },
            [],
        );

        // Shim registered with TextInput.State so that ScrollView's
        // dismissKeyboard() (triggered by keyboardShouldPersistTaps='handled')
        // can find and blur this input. focusTextInput/blurTextInput expect a
        // component-like object with a .blur() method — NOT a node handle number.
        const blurFn = useCallback(() => dispatchCommand('blur', []), [dispatchCommand]);

        const handleChange = useCallback(
            (event: NativeSyntheticEvent<TextInputChangeEventData>) => {
                const payload = event?.nativeEvent;
                const text = typeof payload?.text === 'string' ? payload.text : '';
                if (typeof payload?.eventCount === 'number') {
                    eventCountRef.current = payload.eventCount;
                }
                onChangeText?.(text);
                onChange?.(event);
            },
            [onChangeText, onChange],
        );

        const handleFocus = useCallback(
            (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
                focusedRef.current = true;
                const now = Date.now();
                console.log('[ISOLATED_JS] handleFocus', { now });
                // Track the focused entry with timestamp. blurAllIsolatedInputs
                // uses this to skip blur for inputs focused within FOCUS_GUARD_MS
                // (the tap-gesture window), preventing blur-flicker when tapping
                // from a standard field to an isolated field.
                focusedEntryRef.current = { blur: blurFn, focusedAt: now, lastFocusAt: now };
                onFocus?.(event);
            },
            [onFocus],
        );

        const handleBlur = useCallback(
            (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
                focusedRef.current = false;
                console.log('[ISOLATED_JS] handleBlur');
                // Clear the tracker entry. When transferring focus between
                // fields, this fires on ACTION_DOWN (before handleTouchEnd),
                // so blurAllIsolatedInputs finds no entry and is a no-op.
                if (focusedEntryRef.current?.blur === blurFn) {
                    focusedEntryRef.current = null;
                }
                onBlur?.(event);
            },
            [onBlur],
        );

        useImperativeHandle(
            ref,
            () => ({
                focus: () => dispatchCommand('focus', []),
                blur: () => dispatchCommand('blur', []),
                isFocused: () => focusedRef.current,
                clear: () => {
                    nativeRef.current?.setNativeProps?.({ text: '' });
                },
                setNativeProps: (props: TextInputProps & { text?: string }) => {
                    nativeRef.current?.setNativeProps?.(props);
                },
            }) as unknown as TextInput,
            [dispatchCommand],
        );

        if (!NativeIsolatedTextInput) {
            return null;
        }

        const textValue = (value !== undefined ? value : defaultValue) ?? '';

        return (
            <NativeIsolatedTextInput
                ref={nativeRef}
                {...rest}
                isolatedSecureTextEntry={Boolean(secureTextEntry)}
                isolatedText={textValue}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
            />
        );
    },
);
