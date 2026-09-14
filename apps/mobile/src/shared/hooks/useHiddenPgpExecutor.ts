import { RefObject, useCallback, useEffect, useRef } from 'react';
import type { WebView, WebViewMessageEvent } from 'react-native-webview';

import type { PGPExecutor } from '../../services/pgpCryptoService';
import { logger } from '../../utils/logger';
import {
    isPgpOperationResultValid,
    parsePgpEnvelope,
    PgpOperationName,
    PgpOperationResponse,
    PgpRequestMap,
} from '../../services/pgpProtocol';

type PendingOperation = {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    operation: PgpOperationName;
};

export function useHiddenPgpExecutor(webViewRef: RefObject<WebView | null>) {
    const pending = useRef<Map<number, PendingOperation>>(new Map());
    const opId = useRef(0);

    useEffect(() => () => {
        pending.current.forEach(operation => {
            clearTimeout(operation.timer);
            operation.reject(new Error('PGP WebView disposed'));
        });
        pending.current.clear();
    }, []);

    const executePGPOperation: PGPExecutor['executePGPOperation'] = useCallback(<T extends PgpOperationName>(operation: T, data: PgpRequestMap[T]['data']) => {
        return new Promise<PgpOperationResponse<T>>((resolve, reject) => {
            const id = opId.current++;

            // Compute per-operation timeout. Crypto-heavy operations
            // (encrypt/decrypt/key-password changes) do PBKDF2 with 600k
            // iterations inside the WebView and can exceed the flat 30s cap
            // on slower devices/emulators; light ops keep the short default.
            const CRYPTO_HEAVY_OPS = new Set<PgpOperationName>([
                'encryptMessage',
                'decryptMessage',
                'changePassphrase',
                'changeExpiration',
                'validatePrivateKeyPassphrase',
                'createDetachedSignature',
                'verifyDetachedSignature',
                'extractPublicKeyFromPrivate',
                // File ops unlock a private key (PBKDF2) and stream large data;
                // fileOpResultChunk can block while the output stream produces
                // the next chunk, so it needs a generous cap too.
                // fileOpChunkBatch may wait on the WebView queue while a slow
                // key-unlock (PBKDF2) precedes the first stream pull, so it
                // must survive that too (was a 30s timeout → decrypt failed).
                'fileOpEncrypt',
                'fileOpDecrypt',
                'fileOpResultChunk',
                'fileOpChunkBatch',
            ]);
            let timeoutMs = 30000; // default (light ops)
            if (CRYPTO_HEAVY_OPS.has(operation)) {
                timeoutMs = 120000;
            } else if (operation === 'generateKeyPair') {
                const bits = (data as PgpRequestMap['generateKeyPair']['data'] | undefined)?.bitStrength;
                if (bits !== undefined && bits >= 4096) timeoutMs = 180000;
                else if (bits !== undefined && bits >= 3072) timeoutMs = 90000;
                else if (bits !== undefined && bits >= 2048) timeoutMs = 45000;
            }

            const timer = setTimeout(() => {
                if (pending.current.has(id)) {
                    pending.current.delete(id);
                    reject(new Error(`Timeout ${operation} #${id}`));
                }
            }, timeoutMs);

            pending.current.set(id, {
                resolve: value => resolve(value as PgpOperationResponse<T>),
                reject,
                timer,
                operation,
            });

            const payload = { operation, data, id };
            // No setTimeout wrapper: evaluateJavascript is already async on the
            // native side, and deferring through a timer can add up to ~1s per
            // call if the WebView throttles timers (hidden/offscreen webview).
            // handlePGPOperation is async and yields on its own awaits.
            const js = `
        (function(){
          try {
            if (typeof window.handlePGPOperation !== 'function') {
              window.ReactNativeWebView.postMessage(JSON.stringify({ success:false, error:'handlePGPOperation not ready', id: ${id} }));
              return true;
            }
            try {
              window.handlePGPOperation(${JSON.stringify(payload)});
            } catch(eInner) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ success:false, error: eInner.message, id: ${id} }));
            }
          } catch(e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ success:false, error: e.message, id: ${id} }));
          }
          return true;
        })();
      `;

            if (!webViewRef.current) {
                clearTimeout(timer);
                pending.current.delete(id);
                reject(new Error('PGP WebView not available'));
                return;
            }

            webViewRef.current.injectJavaScript(js);
        });
    }, [webViewRef]);

    const reload = useCallback(() => {
        webViewRef.current?.reload();
    }, [webViewRef]);

    const onMessage = useCallback((event: WebViewMessageEvent) => {
        let parsed: ReturnType<typeof parsePgpEnvelope>;
        try {
            parsed = parsePgpEnvelope(JSON.parse(event.nativeEvent.data));
        } catch (error) {
            logger.warn('pgp webview message parse failed', { error });
            return;
        }

        if (!parsed) {
            logger.warn('pgp webview message rejected', { data: event.nativeEvent.data });
            return;
        }

        const operation = pending.current.get(parsed.id);
        if (!operation) return;

        pending.current.delete(parsed.id);
        clearTimeout(operation.timer);

        if (!parsed.success) {
            operation.reject(new Error(parsed.error));
            return;
        }

        // Validate the result against the operation's response contract
        // before resolving: the WebView is a high-value trust boundary.
        if (!isPgpOperationResultValid(operation.operation, parsed.result)) {
            operation.reject(new Error(`Invalid result for PGP operation ${operation.operation}`));
            return;
        }

        operation.resolve(parsed.result);
    }, []);

    return {
        executePGPOperation,
        reload,
        onMessage,
    };
}
