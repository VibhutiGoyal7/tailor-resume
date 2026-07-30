// Manual-add step 2: pick what kind of entry to add. Not a standalone screen in
// the design set (which jumps straight to per-type forms), but the manual path
// needs a type before the form — so this is a small connective screen in the same
// tilted-card visual language, one card per Experience Bank type.
import { Pressable, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ExperienceType } from '@tailor/shared-types';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { BankStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<BankStackParamList, 'ChooseType'>;

const TYPES: { type: ExperienceType; label: string; note: string }[] = [
  { type: 'role', label: 'Role', note: 'A job or position you held' },
  { type: 'project', label: 'Project', note: 'Something you built or shipped' },
  { type: 'education', label: 'Education', note: 'A degree, school, or program' },
  { type: 'skill', label: 'Skill', note: 'A tool, language, or ability' },
];

export function ChooseTypeScreen({ navigation }: Props) {
  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="What are you adding?"
        subtitle="Pick a type to fill in."
        onBack={() => navigation.goBack()}
      />
      {TYPES.map((t, i) => (
        <Pressable
          key={t.type}
          accessibilityRole="button"
          onPress={() => navigation.navigate('ItemForm', { type: t.type })}
          style={({ pressed }) => [
            styles.card,
            { transform: [{ rotate: i % 2 === 0 ? '-1deg' : '1deg' }] },
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.label}>{t.label}</Text>
          <Text style={styles.note}>{t.note}</Text>
        </Pressable>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...radii.card,
  },
  label: { ...typography.heading, color: colors.ink },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  pressed: { opacity: 0.85 },
});
