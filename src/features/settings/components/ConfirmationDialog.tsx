import React from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { ModalToastHost } from '../../../components/ModalToastHost';

interface ConfirmationDialogProps {
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    itemType?: 'key' | 'account' | 'data' | 'sessions' | 'mfa' | 'recoveryCodes';
    itemName?: string;
    loading?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
    visible,
    title,
    message,
    onConfirm,
    onCancel,
    itemType = 'data',
    itemName,
    loading = false,
}) => {
    const getWarningIcon = () => {
        switch (itemType) {
            case 'key':
                return 'vpn-key-off';
            case 'account':
                return 'person-remove';
            case 'sessions':
                return 'logout';
            case 'mfa':
                return 'security';
            case 'recoveryCodes':
                return 'autorenew';
            default:
                return 'warning';
        }
    };

    const getWarningColor = () => {
        switch (itemType) {
            case 'account':
                return theme.colors.error;
            case 'sessions':
                return theme.colors.error;
            case 'mfa':
                return theme.colors.error;
            case 'recoveryCodes':
                return theme.colors.success;
            default:
                return theme.colors.secondary;
        }
    };

    const getConfirmButtonLabel = () => {
        switch (itemType) {
            case 'account':
                return 'Delete';
            case 'sessions':
                return 'Revoke';
            case 'mfa':
                return 'Disable';
            case 'recoveryCodes':
                return 'Regenerate';
            default:
                return 'Delete';
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
        >
            <View style={[commonStyles.modalOverlay]}>
                <View style={styles.centeringContainer}>
                    <View style={[styles.modalDialogCenter, { padding: theme.spacing.lg }]}>
                        {/* Warning Icon */}
                        <View style={{ alignItems: 'center', marginBottom: theme.spacing.md }}>
                            <Icon
                                name={getWarningIcon()}
                                size={48}
                                color={getWarningColor()}
                            />
                        </View>

                        {/* Title */}
                        <CustomText style={[commonStyles.textTitle, { textAlign: 'center', marginBottom: theme.spacing.md, fontWeight: '600' }]}>
                            {title}
                        </CustomText>

                        {/* Item Name if provided */}
                        {itemName && (
                            <View style={{
                                backgroundColor: theme.colors.background,
                                padding: theme.spacing.sm,
                                borderRadius: theme.borderRadius.sm,
                                marginBottom: theme.spacing.md,
                                borderLeftWidth: 3,
                                borderLeftColor: theme.colors.primary,
                            }}>
                                <CustomText style={[commonStyles.textBody, {
                                    fontFamily: 'monospace',
                                    fontSize: theme.typography.caption.fontSize,
                                    color: theme.colors.primary,
                                    fontWeight: '600',
                                }]}>
                                    "{itemName}"
                                </CustomText>
                            </View>
                        )}

                        {/* Warning Message */}
                        <CustomText style={[commonStyles.textBody, { textAlign: 'center', marginBottom: theme.spacing.lg, lineHeight: 22 }]}>
                            {message}
                        </CustomText>

                        {/* Additional Warning for Account */}
                        {itemType === 'account' && (
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: `${theme.colors.error}15`,
                                padding: theme.spacing.sm,
                                borderRadius: theme.borderRadius.sm,
                                marginBottom: theme.spacing.lg,
                                borderLeftWidth: 3,
                                borderLeftColor: theme.colors.error,
                            }}>
                                <Icon name="error" size={20} color={theme.colors.error} />
                                <CustomText style={[commonStyles.textCaption, commonStyles.flex, {
                                    marginLeft: theme.spacing.xs,
                                    color: theme.colors.error,
                                    fontWeight: '600',
                                }]}>
                                    This action is permanent and cannot be undone
                                </CustomText>
                            </View>
                        )}

                        {/* Additional Warning for Sessions */}
                        {itemType === 'sessions' && (
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: `${theme.colors.secondary}15`,
                                padding: theme.spacing.sm,
                                borderRadius: theme.borderRadius.sm,
                                marginBottom: theme.spacing.lg,
                                borderLeftWidth: 3,
                                borderLeftColor: theme.colors.secondary,
                            }}>
                                <Icon name="warning" size={20} color={theme.colors.secondary} />
                                <CustomText style={[commonStyles.textCaption, commonStyles.flex, {
                                    marginLeft: theme.spacing.xs,
                                    color: theme.colors.secondary,
                                    fontWeight: '600',
                                }]}>
                                    You'll be logged out from all devices
                                </CustomText>
                            </View>
                        )}

                        {/* Additional Warning for MFA */}
                        {itemType === 'mfa' && (
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: `${theme.colors.error}15`,
                                padding: theme.spacing.sm,
                                borderRadius: theme.borderRadius.sm,
                                marginBottom: theme.spacing.lg,
                                borderLeftWidth: 3,
                                borderLeftColor: theme.colors.error,
                            }}>
                                <Icon name="info" size={20} color={theme.colors.error} />
                                <CustomText style={[commonStyles.textCaption, commonStyles.flex, {
                                    marginLeft: theme.spacing.xs,
                                    color: theme.colors.error,
                                    fontWeight: '600',
                                }]}>
                                    Your account will be less secure
                                </CustomText>
                            </View>
                        )}

                        {/* Additional Info for Recovery Codes */}
                        {itemType === 'recoveryCodes' && (
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: `${theme.colors.success}15`,
                                padding: theme.spacing.sm,
                                borderRadius: theme.borderRadius.sm,
                                marginBottom: theme.spacing.lg,
                                borderLeftWidth: 3,
                                borderLeftColor: theme.colors.success,
                            }}>
                                <Icon name="info" size={20} color={theme.colors.success} />
                                <CustomText style={[commonStyles.textCaption, commonStyles.flex, {
                                    marginLeft: theme.spacing.xs,
                                    color: theme.colors.success,
                                    fontWeight: '600',
                                }]}>
                                    Existing codes will be invalidated
                                </CustomText>
                            </View>
                        )}

                        {/* Action Buttons */}
                        <View style={[commonStyles.row, styles.modalButtonsContainer]}>
                            <Button
                                label="Cancel"
                                onPress={onCancel}
                                variant="secondary"
                                style={commonStyles.flex}
                            />
                            <Button
                                label={getConfirmButtonLabel()}
                                onPress={onConfirm}
                                style={[commonStyles.flex, {
                                    borderWidth: 0,
                                    backgroundColor: getWarningColor()
                                }] as any}
                                icon={loading ? undefined : <Icon name={
                                    itemType === 'sessions' ? 'logout' :
                                        itemType === 'mfa' ? 'security' :
                                            itemType === 'recoveryCodes' ? 'autorenew' :
                                                'delete-forever'
                                } size={20} color={theme.colors.onPrimary} />}
                                loading={loading}
                                disabled={loading}
                            />
                        </View>
                    </View>
                </View>
            </View>
            <ModalToastHost />
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlayCenter: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: theme.spacing.lg,
    },
    modalDialogCenter: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        ...theme.elevation.high,
        width: '100%',
        maxWidth: 400,
        alignSelf: 'center',
    },
    modalButtonsContainer: {
        justifyContent: 'space-between',
        gap: theme.spacing.md,
    },
    centeringContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
