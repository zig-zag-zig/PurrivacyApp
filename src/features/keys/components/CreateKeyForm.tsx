import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import Icon from '@expo/vector-icons/MaterialIcons';
import { AutofillDisabledView } from '../../../components/AutofillDisabledView';
import { Button } from '../../../components/Button';
import { InputField } from '../../../components/InputField';
import { theme } from '../../../styles/theme';
import { validateKeyCreationForm } from '../../../utils/validation';
import { ALGORITHM_OPTIONS, RSA_BITS_OPTIONS } from '../../../utils/formUtils';
import { KeyGenerationOptions, PgpAlgorithm } from '../../../types/types';
import { GeneratedPassphrasePair } from './GeneratedPassphrasePair';
import { FormField } from '../../../shared/ui/FormField';
import { SelectField } from '../../../shared/ui/SelectField';
import { SwitchRow } from '../../../shared/ui/SwitchRow';
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
            <FormField>
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
            </FormField>

            <FormField>
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
            </FormField>

            <FormField>
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
            </FormField>

            <FormField>
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
                />
            </FormField>

            <SelectField
                label="Algorithm *"
                value={algorithm}
                visible={showAlgorithmSheet}
                options={ALGORITHM_OPTIONS}
                error={formErrors.algorithm}
                onOpen={() => {
                    setShowRsaBitsSheet(false);
                    setShowAlgorithmSheet(prev => !prev);
                }}
                onClose={() => setShowAlgorithmSheet(false)}
                onSelect={option => {
                    setAlgorithm(option.value);
                    setShowAlgorithmSheet(false);
                }}
            />

            {algorithm === 'RSA' && (
                <SelectField
                    label="RSA Key Size *"
                    value={bitStrength}
                    visible={showRsaBitsSheet}
                    options={RSA_BITS_OPTIONS}
                    error={formErrors.bitStrength}
                    onOpen={() => {
                        setShowAlgorithmSheet(false);
                        setShowRsaBitsSheet(prev => !prev);
                    }}
                    onClose={() => setShowRsaBitsSheet(false)}
                    onSelect={option => {
                        setBitStrength(option.value);
                        setShowRsaBitsSheet(false);
                    }}
                />
            )}

            {hasExistingKeys && (
                <SwitchRow
                    value={!!setAsDefault}
                    onValueChange={onSetAsDefault}
                    disabled={!!setAsDefaultDisabled}
                    required={!!setAsDefaultDisabled}
                    label="Set as default key pair"
                />
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
