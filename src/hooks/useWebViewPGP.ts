import { useRef, useState, useCallback } from 'react';
import { HiddenPGPWebViewRef } from '../components/HiddenPGPWebView';
import { pgpCryptoService } from '../services/pgpCryptoService';

export const useWebViewPGP = () => {
    const webViewRef = useRef<HiddenPGPWebViewRef | null>(null);
    const [isReady, setIsReady] = useState(false);

    const setWebViewRef = useCallback((node: HiddenPGPWebViewRef | null) => {
        webViewRef.current = node;
        if (node) {
            // Connect the service to the WebView executor
            pgpCryptoService.setExecutor(node);
            setIsReady(true);
        } else {
            pgpCryptoService.clearExecutor();
            setIsReady(false);
        }
    }, []);

    const handleWebViewReload = useCallback(() => {
        if (webViewRef.current) {
            pgpCryptoService.setExecutor(webViewRef.current);
        }
    }, []);

    const reloadWebView = useCallback(() => {
        pgpCryptoService.clearExecutor();
        setIsReady(false);
        webViewRef.current?.reload();
    }, []);

    return {
        webViewRef: setWebViewRef,
        isReady,
        onReload: handleWebViewReload,
        reloadWebView,
    };
};
