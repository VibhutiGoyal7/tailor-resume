// Root gate: while the session is loading show the splash; then show the tab bar
// (authenticated) or the auth stack (logged out). Swapping the tree on auth status
// is what makes login/logout navigate automatically — no imperative reset needed.
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { SplashScreen } from '../screens/SplashScreen';
import { AuthStack } from './AuthStack';
import { AppTabs } from './AppTabs';

export function RootNavigator() {
  const { status } = useAuth();
  if (status === 'loading') return <SplashScreen />;
  return (
    <NavigationContainer>
      {status === 'authenticated' ? <AppTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
