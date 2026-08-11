// The Profile tab is a stack: the settings list → the designed sub-screens (resume
// basics, how-this-works) and a shared placeholder for the rows still awaiting a
// design. Headers are hidden — each screen owns its own header + ambient background,
// per the finalized designs.
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileSettingsScreen } from '../screens/profile/ProfileSettingsScreen';
import { AccountDetailsScreen } from '../screens/profile/AccountDetailsScreen';
import { PasswordScreen } from '../screens/profile/PasswordScreen';
import { ResumeBasicsScreen } from '../screens/profile/ResumeBasicsScreen';
import { HowThisWorksScreen } from '../screens/profile/HowThisWorksScreen';
import { ProfilePlaceholderScreen } from '../screens/profile/ProfilePlaceholderScreen';
import type { ProfileStackParamList } from './types';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileStack() {
  return (
    <Stack.Navigator initialRouteName="ProfileSettings" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileSettings" component={ProfileSettingsScreen} />
      <Stack.Screen name="AccountDetails" component={AccountDetailsScreen} />
      <Stack.Screen name="Password" component={PasswordScreen} />
      <Stack.Screen name="ResumeBasics" component={ResumeBasicsScreen} />
      <Stack.Screen name="HowThisWorks" component={HowThisWorksScreen} />
      <Stack.Screen name="ProfilePlaceholder" component={ProfilePlaceholderScreen} />
    </Stack.Navigator>
  );
}
