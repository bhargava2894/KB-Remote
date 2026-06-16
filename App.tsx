import './src/polyfills';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from './src/components/Toast';
import { SettingsProvider } from './src/context/SettingsContext';
import { PairingScreen } from './src/screens/PairingScreen';
import { RemoteScreen } from './src/screens/RemoteScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { colors } from './src/theme/colors';

export type RootStackParamList = {
  Remote: undefined;
  Settings: undefined;
  Pairing: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

const screenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTitleStyle: { color: colors.text },
  headerTintColor: colors.text,
  contentStyle: { backgroundColor: colors.background },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <ToastProvider>
          <StatusBar style="light" />
          <NavigationContainer theme={navTheme}>
            <Stack.Navigator screenOptions={screenOptions}>
              <Stack.Screen
                name="Remote"
                component={RemoteScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ title: 'Settings' }}
              />
              <Stack.Screen
                name="Pairing"
                component={PairingScreen}
                options={{ title: 'Pair with TV' }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </ToastProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
