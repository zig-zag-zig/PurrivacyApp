import { useEffect, useRef } from 'react';
import { useAppUpdate } from '../../features/updates/state/UpdateContext';

export function useStartupUpdateCheck(authCompleted: boolean): void {
  const updateStartupCheckedRef = useRef(false);
  const appUpdate = useAppUpdate();

  useEffect(() => {
    if (!authCompleted || updateStartupCheckedRef.current || !appUpdate.isConfigured) return;

    updateStartupCheckedRef.current = true;
    void appUpdate.checkForUpdates({
      silent: true,
      showModalOnUpdate: true,
      respectSkippedVersion: true,
    });
  }, [authCompleted, appUpdate]);
}
