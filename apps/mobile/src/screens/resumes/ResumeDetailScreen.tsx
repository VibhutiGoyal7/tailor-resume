// A tailored resume's detail, built to screens/tailor_screen_resume_detail.svg: the
// match-score ring, the target role + "company · tailored <when>", the tailored
// bullets grouped into EXPERIENCE / PROJECTS (derived from each bullet's real source
// trace — see lib/resume.groupResumeBullets), each card showing "from: <source>", and
// the actions — Edit layout / Export (the full-screen tailoring-flow screens on the
// root stack) and a destructive "Delete this resume". Reads GET /resumes/:id plus the
// bank (to resolve the per-bullet source labels, build brief §5).
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { MatchRing } from '../../components/MatchRing';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { getResume } from '../../api/tailoring';
import { getExperienceBank } from '../../api/bank';
import { deleteResume } from '../../api/resumes';
import { groupResumeBullets, indexBankItems } from '../../lib/resume';
import { relativeTime } from '../../lib/time';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { ResumesStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ResumesStackParamList, 'ResumeDetail'>;

export function ResumeDetailScreen({ navigation, route }: Props) {
  const { resumeId } = route.params;
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();

  const resume = useQuery({ queryKey: ['resume', resumeId], queryFn: () => getResume(resumeId) });
  const bank = useQuery({ queryKey: ['bank'], queryFn: getExperienceBank });

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  const groups = useMemo(() => {
    const bullets = resume.data?.renderedContent?.bullets ?? [];
    return groupResumeBullets(bullets, indexBankItems(bank.data));
  }, [resume.data, bank.data]);

  const remove = useMutation({
    mutationFn: () => deleteResume(resumeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['resumes'] });
      queryClient.removeQueries({ queryKey: ['resume', resumeId] });
      logger.info('resume deleted', { resumeId });
      navigation.goBack();
    },
    onError: (err) => setDialog(errorToCopy(err)),
  });

  if (resume.isLoading || !resume.data) {
    return (
      <ScreenContainer>
        <ScreenHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </ScreenContainer>
    );
  }

  const jd = resume.data.jdParsed;
  const subtitle = [jd?.company_type?.trim(), `tailored ${relativeTime(resume.data.createdAt)}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title={jd?.role_type || 'Tailored resume'}
        subtitle={subtitle}
        onBack={() => navigation.goBack()}
        right={<MatchRing score={resume.data.matchScore} size={48} strokeWidth={3} fontSize={13} />}
      />

      {groups.length === 0 ? (
        <Text style={styles.meta}>This resume has no content yet.</Text>
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.section}>
            <Text style={styles.sectionLabel}>{group.label}</Text>
            {group.bullets.map((b, i) => (
              <View key={i} style={styles.bulletCard}>
                <Text style={styles.bulletText}>{b.text}</Text>
                <View style={styles.sourceRow}>
                  <View style={styles.sourceDot} />
                  <Text style={styles.sourceText} numberOfLines={1}>
                    from: {b.source}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ))
      )}

      <View style={styles.actions}>
        <Button
          label="Edit layout"
          variant="secondary"
          onPress={() => rootNav.navigate('LayoutCustomize', { resumeId })}
          style={styles.action}
        />
        <Button
          label="Export"
          onPress={() => rootNav.navigate('Export', { resumeId })}
          style={styles.action}
        />
      </View>

      <View style={styles.deleteWrap}>
        {confirmingDelete ? (
          <>
            <Text style={styles.confirmText}>Delete this resume? This can&apos;t be undone.</Text>
            <View style={styles.actions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setConfirmingDelete(false)}
                style={styles.action}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => remove.mutate()}
                disabled={remove.isPending}
                style={({ pressed }) => [styles.deleteConfirm, pressed ? styles.pressed : null]}
              >
                {remove.isPending ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.deleteConfirmText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirmingDelete(true)}
            hitSlop={8}
            style={({ pressed }) => [styles.deleteLink, pressed ? styles.pressed : null]}
          >
            <Text style={styles.deleteText}>Delete this resume</Text>
          </Pressable>
        )}
      </View>

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  meta: { ...typography.body, color: colors.textSecondary, marginTop: spacing.lg },

  section: { marginTop: spacing.lg },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  bulletCard: {
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  bulletText: { ...typography.body, color: colors.ink },
  sourceRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  sourceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentOnDark, marginRight: spacing.sm },
  sourceText: { ...typography.micro, color: colors.accentOnDark, flex: 1 },

  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  action: { flex: 1 },

  deleteWrap: { marginTop: spacing.xl, marginBottom: spacing.xl, alignItems: 'center' },
  deleteLink: { paddingVertical: spacing.sm },
  deleteText: { ...typography.bodyStrong, color: colors.dangerText },
  confirmText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  deleteConfirm: {
    flex: 1,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmText: { ...typography.bodyStrong, color: colors.background },
  pressed: { opacity: 0.85 },
});
