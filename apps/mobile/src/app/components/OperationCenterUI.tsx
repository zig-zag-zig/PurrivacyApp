import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import * as Sharing from 'expo-sharing';

import { CustomText } from '../../components/CustomText';
import { useToast } from '../state/ToastContext';
import { useOperationCenter } from '../state/OperationCenterContext';
import { formatBytes, type OperationRecord } from '../state/operationCenterState';
import { openResultFile, showResultsInFolder } from '../../services/downloadsSaver';
import { OperationResultDetail } from './OperationResultDetail';
import { theme } from '../../styles/theme';

/**
 * The operation center's visible surface: a floating action button in the
 * bottom-right corner while operations exist (running or finished), opening
 * the Activity list of pending/finished operations.
 *
 * Deliberately not a blocking overlay — long operations must not hold the app
 * hostage. The FAB and the list persist until the user clears them or the
 * list empties, so a finished result is never yanked away mid-read.
 *
 * FAB design:
 *  - Running ops → an indeterminate progress ring spins around the button.
 *  - A counter badge shows running count, else unseen-finished count.
 *  - The icon follows state: flash while running, check when something just
 *    finished, a clock for quiet history.
 */

const FAB_SIZE = 56;

const OperationFab: React.FC<{
    runningCount: number;
    finishedCount: number;
    unseenFinishedCount: number;
    onPress: () => void;
}> = ({ runningCount, finishedCount, unseenFinishedCount, onPress }) => {
    const isRunning = runningCount > 0;
    const badgeCount = isRunning ? runningCount : unseenFinishedCount;

    // Indeterminate spinner ring while anything is running.
    const spin = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(0.6)).current;

    useEffect(() => {
        if (isRunning) {
            spin.setValue(0);
            const loop = Animated.loop(
                Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
            );
            loop.start();
            return () => loop.stop();
        }
        spin.stopAnimation();
        return undefined;
    }, [isRunning, spin]);

    // Pop-in when the FAB first appears.
    useEffect(() => {
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
    }, [scale]);

    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

    const icon: React.ComponentProps<typeof Icon>['name'] = isRunning
        ? 'flash-on'
        : unseenFinishedCount > 0
            ? 'check'
            : 'schedule';

    return (
        <Animated.View style={[styles.fabHost, { transform: [{ scale }] }]} pointerEvents="box-none">
            <View style={styles.fabRing} pointerEvents="none">
                {isRunning ? (
                    <Animated.View style={[styles.fabRingSpin, { transform: [{ rotate }] }]} />
                ) : (
                    <View style={styles.fabRingIdle} />
                )}
            </View>
            <TouchableOpacity
                onPress={onPress}
                style={styles.fab}
                activeOpacity={0.85}
                accessibilityLabel={`Activity, ${isRunning ? `${runningCount} running` : `${finishedCount} finished`}`}
                accessibilityRole="button"
                testID="purrivacy.ops.pill"
            >
                <Icon name={icon} size={26} color={theme.colors.onPrimary} />
            </TouchableOpacity>
            {badgeCount > 0 ? (
                <View style={styles.fabBadge} pointerEvents="none">
                    <CustomText style={styles.fabBadgeText}>{badgeCount > 99 ? '99+' : badgeCount}</CustomText>
                </View>
            ) : null}
        </Animated.View>
    );
};

const describeProgress = (op: OperationRecord): string => {
    if (op.status === 'running' && op.progress) {
        const { done, total } = op.progress;
        if (total && total > 0) {
            return `${formatBytes(done)} / ${formatBytes(total)}`;
        }
        return formatBytes(done);
    }
    if (op.resultSummary) return op.resultSummary;
    if (op.status === 'failed') return op.error ?? 'Failed';
    return '';
};

const statusIconName = (op: OperationRecord): React.ComponentProps<typeof Icon>['name'] => {
    switch (op.status) {
        case 'succeeded': return 'check-circle';
        case 'failed': return 'error';
        default: return 'autorenew';
    }
};

const statusIconColor = (op: OperationRecord): string => {
    switch (op.status) {
        case 'succeeded': return theme.colors.success;
        case 'failed': return theme.colors.error;
        default: return theme.colors.primary;
    }
};

