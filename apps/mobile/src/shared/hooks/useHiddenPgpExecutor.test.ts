import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';

const mockLogger = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('../../utils/logger', () => ({
    logger: mockLogger,
}));

// The hook is exercised without a React renderer (no react-dom/test-utils in
// this repo); provide pass-through implementations for the hooks it uses.
vi.mock('react', () => {
    return {
        useRef: (initial: unknown) => ({ current: initial }),
        useCallback: (fn: unknown) => fn,
        useEffect: () => undefined,
    };
});

import { useHiddenPgpExecutor } from './useHiddenPgpExecutor';

const message = (data: unknown): WebViewMessageEvent =>
    ({ nativeEvent: { data: JSON.stringify(data) } }) as WebViewMessageEvent;

const messageWithRaw = (data: string): WebViewMessageEvent =>
    ({ nativeEvent: { data } }) as WebViewMessageEvent;

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    vi.useRealTimers();
});

function createHost() {
    const injectJavaScript = vi.fn();
    const reload = vi.fn();
    const ref = {
        current: { injectJavaScript, reload },
    } as unknown as RefObject<WebView | null>;
    const { executePGPOperation, onMessage } = useHiddenPgpExecutor(ref);
    return { injectJavaScript, reload, executePGPOperation, onMessage, ref };
}

describe('useHiddenPgpExecutor', () => {
    it('injects the serialized operation payload into the WebView', () => {
        const { executePGPOperation, injectJavaScript } = createHost();
        void executePGPOperation('ping', undefined);

        expect(injectJavaScript).toHaveBeenCalledTimes(1);
        const js = injectJavaScript.mock.calls[0][0] as string;
        expect(js).toContain('"operation":"ping"');
        expect(js).toContain('"id":0');
        expect(js).toContain('handlePGPOperation');
    });

    it('resolves with the validated result for a valid response', async () => {
        const { executePGPOperation, onMessage } = createHost();
        const promise = executePGPOperation('ping', undefined);

        onMessage(message({ success: true, result: { pong: true, timestamp: 1234 }, id: 0 }));

        await expect(promise).resolves.toEqual({ pong: true, timestamp: 1234 });
    });

    it('rejects with the WebView error message on failure envelopes', async () => {
        const { executePGPOperation, onMessage } = createHost();
        const promise = executePGPOperation('ping', undefined);

        onMessage(message({ success: false, error: 'OpenPGP load timeout', id: 0 }));

        await expect(promise).rejects.toThrow('OpenPGP load timeout');
    });

    it('rejects tampered results that violate the operation contract', async () => {
        const { executePGPOperation, onMessage } = createHost();
        const promise = executePGPOperation('encryptMessage', { publicKeys: [], content: 'hi' });

        // Valid envelope, but the result is an object instead of armored text.
        onMessage(message({ success: true, result: { ciphertext: 'x' }, id: 0 }));

        await expect(promise).rejects.toThrow('Invalid result for PGP operation encryptMessage');
    });

    it('rejects tampered decrypted results missing the decrypted text', async () => {
        const { executePGPOperation, onMessage } = createHost();
        const promise = executePGPOperation('decryptMessage', {
            encryptedData: 'enc',
            privateKey: 'priv',
            passphrase: 'pass',
        });

        onMessage(message({ success: true, result: { verified: true }, id: 0 }));

        await expect(promise).rejects.toThrow('Invalid result for PGP operation decryptMessage');
    });

    it('ignores tampered envelopes and lets the timeout reject', async () => {
        vi.useFakeTimers();
        const { executePGPOperation, onMessage } = createHost();
        const promise = executePGPOperation('ping', undefined);

        // success is a string, not a boolean — envelope-level tampering.
        onMessage(message({ success: 'yes', result: { pong: true, timestamp: 1 }, id: 0 }));

        vi.advanceTimersByTime(30001);

        await expect(promise).rejects.toThrow('Timeout ping #0');
    });

    it('ignores messages that fail to parse as JSON', async () => {
        vi.useFakeTimers();
        const { executePGPOperation, onMessage } = createHost();
        const promise = executePGPOperation('ping', undefined);

        onMessage(messageWithRaw('not-json{{'));

        vi.advanceTimersByTime(30001);

        await expect(promise).rejects.toThrow('Timeout ping #0');
        expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('ignores messages with an unknown operation id', async () => {
        const { onMessage } = createHost();
        expect(() => onMessage(message({ success: true, result: 1, id: 999 }))).not.toThrow();
    });

    it('rejects immediately when the WebView is not mounted', async () => {
        const ref = { current: null } as unknown as RefObject<WebView | null>;
        const { executePGPOperation } = useHiddenPgpExecutor(ref);

        await expect(executePGPOperation('ping', undefined)).rejects.toThrow('PGP WebView not available');
    });
});
