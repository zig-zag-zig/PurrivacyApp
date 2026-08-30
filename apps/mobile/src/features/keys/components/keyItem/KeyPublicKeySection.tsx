import React from 'react';
import { Keyboard, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';

import { theme } from '../../../../styles/theme';
import { CustomText } from '../../../../components/CustomText';
import { useToast } from '../../../../app/state/ToastContext';
import { SUCCESS_MESSAGES } from '../../../../utils/errorHandling';
import { useCopyFeedback } from '../../../../shared/hooks/useCopyFeedback';
import { useSecureCopy } from '../../../../shared/hooks/useSecureCopy';
import type { KeyPair } from '../../../../types/types';
import { KeyMaterialBlock } from '../KeyMaterialBlock';
import { styles } from './styles';

type KeyPublicKeySectionProps = {
    pgpKey: KeyPair;
};

/**
 * Public key presentation: section header, copy action and material block
 * (APP-ARCH-002). Pure extraction from KeyItem.tsx.
 */
export const KeyPublicKeySection = ({ pgpKey }: KeyPublicKeySectionProps) => {
    const publicKeyCopyFeedback = useCopyFeedback();
    const { secureCopy } = useSecureCopy();
    const { showToast } = useToast();

    const handleCopyPublicKey = () => {
        Keyboard.dismiss();
        void secureCopy(pgpKey.publicKey || '', { sensitivity: 'low' });
        publicKeyCopyFeedback.markCopied();
        showToast(SUCCESS_MESSAGES.PUBLIC_KEY_COPIED, 'success');
    };

    return (
        <View style={styles.publicKeySection}>
            <View style={styles.sectionHeader}>
                <CustomText style={styles.sectionTitle}>Public key</CustomText>
                <TouchableOpacity
                    onPress={handleCopyPublicKey}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Copy public key"
                >
                    <Icon name="content-copy" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
            </View>
            <KeyMaterialBlock
                text={pgpKey.publicKey || ''}
                copied={publicKeyCopyFeedback.copied}
                onCopy={handleCopyPublicKey}
            />
        </View>
    );
};
