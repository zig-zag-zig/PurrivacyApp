import { useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';

export function usePgpRuntimeOnUserChange(user: User | null, reloadWebView: () => void): void {
  const previousUserRef = useRef(user);

  useEffect(() => {
    if (previousUserRef.current && !user) {
      reloadWebView();
    }
    previousUserRef.current = user;
  }, [user, reloadWebView]);
}
