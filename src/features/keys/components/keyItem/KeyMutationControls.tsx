import React from 'react';

import type { KeyPair } from '../../../../types/types';
import { KeyManagementForm } from '../KeyManagementForm';
import type { UseKeyMutationControlsResult } from './useKeyMutationControls';

type KeyMutationControlsProps = {
    pgpKey: KeyPair;
    mutation: UseKeyMutationControlsResult;
};

/**
 * Key editing controls: wires the mutation state (useKeyMutationControls)
 * into KeyManagementForm (APP-ARCH-002). Pure extraction from KeyItem.tsx.
 */
export const KeyMutationControls = ({ pgpKey, mutation }: KeyMutationControlsProps) => (
    <KeyManagementForm
        pgpKey={pgpKey}
        oldPass={mutation.oldPass}
        newPass={mutation.newPass}
        newPassConfirm={mutation.newPassConfirm}
        expiryDays={mutation.expiryDays}
        changingPassword={mutation.changingPassword}
        changingDate={mutation.changingDate}
        onOldPassChange={mutation.setOldPass}
        onNewPassChange={mutation.setNewPass}
        onNewPassConfirmChange={mutation.setNewPassConfirm}
        onExpiryDaysChange={mutation.setExpiryDays}
        onChangePassphrase={mutation.handleChangePassphrasePress}
        onChangeExpiry={mutation.handleChangeExpiryPress}
        storedPassphraseValue={pgpKey.privateKeyPassphrase}
    />
);
