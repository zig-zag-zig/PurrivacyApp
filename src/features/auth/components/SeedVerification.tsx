import { useNavigation } from '@react-navigation/native';
import { validateMnemonic } from 'bip39';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { Button } from '../../../components/Button';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { CustomText } from '../../../components/CustomText';
import { RootNavigationProps } from '../../../app/navigation/types';
import { AuthService } from '../services/authService';
import { theme } from '../../../styles/theme';
import { useToast } from '../../../app/state/ToastContext';
import { useSecureCopy } from '../../../hooks/useSecureCopy';

interface SeedVerificationProps {
    seed: string;
    onVerified: () => void | Promise<void>;
    isLoading?: boolean;
}

export const SeedVerification: React.FC<SeedVerificationProps> = ({
    seed,
    onVerified,
    isLoading = false,
}) => {
    const [confirmed, setConfirmed] = useState(false);
    const { secureCopy } = useSecureCopy();
    const [copied, setCopied] = useState(false);
    const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const navigation = useNavigation<RootNavigationProps>();
    const { showToast } = useToast();

    const handleCopySeed = () => {
        void secureCopy(seed);
        showToast('Seed copied to clipboard', 'success');

        setCopied(true);

        if (copyFeedbackTimeoutRef.current) {
            clearTimeout(copyFeedbackTimeoutRef.current);
        }
        copyFeedbackTimeoutRef.current = setTimeout(() => {
            setCopied(false);
            copyFeedbackTimeoutRef.current = null;
        }, 1600);
    };

    useEffect(() => () => {
        if (copyFeedbackTimeoutRef.current) {
            clearTimeout(copyFeedbackTimeoutRef.current);
        }
    }, []);

    useEffect(() => {
        if (!validateMnemonic(seed)) {
            showToast('Recovery phrase could not be verified. Please restart signup.', 'error');
            navigation.navigate('Signup');
        }
    }, [seed, navigation, showToast]);

    if (!validateMnemonic(seed)) {
        return (
            <ScreenContainer>
                <CustomText>Critical error occurred. Please restart signup.</CustomText>
                <Button
                    label="Go Back"
                    onPress={() => navigation.navigate('Signup')}
                />
            </ScreenContainer>
        );
    }

    return (
        <ScreenContainer testID="purrivacy.seed.screen">
            {!confirmed ? (
                <View style={styles.panel}>
                    <CustomText variant="title" style={styles.title}>
                        Your Recovery Seed
                    </CustomText>

                    <CustomText style={styles.description}>
                        Save these words somewhere secure. You will need them to recover your account.
                    </CustomText>

                    <TouchableOpacity
                        testID="purrivacy.seed.words"
                        activeOpacity={0.7}
                        onLongPress={handleCopySeed}
                        delayLongPress={500}
                        style={[styles.seedGrid, copied && styles.seedGridCopied]}
                        accessibilityLabel="Recovery seed words"
                        accessibilityHint="Long press to copy the recovery seed"
                    >
                        {seed.split(' ').map((word, idx) => (
                            <View
                                key={idx}
                                style={styles.seedWord}
                            >
                                <CustomText
                                    style={styles.seedIndex}
                                >
                                    {idx + 1}
                                </CustomText>

                                <CustomText
                                    style={styles.seedText}
                                    selectable={false}
                                    contextMenuHidden={true}
                                >
                                    {word}
                                </CustomText>
                            </View>
                        ))}
                    </TouchableOpacity>

                    <View style={styles.actionStack}>
                        <Button
                            label={copied ? 'Copied' : 'Copy seed'}
                            testID="purrivacy.seed.copy"
                            onPress={handleCopySeed}
                            variant="secondary"
                            style={styles.actionButton}
                            icon={
                                <Icon
                                    name={copied ? 'check' : 'content-copy'}
                                    size={18}
                                    color={theme.colors.primary}
                                />
                            }
                        />

                        <Button
                            label="I've saved the seed"
                            testID="purrivacy.seed.saved"
                            onPress={() => setConfirmed(true)}
                            style={styles.actionButton}
                        />
                    </View>
                </View>
            ) : (
                <SeedVerificationChallenge
                    seed={seed}
                    onComplete={onVerified}
                    isLoading={isLoading}
                />
            )}
        </ScreenContainer>
    );
};

