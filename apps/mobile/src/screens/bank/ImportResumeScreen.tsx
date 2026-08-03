// "Import from resume", built to screens/tailor_screen_import_resume.svg: a
// dashed upload dropzone, then a three-step staged progress (Reading → Extracting
// → Ready) while the file uploads and Claude pulls out every experience
// (POST /bank/import). On success we go to the multi-item review. The upload is a
// single request; the steps advance on a short timer so the wait reads as staged
// (the same staged-progress spirit as ADR-015).
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle, Path } from 'react-native-svg';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ErrorDialog } from '../../components/ErrorDialog';
import { importResume, type UploadFile } from '../../api/bank';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { BankStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<BankStackParamList, 'ImportResume'>;

const STEPS = ['Reading the document', 'Extracting your experience', 'Ready for your review'];
const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export function ImportResumeScreen({ navigation }: Props) {
  const [stage, setStage] = useState(-1); // -1 = idle dropzone; 0..2 = staged progress
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upload = useMutation({
    mutationFn: (file: UploadFile) => importResume(file),
    onSuccess: async (items) => {
      if (timer.current) clearTimeout(timer.current);
      setStage(2);
      await queryClient.invalidateQueries({ queryKey: ['bank'] });
      logger.info('resume imported', { items: items.length });
      const itemIds = items.map((i) => i.id);
      if (itemIds.length === 0) {
        setDialog({
          title: 'Nothing to import',
          message: "We couldn't find any experience in that file. Try a different resume.",
        });
        setStage(-1);
        return;
      }
      navigation.replace('ImportReview', { itemIds });
    },
    onError: (err) => {
      if (timer.current) clearTimeout(timer.current);
      setStage(-1);
      logger.warn('resume import failed');
      setDialog(errorToCopy(err));
    },
  });

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ACCEPTED_TYPES,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setStage(0);
    // Advance to "Extracting" shortly after so the wait reads as staged.
    timer.current = setTimeout(() => setStage((s) => (s === 0 ? 1 : s)), 900);
    upload.mutate({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
  };

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Import from resume"
        subtitle="Upload a PDF or DOCX, we'll do the rest."
        onBack={() => navigation.goBack()}
      />

      {stage < 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={pickFile}
          style={({ pressed }) => [styles.dropzone, pressed ? styles.pressed : null]}
        >
          <View style={styles.uploadCoin}>
            <Svg width={30} height={30} viewBox="0 0 24 24">
              <Path
                d="M12 5 V17 M7 10 L12 5 L17 10"
                fill="none"
                stroke={colors.accent}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
          <Text style={styles.dropTitle}>Tap to choose a file</Text>
          <Text style={styles.dropHint}>PDF or DOCX, up to 5MB</Text>
        </Pressable>
      ) : (
        <View style={styles.progress}>
          <Text style={styles.progressTitle}>Processing your resume</Text>
          {STEPS.map((label, i) => (
            <View key={label} style={styles.stepRow}>
              <StepDot state={i < stage ? 'done' : i === stage ? 'active' : 'pending'} />
              <Text style={[styles.stepLabel, i <= stage ? styles.stepLabelActive : null]}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      )}

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

function StepDot({ state }: { state: 'done' | 'active' | 'pending' }) {
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
  dropzone: {
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.iconMuted,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    backgroundColor: colors.fieldBg,
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  uploadCoin: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.badgeTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  dropTitle: { ...typography.body, color: colors.ink },
  dropHint: { ...typography.caption, color: colors.textSecondary },

  progress: { marginTop: spacing.lg },
  progressTitle: { ...typography.bodyStrong, color: colors.ink, marginBottom: spacing.lg },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  activeDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentOnDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { ...typography.body, color: colors.textSecondary },
  stepLabelActive: { color: colors.ink },

  pressed: { opacity: 0.85 },
});
