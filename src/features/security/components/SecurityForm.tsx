import React from 'react';
import { InputField } from '../../../components/InputField';
import { Button } from '../../../components/Button';
import { theme } from '../../../styles/theme';
import { View } from 'react-native';
import { commonStyles } from '../../../styles/commonStyles';
import { CustomText } from '../../../components/CustomText';
import { AccountAutofillContext } from '../../../components/AccountAutofillContext';

interface SecurityFormProps {
    type: 'password' | 'delete';
    username?: string | null;
    currentPassword: string;
    newValue?: string;
    confirmValue?: string;
    onCurrentPasswordChange: (text: string) => void;
    onNewValueChange?: (text: string) => void;
    onConfirmValueChange?: (text: string) => void;
    onSubmit: () => void;
    isLoading: boolean;
    formErrors: { [key: string]: string };
}

export const SecurityForm: React.FC<SecurityFormProps> = ({
    type,
    username,
    currentPassword,
    newValue = '',
    confirmValue = '',
    onCurrentPasswordChange,
    onNewValueChange = () => { },
    onConfirmValueChange = () => { },
    onSubmit,
    isLoading,
    formErrors,
}) => {
    const getTitle = () => {
        switch (type) {
            case 'password': return 'Change Password';
            case 'delete': return 'Delete Account';
            default: return 'Security Action';
        }
    };

    const getDescription = () => {
        switch (type) {
            case 'password': return 'Enter your current password and set a new one';
            case 'delete': return 'This will permanently delete your account and all data';
            default: return '';
        }
    };

    return (
        <View style={{ gap: theme.spacing.md }}>
            <CustomText style={[commonStyles.textTitle, { marginBottom: theme.spacing.sm }]}>
                {getTitle()}
            </CustomText>

            <CustomText style={[commonStyles.textBody, { marginBottom: theme.spacing.md }]}>
                {getDescription()}
            </CustomText>

            {type === 'delete' && (
                <CustomText style={[commonStyles.textBody, { color: theme.colors.error }]}>
                    Warning: This action is irreversible and will delete all your data.
                </CustomText>
            )}

            <AccountAutofillContext username={username} />

            <InputField
                label="Current Password"
                value={currentPassword}
                onChangeText={onCurrentPasswordChange}
                autoComplete="current-password"
                enableAutofill
                secureTextEntry
                showToggleSecureText
                textContentType="password"
                error={formErrors.currentPassword}
            />

            {type === 'password' && (
                <>
                    <InputField
                        label="New Password"
                        value={newValue}
                        onChangeText={onNewValueChange}
                        autoComplete="password"
                        enableAutofill
                        secureTextEntry
                        showToggleSecureText
                        textContentType="newPassword"
                        error={formErrors.newValue}
                    />

                    <InputField
                        label="Confirm New Password"
                        value={confirmValue}
                        onChangeText={onConfirmValueChange}
                        autoComplete="password"
                        enableAutofill
                        secureTextEntry
                        showToggleSecureText
                        textContentType="newPassword"
                        error={formErrors.confirmValue}
                    />
                </>
            )}

            <Button
                label={getTitle()}
                onPress={onSubmit}
                loading={isLoading}
                style={type === 'delete' ? { backgroundColor: theme.colors.error } : undefined}
            />
        </View>
    );
};
