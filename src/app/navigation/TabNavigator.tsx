import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import Icon from '@expo/vector-icons/MaterialIcons';
import { Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabParamList } from './types';
import { DecryptScreen } from '../../features/decrypt/pages/DecryptScreen';
import { EncryptScreen } from '../../features/encrypt/pages/EncryptScreen';
import { KeyScreen } from '../../features/keys/pages/KeyScreen';
import { SettingsScreen } from '../../features/settings/pages/SettingsScreen';
import { theme } from '../../styles/theme';

const Tab = createBottomTabNavigator<TabParamList>();
const TAB_BAR_HEIGHT = 48;
const TAB_BAR_ICON_SIZE = 28;
const TAB_BAR_ICON_OFFSET = 8;

export const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  return (
    <Tab.Navigator
      screenListeners={{
        tabPress: () => {
          Keyboard.dismiss();
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: 'rgba(255, 255, 255, 0.16)',
          borderTopWidth: 1,
          height: TAB_BAR_HEIGHT + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 0,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarShowLabel: false,
        tabBarIconStyle: {
          height: TAB_BAR_ICON_SIZE,
          marginTop: TAB_BAR_ICON_OFFSET,
          width: TAB_BAR_ICON_SIZE,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          paddingVertical: 0,
        },
      }}
    >
      <Tab.Screen
        name="Key"
        component={KeyScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Icon name="vpn-key" size={TAB_BAR_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Encrypt"
        component={EncryptScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Icon name="lock" size={TAB_BAR_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Decrypt"
        component={DecryptScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Icon name="lock-open" size={TAB_BAR_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Icon name="settings" size={TAB_BAR_ICON_SIZE} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};
