import { focusManager, onlineManager, QueryCache, QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Network from 'expo-network';
import { ObserveRoot } from 'expo-observe';
import { DarkTheme, DefaultTheme, ErrorBoundary as RouterErrorBoundary, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Storage from '@/lib/storage';
import { initAlerts } from '@/lib/alerts';
import { configureAnalytics, reportError, track } from '@/lib/analytics';
import { HttpError, isNotFound } from '@/lib/api';
import { useWidgetSync } from '@/widget/sync';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Render errors show expo-router's error screen with a retry instead of a blank app, and are reported to EAS Observe
export function ErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => reportError(props.error), [props.error]);
  return <RouterErrorBoundary {...props} />;
}

configureAnalytics();   // before any screen mounts
SplashScreen.preventAutoHideAsync();
initAlerts();

// A deep link straight to a pushed screen (fuelforecast://station/<id> from the widget) gets the tabs behind it,
// so Back goes to Today instead of closing the app
export const unstable_settings = { anchor: '(tabs)' };

const DAY = 24 * 60 * 60 * 1000;
// Keep yesterday's data on the device so the app opens instantly and works offline.
const queryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: 2 * DAY, retry: 2 } },
  // After its retries, with nothing to show: which file, the HTTP status (0: no response) and whether the phone thought
  // it was online. A 404 (a station or track file that failed soft) is expected; a failed refetch still shows saved data.
  queryCache: new QueryCache({
    onError: (e, q) => !isNotFound(e) && q.state.data === undefined && track('data.fetch_failed', {
      query: String(q.queryKey[0]), status: e instanceof HttpError ? e.status : 0, online: onlineManager.isOnline(), message: e.message,
    }, 'warn'),
  }),
});
const persister = createAsyncStoragePersister({ storage: Storage, key: 'query-cache.v1' });

onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((s) => setOnline(s.isConnected !== false));
  return () => sub.remove();
});

function RootLayout() {
  const scheme = useColorScheme();
  useWidgetSync(queryClient);   // keeps the home-screen widget in step (no-op on web)

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
          <Stack.Screen name="savings" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="track" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
        </Stack>
      </ThemeProvider>
    </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

// Startup timings (cold launch, bundle load, first render) for EAS Observe
export default ObserveRoot.wrap(RootLayout);
