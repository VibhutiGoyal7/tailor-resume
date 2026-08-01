// "Add to your bank" — how do you want to add it? Built to
// screens/tailor_screen_add_entry_choice.svg: three tilted option cards (add
// manually / write about it / import from resume) each with a badge-tint icon.
//
// "Add manually" (structured form) and "Write about it" (LLM extraction from
// freeform text) are both wired. "Import from resume" needs file upload +
// PDF/DOCX parsing, which isn't built yet, so it's shown (part of the finalized
// design) but marked "Coming soon" rather than leading to a dead end.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { BankStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<BankStackParamList, 'AddEntryChoice'>;

export function AddEntryChoiceScreen({ navigation }: Props) {
  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Add to your bank"
        subtitle="How do you want to add it?"
        onBack={() => navigation.goBack()}
      />

      <OptionCard
        icon={<PlusIcon />}
        title="Add manually"
        note="Fill in a structured form yourself"
        tilt="-1deg"
        onPress={() => navigation.navigate('ChooseType')}
      />
      <OptionCard
        icon={<LinesIcon />}
        title="Write about it"
        note="Describe it in your own words"
        tilt="1deg"
        onPress={() => navigation.navigate('WriteAboutIt')}
      />
      <OptionCard
        icon={<UploadIcon />}
        title="Import from resume"
        note="Upload a resume, we'll extract it"
        tilt="-1deg"
        comingSoon
      />
    </ScreenContainer>
  );
}

function OptionCard({
  icon,
  title,
  note,
  tilt,
  onPress,
  comingSoon = false,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  tilt: string;
  onPress?: () => void;
  comingSoon?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={comingSoon}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { transform: [{ rotate: tilt }] },
        comingSoon ? styles.cardDisabled : null,
        pressed && !comingSoon ? styles.pressed : null,
      ]}
    >
      <View style={styles.iconCircle}>{icon}</View>
      <View style={styles.cardText}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {comingSoon ? <Text style={styles.soon}>Coming soon</Text> : null}
        </View>
        <Text style={styles.cardNote}>{note}</Text>
      </View>
    </Pressable>
  );
}

const ICON = { stroke: colors.accent, strokeWidth: 2.2 };
function PlusIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M12 6 V18 M6 12 H18" {...ICON} strokeLinecap="round" />
    </Svg>
  );
}
function LinesIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M6 8 H18 M6 12 H18 M6 16 H14" {...ICON} strokeLinecap="round" />
    </Svg>
  );
}
function UploadIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M12 5 V17 M7 10 L12 5 L17 10" fill="none" {...ICON} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...radii.card,
  },
  cardDisabled: { opacity: 0.55 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.badgeTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  cardText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...typography.heading, color: colors.ink },
  soon: {
    ...typography.micro,
    color: colors.accent,
    backgroundColor: colors.badgeTint,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  cardNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  pressed: { opacity: 0.85 },
});
