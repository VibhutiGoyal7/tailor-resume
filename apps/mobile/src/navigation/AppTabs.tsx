// The 4-tab bottom bar shown when logged in (Home, Bank, Resumes, Profile).
// Tab glyphs are a simple token-colored dot for now; the SVG illustration motifs
// (paper airplane / sprout / dog-eared page) are a later visual pass.
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { BankScreen } from '../screens/BankScreen';
import { ResumesScreen } from '../screens/ResumesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { colors, typography } from '../theme/tokens';
import type { AppTabsParamList } from './types';

const Tab = createBottomTabNavigator<AppTabsParamList>();

/** Minimal tab glyph until the SVG motifs land — a filled dot in the tint color. */
function TabDot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.iconMuted,
        tabBarLabelStyle: typography.micro,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.cardBorder },
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { ...typography.heading, color: colors.ink },
        headerShadowVisible: false,
        tabBarIcon: ({ color }) => <TabDot color={color} />,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Bank" component={BankScreen} options={{ title: 'Experience Bank' }} />
      <Tab.Screen name="Resumes" component={ResumesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
