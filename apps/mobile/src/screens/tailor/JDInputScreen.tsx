// "New tailored resume" — the entry to the tailoring flow, built to
// screens/tailor_screen_jd_input.svg: back chevron with the paper-airplane motif
// top-right (§9b "tailoring in motion"), a large title + subtitle, a tall
// paste-the-JD box, and a "Find my match" CTA. Submitting starts the pipeline
// (POST /resumes) and hands the returned jobId to the retrieve staged-progress
// screen, which polls from there.
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { PaperAirplane } from '../../components/brand/motifs/PaperAirplane';
import { requestTailoredResume } from '../../api/tailoring';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'JDInput'>;

const PLACEHOLDER =
  "Senior Mobile Engineer\n\nWe're looking for someone with 5+ years building React Native apps at scale, strong ownership of CI/CD and release…";

// The backend caps jdText at 20000 chars (requestTailoredResumeSchema).
const MAX_JD = 20000;

export function JDInputScreen({ navigation }: Props) {
  const [jd, setJd] = useState('');
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);
  const trimmed = jd.trim();

  const start = useMutation({
    mutationFn: () => requestTailoredResume(trimmed),
    onSuccess: ({ jobId }) => {
      logger.info('tailoring started', { jobId });
      navigation.replace('StagedProgress', { jobId, phase: 'retrieve' });
    },
    onError: (err) => {
      logger.warn('tailoring start failed');
      setDialog(errorToCopy(err));
    },
  });

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="New tailored resume"
        subtitle="Paste the job description below — we'll figure out what it's really asking for."
        onBack={() => navigation.goBack()}
        right={<PaperAirplane size={60} />}
      />

      <TextInput
        style={styles.box}
        value={jd}
        onChangeText={setJd}
        placeholder={PLACEHOLDER}
        placeholderTextColor={colors.iconMuted}
        multiline
        textAlignVertical="top"
        maxLength={MAX_JD}
        accessibilityLabel="Job description"
      />

      <Button
        label="Find my match"
        onPress={() => start.mutate()}
        loading={start.isPending}
        disabled={trimmed.length === 0 || start.isPending}
        style={styles.cta}
      />
      {trimmed.length === 0 ? (
        <Text style={styles.hint}>Paste a job description to get started.</Text>
      ) : null}

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 320,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.fieldBg,
    padding: spacing.lg,
    ...typography.body,
    color: colors.ink,
    ...radii.card,
  },
  cta: { marginTop: spacing.xl },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
