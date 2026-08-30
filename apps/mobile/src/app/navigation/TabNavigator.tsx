import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Keyboard, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabParamList } from './types';
import { DecryptScreen } from '../../features/decrypt/pages/DecryptScreen';
import { EncryptScreen } from '../../features/encrypt/pages/EncryptScreen';
import { KeyScreen } from '../../features/keys/pages/KeyScreen';
import { SettingsScreen } from '../../features/settings/pages/SettingsScreen';
import { theme } from '../../styles/theme';

const Tab = createBottomTabNavigator<TabParamList>();
const TAB_BAR_BASE_HEIGHT = 58;
const TAB_BAR_ICON_SIZE = 23;

const tabIcons: Record<keyof TabParamList, React.ComponentProps<typeof Icon>['name']> = {
  Key: 'key-chain-variant',
  Encrypt: 'lock-outline',
  Decrypt: 'lock-open-variant-outline',
  Settings: 'tune-variant',
};

export const TabNavigator = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenListeners={{
        tabPress: () => {
          Keyboard.dismiss();
        },
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          height: TAB_BAR_BASE_HEIGHT + insets.bottom,
          marginHorizontal: theme.spacing.sm,
          paddingHorizontal: theme.spacing.xs,
          paddingTop: 2,
          paddingBottom: insets.bottom,
          backgroundColor: theme.colors.surfaceElevated,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: theme.colors.dividerStrong,
          borderRadius: theme.borderRadius.xl,
          ...theme.elevation.high,
        },
        tabBarActiveTintColor: theme.colors.primaryStrong,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarIcon: ({ color, focused }) => (
          <View style={[styles.iconFrame, focused && styles.iconFrameActive]}>
            <Icon name={tabIcons[route.name]} size={TAB_BAR_ICON_SIZE} color={color} />
          </View>
        ),
      })}
    >
      <Tab.Screen
        name="Key"
        component={KeyScreen}
        options={{ tabBarButtonTestID: 'purrivacy.tab.key', title: 'Vault' }}
      />
      <Tab.Screen
        name="Encrypt"
        component={EncryptScreen}
        options={{ tabBarButtonTestID: 'purrivacy.tab.encrypt', title: 'Encrypt' }}
      />
      <Tab.Screen
        name="Decrypt"
        component={DecryptScreen}
        options={{ tabBarButtonTestID: 'purrivacy.tab.decrypt', title: 'Decrypt' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarButtonTestID: 'purrivacy.tab.settings', title: 'Settings' }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  item: {
    borderRadius: theme.borderRadius.lg,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    marginTop: -4,
    marginBottom: 3,
  },
  iconFrame: {
    width: 40,
    height: 25,
    borderRadius: theme.borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFrameActive: {
    backgroundColor: theme.colors.primaryMuted,
  },
});
