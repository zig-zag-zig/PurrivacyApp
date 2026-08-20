import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

import { useToast } from '../../../../app/state/ToastContext';
import { getUserFacingErrorMessage } from '../../../../utils/errorHandling';
import type { KeyPair } from '../../../../types/types';

type UseKeyMutationControlsParams = {
    pgpKey: KeyPair;
    deleting: boolean;
    readOnly: boolean;
    onDelete?: () => void;
    onChangePassphrase?: (fingerprint: string, oldPass: string, newPass: string, newPassConfirm: string) => Promise<void>;
    onChangeExpiry?: (fingerprint: string, passphrase: string, newExpiryDays: string) => Promise<void>;
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
}: UseKeyMutationControlsParams) {
    const [confirmVisible, setConfirmVisible] = useState(false);
    const [deleteRequested, setDeleteRequested] = useState(false);
    const [oldPass, setOldPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [newPassConfirm, setNewPassConfirm] = useState('');
    const [expiryDays, setExpiryDays] = useState('365');
    const [changingPassword, setChangingPassword] = useState(false);
    const [changingDate, setChangingDate] = useState(false);
    const { showToast } = useToast();

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
