import React from 'react';
import { ScrollView, View, ScrollViewProps, StyleSheet } from 'react-native';
import { commonStyles } from '../styles/commonStyles';
import { theme } from '../styles/theme';

interface ScreenContainerProps extends ScrollViewProps {
    children: React.ReactNode;
    safeArea?: boolean;
}

export const ScreenContainer = React.forwardRef<ScrollView, ScreenContainerProps>(
    ({ children, style, contentContainerStyle, keyboardShouldPersistTaps, ...props }, ref) => {
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
                        keyboardDismissMode="on-drag"
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
