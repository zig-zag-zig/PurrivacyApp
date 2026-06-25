import React, { forwardRef, useEffect, useRef, useState } from 'react';
import {
    Platform,
    StyleSheet,
    StyleProp,
    TextInput,
    TextInputProps,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';

import { IsolatedTextInput, suppressBlurForToggle } from './IsolatedTextInput';
import Icon from '@expo/vector-icons/MaterialIcons';
import { commonStyles } from '../styles/commonStyles';
import { theme } from '../styles/theme';
import { CustomText } from './CustomText';
import { useKeyboardAwareScroll } from './KeyboardAwareScrollContext';
import type { KeyboardAwareInputNode } from './KeyboardAwareScrollContext';
import { FloatingInputLabel } from './inputField/FloatingInputLabel';
import { useNativeAutofillSuppression } from './inputField/useNativeAutofillSuppression';

interface InputFieldProps extends TextInputProps {
    label?: string;
    error?: string;
    containerStyle?: StyleProp<ViewStyle>;
    validate?: (text: string) => string | null;
    showToggleSecureText?: boolean;
    isIsolated?: boolean;
    allowPasteOverride?: boolean;
    rightIcon?: React.ReactNode;
    numberOnly?: boolean;
    maxDigits?: number;
    email?: boolean;
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    largeText?: boolean; // New prop for large text areas
    hidden?: boolean; // show the input by default, set to false to hide,
    uncontrolled?: boolean;
    preserveFocusOnBlurMs?: number;
    helperText?: string;
    enableAutofill?: boolean;
    labelTopBackgroundColor?: string;
    labelBottomBackgroundColor?: string;
    onInputLayout?: (layout: { y: number; height: number }) => void;
    onInputWrapperRef?: (node: View | null) => void;
    onInputTouchStart?: () => void;
    readOnly?: boolean;
    trimOnBlur?: boolean;
    normalizeOnBlur?: (text: string) => string;
}

const INPUT_BORDER_WIDTH = 2;

export const InputField = forwardRef<TextInput, InputFieldProps>(
    (
        {
            label,
            error,
            style,
            containerStyle,
            validate,
            onChangeText,
            secureTextEntry,
            showToggleSecureText,
            rightIcon,
            numberOnly = false,
            maxDigits = 6,
            email = false,
            autoCapitalize = 'none',
            largeText = false,
            hidden = false,
            uncontrolled = false,
            preserveFocusOnBlurMs = 0,
            helperText,
            enableAutofill = false,
            labelTopBackgroundColor = theme.colors.background,
            labelBottomBackgroundColor = theme.colors.surface,
            onInputLayout,
            onInputWrapperRef,
            onInputTouchStart,
            readOnly = false,
            isIsolated = false,
            allowPasteOverride = false,
            trimOnBlur = false,
            normalizeOnBlur,
            onFocus: parentOnFocus,
            onBlur: parentOnBlur,
            ...props
        },
        ref
    ) => {
        const [internalError, setInternalError] = useState<string | null>(null);
        const [isFocused, setIsFocused] = useState(false);
        const [isRevealed, setIsRevealed] = useState(false);
        const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
        const { scrollInputIntoView } = useKeyboardAwareScroll();
        const {
            value,
            defaultValue,
            maxLength,
            multiline,
            autoComplete,
            cursorColor,
            importantForAutofill,
            selectionColor,
            selectionHandleColor,
            textContentType,
            ...textInputProps
        } = props;
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
            forwardedRef: ref,
            onInputWrapperRef,
            secureTextEntry,
            secureTextHidden,
            shouldSuppressNativeAutofill,
        });

        useEffect(() => () => {
            if (blurTimeoutRef.current) {
                clearTimeout(blurTimeoutRef.current);
            }
        }, []);

        useEffect(() => {
            applyNativeAutofillSuppression();
        }, [applyNativeAutofillSuppression]);

        const handleChangeText = (text: string) => {
            if (numberOnly) {
                const filteredText = text.replace(/[^0-9]/g, '');
                const truncatedText = filteredText.slice(0, maxDigits);
                if (onChangeText) {
                    onChangeText(truncatedText);
                }
            } else {
                if (validate) {
                    const validationError = validate(text);
                    setInternalError(validationError);
                }
                if (onChangeText) {
                    onChangeText(text);
                }
            }
        };

        const displayError = error || internalError;
        const activeBorderColor = displayError
            ? theme.colors.error
            : isFocused
                ? theme.colors.primary
                : theme.colors.divider;
        const labelColor = displayError
            ? theme.colors.error
            : isFocused
                ? theme.colors.primary
                : theme.colors.textSecondary;

        if (hidden) return null;
        const shouldHideContextMenu = allowPasteOverride ? false : (Boolean(secureTextEntry) && secureTextHidden);
        const keyboardType = numberOnly ? 'number-pad' : email ? 'email-address' : 'default';
        const useIsolated = Platform.OS === 'android' && isIsolated && !multiline;
        const InputComponent = useIsolated ? IsolatedTextInput : TextInput;

        return (
            <View style={[label && styles.fieldContainerWithLabel, containerStyle]}>
                {label && (
                    <FloatingInputLabel
                        label={label}
                        color={labelColor}
                        topBackgroundColor={labelTopBackgroundColor}
                        bottomBackgroundColor={labelBottomBackgroundColor}
                    />
                )}
                <View
                    ref={assignInputWrapperRef}
                    collapsable={false}
                    style={[
                        styles.inputWrapper,
                        {
                            borderColor: activeBorderColor,
                            shadowColor: isFocused ? theme.colors.primary : 'transparent',
                            shadowOpacity: isFocused ? 0.18 : 0,
                            shadowRadius: isFocused ? 6 : 0,
                            elevation: isFocused ? 2 : 0,
                            borderWidth: INPUT_BORDER_WIDTH,
                        },
                        readOnly && styles.inputWrapperReadOnly,
                        displayError && styles.inputWrapperError,
                    ]}
                    onLayout={(event) => {
                        onInputLayout?.({
                            y: event.nativeEvent.layout.y,
                            height: event.nativeEvent.layout.height,
                        });
                    }}
                    onTouchStart={onInputTouchStart}
                >
                    {/* iOS HEURISTIC DECOY: Absorbs Apple's autofill grouping for isolated fields */}
                    {Platform.OS === 'ios' && isIsolated && (
                        <TextInput
                            style={{ position: 'absolute', top: -9999, left: -9999, width: 1, height: 1, opacity: 0.01 }}
                            textContentType="username"
                            autoComplete="username"
                            pointerEvents="none"
                            editable={false}
                        />
                    )}
                    <InputComponent
                        {...textInputProps}
                        ref={assignInputRef}
                        autoComplete={resolvedAutoComplete}
                        cursorColor={Platform.OS === 'android' ? cursorColor ?? theme.colors.primary : cursorColor}
                        importantForAutofill={Platform.OS === 'android' ? androidAutofillMode : importantForAutofill}
                        importantForAccessibility={Platform.OS === 'android' && isAndroidAutofillDisabled ? 'no' : undefined}
                        selectionColor={selectionColor ?? theme.colors.primary}
                        selectionHandleColor={Platform.OS === 'android' ? selectionHandleColor ?? theme.colors.primary : selectionHandleColor}
                        textContentType={Platform.OS === 'ios' ? (textContentType ?? (isAndroidAutofillDisabled && secureTextEntry ? 'oneTimeCode' : undefined)) : undefined}
                        underlineColorAndroid="transparent"
                        style={[
                            commonStyles.flex,
                            {
                                backgroundColor: 'transparent',
                                color: theme.colors.text,
                                fontSize: theme.typography.body.fontSize,
                                height: 44,
                                minHeight: 44,
                                borderWidth: 0,
                                borderRadius: 0,
                                includeFontPadding: false,
                                paddingHorizontal: theme.spacing.md + 4,
                                paddingVertical: 0,
                                paddingRight: (showToggleSecureText && rightIcon) ? 70 : (showToggleSecureText || rightIcon) ? 40 : 12,
                                textAlignVertical: 'center',
                                ...(readOnly && {
                                    color: theme.colors.textSecondary,
                                }),
                                ...(largeText && {
                                    height: undefined,
                                    minHeight: 140,
                                    maxHeight: undefined,
                                    textAlignVertical: 'top',
                                    paddingVertical: theme.spacing.xl * 2,
                                    lineHeight: 20,
                                    paddingHorizontal: theme.spacing.lg,
                                }),
                                ...(multiline && {
                                    textAlignVertical: largeText ? 'top' : 'center',
                                    lineHeight: largeText ? 20 : undefined,
                                }),
                            },
                            style,
                        ]}
                        defaultValue={uncontrolled ? defaultValue ?? (typeof value === 'string' ? value : undefined) : defaultValue}
                        value={uncontrolled ? undefined : value}
                        multiline={multiline}
                        maxLength={numberOnly ? maxDigits : maxLength}
                        onFocus={(e) => {
                            if (blurTimeoutRef.current) {
                                clearTimeout(blurTimeoutRef.current);
                                blurTimeoutRef.current = null;
                            }
                            setIsFocused(true);
                            applyNativeAutofillSuppression();
                            scrollInputIntoView(
                                (inputWrapperRef.current ?? inputRef.current) as KeyboardAwareInputNode | null,
                            );
                            if (parentOnFocus) {
                                parentOnFocus(e);
                            }
                        }}
                        onBlur={(e) => {
                            if (!uncontrolled && typeof value === 'string' && (trimOnBlur || normalizeOnBlur)) {
                                const normalizedValue = normalizeOnBlur ? normalizeOnBlur(value) : value.trim();
                                if (normalizedValue !== value) {
                                    handleChangeText(normalizedValue);
                                }
                            }
                            if (preserveFocusOnBlurMs > 0) {
                                blurTimeoutRef.current = setTimeout(() => {
                                    setIsFocused(false);
                                    blurTimeoutRef.current = null;
                                }, preserveFocusOnBlurMs);
                            } else {
                                setIsFocused(false);
                            }
                            if (parentOnBlur) {
                                parentOnBlur(e);
                            }
                        }}
                        onChangeText={handleChangeText}
                        keyboardType={keyboardType}
                        secureTextEntry={Boolean(secureTextEntry) ? secureTextHidden : false}
                        autoCapitalize={isIsolated ? 'none' : autoCapitalize}
                        autoCorrect={isIsolated ? false : props.autoCorrect}
                        contextMenuHidden={shouldHideContextMenu}
                    />
                    {rightIcon && (
                        <View style={{
                            position: 'absolute',
                            right: 8,
                            top: 0,
                            bottom: 0,
                            justifyContent: 'center',
                            alignItems: 'center',
                            zIndex: 2,
                            transform: [{ translateY: Platform.OS === 'android' ? -3 : -1.5 }],
                        }} pointerEvents="box-none">
                            <View style={{
                                height: '100%',
                                justifyContent: 'center',
                                alignItems: 'center',
                            }}>
                                {rightIcon}
                            </View>
                        </View>
                    )}
                    {showToggleSecureText && (
                        <TouchableOpacity
                            onPress={() => {
                                // Suppress blur so handleTouchEnd → blurAllIsolatedInputs
                                // doesn't clear focus ~90ms after the toggle.
                                suppressBlurForToggle();
                                setIsRevealed((v) => !v);
                                // Re-focus the input after toggling reveal
                                // (backup for any residual focus loss).
                                setTimeout(() => {
                                    inputRef.current?.focus?.();
                                }, 0);
                            }}
                            style={{
                                position: 'absolute',
                                right: 8,
                                padding: 4,
                                zIndex: 2,
                                height: '100%',
                                justifyContent: 'center',
                                alignItems: 'center',
                            }}
                            accessibilityLabel={isRevealed ? 'Hide text' : 'Show text'}
                        >
                            <Icon
                                name={isRevealed ? 'visibility-off' : 'visibility'}
                                size={22}
                                color={theme.colors.primary}
                            />
                        </TouchableOpacity>
                    )}
                </View>
                {(displayError || helperText) && (
                    <CustomText
                        style={[
                            commonStyles.textCaption,
                            styles.supportingText,
                            { color: displayError ? theme.colors.error : theme.colors.textSecondary },
                        ]}
                    >
                        {displayError || helperText}
                    </CustomText>
                )}
            </View>
        );
    }
);

const styles = StyleSheet.create({
    fieldContainerWithLabel: {
        paddingTop: 9,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 0 },
        zIndex: 1,
    },
    inputWrapperReadOnly: {
        backgroundColor: theme.colors.surface,
        opacity: 0.78,
    },
    inputWrapperError: {
        borderColor: theme.colors.error,
    },
    supportingText: {
        marginTop: theme.spacing.xs,
        marginLeft: theme.spacing.md,
    },
});