// "Resume basics", built to screens/tailor_screen_resume_basics.svg: the contact +
// summary details pulled into every tailored resume. Full name (required), phone +
// location (paired), the three optional links (LinkedIn / Portfolio / GitHub), and a
// summary. Loads GET /bank/basics to prefill and saves via PUT /bank/basics. A
// signature-flourish motif (§9b: "your resume, your own mark") sits by the header.
// Backend validation errors map to per-field hints via the shared TextField.
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { FieldIssue, ResumeBasicsView, UpdateResumeBasicsInput } from '@tailor/shared-types';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { SignatureFlourish } from '../../components/brand/motifs/SignatureFlourish';
import { getResumeBasics, updateResumeBasics } from '../../api/bank';
import { isApiRequestError } from '../../api/errors';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ResumeBasics'>;

interface FormState {
  fullName: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
  github: string;
  summary: string;
}

function initialForm(basics: ResumeBasicsView | null | undefined): FormState {
  return {
    fullName: basics?.fullName ?? '',
    phone: basics?.phone ?? '',
    location: basics?.location ?? '',
    linkedin: basics?.links?.linkedin ?? '',
    portfolio: basics?.links?.portfolio ?? '',
    github: basics?.links?.github ?? '',
    summary: basics?.summary ?? '',
  };
}

export function ResumeBasicsScreen({ navigation }: Props) {
  const basics = useQuery({ queryKey: ['bank', 'basics'], queryFn: getResumeBasics });

  if (basics.isLoading) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Resume basics" onBack={() => navigation.goBack()} />
      </ScreenContainer>
    );
  }
  return <BasicsForm navigation={navigation} initial={initialForm(basics.data)} />;
}

function BasicsForm({ navigation, initial }: { navigation: Props['navigation']; initial: FormState }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  const set = (key: keyof FormState, v: string) => setForm((p) => ({ ...p, [key]: v }));

  const save = useMutation({
    mutationFn: () => {
      const t = (v: string) => v.trim();
      const links: UpdateResumeBasicsInput['links'] = {};
      if (t(form.linkedin)) links.linkedin = t(form.linkedin);
      if (t(form.portfolio)) links.portfolio = t(form.portfolio);
      if (t(form.github)) links.github = t(form.github);
      const input: UpdateResumeBasicsInput = { fullName: t(form.fullName), links };
      if (t(form.phone)) input.phone = t(form.phone);
      if (t(form.location)) input.location = t(form.location);
      if (t(form.summary)) input.summary = t(form.summary);
      return updateResumeBasics(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bank', 'basics'] });
      logger.info('resume basics saved');
      navigation.goBack();
    },
    onError: (err) => {
      setFieldErrors(fieldIssuesToMap(isApiRequestError(err) ? err.fields : undefined));
      setDialog(errorToCopy(err));
    },
  });

  const canSave = form.fullName.trim().length > 0 && !save.isPending;
  // Link validation errors come back keyed under `links.*`; surface them on the group.
  const linksError = fieldErrors['links.linkedin'] || fieldErrors['links.portfolio'] || fieldErrors['links.github'];

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Resume basics"
        subtitle="Pulled into every tailored resume."
        onBack={() => navigation.goBack()}
        right={<SignatureFlourish width={64} color={colors.accentOnDark} />}
      />

      <TextField
        label="Full name"
        value={form.fullName}
        onChangeText={(v) => set('fullName', v)}
        placeholder="Your name"
        errorText={fieldErrors.fullName}
      />

      <View style={styles.pairRow}>
        <View style={styles.pairItem}>
          <TextField
            label="Phone"
            value={form.phone}
            onChangeText={(v) => set('phone', v)}
            placeholder="Optional"
            keyboardType="phone-pad"
            errorText={fieldErrors.phone}
          />
        </View>
        <View style={styles.pairItem}>
          <TextField
            label="Location"
            value={form.location}
            onChangeText={(v) => set('location', v)}
            placeholder="Bengaluru, IN"
            errorText={fieldErrors.location}
          />
        </View>
      </View>

      <Text style={styles.groupLabel}>Links (all optional)</Text>
      <LinkInput value={form.linkedin} onChangeText={(v) => set('linkedin', v)} placeholder="LinkedIn" />
      <LinkInput value={form.portfolio} onChangeText={(v) => set('portfolio', v)} placeholder="Portfolio (optional)" />
      <LinkInput value={form.github} onChangeText={(v) => set('github', v)} placeholder="GitHub (optional)" />
      {linksError ? <Text style={styles.linksError}>Links must be full URLs (e.g. https://…).</Text> : null}

      <View style={styles.summaryWrap}>
        <TextField
          label="Summary"
          value={form.summary}
          onChangeText={(v) => set('summary', v)}
          placeholder="Mobile engineer with 3 years building production React Native and Flutter apps…"
          multiline
          style={styles.multiline}
          errorText={fieldErrors.summary}
        />
      </View>

      <Button
        label="Save"
        onPress={() => save.mutate()}
        loading={save.isPending}
        disabled={!canSave}
        style={styles.save}
      />

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

/** A bare, placeholder-only input for the link rows (the design shows no per-field label). */
function LinkInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.iconMuted}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="url"
      style={styles.linkInput}
    />
  );
}

function fieldIssuesToMap(fields: FieldIssue[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fields ?? []) map[f.field] = f.issue;
  return map;
}

const styles = StyleSheet.create({
  pairRow: { flexDirection: 'row', gap: spacing.md },
  pairItem: { flex: 1 },
  groupLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  linkInput: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.fieldBg,
    marginBottom: spacing.md,
  },
  linksError: { ...typography.caption, color: colors.accent, marginBottom: spacing.md },
  summaryWrap: { marginTop: spacing.sm },
  multiline: { height: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  save: { marginTop: spacing.sm, marginBottom: spacing.xl },
});
