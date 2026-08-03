// The staged-progress screens (screens/tailor_screen_staged_progress_retrieve.svg
// and _generate.svg): the animated building-blocks motif over a step checklist that
// fills in as the pipeline advances. One component serves both phases — `phase`
// picks the copy + step set, and it polls GET /resumes/jobs/:id (ADR-015) until the
// phase's target stage is reached, then moves the flow on:
//   retrieve → the retrieval checkpoint (ADR-017)
//   generate → the result screen (keyed on the resume the job produced)
// Reuses the staged-progress spirit of ADR-015 (the same pattern as the import flow).
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle, Path } from 'react-native-svg';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ErrorDialog } from '../../components/ErrorDialog';
import { BuildingBlocks } from '../../components/brand/motifs/BuildingBlocks';
import { getJobStatus } from '../../api/tailoring';
import {
  isPhaseComplete,
  stepStates,
  stepsForPhase,
  type StepState,
} from '../../lib/tailoring';
import { logger } from '../../lib/logger';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'StagedProgress'>;

const COPY = {
  retrieve: { title: 'Finding your match', subtitle: 'This usually takes under a minute.' },
  generate: { title: 'Writing your resume', subtitle: 'Almost there.' },
} as const;

const POLL_MS = 1200;

export function StagedProgressScreen({ navigation, route }: Props) {
  const { jobId, phase } = route.params;
  const [dialog, setDialog] = useState(false);

  const job = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJobStatus(jobId),
    // Poll until the phase is done or a stage has failed; then let it settle.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return POLL_MS;
      if (data.failedStage || isPhaseComplete(phase, data.stage)) return false;
      return POLL_MS;
    },
  });

  const stage = job.data?.stage;
  const failed = job.data?.failedStage ?? null;
  const resumeId = job.data?.resumeId ?? null;

  // Advance the flow once the phase's target stage is reached (in an effect, never
  // during render). `navigation.replace` so the progress screen isn't left on the
  // back stack.
  useEffect(() => {
    if (!stage || failed) return;
    if (!isPhaseComplete(phase, stage)) return;
    if (phase === 'retrieve') {
      navigation.replace('RetrievalCheckpoint', { jobId });
    } else if (resumeId) {
      navigation.replace('Result', { resumeId });
    }
  }, [stage, failed, phase, resumeId, jobId, navigation]);

  useEffect(() => {
    if (failed) {
      logger.warn('tailoring stage failed', { jobId, failedStage: failed });
      setDialog(true);
    }
  }, [failed, jobId]);

  const states = stage ? stepStates(phase, stage) : stepsForPhase(phase).map(() => 'pending');
  const steps = stepsForPhase(phase);

  return (
    <ScreenContainer>
      <View style={styles.head}>
        <Text style={styles.title}>{COPY[phase].title}</Text>
        <Text style={styles.subtitle}>{COPY[phase].subtitle}</Text>
      </View>

      <View style={styles.motif}>
        <BuildingBlocks size={200} />
      </View>

      <View style={styles.steps}>
        {steps.map((label, i) => (
          <View key={label} style={styles.stepRow}>
            <StepDot state={(states[i] as StepState) ?? 'pending'} />
            <Text
              style={[styles.stepLabel, states[i] === 'pending' ? styles.stepPending : null]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      <ErrorDialog
        error={
          dialog
            ? {
                title: 'This took a wrong turn',
                message:
                  "We hit a snag while building your resume. Your experience is safe — let's try that again.",
              }
            : null
        }
        onDismiss={() => {
          setDialog(false);
          navigation.replace('JDInput');
        }}
      />
    </ScreenContainer>
  );
}

// The step marker: a filled denim check when done, a spinner while active, a hollow
// ring while pending — matching the connector-dotted checklist in the designs.
function StepDot({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Circle cx={11} cy={11} r={10} fill={colors.accent} />
        <Path
          d="M6 11 L9.5 14.5 L16 7.5"
          fill="none"
          stroke={colors.background}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (state === 'active') {
    return (
      <View style={styles.activeDot}>
        <ActivityIndicator size="small" color={colors.background} />
      </View>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Circle cx={11} cy={11} r={9} fill="none" stroke={colors.iconMuted} strokeWidth={2} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.xxl },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },

  motif: { alignItems: 'center', marginTop: spacing.xxxl, marginBottom: spacing.xxxl },

  steps: { gap: spacing.xl, marginTop: spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  activeDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentOnDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { ...typography.body, color: colors.ink },
  stepPending: { color: colors.textSecondary },
});
