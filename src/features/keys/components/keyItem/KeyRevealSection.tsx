import React from 'react';
import { Keyboard } from 'react-native';

import type { KeyPair } from '../../../../types/types';
import { PrivateKeyRevealPanel } from '../PrivateKeyRevealPanel';
import type { UseKeyRevealResult } from './useKeyReveal';

type KeyRevealSectionProps = {
    pgpKey: KeyPair;
    reveal: UseKeyRevealResult;
};

/**
 * Wires the reveal-authorization state (useKeyReveal) into
 * PrivateKeyRevealPanel (APP-ARCH-002). Pure extraction from KeyItem.tsx.
 */
export const KeyRevealSection = ({ pgpKey, reveal }: KeyRevealSectionProps) => {
    if (!pgpKey.privateKey) {
        // Parent only renders this section for keys with a private part; the
        // guard keeps the narrow type without changing rendered output.
        return null;
    }

    const isPrivateKeyProtected = pgpKey.privateKeyIsUnlocked === false;

    return (
        <PrivateKeyRevealPanel
            accountPassword={reveal.accountPassword}
            canRevealWithBiometrics={reveal.canRevealWithBiometrics}
            copied={reveal.privateKeyCopyFeedback.copied}
            error={reveal.revealError}
            isPrivateKeyProtected={isPrivateKeyProtected}
            loading={reveal.revealLoading}
            onAccountPasswordChange={reveal.setAccountPassword}
            onCopyPrivateKey={reveal.handleCopyPrivateKey}
            onHidePrivateKey={() => {
                Keyboard.dismiss();
                reveal.clearPrivateKeyReveal();
            }}
            onRevealWithAccountPassword={reveal.handleRevealWithAccountPassword}
            onRevealWithBiometric={reveal.handleRevealWithBiometric}
            privateKey={pgpKey.privateKey}
            privateKeyVisible={reveal.privateKeyVisible}
        />
    );
};
