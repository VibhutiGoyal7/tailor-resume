// The Resumes tab — the tailoring history, built to screens/tailor_screen_resumes_list.svg:
// a "Resumes" title with a denim "+" (start a new tailoring), the history as slightly-
// tilted white cards (role title, "company · template", relative time, and the compact
// match-score ring), and a floating "+" — both "+"s open the JD-input flow on the root
// stack. Empty history shows the dog-eared-page motif (§9b neutral empty state). Tapping
// a card opens its detail.
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import type { TailoredResumeSummary } from '@tailor/shared-types';
import { AmbientBackground } from '../../components/brand/AmbientBackground';
import { DogEaredPage } from '../../components/brand/motifs/DogEaredPage';
import { MatchRing } from '../../components/MatchRing';
import { Button } from '../../components/ui/Button';
import { listResumes } from '../../api/resumes';
import { resumeListSubtitle } from '../../lib/resume';
import { relativeTime } from '../../lib/time';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { ResumesStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ResumesStackParamList, 'ResumesList'>;

export function ResumesListScreen({ navigation }: Props) {
  // The tailoring flow lives on the root stack (above the tabs); reach it via the
  // parent navigator, as Home does.
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const resumes = useQuery({ queryKey: ['resumes'], queryFn: listResumes });

  const startTailoring = () => {
    logger.info('resumes: start tailoring tapped');
    rootNav.navigate('JDInput');
  };

  const openResume = (id: string) => {
    logger.info('resumes: open resume', { id });
    navigation.navigate('ResumeDetail', { resumeId: id });
  };

  const data = resumes.data ?? [];
  const isEmpty = !resumes.isLoading && !resumes.isError && data.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AmbientBackground />

      <View style={styles.headerRow}>
        <Text style={styles.title}>Resumes</Text>
        <PlusButton size={36} onPress={startTailoring} />
      </View>

      {resumes.isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : resumes.isError ? (
        <View style={styles.stateBox}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load your resumes</Text>
          <Text style={styles.emptyBody}>Check your connection and try again.</Text>
          <Pressable onPress={() => void resumes.refetch()} hitSlop={8}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : isEmpty ? (
        <View style={styles.emptyWrap}>
          <DogEaredPage size={124} />
          <Text style={styles.emptyTitle}>No resumes yet</Text>
          <Text style={styles.emptyBody}>
            Tailor your first resume from a job description — it&apos;ll show up here.
          </Text>
          <Button label="Start tailoring" onPress={startTailoring} style={styles.emptyCta} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {data.map((r, i) => (
            <ResumeCard key={r.id} summary={r} index={i} onPress={() => openResume(r.id)} />
          ))}
        </ScrollView>
      )}

      {!isEmpty && !resumes.isLoading ? (
        <View style={styles.fab}>
          <PlusButton size={56} onPress={startTailoring} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ResumeCard({
  summary,
  index,
  onPress,
}: {
  summary: TailoredResumeSummary;
  index: number;
  onPress: () => void;
}) {
  // Alternating slight rotation, as in the design (cards tilt ∓~1°).
  const tilt = index % 2 === 0 ? '-1deg' : '1deg';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        index % 2 === 0 ? radii.card : radii.cardAlt,
        { transform: [{ rotate: tilt }] },
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.cardText}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {summary.roleType}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {resumeListSubtitle(summary)}
        </Text>
        <Text style={styles.cardTime}>{relativeTime(summary.createdAt)}</Text>
      </View>
      <MatchRing score={summary.matchScore} size={44} strokeWidth={3} fontSize={12} />
    </Pressable>
  );
}

/** The denim "+" circle used in the header and as the FAB (starts a new tailoring). */
function PlusButton({ size, onPress }: { size: number; onPress: () => void }) {
  const r = size / 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Start a new tailored resume"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: r, backgroundColor: colors.accent },
        styles.plus,
        pressed ? styles.pressed : null,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 7 V17 M7 12 H17" stroke={colors.background} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.ink },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxxl * 2, gap: spacing.md },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  cardText: { flex: 1, marginRight: spacing.md },
  cardTitle: { ...typography.bodyStrong, color: colors.ink },
  cardMeta: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  cardTime: { ...typography.micro, color: colors.iconMuted, marginTop: spacing.xs },

  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyCta: { marginTop: spacing.lg, alignSelf: 'stretch' },
  emptyTitle: { ...typography.heading, color: colors.ink, marginTop: spacing.sm },
  emptyBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retry: { ...typography.bodyStrong, color: colors.accent, marginTop: spacing.sm },

  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xxl },
  plus: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});
