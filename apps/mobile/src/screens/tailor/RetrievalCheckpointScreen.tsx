// The ADR-017 retrieval checkpoint (screens/tailor_screen_retrieval_checkpoint.svg):
// "Here's what we found" — the bullets RAG retrieved from the Experience Bank,
// matched against the parsed role, each checked by default. The user unchecks
// anything that isn't a fit, then "Looks good, write my resume" confirms the kept
// subset (POST /resumes/jobs/:id/confirm) and kicks off the generate phase. This is
// the human-in-the-loop gate before generation runs.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle, Path } from 'react-native-svg';
import type { RetrievedCandidateView } from '@tailor/shared-types';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { confirmMatches, getJobStatus } from '../../api/tailoring';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RetrievalCheckpoint'>;

export function RetrievalCheckpointScreen({ navigation, route }: Props) {
  const { jobId } = route.params;
  const job = useQuery({ queryKey: ['job', jobId], queryFn: () => getJobStatus(jobId) });

  const candidates = useMemo<RetrievedCandidateView[]>(
    () => job.data?.retrievedCandidates ?? [],
    [job.data],
  );
  const role = job.data?.jdParsed?.role_type;

  // Kept-by-default: unchecking removes an id. Seeded once the candidates load.
  const [dropped, setDropped] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);
  const kept = candidates.filter((c) => !dropped[c.bulletId]);
  const uncheckedCount = candidates.length - kept.length;

  const confirm = useMutation({
    mutationFn: () =>
      confirmMatches(
        jobId,
        kept.map((c) => c.bulletId),
      ),
    onSuccess: () => {
      logger.info('retrieval checkpoint confirmed', { jobId, kept: kept.length });
      navigation.replace('StagedProgress', { jobId, phase: 'generate' });
    },
    onError: (err) => setDialog(errorToCopy(err)),
  });

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Here's what we found"
        subtitle={
          role
            ? `Matched against: ${role}\nUncheck anything that's not a fit.`
            : "Uncheck anything that's not a fit."
        }
        onBack={() => navigation.goBack()}
      />

      {job.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        candidates.map((c) => (
          <CandidateRow
            key={c.bulletId}
            text={c.text}
            kept={!dropped[c.bulletId]}
            onToggle={() =>
              setDropped((p) => ({ ...p, [c.bulletId]: !p[c.bulletId] }))
            }
          />
        ))
      )}

      {!job.isLoading ? (
        <Text style={styles.counter}>
          {kept.length} selected{uncheckedCount > 0 ? `, ${uncheckedCount} unchecked` : ''}
        </Text>
      ) : null}

      <Button
        label="Looks good, write my resume"
        onPress={() => confirm.mutate()}
        loading={confirm.isPending}
        disabled={confirm.isPending || kept.length === 0}
        style={styles.cta}
      />
      {kept.length === 0 && !job.isLoading ? (
        <Text style={styles.hint}>Keep at least one so we have something to work with.</Text>
      ) : null}

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

function CandidateRow({
  text,
  kept,
  onToggle,
}: {
  text: string;
  kept: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: kept }}
      onPress={onToggle}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.cardText, kept ? null : styles.cardTextDropped]}>{text}</Text>
      <Checkbox checked={kept} />
    </Pressable>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26">
      <Circle
        cx={13}
        cy={13}
        r={12}
        fill={checked ? colors.accent : 'none'}
        stroke={checked ? colors.accent : colors.iconMuted}
        strokeWidth={2}
      />
      {checked ? (
        <Path
          d="M7 13.5 L11 17.5 L19 8.5"
          fill="none"
          stroke={colors.background}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
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
  cardText: { ...typography.body, color: colors.ink, flex: 1, marginRight: spacing.md },
  cardTextDropped: { color: colors.iconMuted, textDecorationLine: 'line-through' },
  counter: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  cta: { marginTop: spacing.sm },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  pressed: { opacity: 0.9 },
});
