import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

import { useToast } from '../../../../app/state/ToastContext';
import { getUserFacingErrorMessage } from '../../../../utils/errorHandling';
import { useShareText } from '../../../../shared/hooks/useShareText';
import type { KeyPair } from '../../../../types/types';

type UseKeyMutationControlsParams = {
    pgpKey: KeyPair;
    deleting: boolean;
    readOnly: boolean;
    onDelete?: () => void;
    onChangePassphrase?: (fingerprint: string, oldPass: string, newPass: string, newPassConfirm: string) => Promise<void>;
    onChangeExpiry?: (fingerprint: string, passphrase: string, newExpiryDays: string) => Promise<void>;
    onRevoke?: (fingerprint: string, passphrase: string) => Promise<void>;
};

/**
 * Key mutation controls: delete confirmation flow and passphrase/expiry
 * editing state (APP-ARCH-002). Behavior is a verbatim extraction from
 * KeyItem.tsx.
 */
export function useKeyMutationControls({
    pgpKey,
    deleting,
    readOnly,
    onDelete,
    onChangePassphrase,
    onChangeExpiry,
    onRevoke,
}: UseKeyMutationControlsParams) {
    const [confirmVisible, setConfirmVisible] = useState(false);
    const [deleteRequested, setDeleteRequested] = useState(false);
    const [oldPass, setOldPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [newPassConfirm, setNewPassConfirm] = useState('');
    const [expiryDays, setExpiryDays] = useState('365');
    const [changingPassword, setChangingPassword] = useState(false);
    const [changingDate, setChangingDate] = useState(false);
    const [revoking, setRevoking] = useState(false);
    const [revokeConfirmVisible, setRevokeConfirmVisible] = useState(false);
    const { showToast } = useToast();
    const { shareText } = useShareText();

    useEffect(() => {
        if (!newPass) setNewPassConfirm('');
    }, [newPass]);

    const handleDelete = () => {
        if (!onDelete || readOnly) return;
        Keyboard.dismiss();
        setDeleteRequested(false);
        setConfirmVisible(true);
    };

    const confirmDelete = () => {
        setDeleteRequested(true);
        onDelete?.();
    };

    const cancelDelete = () => {
        if (!deleting) {
            setConfirmVisible(false);
        }
    };

    const handleChangePassphrasePress = async () => {
        if (!onChangePassphrase) return;
        setChangingPassword(true);
        try {
            await onChangePassphrase(pgpKey.fingerprint, oldPass, newPass, newPassConfirm);
            setOldPass(newPass);
            setNewPass('');
            setNewPassConfirm('');
        } catch (err: any) {
            showToast(getUserFacingErrorMessage(err, 'Failed to change passphrase'), 'error');
        } finally {
            setChangingPassword(false);
        }
    };

    const handleChangeExpiryPress = async () => {
        if (!onChangeExpiry) return;
        setChangingDate(true);
        try {
            await onChangeExpiry(pgpKey.fingerprint, oldPass, expiryDays);
            showToast('Expiry updated', 'success');
        } catch (err: any) {
            showToast(getUserFacingErrorMessage(err, 'Failed to change expiry'), 'error');
        } finally {
            setChangingDate(false);
        }
    };

    const handleRevokePress = () => {
        if (!onRevoke || readOnly || pgpKey.revoked) return;
        Keyboard.dismiss();
        setRevokeConfirmVisible(true);
    };

    const confirmRevoke = async () => {
        if (!onRevoke) return;
        setRevokeConfirmVisible(false);
        setRevoking(true);
        try {
            await onRevoke(pgpKey.fingerprint, oldPass);
            showToast('Key revoked', 'success');
        } catch (err: any) {
            showToast(getUserFacingErrorMessage(err, 'Failed to revoke key'), 'error');
        } finally {
            setRevoking(false);
        }
    };

    const cancelRevoke = () => {
        if (!revoking) setRevokeConfirmVisible(false);
    };

    const shareRevocationCertificate = () => {
        if (!pgpKey.revocationCertificate) return;
        Keyboard.dismiss();
        void shareText(pgpKey.revocationCertificate, 'Revocation certificate');
    };

    return {
        changingDate,
        changingPassword,
        confirmDelete,
        confirmVisible,
        cancelDelete,
        deleteRequested,
        expiryDays,
        handleChangeExpiryPress,
        handleChangePassphrasePress,
        handleDelete,
        handleRevokePress,
        confirmRevoke,
        cancelRevoke,
        revokeConfirmVisible,
        revoking,
        shareRevocationCertificate,
        newPass,
        newPassConfirm,
        oldPass,
        setExpiryDays,
        setNewPass,
        setNewPassConfirm,
        setOldPass,
    };
}

export type UseKeyMutationControlsResult = ReturnType<typeof useKeyMutationControls>;
