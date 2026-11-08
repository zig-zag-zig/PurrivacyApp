import { useCallback, useRef } from 'react';
import type { View } from 'react-native';

import { useKeyboardAwareScroll } from './KeyboardAwareScrollContext';
import type { KeyboardAwareInputNode } from './KeyboardAwareScrollContext';

/**
 * Default focus behavior for non-InputField text inputs. Attach `containerRef`
 * to the field's wrapper and call `scrollIntoView` from `onFocus`; the nearest
 * ScreenContainer/ScreenList engine will move the field above the keyboard.
 */
export const useKeyboardAwareInputFocus = () => {
    const containerRef = useRef<View>(null);
    const { scrollInputIntoView } = useKeyboardAwareScroll();

    const scrollIntoView = useCallback(() => {
        scrollInputIntoView(containerRef.current as unknown as KeyboardAwareInputNode | null);
    }, [scrollInputIntoView]);

    return { containerRef, scrollIntoView };
};