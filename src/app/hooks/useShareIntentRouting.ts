import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useShareIntent } from '../../features/share-intent/hooks/useShareIntent';
import { useToast } from '../state/ToastContext';
import { identifyKeyType } from '../../features/keys/domain/pgpValidation';
import { useAuth } from '../../features/auth/state/AuthContext';
import type { PgpArmorType } from '../../features/keys/domain/pgpValidation';
import type { RootNavigationProps } from '../navigation/types';

const SHARE_INTENT_TTL = 3 * 60 * 1000;

const getTargetScreen = (text: string): 'Key' | 'Decrypt' | 'Encrypt' => {
  const keyType: PgpArmorType = identifyKeyType(text);

  switch (keyType) {
    case 'private':
    case 'public':
      return 'Key';
    case 'message':
      return 'Decrypt';
    default:
      return 'Encrypt';
  }
};

export function useShareIntentRouting(): void {
  const { user, authCompleted } = useAuth();
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntent();
  const navigation = useNavigation<RootNavigationProps>();
  const { showToast } = useToast();
  const pendingShareRef = useRef<{ screen: 'Key' | 'Decrypt' | 'Encrypt'; text: string; timestamp: number } | null>(null);

  // Handle incoming share intent
  useEffect(() => {
    if (!authCompleted) return;

    if (error) {
      console.error('Share Intent Error:', error);
      showToast('Failed to handle incoming share', 'error');
      resetShareIntent();
      return;
    }

    let text = shareIntent.text;
    const trimmedText = text?.trim();
    if (hasShareIntent && trimmedText) {
      const targetScreen = getTargetScreen(trimmedText);
      text = targetScreen === 'Encrypt' ? text! : trimmedText;

      if (!user) {
        pendingShareRef.current = {
          screen: targetScreen,
          text,
          timestamp: Date.now(),
        };
        resetShareIntent();
        return;
      }

      navigation.navigate('Home', { screen: targetScreen, params: { text } });
      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent, error, navigation, resetShareIntent, authCompleted, user, showToast]);

  // Handle pending share after login
  useEffect(() => {
    if (user && pendingShareRef.current) {
      const { screen, text, timestamp } = pendingShareRef.current;
      if (Date.now() - timestamp < SHARE_INTENT_TTL) {
        navigation.navigate('Home', { screen, params: { text } });
      }
      pendingShareRef.current = null;
    }
  }, [user, navigation]);
}
