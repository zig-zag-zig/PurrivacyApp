import React, { useEffect } from 'react';
import { BackHandler, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import type { AppRelease, UpdateDownloadProgress, UpdateStatus } from '../model/types';
import {
  formatBytes,
  formatPublishedDate,
  getProgressLabel,
  getUpdateStatusPresentation,
  UPDATE_COPY,
} from '../model/updateCopy';

type AppUpdateModalProps = {
  visible: boolean;
  status: UpdateStatus;
  currentVersion: string;
  release: AppRelease | null;
  error: string | null;
  checking: boolean;
  updating: boolean;
  canInstallUpdates: boolean;
  downloadProgress: UpdateDownloadProgress | null;
  onClose: () => void;
  onCheckAgain: () => void;
  onUpdate: () => void;
  onSkipVersion: () => void;
};

export const AppUpdateModal = ({
  visible,
  status,
  currentVersion,
  release,
  error,
  checking,
  updating,
  canInstallUpdates,
  downloadProgress,
  onClose,
  onCheckAgain,
  onUpdate,
  onSkipVersion,
}: AppUpdateModalProps) => {
  const insets = useSafeAreaInsets();
  const availableRelease = status === 'available' ? release : null;
  const isAvailable = Boolean(availableRelease);
  const isNotFound = status === 'not_found';
  const isError = status === 'error';
  const statusPresentation = getUpdateStatusPresentation(status);
  const publishedDate = formatPublishedDate(release?.publishedAt ?? null);
  const progressPercent = downloadProgress?.progress === null || downloadProgress?.progress === undefined
    ? null
    : Math.round(downloadProgress.progress * 100);
  const progressWidth = `${Math.max(3, progressPercent ?? 18)}%` as `${number}%`;
  const bytesWritten = formatBytes(downloadProgress?.bytesWritten ?? null);
  const contentLength = formatBytes(downloadProgress?.contentLength ?? release?.assetSizeBytes ?? null);
  const showUpdateAction = Boolean(availableRelease && canInstallUpdates);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });

    return () => subscription.remove();
  }, [onClose, visible]);

  if (!visible) {
    return null;
  }

  const iconColor = statusPresentation.tone === 'error'
    ? theme.colors.error
    : statusPresentation.tone === 'success'
      ? theme.colors.success
      : statusPresentation.tone === 'info'
        ? '#38bdf8'
        : theme.colors.primary;
  const iconName = statusPresentation.iconName as React.ComponentProps<typeof Icon>['name'];

  return (
    <View
      style={[
        commonStyles.modalOverlay,
        styles.overlay,
        {
          paddingTop: insets.top + theme.spacing.md,
          paddingBottom: insets.bottom + theme.spacing.md,
        },
      ]}
    >
      <View style={styles.dialog}>
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: `${iconColor}22` }]}>
            <Icon name={iconName} size={26} color={iconColor} />
          </View>
          <View style={styles.headerText}>
            <CustomText style={styles.title} numberOfLines={2}>
              {statusPresentation.title}
            </CustomText>
            <CustomText style={styles.subtitle} numberOfLines={1}>
              Current version {currentVersion}
            </CustomText>
          </View>
          <TouchableOpacity
            onPress={onClose}
            disabled={updating}
            style={styles.closeButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Close update dialog"
          >
            <Icon
              name="close"
              size={24}
              color={updating ? theme.colors.placeholder : theme.colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {release && (
            <View style={styles.releaseSummary}>
              <View style={styles.versionPill}>
                <CustomText style={styles.versionText}>Latest {release.version}</CustomText>
              </View>
              <CustomText style={styles.releaseName} numberOfLines={2}>
                {release.name}
              </CustomText>
              {publishedDate && (
                <CustomText style={styles.releaseDate}>
                  Released {publishedDate}
                </CustomText>
              )}
              {release.assetName && (
                <CustomText style={styles.releaseDate} numberOfLines={1}>
                  {release.assetName}
                </CustomText>
              )}
            </View>
          )}

          {isError || isNotFound ? (
            <View style={[styles.messageBox, isNotFound && styles.infoMessageBox]}>
              <CustomText style={isNotFound ? styles.infoText : styles.errorText}>
                {error || (isNotFound
                  ? UPDATE_COPY.noPublicRelease
                  : UPDATE_COPY.checkFailed)}
              </CustomText>
            </View>
          ) : null}

          {release && !isError ? (
            <View style={styles.notesContainer}>
              <CustomText style={styles.notesTitle}>Release Notes</CustomText>
              <ScrollView
                style={styles.notesScroll}
                contentContainerStyle={styles.notesContent}
                nestedScrollEnabled
              >
                <CustomText style={styles.notesText}>{release.body}</CustomText>
              </ScrollView>
            </View>
          ) : null}

          {downloadProgress && (
            <View style={styles.progressPanel}>
              <View style={styles.progressHeader}>
                <View style={styles.progressTitleRow}>
                  <Icon name="download" size={18} color={theme.colors.primary} />
                  <CustomText style={styles.progressTitle} numberOfLines={1}>
                    {getProgressLabel(downloadProgress)}
                  </CustomText>
                </View>
                {progressPercent !== null && (
                  <CustomText style={styles.progressPercent}>{progressPercent}%</CustomText>
                )}
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: progressWidth }]} />
              </View>
              {(bytesWritten || contentLength) && (
                <CustomText style={styles.progressMeta}>
                  {bytesWritten || '0 KB'}{contentLength ? ` of ${contentLength}` : ''}
                </CustomText>
              )}
            </View>
          )}
        </ScrollView>

        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <Button
              label={isAvailable ? 'Later' : 'Close'}
              onPress={onClose}
              variant="secondary"
              disabled={updating}
              style={commonStyles.flex}
            />
            {showUpdateAction && availableRelease ? (
              <Button
                label={updating ? getProgressLabel(downloadProgress) : availableRelease.downloadLabel}
                onPress={onUpdate}
                loading={updating}
                disabled={updating}
                style={commonStyles.flex}
                icon={updating ? undefined : <Icon name="download" size={20} color={theme.colors.onPrimary} />}
              />
            ) : !isAvailable ? (
              <Button
                label="Check Again"
                onPress={onCheckAgain}
                loading={checking}
                disabled={checking}
                style={commonStyles.flex}
                icon={checking ? undefined : <Icon name="refresh" size={20} color={theme.colors.onPrimary} />}
              />
            ) : null}
          </View>
          {showUpdateAction && !updating && (
            <TouchableOpacity
              onPress={onSkipVersion}
              disabled={updating}
              activeOpacity={0.78}
              style={[styles.skipButton, updating && commonStyles.disabled]}
            >
              <CustomText style={styles.skipText}>
                {UPDATE_COPY.skipVersion}
              </CustomText>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    zIndex: 9000,
    elevation: 9000,
  },
  dialog: {
    width: '100%',
    maxHeight: '86%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    padding: theme.spacing.md,
    ...theme.elevation.high,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...commonStyles.textTitle,
    fontSize: 19,
  },
  subtitle: {
    ...commonStyles.textCaption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    paddingBottom: theme.spacing.xs,
  },
  releaseSummary: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  versionPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 999,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
  },
  versionText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  releaseName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  releaseDate: {
    ...commonStyles.textCaption,
    color: theme.colors.textSecondary,
  },
  notesContainer: {
    marginBottom: theme.spacing.md,
  },
  notesTitle: {
    ...commonStyles.textLabel,
    marginBottom: theme.spacing.sm,
  },
  notesScroll: {
    maxHeight: 168,
    minHeight: 96,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  notesContent: {
    padding: theme.spacing.md,
  },
  notesText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  messageBox: {
    backgroundColor: `${theme.colors.error}14`,
    borderWidth: 1,
    borderColor: `${theme.colors.error}66`,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
    lineHeight: 20,
  },
  infoMessageBox: {
    backgroundColor: '#38bdf814',
    borderColor: '#38bdf866',
  },
  infoText: {
    color: '#38bdf8',
    fontSize: 14,
    lineHeight: 20,
  },
  progressPanel: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}66`,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  progressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  progressTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  progressPercent: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.divider,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  progressMeta: {
    ...commonStyles.textCaption,
    color: theme.colors.textSecondary,
  },
  actions: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  skipButton: {
    minHeight: 44,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  skipText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
});
