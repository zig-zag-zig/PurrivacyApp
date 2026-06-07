import React, { useEffect, useState } from "react";
import { Keyboard, View, TouchableOpacity, StyleSheet, Switch } from "react-native";
import Icon from '@expo/vector-icons/MaterialIcons';
import { AutofillDisabledView } from '../../../components/AutofillDisabledView';
import { Button } from '../../../components/Button';
import { InputField } from '../../../components/InputField';
import { DropdownSelect } from '../../../components/DropdownSelect';
import { theme } from '../../../styles/theme';
import { commonStyles } from '../../../styles/commonStyles';
import { CustomText } from '../../../components/CustomText';
import { validateKeyCreationForm } from '../../../utils/validation';
import { ALGORITHM_OPTIONS, RSA_BITS_OPTIONS } from '../../../utils/formUtils';
import { KeyGenerationOptions, PgpAlgorithm } from '../../../types/types';
import { GeneratedPassphrasePair } from './GeneratedPassphrasePair';
import {
    KEY_COMMENT_MAX_LENGTH,
    KEY_EMAIL_MAX_LENGTH,
    KEY_NAME_MAX_LENGTH,
} from '../../../config/inputLimits';

export const CreateKeyForm = ({
    onCreate,
    isLoading,
    hasExistingKeys,
    setAsDefault,
    onSetAsDefault,
    setAsDefaultDisabled
}: {
    onCreate: (keyGenerationOptions: KeyGenerationOptions, setAsDefault?: boolean) => void;
    isLoading: boolean;
    hasExistingKeys?: boolean;
    setAsDefault?: boolean;
    onSetAsDefault?: (value: boolean) => void;
    setAsDefaultDisabled?: boolean;
}) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [comment, setComment] = useState('');
    const [algorithm, setAlgorithm] = useState<PgpAlgorithm>('EDDSA');
    const [bitStrength, setBitStrength] = useState<2048 | 3072 | 4096>(3072);
    const [showAlgorithmSheet, setShowAlgorithmSheet] = useState(false);
    const [showRsaBitsSheet, setShowRsaBitsSheet] = useState(false);

    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        if (!passphrase) setConfirmPassphrase('');
    }, [passphrase])

    const submitForm = (passphraseValue = passphrase, confirmPassphraseValue = confirmPassphrase) => {
        const trimmedName = name.trim();
        const trimmedEmail = email.trim().toLowerCase();
        const trimmedComment = comment.trim();
        if (trimmedName !== name) setName(trimmedName);
        if (trimmedEmail !== email) setEmail(trimmedEmail);
        if (trimmedComment !== comment) setComment(trimmedComment);

        const errors = validateKeyCreationForm(
            trimmedName,
            trimmedEmail,
            trimmedComment,
            passphraseValue,
            confirmPassphraseValue,
            algorithm,
            bitStrength,
        );
        setFormErrors(errors);

        if (Object.keys(errors).length > 0) return;

        onCreate({
            name: trimmedName,
            email: trimmedEmail,
            passphrase: passphraseValue,
            comment: trimmedComment,
            algorithm,
            bitStrength,
        }, setAsDefault);
    };

    const handleSubmit = () => {
        submitForm();
    };

    const closeDropdowns = () => {
        setShowAlgorithmSheet(false);
        setShowRsaBitsSheet(false);
    };

    return (
        <AutofillDisabledView>
            {(showAlgorithmSheet || showRsaBitsSheet) && (
                <View style={styles.backdrop} pointerEvents="box-none" />
            )}
            <View style={{ marginBottom: theme.spacing.md }}>
                <InputField
                    label="Name"
                    testID="purrivacy.key.create.name"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    maxLength={KEY_NAME_MAX_LENGTH}
                    error={formErrors.userId}
                    onFocus={closeDropdowns}
                    trimOnBlur
                />
            </View>

            <View style={{ marginBottom: theme.spacing.md }}>
                <InputField
                    label="Email"
                    testID="purrivacy.key.create.email"
                    value={email}
                    onChangeText={setEmail}
                    maxLength={KEY_EMAIL_MAX_LENGTH}
                    error={formErrors.email || formErrors.userId}
                    onFocus={closeDropdowns}
                    normalizeOnBlur={(text) => text.trim().toLowerCase()}
                />
            </View>

            <View style={{ marginBottom: theme.spacing.md }}>
                <InputField
                    label="Comment"
                    testID="purrivacy.key.create.comment"
                    value={comment}
                    onChangeText={setComment}
                    autoCapitalize="sentences"
                    maxLength={KEY_COMMENT_MAX_LENGTH}
                    error={formErrors.userId}
                    onFocus={closeDropdowns}
                    trimOnBlur
                />
            </View>

            <GeneratedPassphrasePair
                passphraseLabel="Passphrase"
                confirmPassphraseLabel="Confirm Passphrase"
                testID="purrivacy.key.create.passphrase"
                confirmTestID="purrivacy.key.create.confirmPassphrase"
                passphrase={passphrase}
                confirmPassphrase={confirmPassphrase}
                onPassphraseChange={setPassphrase}
                onConfirmPassphraseChange={setConfirmPassphrase}
                passphraseError={formErrors.passphrase}
                confirmPassphraseError={formErrors.confirmPassphrase}
                gap={theme.spacing.md}
                style={{ marginBottom: theme.spacing.md }}
            />

            <View style={{ marginBottom: theme.spacing.md }}>
                <CustomText style={commonStyles.textLabel}>Algorithm *</CustomText>
                <View style={styles.dropdownContainer}>
                    <View style={[styles.inputWrapper]}>
                        <TouchableOpacity
                            style={[
                                {
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    position: 'relative',
                                    borderColor: theme.colors.divider,
                                    borderWidth: 2,
                                    backgroundColor: theme.colors.surface,
                                    borderRadius: theme.borderRadius.md,
                                    overflow: 'hidden',
                                    paddingHorizontal: theme.spacing.md + 4,
                                    paddingVertical: theme.spacing.sm + 2,
                                    minHeight: 44,
                                },
                                commonStyles.flex,
                            ]}
                            onPress={() => {
                                Keyboard.dismiss();
                                setShowRsaBitsSheet(false);
                                setShowAlgorithmSheet(prev => !prev);
                            }}
                            activeOpacity={0.7}
                        >
                            <CustomText
                                style={[
                                    commonStyles.textBody,
                                    commonStyles.flex,
                                    {
                                        color: algorithm ? theme.colors.text : theme.colors.placeholder,
                                    },
                                ]}
                                ellipsizeMode="tail"
                            >
                                {ALGORITHM_OPTIONS.find(o => o.value === algorithm)?.label || 'Select'}
                            </CustomText>
                            <Icon name={showAlgorithmSheet ? "expand-less" : "expand-more"} size={24} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <DropdownSelect
                        visible={showAlgorithmSheet}
                        options={ALGORITHM_OPTIONS.map(o => o.label)}
                        onSelect={idx => {
                            setAlgorithm(ALGORITHM_OPTIONS[idx].value as typeof algorithm);
                            setShowAlgorithmSheet(false);
                        }}
                        onClose={() => setShowAlgorithmSheet(false)}
                    />
                </View>
                {formErrors.algorithm ? (
                    <CustomText style={{ color: theme.colors.error, marginTop: 4, marginLeft: 4, fontSize: 13 }}>
                        {formErrors.algorithm}
                    </CustomText>
                ) : null}
            </View>

            {algorithm === 'RSA' && (
                <View style={{ marginBottom: theme.spacing.md }}>
                    <CustomText style={commonStyles.textLabel}>RSA Key Size *</CustomText>
                    <View style={styles.dropdownContainer}>
                        <View style={[styles.inputWrapper]}>
                            <TouchableOpacity
                                style={[
                                    {
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        position: 'relative',
                                        borderColor: theme.colors.divider,
                                        borderWidth: 2,
                                        backgroundColor: theme.colors.surface,
                                        borderRadius: theme.borderRadius.md,
                                        overflow: 'hidden',
                                        paddingHorizontal: theme.spacing.md + 4,
                                        paddingVertical: theme.spacing.sm + 2,
                                        minHeight: 44,
                                    },
                                    commonStyles.flex,
                                ]}
                                onPress={() => {
                                    Keyboard.dismiss();
                                    setShowAlgorithmSheet(false);
                                    setShowRsaBitsSheet(prev => !prev);
                                }}
                                activeOpacity={0.7}
                            >
                                <CustomText
                                    style={[
                                        commonStyles.textBody,
                                        commonStyles.flex,
                                        {
                                            color: bitStrength ? theme.colors.text : theme.colors.placeholder,
                                        },
                                    ]}
                                    ellipsizeMode="tail"
                                >
                                    {bitStrength || 'Select'}
                                </CustomText>
                                <Icon name={showRsaBitsSheet ? "expand-less" : "expand-more"} size={24} color={theme.colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <DropdownSelect
                            visible={showRsaBitsSheet}
                            options={RSA_BITS_OPTIONS.map(o => o.label)}
                            onSelect={idx => {
                                setBitStrength(RSA_BITS_OPTIONS[idx].value as typeof bitStrength);
                                setShowRsaBitsSheet(false);
                            }}
                            onClose={() => setShowRsaBitsSheet(false)}
                        />
                    </View>
                    {formErrors.bitStrength ? (
                        <CustomText style={{ color: theme.colors.error, marginTop: 4, marginLeft: 4, fontSize: 13 }}>
                            {formErrors.bitStrength}
                        </CustomText>
                    ) : null}
                </View>
            )}

            {hasExistingKeys && (
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    marginBottom: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                }}>
                    <Switch
                        value={!!setAsDefault}
                        onValueChange={onSetAsDefault}
                        disabled={!!setAsDefaultDisabled}
                        trackColor={{ false: theme.colors.divider, true: theme.colors.primary }}
                        thumbColor={theme.colors.surface}
                        style={{ marginRight: theme.spacing.sm }}
                    />
                    <CustomText style={[commonStyles.textBody, {
                        color: setAsDefaultDisabled ? theme.colors.textSecondary : theme.colors.text
                    }]}>
                        Set as default key pair
                        {setAsDefaultDisabled ? ' (required)' : ''}
                    </CustomText>
                </View>
            )}

            <Button
                label="Create Key"
                onPress={() => {
                    closeDropdowns();
                    handleSubmit();
                }}
                loading={isLoading}
                disabled={isLoading}
                testID="purrivacy.key.create.submit"
                icon={<Icon name="vpn-key" size={20} />}
            />
        </AutofillDisabledView>
    );
};

const styles = StyleSheet.create({
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },
    dropdownContainer: {
        position: 'relative',
        width: '100%',
        margin: 0,
        padding: 0,
        marginTop: theme.spacing.sm
    },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        zIndex: 9998,
    },
});
