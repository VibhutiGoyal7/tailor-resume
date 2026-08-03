// First-run choice — shown once after the first login (ADR-016, so "start from
// scratch" is no longer a dead end). screens/tailor_screen_first_run_choice.svg:
// the growing-sprout motif, a warm headline, and two slightly-tilted option cards
// (Upload an existing resume / Start from scratch). Choosing either marks first-run
// complete; RootNavigator then shows the tab bar.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { ScreenContainer } from '../../components/ScreenContainer';
import { GrowingSprout } from '../../components/brand/motifs/GrowingSprout';
import { useAuth } from '../../auth/AuthContext';
import { colors, radii, spacing, typography } from '../../theme/tokens';

function CoinIcon({ kind }: { kind: 'upload' | 'scratch' }) {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40">
      <Circle cx={20} cy={20} r={16} fill={colors.badgeTint} />
      {kind === 'upload' ? (
        <Path
          d="M15 24 L20 12 L25 24 M20 12 V28"
          stroke={colors.accent}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <Path
          d="M12 20 H28 M20 12 V28"
          stroke={colors.accent}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

function OptionCard({
  kind,
  title,
  subtitle,
  tilt,
  onPress,
}: {
  kind: 'upload' | 'scratch';
  title: string;
  subtitle: string;
  tilt: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { transform: [{ rotate: `${tilt}deg` }] },
        pressed ? styles.cardPressed : null,
      ]}
    >
      <CoinIcon kind={kind} />
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

export function FirstRunChoiceScreen() {
  const { completeFirstRun } = useAuth();
  return (
    <ScreenContainer center>
      <View style={styles.art}>
        <GrowingSprout size={150} />
      </View>
      <Text style={styles.headline}>Let's build your{'\n'}experience bank</Text>
      <Text style={styles.subtext}>
        Give us something to start with — you can always add more later.
      </Text>

      <View style={styles.cards}>
        <OptionCard
          kind="upload"
          title="Upload an existing resume"
          subtitle="We'll pull your experience from it"
          tilt={-1}
          onPress={() => completeFirstRun('upload')}
        />
        <OptionCard
          kind="scratch"
          title="Start from scratch"
          subtitle="We'll guide you through your first entry"
          tilt={1}
          onPress={() => completeFirstRun('scratch')}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', marginBottom: spacing.lg },
  headline: { ...typography.title, fontSize: 23, lineHeight: 29, color: colors.ink, textAlign: 'center' },
  subtext: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  cards: { alignSelf: 'stretch', marginTop: spacing.xxl, gap: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  cardPressed: { opacity: 0.9 },
  cardText: { marginLeft: spacing.lg, flex: 1 },
  cardTitle: { ...typography.bodyStrong, color: colors.ink },
  cardSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
