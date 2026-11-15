import { useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';

export function usePgpRuntimeOnUserChange(
  user: User | null,
  reloadWebView: () => void,
  onRuntimeCleared?: () => void,
): void {
  const previousUserRef = useRef(user);

  useEffect(() => {
    const previousUser = previousUserRef.current;
    const userChanged = Boolean(previousUser && user && previousUser.uid !== user.uid);
    if (previousUser && (!user || userChanged)) {
      onRuntimeCleared?.();
      reloadWebView();
    }
    previousUserRef.current = user;
  }, [user, reloadWebView, onRuntimeCleared]);
}
