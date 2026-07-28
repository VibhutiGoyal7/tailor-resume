// Root gate: splash while the session loads; then the auth stack (logged out),
// the one-time first-run choice (logged in, ADR-016, before the tabs), or the
// tab bar. Swapping the tree on auth status is what makes login/logout navigate
// automatically — no imperative reset needed.
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { SplashScreen } from '../screens/SplashScreen';
import { FirstRunChoiceScreen } from '../screens/auth/FirstRunChoiceScreen';
import { AuthStack } from './AuthStack';
import { AppTabs } from './AppTabs';

export function RootNavigator() {
  const { status, firstRunComplete } = useAuth();
  if (status === 'loading') return <SplashScreen />;
  if (status !== 'authenticated') {
    return (
      <NavigationContainer>
        <AuthStack />
      </NavigationContainer>
    );
  }
  // First login on this device: the one-time bank-building choice, before the tabs.
  if (!firstRunComplete) return <FirstRunChoiceScreen />;
  return (
    <NavigationContainer>
      <AppTabs />
    </NavigationContainer>
  );
}
