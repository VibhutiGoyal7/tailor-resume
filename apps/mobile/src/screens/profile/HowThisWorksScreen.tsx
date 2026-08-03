// "How this works", built to screens/tailor_screen_how_this_works.svg: a plain-language
// explainer of the tailoring pipeline. An illustrative match-score dial with a caption,
// then the three pipeline stages as numbered steps (read the JD → find best-fit
// experience → write it in their language), and a "Got it" that dismisses. Purely
// educational — no data fetching; the 92% is an example, matching the design.
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { MatchRing } from '../../components/MatchRing';
import { Button } from '../../components/ui/Button';
import { colors, spacing, typography } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'HowThisWorks'>;

const STEPS = [
  { title: 'We read the job description', body: "and figure out what it's really asking for" },
  { title: 'We find your best-fit experience', body: 'from everything in your bank — you confirm it' },
  { title: 'We write it in their language', body: 'every line traces back to something you wrote' },
];

export function HowThisWorksScreen({ navigation }: Props) {
  return (
    <ScreenContainer scroll>
      <ScreenHeader title="How this works" onBack={() => navigation.goBack()} />

      <View style={styles.dialWrap}>
        <MatchRing score={92} size={132} strokeWidth={7} fontSize={28} />
        <Text style={styles.caption}>
          Every resume gets a match score against the job you&apos;re applying for.
        </Text>
      </View>

      <View style={styles.steps}>
        {STEPS.map((step, i) => (
          <View key={step.title} style={styles.step}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNumber}>{i + 1}</Text>
            </View>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Button label="Got it" onPress={() => navigation.goBack()} style={styles.cta} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  dialWrap: { alignItems: 'center', marginTop: spacing.xl },
  caption: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },

  steps: { marginTop: spacing.xxl, gap: spacing.xl },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.badgeTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumber: { ...typography.caption, fontWeight: '600', color: colors.accent },
  stepText: { flex: 1, marginLeft: spacing.lg },
  stepTitle: { ...typography.bodyStrong, color: colors.ink },
  stepBody: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },

  cta: { marginTop: spacing.xxl, marginBottom: spacing.xl },
});