/** Signature verification badge for decrypt operations. */
const VerificationBadge: React.FC<{ op: OperationRecord }> = ({ op }) => {
    const result = op.result ?? {};
    if (op.status !== 'succeeded' || !('verified' in result)) return null;

    const verified = result.verified;
    const [label, color, icon] = verified === true
        ? ['Signature verified', theme.colors.success, 'verified' as const]
        : verified === false
            ? ['Invalid signature', theme.colors.error, 'gpp-bad' as const]
            : ['Unsigned', theme.colors.textMuted, 'gpp-maybe' as const];

    return (
        <View style={styles.badge}>
            <Icon name={icon} size={13} color={color} />
            <CustomText style={[styles.badgeText, { color }]}>{label}</CustomText>
        </View>
    );
};

interface ActionIconProps {
    icon: React.ComponentProps<typeof Icon>['name'];
    label: string;
    onPress: () => void;
    testID?: string;
}

const ActionIcon: React.FC<ActionIconProps> = ({ icon, label, onPress, testID }) => (
    <TouchableOpacity
        onPress={onPress}
        style={styles.actionIcon}
        accessibilityLabel={label}
        accessibilityRole="button"
        testID={testID}
        activeOpacity={0.7}
    >
        <Icon name={icon} size={21} color={theme.colors.primary} />
    </TouchableOpacity>
);

const OperationRow: React.FC<{
    op: OperationRecord;
    onDismiss: (id: string) => void;
    onView: (op: OperationRecord) => void;
}> = ({ op, onDismiss, onView }) => {
    const { showToast } = useToast();
    const started = new Date(op.startedAt);
    const time = `${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}`;

    const result = op.result ?? {};
    const fileName = typeof result.fileName === 'string' ? result.fileName : null;
    const savedUri = typeof result.savedUri === 'string' ? result.savedUri : null;
    const cacheUri = typeof result.fileUri === 'string' ? result.fileUri : null;
    const isFileOp = op.kind === 'file-encrypt' || op.kind === 'file-decrypt';
    const isTextOp = op.kind === 'text-encrypt' || op.kind === 'text-decrypt';
    const done = op.status === 'succeeded';
    const hasOutput = done && Boolean(fileName && (savedUri || cacheUri));
    const canShare = hasOutput && isFileOp;
    // Text results open the detail view on card tap; file results open the
    // file itself (falling back to its folder when nothing can view it) — so
    // no separate "open" icon is needed on the row.
    const canViewDetail = done && isTextOp
        && (typeof result.encryptedContent === 'string' || typeof result.decryptedContent === 'string');
    const canOpenFile = done && isFileOp && hasOutput;
    const tappable = canViewDetail || canOpenFile;

    // expo-sharing only accepts a local file:// URI, so prefer the app-cache
    // copy (the content:// Downloads URI is for open/reveal, not sharing).
    const share = useCallback(() => {
        const uri = cacheUri ?? savedUri;
        if (!uri) return;
        void Sharing.isAvailableAsync()
            .then(available => {
                if (!available) {
                    showToast('Sharing is not available on this device', 'error');
                    return;
                }
                return Sharing.shareAsync(uri);
            })
            .catch(() => showToast('Could not share the file', 'error'));
    }, [cacheUri, savedUri, showToast]);

    const open = useCallback(() => {
        if (!fileName) return;
        void openResultFile(fileName, savedUri, cacheUri).then(opened => {
            if (!opened) void showResultsInFolder();
        });
    }, [fileName, savedUri, cacheUri]);

    const handleTap = () => {
        if (canViewDetail) {
            onView(op);
        } else if (canOpenFile) {
            open();
        }
    };

    return (
        <View style={styles.row}>
            <Icon
                name={statusIconName(op)}
                size={20}
                color={statusIconColor(op)}
                style={styles.statusIcon}
            />

            <View style={styles.rowBody}>
                <TouchableOpacity
                    activeOpacity={tappable ? 0.7 : 1}
                    onPress={tappable ? handleTap : undefined}
                    disabled={!tappable}
                    testID={`purrivacy.ops.row.${op.kind}`}
                >
                    <CustomText style={styles.rowTitle} numberOfLines={2}>
                        {op.title}{op.detail ? ` — ${op.detail}` : ''}
                    </CustomText>
                    <CustomText style={styles.rowMeta} numberOfLines={2}>
                        {op.phase ? `${op.phase} · ` : ''}{describeProgress(op)}
                    </CustomText>
                </TouchableOpacity>

                <View style={styles.rowFooter}>
                    <CustomText style={styles.rowTime}>{time}</CustomText>
                    <VerificationBadge op={op} />
                </View>
            </View>

            {/* Right-hand column: dismiss at the top (its conventional place),
                then the file result's quick actions underneath. */}
            <View style={styles.actionsColumn}>
                {op.status !== 'running' ? (
                    <TouchableOpacity
                        onPress={() => onDismiss(op.id)}
                        style={styles.dismissIcon}
                        accessibilityLabel="Dismiss"
                        testID={`purrivacy.ops.dismiss.${op.id}`}
                    >
                        <Icon name="close" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                ) : null}
                {canShare ? (
                    <ActionIcon
                        icon="share"
                        label="Share result"
                        onPress={share}
                        testID={`purrivacy.ops.share.${op.id}`}
                    />
                ) : null}
                {canShare ? (
                    <ActionIcon
                        icon="folder-open"
                        label="Show in Downloads"
                        onPress={() => { void showResultsInFolder(); }}
                        testID={`purrivacy.ops.folder.${op.id}`}
                    />
                ) : null}
            </View>
        </View>
    );
};

