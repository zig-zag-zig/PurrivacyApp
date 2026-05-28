import { useCallback, useRef } from 'react';
import type { Dispatch } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';

import type { KeyScreenAction } from '../state/keyScreenReducer';

type KeyListExpansion = {
  scrollRef: React.RefObject<ScrollView | null>;
  itemRefs: React.RefObject<Record<string, View | null>>;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onToggleExpandedKey: (fingerprint: string) => void;
};

export function useKeyListExpansion(
  expandedKeyFingerprint: string | null,
  dispatch: Dispatch<KeyScreenAction>,
): KeyListExpansion {
  const scrollRef = useRef<ScrollView>(null);
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
        scrollRef.current?.scrollTo({ y: scrollYRef.current, animated: false });
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
