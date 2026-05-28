import React from 'react';
import { InputField } from '../../../components/InputField';
import { Button } from '../../../components/Button';
import { theme } from '../../../styles/theme';
import { View } from 'react-native';

interface PasswordFormProps {
    newPassword: string;
    confirmPassword: string;
    onCurrentPasswordChange?: (text: string) => void;
    onNewPasswordChange: (text: string) => void;
    onConfirmPasswordChange: (text: string) => void;
    onSubmit: () => void;
    isLoading: boolean;
    formErrors: { [key: string]: string };
}

export const PasswordForm: React.FC<PasswordFormProps> = ({
    newPassword,
    confirmPassword,
    onNewPasswordChange,
    onConfirmPasswordChange,
    onSubmit,
    isLoading,
    formErrors,
}) => (
    <View style={{ gap: theme.spacing.md }}>
        <InputField
            label={"Password"}
            value={newPassword}
            onChangeText={onNewPasswordChange}
            autoComplete="password"
            enableAutofill
            secureTextEntry
            showToggleSecureText
            textContentType="newPassword"
            error={formErrors.newPassword}
        />

        <InputField
            label={"Confirm Password"}
            value={confirmPassword}
            onChangeText={onConfirmPasswordChange}
            autoComplete="password"
            enableAutofill
            secureTextEntry
            showToggleSecureText
            textContentType="newPassword"
            error={formErrors.confirmPassword}
        />

        <Button
            label={"Reset Password"}
            onPress={onSubmit}
            loading={isLoading}
        />
    </View>
);
