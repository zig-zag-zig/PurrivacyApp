import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

type UsePassphraseFieldValueParams = {
    value?: string;
    onPassphraseChange?: (passphrase: string) => void;
    onGeneratedPassphrase?: (passphrase: string) => void;
};

type UsePassphraseFieldValueResult = {
    currentValue: string;
    currentValueRef: MutableRefObject<string>;
    commitPassphrase: (nextPassphrase: string) => void;
    commitPassphraseRef: MutableRefObject<(nextPassphrase: string) => void>;
    onGeneratedPassphraseRef: MutableRefObject<((passphrase: string) => void) | undefined>;
};

/**
 * Extracted from usePassphraseFieldController (APP-ARCH-002) — owns the field's
 * value state and the commit path shared by typing, autofill and
 * generated-passphrase apply. The facade passes the refs onward to the storage
 * and generator modules.
 */
export function usePassphraseFieldValue({
    value,
    onPassphraseChange,
    onGeneratedPassphrase,
}: UsePassphraseFieldValueParams): UsePassphraseFieldValueResult {
    const [passphrase, setPassphrase] = useState('');
    const currentValueRef = useRef('');
    const onGeneratedPassphraseRef = useRef(onGeneratedPassphrase);
    const commitPassphraseRef = useRef<(nextPassphrase: string) => void>(() => undefined);

    const currentValue = value !== undefined ? value : passphrase;
    currentValueRef.current = currentValue;
    onGeneratedPassphraseRef.current = onGeneratedPassphrase;

    const commitPassphrase = useCallback((nextPassphrase: string) => {
        if (value === undefined) {
            setPassphrase(nextPassphrase);
        }
        onPassphraseChange?.(nextPassphrase);
    }, [onPassphraseChange, value]);

    // Keep the ref used by async flows (storage load, generator apply) pointed
    // at the latest commit closure without re-rendering consumers.
    useEffect(() => {
        commitPassphraseRef.current = commitPassphrase;
    }, [commitPassphrase]);

    return {
        currentValue,
        currentValueRef,
        commitPassphrase,
        commitPassphraseRef,
        onGeneratedPassphraseRef,
    };
}
