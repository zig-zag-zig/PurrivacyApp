import React from 'react';
import { View } from 'react-native';

import type { KeyPair } from '../../../types/types';
import { KeyItemDialogs } from './keyItem/KeyItemDialogs';
import { KeyItemSummary } from './keyItem/KeyItemSummary';
import { KeyMutationControls } from './keyItem/KeyMutationControls';
import { KeyPublicKeySection } from './keyItem/KeyPublicKeySection';
import { KeyRevealSection } from './keyItem/KeyRevealSection';
import { useKeyMutationControls } from './keyItem/useKeyMutationControls';
import { useKeyReveal } from './keyItem/useKeyReveal';
import { styles } from './keyItem/styles';

type KeyItemProps = {
    pgpKey: KeyPair;
    onDelete?: () => void;
    deleting?: boolean;
    onSetDefault?: () => void;
    onPress?: () => void;
    expanded?: boolean;
    readOnly?: boolean;
    onChangePassphrase?: (fingerprint: string, oldPass: string, newPass: string, newPassConfirm: string) => Promise<void>;
    onChangeExpiry?: (fingerprint: string, passphrase: string, newExpiryDays: string) => Promise<void>;
};

/**
 * Key list item. Composition root (APP-ARCH-002): reveal authorization
 * (useKeyReveal/KeyRevealSection), mutation controls
 * (useKeyMutationControls/KeyMutationControls/KeyItemDialogs) and
 * presentation (KeyItemSummary/KeyPublicKeySection) are extracted
 * submodules; props, testIDs and rendered output are unchanged.
 */
export const KeyItem = ({ pgpKey, onDelete, onSetDefault, onPress, expanded, readOnly = false, onChangePassphrase, onChangeExpiry, deleting = false }: KeyItemProps) => {
    const reveal = useKeyReveal(pgpKey, expanded);
    const mutation = useKeyMutationControls({
        pgpKey,
        deleting,
        readOnly,
        onDelete,
        onChangePassphrase,
        onChangeExpiry,
    });

    const canManageKey = !readOnly;
    const hasPrivateKey = Boolean(pgpKey.privateKey);
    const keyTitle = pgpKey.userId.trim() || 'Unnamed key';

    return (
        <View testID="purrivacy.key.item" style={[styles.card, expanded && styles.cardExpanded]}>
            <KeyItemSummary
                pgpKey={pgpKey}
                keyTitle={keyTitle}
                readOnly={readOnly}
                canManageKey={canManageKey}
                canDelete={canManageKey && Boolean(onDelete)}
                expanded={expanded}
                onPress={onPress}
                onSetDefault={onSetDefault}
                onDeletePress={mutation.handleDelete}
            />
            {expanded && (
                <View style={styles.details}>
                    {hasPrivateKey && canManageKey && pgpKey.privateKey ? (
                        <KeyRevealSection
                            pgpKey={pgpKey}
                            reveal={reveal}
                        />
                    ) : null}

                    {pgpKey.privateKey && canManageKey && (
                        <KeyMutationControls
                            pgpKey={pgpKey}
                            mutation={mutation}
                        />
                    )}

                    <KeyPublicKeySection pgpKey={pgpKey} />
                </View>
            )}
            <KeyItemDialogs
                pgpKey={pgpKey}
                keyTitle={keyTitle}
                deleting={deleting}
                copyConfirmVisible={reveal.copyConfirmVisible}
                onConfirmCopyPrivateKey={reveal.confirmCopyPrivateKey}
                onCancelCopyPrivateKey={() => reveal.setCopyConfirmVisible(false)}
                deleteConfirmVisible={mutation.confirmVisible}
                onConfirmDelete={mutation.confirmDelete}
                onCancelDelete={mutation.cancelDelete}
            />
        </View>
    );
};
