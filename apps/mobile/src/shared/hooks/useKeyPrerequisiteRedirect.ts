import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

import { useToast } from '../../app/state/ToastContext';
import type { RootNavigationProps } from '../../app/navigation/types';

type KeyNavigateParams = {
    screen: 'Key';
    params: { action: 'import' | 'create' };
};

/**
 * Extracted shared pattern from useEncryptPage / useDecryptPage:
 * when no keys exist, displays a toast message and redirects to the Key screen
 * with the specified action parameter.
 *
 * @param shouldRedirect - true when the user is authenticated but has no matching keys
 * @param message - the toast message to show before redirecting
 * @param navigateTarget - the navigation target screen and action params
 * @param navigation - navigation object (passed in to avoid hook-ordering issues)
 * @returns isRedirecting - whether a redirect is currently in progress
 */
export function useKeyPrerequisiteRedirect(
    shouldRedirect: boolean,
    message: string,
    navigateTarget: KeyNavigateParams,
    navigation: RootNavigationProps,
): { isRedirecting: boolean } {
    const { showToast } = useToast();
    const [isRedirecting, setIsRedirecting] = useState(false);
    // Keep target out of effect deps (callers pass inline object literals).
    // Match pre-extraction behavior: only re-run when redirect eligibility changes.
    const navigateTargetRef = useRef(navigateTarget);
    navigateTargetRef.current = navigateTarget;
    const messageRef = useRef(message);
    messageRef.current = message;

    useFocusEffect(
        useCallback(() => {
            if (!shouldRedirect) {
                setIsRedirecting(false);
                return;
            }

            setIsRedirecting(true);
            showToast(messageRef.current, 'info');
            const target = navigateTargetRef.current;
            const interaction = InteractionManager.runAfterInteractions(() => {
                navigation.navigate('Home', target);
            });

            return () => {
                interaction.cancel?.();
                setIsRedirecting(false);
            };
        }, [navigation, shouldRedirect, showToast]),
    );

    return { isRedirecting };
}
