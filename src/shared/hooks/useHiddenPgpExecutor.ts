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

            // Compute per-operation timeout based on RSA key size
            let timeoutMs = 30000; // default
            if (operation === 'generateKeyPair') {
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
            const js = `
        (function(){
          try {
            if (typeof window.handlePGPOperation !== 'function') {
              window.ReactNativeWebView.postMessage(JSON.stringify({ success:false, error:'handlePGPOperation not ready', id: ${id} }));
              return true;
            }
            setTimeout(function(){
              try {
                window.handlePGPOperation(${JSON.stringify(payload)});
              } catch(eInner) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ success:false, error: eInner.message, id: ${id} }));
              }
            }, 0);
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
