import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Network from 'expo-network';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Storage from '@/lib/storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';

// Render errors show expo-router's error screen with a retry instead of a blank app
export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

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

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    const t = setTimeout(() => SplashScreen.hideAsync(), 2500);   // in case cache restore never settles
    return () => {
      sub.remove();
      clearTimeout(t);
    };
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 2 * DAY, buster: 'schema-1' }}
      onSuccess={() => SplashScreen.hideAsync()}>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <AppTabs />
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
