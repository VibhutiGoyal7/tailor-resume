// The result screen (screens/tailor_screen_result_template.svg): the RAG pipeline's
// payoff. A match-score dial (the signature output, §9b), a template picker (Clean /
// Modern / Compact), a live-ish preview of the rendered resume, and "Customize
// layout" to fine-tune before export. Reads GET /resumes/:id; picking a template
// PATCHes the layout (template override) and re-renders. Also the destination when
// opening a resume from Home history.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle } from 'react-native-svg';
import type { TailoredResumeView, TemplateId } from '@tailor/shared-types';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { getResume, updateResumeLayout } from '../../api/tailoring';
import { getResumeBasics } from '../../api/bank';
import { matchLabel } from '../../lib/tailoring';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

// The three templates as the picker shows them (short labels, in display order).
const TEMPLATE_CHOICES: { id: TemplateId; label: string }[] = [
  { id: 'ats', label: 'Clean' },
  { id: 'modern', label: 'Modern' },
  { id: 'compact', label: 'Compact' },
];

export function ResultScreen({ navigation, route }: Props) {
  const { resumeId } = route.params;
  const queryClient = useQueryClient();

  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  const resume = useQuery({ queryKey: ['resume', resumeId], queryFn: () => getResume(resumeId) });
  const basics = useQuery({ queryKey: ['bank', 'basics'], queryFn: getResumeBasics });

  const setTemplate = useMutation({
    mutationFn: (templateId: TemplateId) => updateResumeLayout(resumeId, { templateId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['resume', resumeId], updated);
      logger.info('result: template switched', { resumeId, templateId: updated.templateId });
    },
    onError: (err) => setDialog(errorToCopy(err)),
  });

  const role = resume.data?.jdParsed?.role_type;

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="" onBack={() => navigation.goBack()} />

      {resume.isLoading || !resume.data ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <>
          <View style={styles.dialWrap}>
            <MatchDial score={resume.data.matchScore} />
            <Text style={styles.matchLabel}>{matchLabel(resume.data.matchScore)}</Text>
            {role ? <Text style={styles.role}>{role}</Text> : null}
          </View>

          <Text style={styles.sectionLabel}>TEMPLATE</Text>
          <View style={styles.templates}>
            {TEMPLATE_CHOICES.map((t) => (
              <TemplateCard
                key={t.id}
                label={t.label}
                selected={resume.data!.templateId === t.id}
                busy={setTemplate.isPending && setTemplate.variables === t.id}
                onPress={() => {
                  if (resume.data!.templateId !== t.id) setTemplate.mutate(t.id);
                }}
              />
            ))}
          </View>

          <ResumePreview resume={resume.data} name={basics.data?.fullName ?? ''} contact={contactLine(basics.data)} />

          <Button
            label="Customize layout"
            onPress={() => navigation.navigate('LayoutCustomize', { resumeId })}
            style={styles.cta}
          />
        </>
      )}

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

/** Build the preview contact line from whatever real basics the user has filled in. */
function contactLine(basics: { location: string | null; phone: string | null; links?: { linkedin?: string; github?: string; portfolio?: string } } | null | undefined): string {
  if (!basics) return '';
  const link = basics.links?.linkedin || basics.links?.github || basics.links?.portfolio;
  return [basics.location, basics.phone, link].filter(Boolean).join('  ·  ');
}

// The match-score dial: a denim arc over a badge-tint track, the percentage centered.
// A null score (resumes generated before scoring) shows a neutral full track + dash.
function MatchDial({ score }: { score: number | null }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <View style={styles.dial}>
      <Svg width={130} height={130} viewBox="0 0 130 130">
        <Circle cx={65} cy={65} r={R} fill="none" stroke={colors.badgeTint} strokeWidth={10} />
        {score !== null ? (
          <Circle
            cx={65}
            cy={65}
            r={R}
            fill="none"
            stroke={colors.accent}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${C * pct} ${C}`}
            transform="rotate(-90 65 65)"
          />
        ) : null}
      </Svg>
      <View style={styles.dialCenter}>
        <Text style={styles.dialPct}>{score === null ? '—' : `${score}%`}</Text>
      </View>
    </View>
  );
}

function TemplateCard({
  label,
  selected,
  busy,
  onPress,
}: {
  label: string;
  selected: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={styles.templateCol}>
      <View style={[styles.templateCard, selected ? styles.templateCardSelected : null]}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <>
            <View style={styles.skelLineWide} />
            <View style={styles.skelLine} />
            <View style={styles.skelLine} />
          </>
        )}
      </View>
      <Text style={[styles.templateLabel, selected ? styles.templateLabelSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function ResumePreview({
  resume,
  name,
  contact,
}: {
  resume: TailoredResumeView;
  name: string;
  contact: string;
}) {
  const content = resume.renderedContent;
  const bullets = useMemo(() => content?.bullets.slice(0, 4) ?? [], [content]);
  return (
    <View style={styles.preview}>
      <Text style={styles.previewName}>{name || 'Your name'}</Text>
      {contact ? <Text style={styles.previewContact}>{contact}</Text> : null}
      <View style={styles.previewRule} />
      {content?.summary ? <Text style={styles.previewSummary}>{content.summary}</Text> : null}
      <Text style={styles.previewHeading}>EXPERIENCE</Text>
      {bullets.length > 0 ? (
        bullets.map((b, i) => (
          <View key={i} style={styles.previewBulletRow}>
            <View style={styles.previewDot} />
            <Text style={styles.previewBullet} numberOfLines={2}>
              {b.text}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.previewBullet}>Your tailored bullets will appear here.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },

  dialWrap: { alignItems: 'center', marginTop: spacing.sm },
  dial: { width: 130, height: 130, alignItems: 'center', justifyContent: 'center' },
  dialCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  dialPct: { ...typography.title, color: colors.accent, fontSize: 26 },
  matchLabel: { ...typography.heading, color: colors.ink, marginTop: spacing.sm },
  role: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },

  sectionLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    letterSpacing: 1,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  templates: { flexDirection: 'row', gap: spacing.md },
  templateCol: { flex: 1, alignItems: 'center' },
  templateCard: {
    width: '100%',
    height: 84,
    backgroundColor: colors.fieldBg,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: spacing.md,
    justifyContent: 'center',
    gap: 6,
  },
  templateCardSelected: { borderColor: colors.accent },
  skelLineWide: { height: 6, borderRadius: 3, backgroundColor: colors.accentOnDark, width: '70%' },
  skelLine: { height: 5, borderRadius: 3, backgroundColor: colors.badgeTint, width: '90%' },
  templateLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  templateLabelSelected: { color: colors.ink, fontWeight: '600' },

  preview: {
    marginTop: spacing.xl,
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    ...radii.card,
  },
  previewName: { ...typography.heading, color: colors.ink, fontSize: 18 },
  previewContact: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  previewRule: { height: 1, backgroundColor: colors.cardBorder, marginVertical: spacing.md },
  previewSummary: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  previewHeading: { ...typography.micro, color: colors.ink, letterSpacing: 1, marginBottom: spacing.sm },
  previewBulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.xs },
  previewDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.iconMuted,
    marginTop: 7,
    marginRight: spacing.sm,
  },
  previewBullet: { ...typography.caption, color: colors.textSecondary, flex: 1 },

  cta: { marginTop: spacing.xl },
});
