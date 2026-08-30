import React from 'react';

import type { KeyPair } from '../../../../types/types';
import { getKeyTypeDescription } from '../../domain/keyUtils';
import { ConfirmationDialog } from '../../../settings/components/ConfirmationDialog';

type KeyItemDialogsProps = {
    copyConfirmVisible: boolean;
    deleteConfirmVisible: boolean;
    deleting: boolean;
    keyTitle: string;
    pgpKey: KeyPair;
    onCancelCopyPrivateKey: () => void;
    onCancelDelete: () => void;
    onConfirmCopyPrivateKey: () => void;
    onConfirmDelete: () => void;
};

/**
 * Confirmation dialogs for the two destructive/secret flows on a key item:
 * copying the private key (APP-SEC-005) and deleting the key (APP-ARCH-002).
 * Pure extraction from KeyItem.tsx; rendered outside the expandable region
 * exactly as before.
 */
export const KeyItemDialogs = ({
    copyConfirmVisible,
    deleteConfirmVisible,
    deleting,
    keyTitle,
    pgpKey,
    onCancelCopyPrivateKey,
    onCancelDelete,
    onConfirmCopyPrivateKey,
    onConfirmDelete,
}: KeyItemDialogsProps) => (
    <>
        <ConfirmationDialog
            visible={copyConfirmVisible}
            title="Copy private key?"
            message="Your private key will be copied to the clipboard, which other apps can read. It will be wiped automatically after 20 seconds."
            itemType="key"
            itemName={keyTitle}
            confirmLabel="Copy"
            onConfirm={onConfirmCopyPrivateKey}
            onCancel={onCancelCopyPrivateKey}
        />
        <ConfirmationDialog
            visible={deleteConfirmVisible}
            title="Delete Key"
            message={`Are you sure you want to delete this ${getKeyTypeDescription(pgpKey).toLowerCase()}? This action cannot be undone.`}
            itemType="key"
            itemName={pgpKey.userId.trim()}
            loading={deleting}
            onConfirm={onConfirmDelete}
            onCancel={onCancelDelete}
        />
    </>
);
