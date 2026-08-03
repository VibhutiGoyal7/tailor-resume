// "Your resume is ready" (screens/tailor_screen_export.svg): the paper-airplane
// motif (§9b "sending an application"), a format picker (PDF recommended / Word),
// and download/share. Downloading streams the rendered file from
// GET /resumes/:id/export?format= straight to a cache file (expo-file-system, with
// the bearer header) and hands it to the OS share sheet (expo-sharing) — which on
// iOS is also how you save to Files. "Share instead" is the same handoff.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EXPORT_CONTENT_TYPES, type ExportFormat } from '@tailor/shared-types';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { PaperAirplane } from '../../components/brand/motifs/PaperAirplane';
import { exportHeaders, exportUrl, getResume } from '../../api/tailoring';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Export'>;

const FORMAT_LABEL: Record<ExportFormat, string> = { pdf: 'PDF', docx: 'Word (.docx)' };
const UTI: Record<ExportFormat, string> = { pdf: 'com.adobe.pdf', docx: 'org.openxmlformats.wordprocessingml.document' };

export function ExportScreen({ navigation, route }: Props) {
  const { resumeId } = route.params;
  const resume = useQuery({ queryKey: ['resume', resumeId], queryFn: () => getResume(resumeId) });
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  const download = useMutation({
    mutationFn: async () => {
      const target = `${FileSystem.cacheDirectory}resume.${format}`;
      const res = await FileSystem.downloadAsync(exportUrl(resumeId, format), target, {
        headers: exportHeaders(),
      });
      if (res.status !== 200) {
        throw new Error(`export download failed (${res.status})`);
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, {
          mimeType: EXPORT_CONTENT_TYPES[format],
          UTI: UTI[format],
          dialogTitle: 'Your tailored resume',
        });
      }
      return res.uri;
    },
    onSuccess: (uri) => logger.info('resume exported', { resumeId, format, uri }),
    onError: (err) => {
      logger.warn('resume export failed', { resumeId, format });
      setDialog(
        errorToCopy(err).title === 'Something went wrong'
          ? { title: "Couldn't export", message: 'We could not prepare that file. Please try again.' }
          : errorToCopy(err),
      );
    },
  });

  const available = resume.data?.availableFormats ?? ['pdf', 'docx'];

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="" onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <PaperAirplane size={140} />
        <Text style={styles.title}>Your resume is ready</Text>
        <Text style={styles.subtitle}>Choose a format to export.</Text>
      </View>

      <FormatOption
        label={FORMAT_LABEL.pdf}
        badge="Recommended"
        selected={format === 'pdf'}
        disabled={!available.includes('pdf')}
        onPress={() => setFormat('pdf')}
      />
      <FormatOption
        label={FORMAT_LABEL.docx}
        selected={format === 'docx'}
        disabled={!available.includes('docx')}
        onPress={() => setFormat('docx')}
      />

      <Button
        label={download.isPending ? 'Preparing…' : `Download ${format === 'pdf' ? 'PDF' : 'Word'}`}
        onPress={() => download.mutate()}
        loading={download.isPending}
        disabled={download.isPending}
        style={styles.cta}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => download.mutate()}
        disabled={download.isPending}
        style={styles.shareBtn}
      >
        <Text style={styles.shareText}>Share instead</Text>
      </Pressable>

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

function FormatOption({
  label,
  badge,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  badge?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.option,
        selected ? styles.optionSelected : null,
        disabled ? styles.optionDisabled : null,
      ]}
    >
      <Text style={[styles.optionLabel, selected ? styles.optionLabelSelected : null]}>{label}</Text>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.xl },
  title: { ...typography.title, color: colors.ink, marginTop: spacing.lg },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.fieldBg,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
    ...radii.card,
  },
  optionSelected: { borderColor: colors.accent },
  optionDisabled: { opacity: 0.4 },
  optionLabel: { ...typography.body, color: colors.ink },
  optionLabelSelected: { fontWeight: '600' },
  badge: { ...typography.caption, color: colors.textSecondary },

  cta: { marginTop: spacing.lg },
  shareBtn: { alignSelf: 'center', paddingVertical: spacing.lg },
  shareText: { ...typography.bodyStrong, color: colors.accent },
});
