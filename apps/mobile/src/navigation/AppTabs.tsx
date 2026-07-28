// The 4-tab bottom bar shown when logged in (Home, Bank, Resumes, Profile),
// matching the bottom nav in the designs. Each screen owns its own header/ambient
// background (per the finalized designs), so the navigator's header is hidden and
// the tab glyphs come from TabIcon (ported from screens/*.svg).
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { BankScreen } from '../screens/BankScreen';
import { ResumesScreen } from '../screens/ResumesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { colors, typography } from '../theme/tokens';
import { TabIcon } from './TabIcon';
import type { AppTabsParamList } from './types';

const Tab = createBottomTabNavigator<AppTabsParamList>();

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.iconMuted,
        tabBarLabelStyle: typography.micro,
        tabBarStyle: { backgroundColor: colors.fieldBg, borderTopColor: colors.cardBorder },
        tabBarIcon: ({ color }) => <TabIcon name={route.name} color={color} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Bank" component={BankScreen} options={{ tabBarLabel: 'Bank' }} />
      <Tab.Screen name="Resumes" component={ResumesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
