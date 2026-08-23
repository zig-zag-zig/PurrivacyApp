import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CustomText } from './CustomText';
import { commonStyles } from '../styles/commonStyles';
import { theme } from '../styles/theme';

type IconName = React.ComponentProps<typeof Icon>['name'];

type AppScreenHeaderProps = {
    eyebrow?: string;
    icon?: IconName;
    subtitle?: string;
    title: string;
};

export const AppScreenHeader = ({
    eyebrow,
    icon = 'shield-lock-outline',
    subtitle,
    title,
}: AppScreenHeaderProps) => (
    <View style={styles.header}>
        <View style={styles.iconFrame}>
            <Icon name={icon} size={25} color={theme.colors.primaryStrong} />
        </View>
        <View style={styles.copy}>
            {eyebrow ? (
                <CustomText style={styles.eyebrow}>{eyebrow}</CustomText>
            ) : null}
            <CustomText style={styles.title}>{title}</CustomText>
            {subtitle ? (
                <CustomText style={styles.subtitle}>{subtitle}</CustomText>
            ) : null}
        </View>
    </View>
);

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.sm,
    },
    iconFrame: {
        width: 50,
        height: 50,
        borderRadius: theme.borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primaryMuted,
        borderWidth: 1,
        borderColor: `${theme.colors.primary}66`,
    },
    copy: {
        ...commonStyles.flex,
        minWidth: 0,
        paddingTop: theme.spacing.xxs,
    },
    eyebrow: {
        color: theme.colors.secondary,
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '800',
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    title: {
        ...commonStyles.textTitle,
        fontSize: 25,
        lineHeight: 31,
    },
    subtitle: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        marginTop: theme.spacing.xs,
    },
});
