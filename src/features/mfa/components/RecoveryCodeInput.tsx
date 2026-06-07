import React, { useRef, useEffect, useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { theme } from '../../../styles/theme';

interface RecoveryCodeInputProps {
    value: string;
    onChange: (text: string) => void;
    onSubmit: () => void;
    loading: boolean;
}

export const RecoveryCodeInput: React.FC<RecoveryCodeInputProps> = ({
    value,
    onChange,
    onSubmit,
    loading,
}) => {
    const recoveryInputRef = useRef<TextInput | null>(null);
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        setTimeout(() => {
            recoveryInputRef.current?.focus();
        }, 100);
    }, []);

    const handleChange = (text: string) => {
        const allowedText = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const limitedText = allowedText.slice(0, 12);
        onChange(limitedText);
    };

    const inputStyles = StyleSheet.create({
        base: {
            width: '100%',
            height: 60,
            borderWidth: 1.5,
            borderColor: theme.colors.divider,
            borderRadius: theme.borderRadius.md,
            paddingHorizontal: theme.spacing.md,
            fontSize: 20,
            fontWeight: 'bold' as const,
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
            textAlign: 'center' as const,
            letterSpacing: 2,
            shadowColor: 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
            transform: [],
        },
        focused: {
            borderColor: theme.colors.primary,
            backgroundColor: theme.colors.surface,
            shadowColor: theme.colors.primary,
            shadowOpacity: 0.4,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 },
            elevation: 4,
        },
    });

    return (
        <View style={styles.recoveryCodeContainer}>
            <View style={styles.fieldContainer}>
                <CustomText
                    pointerEvents="none"
                    style={[
                        styles.floatingLabel,
                        { color: isFocused ? theme.colors.primary : theme.colors.textSecondary },
                    ]}
                    numberOfLines={1}
                >
                    Recovery code
                </CustomText>
                <TextInput
                    ref={recoveryInputRef}
                    autoComplete="off"
                    cursorColor={theme.colors.primary}
                    importantForAutofill="noExcludeDescendants"
                    selectionColor={theme.colors.primary}
                    selectionHandleColor={theme.colors.primary}
                    underlineColorAndroid="transparent"
                    style={[inputStyles.base, isFocused && inputStyles.focused]}
                    value={value}
                    onChangeText={handleChange}
                    placeholder="Enter 12-character code"
                    placeholderTextColor="#888"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoFocus={true}
                    maxLength={12}
                    editable={!loading}
                    onSubmitEditing={onSubmit}
                    returnKeyType="done"
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                />
            </View>
            <CustomText style={styles.charCount}>
                {value.length}/12
            </CustomText>
            <Button
                label="Submit"
                onPress={onSubmit}
                disabled={value.length !== 12 || loading}
                loading={loading}
                style={styles.submitButton}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    recoveryCodeContainer: {
        width: '100%',
        marginBottom: theme.spacing.lg,
        alignItems: 'center',
    },
    fieldContainer: {
        width: '100%',
        paddingTop: theme.spacing.sm,
        position: 'relative',
    },
    floatingLabel: {
        position: 'absolute',
        top: 0,
        left: theme.spacing.md,
        zIndex: 2,
        paddingHorizontal: theme.spacing.xs,
        backgroundColor: theme.colors.surface,
        fontSize: theme.typography.caption.fontSize,
        lineHeight: 16,
        fontWeight: '600',
    },
    charCount: {
        marginTop: theme.spacing.sm,
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    submitButton: {
        marginTop: theme.spacing.md,
        width: '100%',
    },
});
