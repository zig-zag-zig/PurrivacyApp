import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { InputField } from '../../../components/InputField';
import { CustomText } from '../../../components/CustomText';
import { securityService } from '../../security/services/securityService';
import { useAuth } from '../../auth/state/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { logger } from '../../../utils/logger';

interface PassphraseFieldProps {
    fingerprint: string;
    name?: string;
    onPassphraseChange?: (passphrase: string) => void;
    hidden?: boolean;
    doNotUseAutofill?: boolean;
    label?: string;
    error?: string;
    value?: string;
    helperText?: string;
    labelTopBackgroundColor?: string;
    labelBottomBackgroundColor?: string;
}

export const PassphraseField: React.FC<PassphraseFieldProps> = (props) => {
    const {
        fingerprint,
        name,
        onPassphraseChange,
        value,
        error,
        hidden,
        doNotUseAutofill,
        label,
        helperText,
        labelTopBackgroundColor,
        labelBottomBackgroundColor,
    } = props;
    const { user } = useAuth();
    const [passphrase, setPassphrase] = useState('');
    const [showAutofillBanner, setShowAutofillBanner] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const prevKeyFingerprintRef = useRef<string | null>(null);
    const isFocusedRef = useRef(false);
    const shouldShowBannerOnFocus = useRef(false);
    const [hasStoredPassphrase, setHasStoredPassphrase] = useState(false);

    useEffect(() => {
        if (prevKeyFingerprintRef.current !== fingerprint) {
            const hadPreviousFingerprint = prevKeyFingerprintRef.current !== null;
            setShowAutofillBanner(false);
            if (hadPreviousFingerprint) {
                setPassphrase('');
                if (onPassphraseChange) onPassphraseChange('');
            }
            isFocusedRef.current = false;
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            prevKeyFingerprintRef.current = fingerprint;
        }
    }, [fingerprint, onPassphraseChange]);

    // Always check if a stored passphrase exists for this fingerprint and autofill context
    const checkStoredPassphrase = useCallback(async () => {
        if (doNotUseAutofill) {
            setHasStoredPassphrase(false);
            return;
        }
        if (!fingerprint || !user?.uid) {
            setHasStoredPassphrase(false);
            return;
        }
        try {
            const stored = await securityService.hasStoredPassphrase(user.uid, fingerprint);
            setHasStoredPassphrase(stored);
        } catch {
            setHasStoredPassphrase(false);
        }
    }, [doNotUseAutofill, user?.uid, fingerprint]);

    useFocusEffect(
        useCallback(() => {
            checkStoredPassphrase();
        }, [checkStoredPassphrase])
    );

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: showAutofillBanner ? 1 : 0,
            duration: showAutofillBanner ? 300 : 200,
            useNativeDriver: true,
        }).start();
    }, [showAutofillBanner, fadeAnim]);

    useEffect(() => {
        if (!hasStoredPassphrase) {
            setShowAutofillBanner(false);
        }
    }, [hasStoredPassphrase]);

    const handleFocus = async () => {
        isFocusedRef.current = true;
        if (doNotUseAutofill) return;
        let shouldShow = hasStoredPassphrase;
        if (shouldShowBannerOnFocus.current) {
            shouldShow = true;
            shouldShowBannerOnFocus.current = false;
        }
        setShowAutofillBanner(shouldShow);
    };

    const handleBlur = () => {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        isFocusedRef.current = false;
        setShowAutofillBanner(false);
    };

    const handleChangeText = (text: string) => {
        setPassphrase(text);
        if (onPassphraseChange) onPassphraseChange(text);
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        if (doNotUseAutofill) return;

        setShowAutofillBanner(false);
        typingTimeoutRef.current = setTimeout(async () => {
            if (
                isFocusedRef.current &&
                hasStoredPassphrase
            ) {
                setShowAutofillBanner(true);
            }
        }, text.trim().length > 0 ? 2000 : 0);
    };

    const handleAutofill = async () => {
        if (!user?.uid || doNotUseAutofill) return;
        try {
            const stored = await securityService.getPassphrase(user.uid, fingerprint);
            if (stored) {
                setPassphrase(stored);
                if (onPassphraseChange) onPassphraseChange(stored);
                setShowAutofillBanner(false);
            }
        } catch (error) {
            logger.warn('passphrase autofill failed', { error });
        }
    };

    if (hidden) return null;

    return (
        <View style={{ marginBottom: theme.spacing.sm }}>
            <View style={{ position: 'relative' }}>
                <InputField
                    value={value !== undefined ? value : passphrase}
                    onChangeText={handleChangeText}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    secureTextEntry
                    showToggleSecureText
                    label={label}
                    labelTopBackgroundColor={labelTopBackgroundColor}
                    labelBottomBackgroundColor={labelBottomBackgroundColor}
                    error={error}
                    hidden={hidden}
                    helperText={helperText}
                />
                {hasStoredPassphrase && (
                    <Animated.View
                        style={[
                            styles.autofillBanner,
                            {
                                opacity: fadeAnim,
                                display: showAutofillBanner ? 'flex' : 'none',
                            },
                        ]}
                        pointerEvents={showAutofillBanner ? 'auto' : 'none'}
                    >
                        <TouchableOpacity
                            onPress={handleAutofill}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                padding: theme.spacing.sm,
                                justifyContent: 'flex-start',
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', ...commonStyles.flex }}>
                                <Icon
                                    name="fingerprint"
                                    size={20}
                                    color={theme.colors.surface}
                                    style={{ marginRight: theme.spacing.xs }}
                                />
                                <CustomText style={{
                                    color: theme.colors.surface,
                                    fontSize: theme.typography.caption.fontSize,
                                    ...commonStyles.flex,
                                }}>
                                    Use saved passphrase
                                </CustomText>
                            </View>
                        </TouchableOpacity>
                    </Animated.View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    autofillBanner: {
        backgroundColor: theme.colors.primary,
        borderRadius: 8,
        elevation: 5,
        marginTop: theme.spacing.xs,
        zIndex: 1000,
    },
});
