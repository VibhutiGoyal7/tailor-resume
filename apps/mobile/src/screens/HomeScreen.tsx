// Home — the entry to the tailoring flow, built to screens/tailor_home_screen.svg.
// A time-of-day greeting + name, a dark denim "start tailoring" CTA card carrying
// the paper-airplane motif (§9b: "sending an application, tailoring in motion"),
// then the recent-history list ("Where you've sent yourself lately") with the
// design's slightly-rotated white cards, each carrying the compact match-score
// badge (§9b: the RAG pipeline's signature output). Empty history shows the
// dog-eared-page motif (§9b neutral empty state).
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import Svg, { Circle, Path } from 'react-native-svg';
import type { TailoredResumeSummary } from '@tailor/shared-types';
import { ScreenContainer } from '../components/ScreenContainer';
import { DogEaredPage } from '../components/brand/motifs/DogEaredPage';
import { listResumes } from '../api/resumes';
import { getResumeBasics } from '../api/bank';
import { relativeTime } from '../lib/time';
import { logger } from '../lib/logger';
import { colors, radii, spacing, typography } from '../theme/tokens';
import type { AppTabsParamList } from '../navigation/types';

type Props = BottomTabScreenProps<AppTabsParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const basics = useQuery({ queryKey: ['bank', 'basics'], queryFn: getResumeBasics });
  const resumes = useQuery({ queryKey: ['resumes'], queryFn: listResumes });

  const greeting = useMemo(() => greetingFor(new Date().getHours()), []);
  const firstName = basics.data?.fullName?.trim().split(/\s+/)[0] ?? 'there';

  const onStartTailoring = () => {
    // The tailoring flow (JD input → staged progress → result) lands in the next
    // screen group; wire this navigation when that stack exists.
    logger.info('home: start tailoring tapped');
  };

  const onOpenResume = (id: string) => {
    // Resume detail lands with the Resumes screen group.
    logger.info('home: open resume', { id });
  };

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.name}>{firstName}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => navigation.navigate('Profile')}
          hitSlop={8}
        >
          <ProfileChip />
        </Pressable>
      </View>

      <StartCard onPress={onStartTailoring} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Where you&apos;ve sent yourself lately</Text>
        <WavyFlourish />
      </View>

      <RecentHistory
        loading={resumes.isLoading}
        error={resumes.isError}
        data={resumes.data ?? []}
        onOpen={onOpenResume}
        onRetry={() => void resumes.refetch()}
      />
    </ScreenContainer>
  );
}

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// --- The dark denim CTA card, with the paper-airplane motif (design lines 27-35).
function StartCard({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.ctaCard}>
      <View style={styles.ctaPlane}>
        <CtaPlane />
      </View>
      <Text style={styles.ctaTitle}>Shape a resume for{'\n'}something new</Text>
      <Text style={styles.ctaSubtitle}>Paste a JD, we&apos;ll do the rest</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.ctaButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.ctaButtonLabel}>Start tailoring</Text>
      </Pressable>
    </View>
  );
}

// The airplane as drawn on the dark card: a mid-denim coin, a light accent dot,
// and a light-blue plane (design lines 28-30) — the inverse palette of the
// light-background PaperAirplane motif.
function CtaPlane() {
  return (
    <Svg width={56} height={56} viewBox="0 0 56 56">
      <Circle cx={28} cy={28} r={26} fill="#385A6B" />
      <Circle cx={17} cy={15} r={3} fill={colors.accentOnDark} />
      <Path d="M13,37 L47,21 L31,30 L38,51 Z" fill="#8FB4C6" />
    </Svg>
  );
}

