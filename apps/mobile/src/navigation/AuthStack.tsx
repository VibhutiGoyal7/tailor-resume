// Auth stack — shown while logged out. Lives outside the tab navigator (project
// doc §9: "an auth stack that exists outside the nav entirely"). The finalized
// design combines sign-up and log-in into one screen with a segmented toggle, so
// this stack has a single Auth route for now; Welcome / verify / reset screens are
// added as their slices land.
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthScreen } from '../screens/auth/AuthScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Auth" component={AuthScreen} />
    </Stack.Navigator>
  );
}
