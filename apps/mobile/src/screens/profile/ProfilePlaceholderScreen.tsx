// Shared destination for the Profile settings rows that don't have a finalized
// design yet (Account details, Password, Notifications, Legal and privacy). Rather
// than invent an un-designed screen or leave a dead-end chevron, each opens this
// consistent, on-brand "not built yet" page with row-specific copy. Flagged for the
// owner (build brief §8): these four rows need designs — and, where they map to real
// backend routes (account details, password change per build brief §5), a build pass.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { colors, spacing, typography } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfilePlaceholder'>;

export function ProfilePlaceholderScreen({ navigation, route }: Props) {
  const { title, note } = route.params;
  return (
    <ScreenContainer>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />
      <View style={styles.body}>
        <Text style={styles.note}>{note}</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  note: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
