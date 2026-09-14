import { useCallback, useRef } from 'react';
import type { Dispatch } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native';

import type { KeyScreenAction } from '../state/keyScreenReducer';

/**
 * Minimal scroll surface shared by ScrollView (ScreenContainer) and FlatList
 * (ScreenList). Only `scrollTo` offset semantics are needed — FlatList maps it
 * to `scrollToOffset`.
 */
export type ScrollableRef = {
    scrollTo?: (options: { y: number; animated?: boolean }) => void;
    scrollToOffset?: (options: { offset: number; animated?: boolean }) => void;
};

const scrollToY = (node: ScrollableRef | null, y: number, animated: boolean) => {
    if (!node) return;
    if (node.scrollTo) {
        node.scrollTo({ y, animated });
    } else if (node.scrollToOffset) {
        node.scrollToOffset({ offset: y, animated });
    }
};

type KeyListExpansion = {
  scrollRef: React.RefObject<ScrollableRef | null>;
  itemRefs: React.RefObject<Record<string, View | null>>;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onToggleExpandedKey: (fingerprint: string) => void;
};

export function useKeyListExpansion(
  expandedKeyFingerprint: string | null,
  dispatch: Dispatch<KeyScreenAction>,
): KeyListExpansion {
  const scrollRef = useRef<ScrollableRef>(null);
  const scrollYRef = useRef(0);
  const itemRefs = useRef<Record<string, View | null>>({});

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const onToggleExpandedKey = useCallback((fingerprint: string) => {
    const node = itemRefs.current[fingerprint];
    const handle = node ? (node as unknown as { _nativeTag?: number })._nativeTag : undefined;
    const nextFingerprint = expandedKeyFingerprint === fingerprint ? null : fingerprint;

    if (!handle) {
      dispatch({
        type: 'expandedKeyFingerprintChanged',
        expandedKeyFingerprint: nextFingerprint,
      });
      return;
    }

    requestAnimationFrame(() => {
      dispatch({
        type: 'expandedKeyFingerprintChanged',
        expandedKeyFingerprint: nextFingerprint,
      });

      requestAnimationFrame(() => {
        scrollToY(scrollRef.current, scrollYRef.current, false);
      });
    });
  }, [dispatch, expandedKeyFingerprint]);

  return {
    scrollRef,
    itemRefs,
    onScroll,
    onToggleExpandedKey,
  };
}
