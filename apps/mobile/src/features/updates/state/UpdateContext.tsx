import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useToast } from '../../../app/state/ToastContext';
import { AppUpdateModal } from '../components/AppUpdateModal';
import { getErrorMessage, useUpdateInstall } from '../hooks/useUpdateInstall';
import type {
  AppRelease,
  UpdateCheckOptions,
  UpdateDownloadProgress,
  UpdateStatus,
} from '../model/types';
import { UPDATE_COPY } from '../model/updateCopy';
import { AppUpdateNoReleaseError, appUpdateService } from '../services/appUpdateService';

type UpdateContextType = {
  status: UpdateStatus;
  isChecking: boolean;
  isConfigured: boolean;
  canInstallUpdates: boolean;
  currentVersion: string;
  latestRelease: AppRelease | null;
  skippedReleaseTag: string | null;
  error: string | null;
  checkedAt: number | null;
  downloadProgress: UpdateDownloadProgress | null;
  checkForUpdates: (options?: UpdateCheckOptions) => Promise<void>;
  showUpdateModal: () => void;
  hideUpdateModal: () => void;
  installUpdate: () => Promise<void>;
  skipLatestRelease: () => Promise<void>;
};

const UpdateContext = createContext<UpdateContextType | null>(null);

export const UpdateProvider = ({ children }: { children: ReactNode }) => {
  const { showToast } = useToast();
  const {
    canInstallUpdates,
    clearDownloadProgress,
    downloadProgress,
    installingRef,
    installUpdate,
    isInstalling,
  } = useUpdateInstall();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [latestRelease, setLatestRelease] = useState<AppRelease | null>(null);
  const [skippedReleaseTag, setSkippedReleaseTag] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState(appUpdateService.getCurrentVersion());
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const checkingRef = useRef(false);
  const isConfigured = appUpdateService.isConfigured();

  useEffect(() => {
    void appUpdateService.cleanDownloadedUpdates().catch(() => undefined);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && !installingRef.current) {
        void appUpdateService.cleanDownloadedUpdates().catch(() => undefined);
      }
    });

    return () => subscription.remove();
  }, []);

  const checkForUpdates = useCallback(async (options: UpdateCheckOptions = {}) => {
    if (checkingRef.current) return;

    if (!isConfigured) {
      const message = UPDATE_COPY.checkUnavailable;
      setStatus('error');
      setError(message);
      if (!options.silent) {
        showToast(message, 'error');
        setModalVisible(true);
      }
      return;
    }

    checkingRef.current = true;
    setStatus('checking');
    setError(null);
    clearDownloadProgress();

    try {
      const result = await appUpdateService.checkForUpdate();
      const skippedTag = await appUpdateService.getSkippedReleaseTag();
      setCurrentVersion(result.currentVersion);
      setLatestRelease(result.release);
      setSkippedReleaseTag(skippedTag);
      setCheckedAt(result.checkedAt);
      setStatus(result.isAvailable ? 'available' : 'current');
      const skippedOnStartup = options.respectSkippedVersion && skippedTag === result.release.tagName;

      if (result.isAvailable && options.showModalOnUpdate && !skippedOnStartup) {
        setModalVisible(true);
      } else if (!result.isAvailable && options.showModalWhenCurrent) {
        setModalVisible(true);
      } else if (!result.isAvailable && !options.silent) {
        showToast('App is up to date', 'success');
      }
    } catch (caught) {
      const message = getErrorMessage(caught);
      const releaseNotFound = caught instanceof AppUpdateNoReleaseError;
      setStatus(releaseNotFound ? 'not_found' : 'error');
      setError(message);
      setLatestRelease(null);
      setCheckedAt(Date.now());
      if (!options.silent) {
        showToast(message, releaseNotFound ? 'info' : 'error');
        setModalVisible(true);
      }
    } finally {
      checkingRef.current = false;
    }
  }, [isConfigured, showToast]);

  const installLatestRelease = useCallback(() => {
    setError(null);
    return installUpdate(latestRelease);
  }, [installUpdate, latestRelease]);

  const skipLatestRelease = useCallback(async () => {
    if (!latestRelease) return;

    try {
      await appUpdateService.skipRelease(latestRelease);
      setSkippedReleaseTag(latestRelease.tagName);
      setModalVisible(false);
      showToast(`Skipped ${latestRelease.version}`, 'info');
    } catch {
      showToast('Could not save update preference', 'error');
    }
  }, [latestRelease, showToast]);

  const value = useMemo<UpdateContextType>(() => ({
    status,
    isChecking: status === 'checking',
    isConfigured,
    canInstallUpdates,
    currentVersion,
    latestRelease,
    skippedReleaseTag,
    error,
    checkedAt,
    downloadProgress,
    checkForUpdates,
    showUpdateModal: () => setModalVisible(true),
    hideUpdateModal: () => {
      if (!downloadProgress) setModalVisible(false);
    },
    installUpdate: installLatestRelease,
    skipLatestRelease,
  }), [
    status,
    isConfigured,
    canInstallUpdates,
    currentVersion,
    latestRelease,
    skippedReleaseTag,
    error,
    checkedAt,
    downloadProgress,
    checkForUpdates,
    installLatestRelease,
    skipLatestRelease,
  ]);

  return (
    <UpdateContext.Provider value={value}>
      {children}
      <AppUpdateModal
        visible={modalVisible}
        status={status}
        currentVersion={currentVersion}
        release={latestRelease}
        error={error}
        checking={status === 'checking'}
        updating={isInstalling}
        canInstallUpdates={canInstallUpdates}
        downloadProgress={downloadProgress}
        onClose={() => {
          if (!downloadProgress) setModalVisible(false);
        }}
        onCheckAgain={() => {
          void checkForUpdates({
            showModalOnUpdate: true,
            showModalWhenCurrent: true,
          });
        }}
        onUpdate={() => {
          void installLatestRelease();
        }}
        onSkipVersion={() => {
          void skipLatestRelease();
        }}
      />
    </UpdateContext.Provider>
  );
};

export const useAppUpdate = () => {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useAppUpdate must be used within an UpdateProvider');
  }

  return context;
};
