// The Resumes tab is a stack: the tailoring history list → a resume's detail.
// Headers are hidden (each screen owns its own header + ambient background, per the
// designs). Edit-layout and export from the detail push the full-screen tailoring-
// flow screens on the root stack, above the tabs.
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ResumesListScreen } from '../screens/resumes/ResumesListScreen';
import { ResumeDetailScreen } from '../screens/resumes/ResumeDetailScreen';
import type { ResumesStackParamList } from './types';

const Stack = createNativeStackNavigator<ResumesStackParamList>();

export function ResumesStack() {
  return (
    <Stack.Navigator initialRouteName="ResumesList" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ResumesList" component={ResumesListScreen} />
      <Stack.Screen name="ResumeDetail" component={ResumeDetailScreen} />
    </Stack.Navigator>
  );
}
