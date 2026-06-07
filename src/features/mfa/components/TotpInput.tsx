import React from 'react';
import { ActivityIndicator, View, TouchableOpacity, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../../../styles/theme';

interface TotpInputProps {
    code: string[];
    focusedIndex: number | null;
    loading: boolean;
    inputRef: React.RefObject<TextInput | null>;
    onChangeText: (text: string) => void;
    onFocus: () => void;
    onBlur: () => void;
    onBoxPress: (index: number) => void;
    onLongPress: () => void;
}

export const TotpInput: React.FC<TotpInputProps> = ({
    code,
    focusedIndex,
    loading,
    inputRef,
    onChangeText,
    onFocus,
    onBlur,
    onBoxPress,
    onLongPress,
}) => {
    return (
        <View style={styles.codeInputHost}>
            <TextInput
                ref={inputRef}
                autoComplete="off"
                caretHidden={true}
                contextMenuHidden={true}
                cursorColor="transparent"
                editable={!loading}
                importantForAutofill="noExcludeDescendants"
                inputMode="numeric"
                keyboardType="number-pad"
                maxLength={6}
                onBlur={onBlur}
                onChangeText={onChangeText}
                onFocus={onFocus}
                selectionColor="transparent"
                selectionHandleColor="transparent"
                showSoftInputOnFocus={true}
                style={styles.hiddenInput}
                underlineColorAndroid="transparent"
                value={code.join('')}
            />
            <View style={[styles.codeInputContainer, loading && styles.loadingContent]}>
                {code.map((digit, index) => (
                    <React.Fragment key={index}>
                        <View
                            style={[
                                styles.codeInputBox,
                                focusedIndex === index && styles.codeInputBoxFocused
                            ]}
                        >
                            <Text style={[
                                styles.codeInputText,
                                focusedIndex === index && styles.codeInputTextFocused
                            ]}>
                                {digit}
                            </Text>

                            <TouchableOpacity
                                style={styles.touchOverlay}
                                activeOpacity={1}
                                onLongPress={onLongPress}
                                onPress={() => onBoxPress(index)}
                            />
                        </View>
                    </React.Fragment>
                ))}
            </View>
            {loading && (
                <View pointerEvents="none" style={styles.loadingOverlay}>
                    <ActivityIndicator
                        size="small"
                        color={theme.colors.primary}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    codeInputHost: {
        position: 'relative',
        marginBottom: theme.spacing.lg,
    },
    codeInputContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: theme.spacing.sm,
    },
    codeInputBox: {
        width: 56,
        height: 64,
        borderWidth: 2,
        borderColor: theme.colors.divider,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
    },
    codeInputBoxFocused: {
        borderColor: theme.colors.primary,
        borderWidth: 3,
        backgroundColor: theme.colors.surface,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 4,
    },
    codeInputText: {
        fontSize: 26,
        fontWeight: '700',
        color: theme.colors.text,
        textAlign: 'center',
        width: '100%',
        letterSpacing: 0.5,
    },
    codeInputTextFocused: {
        color: theme.colors.primary,
        textShadowColor: 'rgba(187, 134, 252, 0.3)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 4,
    },
    hiddenInput: {
        position: 'absolute',
        top: -200,
        left: -200,
        width: 1,
        height: 1,
        opacity: 0,
        fontSize: 1,
        color: 'transparent',
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0,
        margin: 0,
        includeFontPadding: false,
        zIndex: 5,
    },
    touchOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        zIndex: 10,
    },
    loadingContent: {
        opacity: 0.28,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFill,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
    },
});