export const OperationCenterUI: React.FC = () => {
    const { operations, runningCount, unseenFinishedCount, dismiss, clearFinished, markSeen } = useOperationCenter();
    const [listOpen, setListOpen] = useState(false);
    const [detailOp, setDetailOp] = useState<OperationRecord | null>(null);

    const closeList = useCallback(() => {
        setListOpen(false);
        setDetailOp(null);
    }, []);

    const finished = useMemo(() => operations.filter(op => op.status !== 'running'), [operations]);
    const hasOperations = operations.length > 0;

    // Opening the list counts as "seen": clears the unseen badge so it only
    // flags outcomes the user has not looked at yet.
    useEffect(() => {
        if (!listOpen) return;
        operations.filter(op => op.status !== 'running' && !op.seen).forEach(op => markSeen(op.id));
    }, [listOpen, operations, markSeen]);

    // When the list empties (cleared, or the last item dismissed) while the
    // modal is open, let the "All clear" state register for a beat and then
    // close — the fade-out reads far better than the modal vanishing instantly.
    useEffect(() => {
        if (!listOpen || hasOperations || detailOp) return undefined;
        const timeout = setTimeout(() => closeList(), 520);
        return () => clearTimeout(timeout);
    }, [listOpen, hasOperations, detailOp, closeList]);

    // Stay mounted while the list is open, even if the last operation settles
    // and is marked seen — otherwise finishing a task would slam the modal shut
    // in the middle of reading it.
    if (!hasOperations && !listOpen) return null;

    return (
        <>
            {hasOperations && !listOpen ? (
                <OperationFab
                    runningCount={runningCount}
                    finishedCount={finished.length}
                    unseenFinishedCount={unseenFinishedCount}
                    onPress={() => setListOpen(true)}
                />
            ) : null}

            <Modal
                visible={listOpen}
                transparent
                animationType="fade"
                onRequestClose={closeList}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        {detailOp ? (
                            <>
                                <View style={styles.modalHeader}>
                                    <TouchableOpacity
                                        onPress={() => setDetailOp(null)}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        accessibilityLabel="Back to activity"
                                        testID="purrivacy.ops.back"
                                    >
                                        <Icon name="arrow-back" size={20} color={theme.colors.textSecondary} />
                                    </TouchableOpacity>
                                    <CustomText style={styles.modalTitle}>Result</CustomText>
                                    <TouchableOpacity
                                        onPress={closeList}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        accessibilityLabel="Close"
                                        testID="purrivacy.ops.closeIcon"
                                    >
                                        <Icon name="close" size={20} color={theme.colors.textSecondary} />
                                    </TouchableOpacity>
                                </View>
                                <ScrollView
                                    style={styles.detailScroll}
                                    contentContainerStyle={styles.detailContent}
                                    keyboardShouldPersistTaps="handled"
                                >
                                    <OperationResultDetail op={detailOp} />
                                </ScrollView>
                            </>
                        ) : (
                            <>
                                <View style={styles.modalHeader}>
                                    <CustomText style={styles.modalTitle}>Activity</CustomText>
                                    <View style={styles.modalHeaderActions}>
                                        {finished.length > 0 ? (
                                            <ActionIcon
                                                icon="delete-sweep"
                                                label="Clear finished"
                                                onPress={clearFinished}
                                                testID="purrivacy.ops.clearFinished"
                                            />
                                        ) : null}
                                        <TouchableOpacity
                                            onPress={closeList}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                            accessibilityLabel="Close"
                                            testID="purrivacy.ops.closeIcon"
                                        >
                                            <Icon name="close" size={20} color={theme.colors.textSecondary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {hasOperations ? (
                                    <ScrollView
                                        style={styles.detailScroll}
                                        contentContainerStyle={styles.list}
                                        keyboardShouldPersistTaps="handled"
                                    >
                                        {operations.map(op => (
                                            <OperationRow
                                                key={op.id}
                                                op={op}
                                                onDismiss={dismiss}
                                                onView={setDetailOp}
                                            />
                                        ))}
                                    </ScrollView>
                                ) : (
                                    <View style={styles.clearedState}>
                                        <Icon name="check-circle" size={34} color={theme.colors.success} />
                                        <CustomText style={styles.clearedText}>All clear</CustomText>
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    fabHost: {
        position: 'absolute',
        right: 16,
        bottom: 92,
        width: FAB_SIZE + 12,
        height: FAB_SIZE + 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fabRing: {
        position: 'absolute',
        width: FAB_SIZE + 10,
        height: FAB_SIZE + 10,
        borderRadius: (FAB_SIZE + 10) / 2,
    },
    fabRingSpin: {
        position: 'absolute',
        width: FAB_SIZE + 10,
        height: FAB_SIZE + 10,
        borderRadius: (FAB_SIZE + 10) / 2,
        borderWidth: 3,
        borderColor: 'transparent',
        borderTopColor: theme.colors.primary,
        borderRightColor: theme.colors.primary,
    },
    fabRingIdle: {
        position: 'absolute',
        width: FAB_SIZE + 10,
        height: FAB_SIZE + 10,
        borderRadius: (FAB_SIZE + 10) / 2,
        borderWidth: 1,
        borderColor: theme.colors.dividerStrong,
    },
    fab: {
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: FAB_SIZE / 2,
        backgroundColor: theme.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        ...theme.elevation.high,
    },
    fabBadge: {
        position: 'absolute',
        top: -2,
        right: -2,
        minWidth: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: theme.colors.error,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
        borderWidth: 2,
        borderColor: theme.colors.background,
    },
    fabBadgeText: {
        color: theme.colors.onPrimary,
        fontSize: 11,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: theme.colors.overlay,
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.lg,
    },
    modalCard: {
        width: '100%',
        maxWidth: 480,
        maxHeight: '80%',
        backgroundColor: theme.colors.backgroundElevated,
        borderColor: theme.colors.divider,
        borderWidth: 1,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.md,
        gap: theme.spacing.md,
        ...theme.elevation.high,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    modalHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
    },
    modalTitle: {
        color: theme.colors.text,
        fontSize: 18,
        fontWeight: '700',
    },
    list: {
        gap: theme.spacing.sm,
        flexGrow: 0,
        paddingBottom: theme.spacing.xs,
    },
    detailScroll: {
        flexGrow: 0,
        flexShrink: 1,
    },
    detailContent: {
        paddingBottom: theme.spacing.xs,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.divider,
        borderWidth: 1,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.sm,
    },
    statusIcon: {
        marginTop: 1,
    },
    rowBody: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    rowTitle: {
        color: theme.colors.text,
        fontWeight: '600',
        fontSize: 14,
    },
    rowMeta: {
        color: theme.colors.textSecondary,
        fontSize: 12,
    },
    rowFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        marginTop: 4,
    },
    rowTime: {
        color: theme.colors.textMuted,
        fontSize: 11,
        fontVariant: ['tabular-nums'],
    },
    actionsColumn: {
        alignItems: 'center',
        gap: theme.spacing.xs,
    },
    actionIcon: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    dismissIcon: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    emptyText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 19,
    },
    clearedState: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.lg,
    },
    clearedText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontWeight: '600',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: theme.spacing.sm,
    },
});
