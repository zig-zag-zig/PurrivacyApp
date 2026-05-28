import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { CustomText } from '../../../components/CustomText';

interface SecureTextDisplayProps extends TextInputProps {
    text: string;
    secure?: boolean;
    revealDuration?: number;
    onChangeText?: (text: string) => void; // Add this for editable mode
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
                <TextInput
                    style={[commonStyles.textBody, commonStyles.flex]}
                    value={text}
                    onChangeText={onChangeText}
                    secureTextEntry={!isRevealed && secure}
                    placeholderTextColor={theme.colors.placeholder}
                    {...props}
                    autoComplete="off"
                    cursorColor={theme.colors.primary}
                    importantForAutofill="noExcludeDescendants"
                    selectionColor={theme.colors.primary}
                    selectionHandleColor={theme.colors.primary}
                    underlineColorAndroid="transparent"
                />
            ) : (
                <CustomText
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
