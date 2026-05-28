import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleProp, View, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { CustomText } from '../../components/CustomText';
import { theme } from '../../styles/theme';

export type ToastType = 'error' | 'success' | 'info';
type ToastPosition = 'top' | 'bottom';

interface ToastContextType {
    showToast: (message: string, type: ToastType, position?: ToastPosition, timeout?: number) => void;
    insets: { top: number; bottom: number; left: number; right: number; };
    toast: ToastState | null;
    dismissToast: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

type ToastState = {
    id: number;
    message: string;
    type: ToastType;
    position: ToastPosition;
};

const ToastCard = ({ text1, onPress, tone, iconName }: any) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        style={[styles.toast, { borderLeftColor: tone }]}
    >
        <View style={[styles.iconContainer, { backgroundColor: `${tone}22` }]}>
            <Icon name={iconName} size={20} color={tone} />
        </View>
        <CustomText style={styles.message}>{text1}</CustomText>
    </TouchableOpacity>
);

const toastTone = (type: ToastType): string => {
    if (type === 'success') return theme.colors.success;
    if (type === 'error') return theme.colors.error;
    return theme.colors.primary;
};

const toastIcon = (type: ToastType): string => {
    if (type === 'success') return 'check-circle';
    if (type === 'error') return 'error';
    return 'info';
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
        position: 'relative',
    },
    viewport: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 10000,
        elevation: 10000,
    },
    toastSlot: {
        position: 'absolute',
        left: theme.spacing.md,
        right: theme.spacing.md,
        alignItems: 'center',
    },
    toast: {
        width: '100%',
        maxWidth: 560,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderLeftWidth: 4,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: theme.spacing.sm,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 6,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: theme.borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    message: {
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '500' as const,
        flex: 1,
    },
});

interface ToastProviderProps {
    children: ReactNode;
}

const TOAST_TOP_OFFSET = 12;
const TOAST_BOTTOM_OFFSET = 16;

export const ToastViewport = ({ style }: { style?: StyleProp<ViewStyle>; }) => {
    const { toast, dismissToast, insets } = useToast();
    if (!toast) {
        return null;
    }

    const positionStyle = toast.position === 'top'
        ? { top: insets.top + TOAST_TOP_OFFSET }
        : { bottom: insets.bottom + TOAST_BOTTOM_OFFSET };

    return (
        <View pointerEvents="box-none" style={[styles.viewport, style]}>
            <View pointerEvents="box-none" style={[styles.toastSlot, positionStyle]}>
                <ToastCard
                    text1={toast.message}
                    onPress={dismissToast}
                    tone={toastTone(toast.type)}
                    iconName={toastIcon(toast.type)}
                />
            </View>
        </View>
    );
};

export const ToastProvider: React.FC<ToastProviderProps> = ({ children = false }) => {
    const insets = useSafeAreaInsets();
    const [toast, setToast] = useState<ToastState | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toastIdRef = useRef(0);

    const clearTimers = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (mountRef.current) {
            clearTimeout(mountRef.current);
            mountRef.current = null;
        }
    };

    const showToast = (message: string, type: ToastType, position?: ToastPosition, timeout?: number) => {
        const trimmedMessage = message.trim();
        if (trimmedMessage.length === 0) {
            return;
        }

        clearTimers();
        const duration = timeout ?? (type === 'error' ? 10000 : type === 'info' ? 5000 : 2500);
        const nextToast: ToastState = {
            id: toastIdRef.current + 1,
            message: trimmedMessage,
            type,
            position: position ?? 'top',
        };
        toastIdRef.current = nextToast.id;

        setToast(null);
        mountRef.current = setTimeout(() => {
            setToast(nextToast);
            mountRef.current = null;
        }, 0);

        if (duration > 0) {
            timeoutRef.current = setTimeout(() => {
                setToast(currentToast => currentToast?.id === nextToast.id ? null : currentToast);
                timeoutRef.current = null;
            }, duration);
        }
    };

    const dismissToast = () => {
        clearTimers();
        setToast(null);
    };

    useEffect(() => clearTimers, []);

    const value: ToastContextType = {
        showToast,
        insets,
        toast,
        dismissToast,
    };

    return (
        <ToastContext.Provider value={value}>
            <View style={styles.root}>
                {children}
                <ToastViewport />
            </View>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
