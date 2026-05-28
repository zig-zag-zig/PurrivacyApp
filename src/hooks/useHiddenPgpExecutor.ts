import { RefObject, useCallback, useEffect, useRef } from 'react';
import type { WebViewMessageEvent } from 'react-native-webview';
import { WebView } from 'react-native-webview';

import type { PGPExecutor } from '../services/pgpCryptoService.';
import { logger } from '../utils/logger';

type PendingOperation = {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
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

    const executePGPOperation: PGPExecutor['executePGPOperation'] = useCallback((operation, data) => {
        return new Promise((resolve, reject) => {
            const id = opId.current++;

            const timer = setTimeout(() => {
                if (pending.current.has(id)) {
                    pending.current.delete(id);
                    reject(new Error(`Timeout ${operation} #${id}`));
                }
            }, 15000);

            pending.current.set(id, {
                resolve,
                reject,
                timer,
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
        try {
            const msg = JSON.parse(event.nativeEvent.data);
            const { success, result, error, id } = msg;
            const operation = pending.current.get(id);
            if (!operation) return;

            pending.current.delete(id);
            clearTimeout(operation.timer);
            success ? operation.resolve(result) : operation.reject(new Error(error));
        } catch (error) {
            logger.warn('pgp webview message parse failed', { error });
        }
    }, []);

    return {
        executePGPOperation,
        reload,
        onMessage,
    };
}
