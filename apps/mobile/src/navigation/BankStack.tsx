// The Experience Bank tab is a stack: the grouped list, the add-entry choice,
// the manual type picker, the per-type form, and item detail. Headers are hidden
// (each screen owns its own header + ambient background, per the designs).
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BankListScreen } from '../screens/bank/BankListScreen';
import { AddEntryChoiceScreen } from '../screens/bank/AddEntryChoiceScreen';
import { ChooseTypeScreen } from '../screens/bank/ChooseTypeScreen';
import { ItemFormScreen } from '../screens/bank/ItemFormScreen';
import { WriteAboutItScreen } from '../screens/bank/WriteAboutItScreen';
import { BulletReviewScreen } from '../screens/bank/BulletReviewScreen';
import { ItemDetailScreen } from '../screens/bank/ItemDetailScreen';
import type { BankStackParamList } from './types';

const Stack = createNativeStackNavigator<BankStackParamList>();

export function BankStack() {
  return (
    <Stack.Navigator initialRouteName="BankList" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BankList" component={BankListScreen} />
      <Stack.Screen name="AddEntryChoice" component={AddEntryChoiceScreen} />
      <Stack.Screen name="ChooseType" component={ChooseTypeScreen} />
      <Stack.Screen name="ItemForm" component={ItemFormScreen} />
      <Stack.Screen name="WriteAboutIt" component={WriteAboutItScreen} />
      <Stack.Screen name="BulletReview" component={BulletReviewScreen} />
      <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
    </Stack.Navigator>
  );
}
