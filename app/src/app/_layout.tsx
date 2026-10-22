import { UpdateNotice } from '@/components/update-notice';
import { API_BASE } from '@/lib/api';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Network from 'expo-network';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Storage from '@/lib/storage';
import { initAlerts } from '@/lib/alerts';
import { useWidgetSync } from '@/widget/sync';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Render errors show expo-router's error screen with a retry instead of a blank app
export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();
initAlerts();

// A deep link straight to a pushed screen (fuelforecast://station/<id> from the widget) gets the tabs behind it,
// so Back goes to Today instead of closing the app
export const unstable_settings = { anchor: '(tabs)' };

const DAY = 24 * 60 * 60 * 1000;
// Keep yesterday's data on the device so the app opens instantly and works offline.
const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 2 * DAY, retry: 2 } } });
const persister = createAsyncStoragePersister({ storage: Storage, key: 'query-cache.v1' });

onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((s) => setOnline(s.isConnected !== false));
  return () => sub.remove();
});

export default function RootLayout() {
  const scheme = useColorScheme();
  useWidgetSync(queryClient);   // keeps the Android home-screen widget in step (no-op elsewhere)

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    const t = setTimeout(() => SplashScreen.hideAsync(), 2500);   // in case cache restore never settles
    return () => {
      sub.remove();
      clearTimeout(t);
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <PersistQueryClientProvider
      client={queryClient}
      // buster: bump to drop cached data a new app version can't use (0.3.0: stations need `id`)
      persistOptions={{ persister, maxAge: 2 * DAY, buster: 'schema-1-ids' }}
      onSuccess={() => SplashScreen.hideAsync()}>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="station/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="trends" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
        </Stack>
        <UpdateNotice releaseUrl={`${API_BASE}/app.json`} />
      </ThemeProvider>
    </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
