// The structured add-item form, built to the per-type form designs
// (screens/tailor_screen_form_{role,project,skill,education}.svg). The fields are
// config-driven per Experience Bank type; the free-text description/notes field is
// also saved as rawInput so a later LLM extraction pass can pull bullets from it.
// On save the item is created (POST /bank/items) and we jump to its detail, where
// bullets are added manually (extraction isn't wired yet).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ExperienceType } from '@tailor/shared-types';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { addExperienceItem } from '../../api/bank';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { spacing } from '../../theme/tokens';
import type { BankStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<BankStackParamList, 'ItemForm'>;

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  half?: boolean;
}

interface FormDef {
  title: string;
  primaryKey: string; // required field
  descriptionKey?: string; // also stored as rawInput for later extraction
  fields: FieldDef[];
}

const FORMS: Record<ExperienceType, FormDef> = {
  role: {
    title: 'Add a role',
    primaryKey: 'title',
    descriptionKey: 'description',
    fields: [
      { key: 'title', label: 'Job title', placeholder: 'Senior Engineer' },
      { key: 'company', label: 'Company', placeholder: 'Acme Co.' },
      { key: 'startDate', label: 'Start date', placeholder: 'Jan 2021', half: true },
      { key: 'endDate', label: 'End date', placeholder: 'Present', half: true },
      { key: 'location', label: 'Location', placeholder: 'Remote' },
      { key: 'description', label: 'What did you do here?', placeholder: 'Led the migration to a new checkout flow…', multiline: true },
    ],
  },
  project: {
    title: 'Add a project',
    primaryKey: 'name',
    descriptionKey: 'description',
    fields: [
      { key: 'name', label: 'Project name', placeholder: 'On-device CV pipeline' },
      { key: 'context', label: 'Your role / context', placeholder: 'Personal project' },
      { key: 'timeframe', label: 'Timeframe', placeholder: '2023' },
      { key: 'description', label: 'What was it, and what did you build?', placeholder: 'On-device document scanner using TensorFlow Lite…', multiline: true },
    ],
  },
  education: {
    title: 'Add education',
    primaryKey: 'school',
    descriptionKey: 'notes',
    fields: [
      { key: 'school', label: 'School', placeholder: 'State University' },
      { key: 'degree', label: 'Degree', placeholder: 'B.Tech', half: true },
      { key: 'field', label: 'Field', placeholder: 'Comp. Science', half: true },
      { key: 'startYear', label: 'Start year', placeholder: '2015', half: true },
      { key: 'endYear', label: 'End year', placeholder: '2019', half: true },
      { key: 'notes', label: 'Notable coursework, honors, activities', placeholder: 'Optional', multiline: true },
    ],
  },
  skill: {
    title: 'Add a skill',
    primaryKey: 'name',
    descriptionKey: 'usage',
    fields: [
      { key: 'name', label: 'Skill name', placeholder: 'React Native' },
      { key: 'category', label: 'Category', placeholder: 'Mobile development' },
      { key: 'usage', label: 'Where have you used it? (optional)', placeholder: 'Production apps at Acme and Nimbus, 3+ years', multiline: true },
    ],
  },
};

export function ItemFormScreen({ navigation, route }: Props) {
  const { type } = route.params;
  const form = FORMS[type];
  const [values, setValues] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);
  const queryClient = useQueryClient();

  const setField = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const mutation = useMutation({
    mutationFn: () => {
      const structuredFields: Record<string, string> = {};
      for (const f of form.fields) {
        const v = values[f.key]?.trim();
        if (v) structuredFields[f.key] = v;
      }
      const rawInput = form.descriptionKey ? (values[form.descriptionKey]?.trim() ?? '') : '';
      return addExperienceItem({ type, structuredFields, rawInput });
    },
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: ['bank'] });
      logger.info('bank item created', { type });
      navigation.replace('ItemDetail', { itemId: item.id });
    },
    onError: (err) => {
      logger.warn('bank item create failed', { type });
      setDialog(errorToCopy(err));
    },
  });

  const canSave = (values[form.primaryKey]?.trim().length ?? 0) > 0 && !mutation.isPending;

  // Group fields into rows so paired half-width fields sit side by side.
  const rows: FieldDef[][] = [];
  for (let i = 0; i < form.fields.length; i += 1) {
    const f = form.fields[i]!;
    const next = form.fields[i + 1];
    if (f.half && next?.half) {
      rows.push([f, next]);
      i += 1;
    } else {
      rows.push([f]);
    }
  }

  return (
    <ScreenContainer scroll>
      <ScreenHeader title={form.title} onBack={() => navigation.goBack()} />

      {rows.map((row) => (
        <View key={row[0]!.key} style={row.length === 2 ? styles.pairRow : undefined}>
          {row.map((f) => (
            <View key={f.key} style={row.length === 2 ? styles.pairItem : undefined}>
              <TextField
                label={f.label}
                value={values[f.key] ?? ''}
                onChangeText={(v) => setField(f.key, v)}
                placeholder={f.placeholder}
                multiline={f.multiline}
                style={f.multiline ? styles.multiline : undefined}
              />
            </View>
          ))}
        </View>
      ))}

      <Button
        label="Save"
        onPress={() => mutation.mutate()}
        loading={mutation.isPending}
        disabled={!canSave}
        style={styles.save}
      />

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  pairRow: { flexDirection: 'row', gap: spacing.md },
  pairItem: { flex: 1 },
  multiline: { height: 110, paddingTop: spacing.md, textAlignVertical: 'top' },
  save: { marginTop: spacing.sm, marginBottom: spacing.xl },
});
