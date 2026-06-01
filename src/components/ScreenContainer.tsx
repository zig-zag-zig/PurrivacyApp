import React from 'react';
import { ScrollView, View, ScrollViewProps, StyleSheet } from 'react-native';
import { commonStyles } from '../styles/commonStyles';
import { theme } from '../styles/theme';
import { requestPassphraseBannerDismiss } from '../services/passphraseBannerEvents';

interface ScreenContainerProps extends ScrollViewProps {
    children: React.ReactNode;
    safeArea?: boolean;
}

export const ScreenContainer = React.forwardRef<ScrollView, ScreenContainerProps>(
    ({
        children,
        style,
        contentContainerStyle,
        keyboardShouldPersistTaps,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        ...props
    }, ref) => {
        const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
        const touchMovedRef = React.useRef(false);

        return (
            <View style={commonStyles.container}>
                <View style={commonStyles.flex}>
                    <ScrollView
                        {...props}
                        ref={ref}
                        style={[commonStyles.flex, style]}
                        contentContainerStyle={[
                            commonStyles.p,
                            styles.content,
                            contentContainerStyle,
                        ]}
                        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
                        keyboardDismissMode={props.keyboardDismissMode ?? 'none'}
                        onTouchStart={(event) => {
                            touchMovedRef.current = false;
                            touchStartRef.current = {
                                x: event.nativeEvent.pageX,
                                y: event.nativeEvent.pageY,
                            };
                            onTouchStart?.(event);
                        }}
                        onTouchMove={(event) => {
                            const start = touchStartRef.current;
                            if (start) {
                                const deltaX = Math.abs(event.nativeEvent.pageX - start.x);
                                const deltaY = Math.abs(event.nativeEvent.pageY - start.y);
                                if (deltaX > 8 || deltaY > 8) {
                                    touchMovedRef.current = true;
                                }
                            }
                            onTouchMove?.(event);
                        }}
                        onTouchEnd={(event) => {
                            if (!touchMovedRef.current) {
                                requestPassphraseBannerDismiss();
                            }
                            touchStartRef.current = null;
                            touchMovedRef.current = false;
                            onTouchEnd?.(event);
                        }}
                    >
                        {children}
                    </ScrollView>
                </View>
            </View>
        );
    }
);

const styles = StyleSheet.create({
    content: {
        flexGrow: 1,
        gap: theme.spacing.md,
        paddingBottom: theme.spacing.xl,
    },
});
