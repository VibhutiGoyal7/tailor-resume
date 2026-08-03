// The logged-in navigation tree: a root native stack whose base screen is the tab
// bar, with the tailoring flow pushed over it (JD input → staged progress →
// retrieval checkpoint → result → customize → export). Keeping the flow at the root
// (rather than inside a tab) lets each screen present full-screen over the whole app
// and be entered from Home. Every screen owns its own header + ambient background,
// so the stack header stays hidden (per the finalized designs).
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppTabs } from './AppTabs';
import { JDInputScreen } from '../screens/tailor/JDInputScreen';
import { StagedProgressScreen } from '../screens/tailor/StagedProgressScreen';
import { RetrievalCheckpointScreen } from '../screens/tailor/RetrievalCheckpointScreen';
import { ResultScreen } from '../screens/tailor/ResultScreen';
import { LayoutCustomizeScreen } from '../screens/tailor/LayoutCustomizeScreen';
import { ExportScreen } from '../screens/tailor/ExportScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="Tabs" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={AppTabs} />
      <Stack.Screen name="JDInput" component={JDInputScreen} />
      {/* The progress screens shouldn't be swiped back to mid-pipeline. */}
      <Stack.Screen
        name="StagedProgress"
        component={StagedProgressScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="RetrievalCheckpoint" component={RetrievalCheckpointScreen} />
      <Stack.Screen name="Result" component={ResultScreen} />
      <Stack.Screen name="LayoutCustomize" component={LayoutCustomizeScreen} />
      <Stack.Screen name="Export" component={ExportScreen} />
    </Stack.Navigator>
  );
}
