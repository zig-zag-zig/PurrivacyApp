import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { InputField } from '../../../components/InputField';
import { EXPIRY_DAYS_MAX_LENGTH } from '../../../config/inputLimits';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import type { KeyPair } from '../../../types/types';
import { GeneratedPassphrasePair } from './GeneratedPassphrasePair';
import { PassphraseField } from './PassphraseField';

type KeyManagementFormProps = {
    changingDate: boolean;
    changingPassword: boolean;
    expiryDays: string;
    newPass: string;
    newPassConfirm: string;
    oldPass: string;
    onChangeExpiry: () => void;
    onChangePassphrase: () => void;
    onExpiryDaysChange: (value: string) => void;
    onNewPassChange: (value: string) => void;
    onNewPassConfirmChange: (value: string) => void;
    onOldPassChange: (value: string) => void;
    pgpKey: KeyPair;
    storedPassphraseValue?: string | null;
};

const SURFACE_LABEL_BACKPLATE_PROPS = {
    labelTopBackgroundColor: theme.colors.surface,
    labelBottomBackgroundColor: theme.colors.surface,
} as const;

export const KeyManagementForm = ({
    changingDate,
    changingPassword,
    expiryDays,
    newPass,
    newPassConfirm,
    oldPass,
    onChangeExpiry,
    onChangePassphrase,
    onExpiryDaysChange,
    onNewPassChange,
    onNewPassConfirmChange,
    onOldPassChange,
    pgpKey,
    storedPassphraseValue,
}: KeyManagementFormProps) => (
    <View style={styles.manageKeySection}>
        <CustomText style={styles.sectionTitle}>Manage key</CustomText>

        <View style={styles.formGroup}>
            <CustomText style={styles.groupLabel}>Passphrase</CustomText>
            <View style={styles.fieldStack}>
                <PassphraseField
                    {...SURFACE_LABEL_BACKPLATE_PROPS}
                    label="Current passphrase"
                    fingerprint={pgpKey.fingerprint}
                    onPassphraseChange={onOldPassChange}
                    hidden={pgpKey.privateKeyIsUnlocked}
                    storedPassphraseValue={storedPassphraseValue}
                />

                <GeneratedPassphrasePair
                    {...SURFACE_LABEL_BACKPLATE_PROPS}
                    passphraseLabel="New passphrase"
                    confirmPassphraseLabel="Confirm new passphrase"
                    fingerprint={pgpKey.fingerprint}
                    passphrase={newPass}
                    confirmPassphrase={newPassConfirm}
                    onPassphraseChange={onNewPassChange}
                    onConfirmPassphraseChange={onNewPassConfirmChange}
                    helperText={pgpKey.privateKeyIsUnlocked ? undefined : 'Leave blank to remove the passphrase.'}
                />
            </View>
            <View style={styles.actionRow}>
                <Button
                    label="Change passphrase"
                    onPress={onChangePassphrase}
                    disabled={newPass === oldPass}
                    loading={changingPassword}
                    size="compact"
                    style={styles.actionButton}
                />
            </View>
        </View>

        <View style={styles.formGroup}>
            <CustomText style={styles.groupLabel}>Expiration</CustomText>
            <InputField
                {...SURFACE_LABEL_BACKPLATE_PROPS}
                label="Expiry days"
                value={expiryDays}
                onChangeText={onExpiryDaysChange}
                keyboardType="number-pad"
                numberOnly
                maxDigits={EXPIRY_DAYS_MAX_LENGTH}
                helperText="Leave blank, or enter below 1, for no expiry."
            />
            <View style={styles.actionRow}>
                <Button
                    label="Change expiry"
                    onPress={onChangeExpiry}
                    disabled={pgpKey.privateKeyIsUnlocked === false && !oldPass}
                    loading={changingDate}
                    size="compact"
                    style={styles.actionButton}
                />
            </View>
        </View>
    </View>
);

const styles = StyleSheet.create({
    manageKeySection: {
        gap: theme.spacing.md,
    },
    sectionTitle: {
        ...commonStyles.textBody,
        color: theme.colors.text,
        fontWeight: '700',
    },
    fieldStack: {
        gap: theme.spacing.sm,
    },
    formGroup: {
        gap: theme.spacing.sm,
    },
    groupLabel: {
        ...commonStyles.textCaption,
        color: theme.colors.textSecondary,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionButton: {
        flex: 1,
    },
});
