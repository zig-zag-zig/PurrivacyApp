import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
    Platform,
    LayoutChangeEvent,
    StyleSheet,
    StyleProp,
    TextInput,
    TextInputProps,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { commonStyles } from '../styles/commonStyles';
import { theme } from '../styles/theme';
import { CustomText } from './CustomText';
import { configureNativeNonAutofillTextInput } from '../native/textInputAutofill';

interface InputFieldProps extends TextInputProps {
    label?: string;
    error?: string;
    containerStyle?: StyleProp<ViewStyle>;
    validate?: (text: string) => string | null;
    showToggleSecureText?: boolean;
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
}

const INPUT_BORDER_WIDTH = 2;
const LABEL_LEFT = theme.spacing.md;
const LABEL_GAP_PADDING = theme.spacing.xs;
const LABEL_LINE_HEIGHT = 16;
const LABEL_BORDER_CROSSING_Y = 8;

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
            onFocus: parentOnFocus,
            onBlur: parentOnBlur,
            ...props
        },
        ref
    ) => {
        // If the caller wants the input hidden, render nothing
        if (hidden) return null;
        const [internalError, setInternalError] = useState<string | null>(null);
        const [isFocused, setIsFocused] = useState(false);
        const [isRevealed, setIsRevealed] = useState(false);
        const [labelWidth, setLabelWidth] = useState(0);
        const inputRef = useRef<TextInput | null>(null);
        const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        const androidAutofillMode = importantForAutofill ?? (enableAutofill ? 'yes' : 'noExcludeDescendants');
        const isAndroidAutofillDisabled = androidAutofillMode === 'no' || androidAutofillMode === 'noExcludeDescendants';
        const resolvedAutoComplete = Platform.OS === 'android'
            ? isAndroidAutofillDisabled ? 'off' : autoComplete
            : textContentType ? undefined : autoComplete;
        const secureTextHidden = showToggleSecureText ? !isRevealed : Boolean(secureTextEntry);
        const shouldSuppressNativeAutofill = Platform.OS === 'android' && !enableAutofill;
        const shouldUseNativeSecureTextEntry =
            Boolean(secureTextEntry) && !(shouldSuppressNativeAutofill && Platform.OS === 'android');

        const assignInputRef = useCallback((node: TextInput | null) => {
            inputRef.current = node;
            if (node && shouldSuppressNativeAutofill) {
                configureNativeNonAutofillTextInput(node, Boolean(secureTextEntry) && secureTextHidden);
            }
            if (typeof ref === 'function') {
                ref(node);
            } else if (ref) {
                ref.current = node;
            }
        }, [ref, secureTextEntry, secureTextHidden, shouldSuppressNativeAutofill]);

        const applyNativeAutofillSuppression = useCallback(() => {
            if (!shouldSuppressNativeAutofill) return;

            configureNativeNonAutofillTextInput(inputRef.current, Boolean(secureTextEntry) && secureTextHidden);
        }, [secureTextEntry, secureTextHidden, shouldSuppressNativeAutofill]);

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
        const handleLabelLayout = (event: LayoutChangeEvent) => {
            const nextWidth = Math.ceil(event.nativeEvent.layout.width);
            setLabelWidth(previousWidth => previousWidth === nextWidth ? previousWidth : nextWidth);
        };

        return (
            <View style={[label && styles.fieldContainerWithLabel, containerStyle]}>
                {label && (
                    <>
                        <View
                            pointerEvents="none"
                            style={[
                                styles.labelBackplate,
                                { width: labelWidth + LABEL_GAP_PADDING * 2 },
                            ]}
                        >
                            <View
                                style={[
                                    styles.labelBackplateTop,
                                    { backgroundColor: labelTopBackgroundColor },
                                ]}
                            />
                            <View
                                style={[
                                    styles.labelBackplateBottom,
                                    { backgroundColor: labelBottomBackgroundColor },
                                ]}
                            />
                        </View>
                        <CustomText
                            onLayout={handleLabelLayout}
                            pointerEvents="none"
                            style={[
                                styles.floatingLabel,
                                { color: labelColor },
                            ]}
                            numberOfLines={1}
                        >
                            {label}
                        </CustomText>
                    </>
                )}
                <View style={[
                    styles.inputWrapper,
                    {
                        borderColor: activeBorderColor,
                        shadowColor: isFocused ? theme.colors.primary : 'transparent',
                        shadowOpacity: isFocused ? 0.18 : 0,
                        shadowRadius: isFocused ? 6 : 0,
                        elevation: isFocused ? 2 : 0,
                        borderWidth: INPUT_BORDER_WIDTH,
                    },
                    displayError && styles.inputWrapperError,
                ]}>
                    <TextInput
                        {...textInputProps}
                        ref={assignInputRef}
                        autoComplete={resolvedAutoComplete}
                        cursorColor={Platform.OS === 'android' ? cursorColor ?? theme.colors.primary : cursorColor}
                        importantForAutofill={Platform.OS === 'android' ? androidAutofillMode : importantForAutofill}
                        selectionColor={selectionColor ?? theme.colors.primary}
                        selectionHandleColor={Platform.OS === 'android' ? selectionHandleColor ?? theme.colors.primary : selectionHandleColor}
                        textContentType={Platform.OS === 'ios' ? textContentType : undefined}
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
                            if (parentOnFocus) {
                                parentOnFocus(e);
                            }
                        }}
                        onBlur={(e) => {
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
                        keyboardType={numberOnly ? 'number-pad' : email && enableAutofill ? 'email-address' : 'default'}
                        secureTextEntry={shouldUseNativeSecureTextEntry ? secureTextHidden : false}
                        autoCapitalize={autoCapitalize}
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
                            onPress={() => setIsRevealed((v) => !v)}
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
        paddingTop: 8,
    },
    floatingLabel: {
        position: 'absolute',
        top: 0,
        left: LABEL_LEFT,
        zIndex: 3,
        fontSize: theme.typography.caption.fontSize,
        lineHeight: LABEL_LINE_HEIGHT,
        fontWeight: '600',
    },
    labelBackplate: {
        position: 'absolute',
        top: 0,
        left: LABEL_LEFT - LABEL_GAP_PADDING,
        height: LABEL_LINE_HEIGHT,
        zIndex: 2,
        overflow: 'hidden',
    },
    labelBackplateTop: {
        height: LABEL_BORDER_CROSSING_Y,
    },
    labelBackplateBottom: {
        height: LABEL_LINE_HEIGHT - LABEL_BORDER_CROSSING_Y,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 0 },
    },
    inputWrapperError: {
        borderColor: theme.colors.error,
    },
    supportingText: {
        marginTop: theme.spacing.xs,
        marginLeft: theme.spacing.md,
    },
});
