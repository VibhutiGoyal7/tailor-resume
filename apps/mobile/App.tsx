// App root: provider stack + the auth-gated navigator. Providers, outermost first:
//  SafeAreaProvider    — safe-area insets for ScreenContainer
//  QueryClientProvider — TanStack Query (server state / polling)
//  AuthProvider        — session + secure-store tokens + API client auth bridge
// then RootNavigator swaps between the auth stack and the tab bar on auth status.
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { queryClient } from './src/lib/queryClient';
import { logger } from './src/lib/logger';

logger.info('app launched');

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