function ProfileChip() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40">
      <Path
        d="M12,4 H30 Q36,4 36,10 V26 Q36,36 26,36 H10 Q4,36 4,30 V12 Q4,4 12,4 Z"
        fill={colors.ambientLight}
      />
      <Circle cx={20} cy={17} r={5} fill="none" stroke={colors.accentInactive} strokeWidth={1.8} />
      <Path
        d="M11,30 Q20,21 29,30"
        fill="none"
        stroke={colors.accentInactive}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function WavyFlourish() {
  return (
    <Svg width={28} height={10} viewBox="0 0 28 10" style={styles.flourish}>
      <Path
        d="M2,6 Q8,0 14,5 Q20,10 26,3"
        stroke={colors.iconMuted}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// --- Recent-history states (loading / error / empty / list) --------------------
function RecentHistory({
  loading,
  error,
  data,
  onOpen,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  data: TailoredResumeSummary[];
  onOpen: (id: string) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.stateBox}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.stateBox}>
        <Text style={styles.emptyTitle}>Couldn&apos;t load your history</Text>
        <Text style={styles.emptyBody}>Check your connection and try again.</Text>
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (data.length === 0) {
    return (
      <View style={styles.stateBox}>
        <DogEaredPage size={120} />
        <Text style={styles.emptyTitle}>Nothing here yet</Text>
        <Text style={styles.emptyBody}>Tailor your first resume and it&apos;ll show up here.</Text>
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {data.map((r, i) => (
        <RecentCard key={r.id} summary={r} index={i} onPress={() => onOpen(r.id)} />
      ))}
    </View>
  );
}

function RecentCard({
  summary,
  index,
  onPress,
}: {
  summary: TailoredResumeSummary;
  index: number;
  onPress: () => void;
}) {
  // Alternating slight rotation, as in the design (cards tilt ±~0.5°).
  const tilt = index % 2 === 0 ? '-0.5deg' : '0.6deg';
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
          {summary.companyType} · {relativeTime(summary.createdAt)}
        </Text>
      </View>
      {summary.matchScore !== null ? (
        <MatchBadge score={summary.matchScore} tiltRight={index % 2 === 0} />
      ) : null}
    </Pressable>
  );
}

// The compact match-score badge (design lines 46-49): a small badge-tint square
// with the app's asymmetric radii, tilted slightly, denim number centered. Only
// shown when a score exists (older resumes, generated before match scoring, have
// none).
function MatchBadge({ score, tiltRight }: { score: number; tiltRight: boolean }) {
  return (
    <View
      style={[
        styles.badge,
        tiltRight ? styles.badgeRadiusA : styles.badgeRadiusB,
        { transform: [{ rotate: tiltRight ? '4deg' : '-3deg' }] },
      ]}
    >
      <Text style={styles.badgeText}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  greeting: { ...typography.caption, color: colors.textSecondary },
  name: { ...typography.title, fontSize: 20, color: colors.ink, marginTop: spacing.xs },

  ctaCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    padding: spacing.lg,
    paddingVertical: spacing.xl,
    ...radii.card,
  },
  ctaPlane: { position: 'absolute', top: spacing.md, right: spacing.md },
  ctaTitle: { ...typography.heading, color: colors.fieldBg, fontSize: 18 },
  ctaSubtitle: { ...typography.caption, color: '#B9CBD3', marginTop: spacing.sm },
  ctaButton: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    backgroundColor: colors.fieldBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    ...radii.cardAlt,
  },
  ctaButtonLabel: { ...typography.bodyStrong, color: colors.accent, fontSize: 14 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.caption, fontWeight: '500', color: colors.textSecondary },
  flourish: { marginLeft: spacing.sm },

  list: { gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cardText: { flex: 1, marginRight: spacing.md },
  cardTitle: { ...typography.bodyStrong, color: colors.ink },
  cardMeta: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },

  badge: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badgeTint,
  },
  // Small-scale asymmetric radii (the app's shape language, scaled for a 40px chip).
  badgeRadiusA: {
    borderTopLeftRadius: 13,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 13,
    borderBottomLeftRadius: 5,
  },
  badgeRadiusB: {
    borderTopLeftRadius: 5,
    borderTopRightRadius: 13,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 13,
  },
  badgeText: { ...typography.bodyStrong, color: colors.accent, fontSize: 15 },

  stateBox: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  emptyTitle: { ...typography.bodyStrong, color: colors.ink, marginTop: spacing.sm },
  emptyBody: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  retry: { ...typography.bodyStrong, color: colors.accent, marginTop: spacing.sm },

  pressed: { opacity: 0.85 },
});
