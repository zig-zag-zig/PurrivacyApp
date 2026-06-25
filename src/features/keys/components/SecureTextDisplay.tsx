import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, TouchableOpacity, View, Platform } from 'react-native';
import { IsolatedTextInput } from '../../../components/IsolatedTextInput';
import Icon from '@expo/vector-icons/MaterialIcons';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { CustomText } from '../../../components/CustomText';

interface SecureTextDisplayProps extends TextInputProps {
    text: string;
    secure?: boolean;
    revealDuration?: number;
    onChangeText?: (text: string) => void;
}

export const SecureTextDisplay: React.FC<SecureTextDisplayProps> = ({
    text,
    secure = true,
    revealDuration = 30000,
    onChangeText,
    style,
    ...props
}) => {
    const [isRevealed, setIsRevealed] = useState(!secure);
    const [revealTimeout, setRevealTimeout] = useState<NodeJS.Timeout | null>(null);
    const { testID, accessibilityLabel } = props;

    const InputComponent = Platform.OS === 'android' ? IsolatedTextInput : TextInput;

    const toggleReveal = () => {
        if (!secure) return;

        if (isRevealed) {
            setIsRevealed(false);
            if (revealTimeout) {
                clearTimeout(revealTimeout);
                setRevealTimeout(null);
            }
        } else {
            setIsRevealed(true);
            const timeout = setTimeout(() => {
                setIsRevealed(false);
            }, revealDuration);
            setRevealTimeout(timeout);
        }
    };

    useEffect(() => {
        return () => {
            if (revealTimeout) clearTimeout(revealTimeout);
        };
    }, [revealTimeout]);

    return (
        <View style={[commonStyles.row, commonStyles.spaceBetween, commonStyles.surface, styles.container, style]}>
            {onChangeText ? (
                <>
                    {/* iOS HEURISTIC DECOY: Absorbs Apple's autofill grouping for secure editable fields */}
                    {Platform.OS === 'ios' && secure && (
                        <TextInput
                            style={{ position: 'absolute', top: -9999, left: -9999, width: 1, height: 1, opacity: 0.01 }}
                            textContentType="username"
                            autoComplete="username"
                            pointerEvents="none"
                            editable={false}
                        />
                    )}
                    <InputComponent
                        style={[commonStyles.textBody, commonStyles.flex]}
                        value={text}
                        onChangeText={onChangeText}
                        secureTextEntry={!isRevealed && secure}
                        placeholderTextColor={theme.colors.placeholder}
                        {...props}
                        autoComplete="off"
                        autoCorrect={false}
                        autoCapitalize="none"
                        cursorColor={theme.colors.primary}
                        selectionColor={theme.colors.primary}
                        selectionHandleColor={theme.colors.primary}
                        underlineColorAndroid="transparent"
                    />
                </>
            ) : (
                <CustomText
                    testID={testID}
                    accessibilityLabel={accessibilityLabel}
                    style={[commonStyles.textBody, commonStyles.flex]}
                    selectable={false}
                    contextMenuHidden={true}
                >
                    {isRevealed || !secure ? text : '•'.repeat(Math.min(text.length, 100))}
                </CustomText>
            )}
            {secure && (
                <TouchableOpacity
                    onPress={toggleReveal}
                    style={styles.iconButton}
                    accessibilityLabel={isRevealed ? 'Hide text' : 'Show text'}
                >
                    <Icon
                        name={isRevealed ? 'visibility-off' : 'visibility'}
                        size={24}
                        color={theme.colors.primary}
                    />
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: theme.spacing.sm,
        borderRadius: theme.borderRadius.md,
    },
    iconButton: commonStyles.iconButton,
});