interface SeedVerificationChallengeProps {
    seed: string;
    onComplete: () => void | Promise<void>;
    isLoading?: boolean;
}

const SeedVerificationChallenge: React.FC<SeedVerificationChallengeProps> = ({
    seed,
    onComplete,
    isLoading = false,
}) => {
    const [positions] = useState(() => AuthService.getThreeUniqueRandomIndices(seed));
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);
    const isBusy = isVerifying || isLoading;

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const canVerify = positions.every(
        pos => typeof answers[pos] === 'string' && answers[pos].trim().length > 0
    );

    const verifyAnswers = async () => {
        setIsVerifying(true);
        setError(null);

        try {
            const allCorrect = AuthService.verifySeed(seed, answers, positions);

            if (allCorrect) {
                await onComplete();
            } else {
                setError('Incorrect words, please check your seed and try again.');
            }
        } finally {
            if (mountedRef.current) {
                setIsVerifying(false);
            }
        }
    };

    const handleWordChange = (pos: number, text: string) => {
        setAnswers(prev => ({
            ...prev,
            [pos]: text.toLowerCase(),
        }));
    };

    return (
        <View style={styles.panel}>
            <CustomText variant="title" style={styles.title}>
                Verify Recovery Seed
            </CustomText>

            <CustomText style={styles.description}>
                Enter these words from your recovery seed.
            </CustomText>

            <View style={styles.challengeFields}>
                {positions.map(pos => (
                    <InputField
                        key={pos}
                        label={`Word #${pos}`}
                        testID={`purrivacy.seed.challenge.word.${pos}`}
                        value={answers[pos] || ''}
                        onChangeText={text => handleWordChange(pos, text)}
                        containerStyle={styles.challengeField}
                        style={styles.challengeInput}
                        autoCorrect={false}
                        autoCapitalize="none"
                        editable={!isBusy}
                        trimOnBlur
                    />
                ))}
            </View>

            {error && (
                <CustomText style={styles.errorText}>
                    {error}
                </CustomText>
            )}

            <Button
                label="Verify"
                testID="purrivacy.seed.challenge.verify"
                onPress={verifyAnswers}
                disabled={!canVerify || isBusy}
                loading={isBusy}
                style={styles.verifyButton}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    panel: {
        gap: theme.spacing.md,
    },
    title: {
        textAlign: 'center',
    },
    description: {
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    seedGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
        justifyContent: 'center',
        padding: theme.spacing.sm,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background,
    },
    seedGridCopied: {
        backgroundColor: 'rgba(187, 134, 252, 0.12)',
    },
    seedWord: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 92,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        backgroundColor: theme.colors.surface,
    },
    seedIndex: {
        color: theme.colors.primary,
        fontWeight: '700',
        marginRight: theme.spacing.xs,
        fontSize: 12,
    },
    seedText: {
        color: theme.colors.text,
        fontSize: 15,
        fontFamily: 'monospace',
    },
    actionStack: {
        gap: theme.spacing.sm,
    },
    actionButton: {
        marginVertical: 0,
    },
    challengeFields: {
        gap: theme.spacing.md,
    },
    challengeField: {
        width: '100%',
    },
    challengeInput: {
        textAlign: 'center',
        fontFamily: 'monospace',
        fontSize: 18,
        fontWeight: '600',
    },
    errorText: {
        color: theme.colors.error,
        textAlign: 'center',
    },
    verifyButton: {
        marginTop: theme.spacing.md,
    },
});
