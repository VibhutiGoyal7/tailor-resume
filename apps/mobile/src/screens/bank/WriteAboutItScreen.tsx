// "Write about it" — the freeform-extraction entry, built to
// screens/tailor_screen_write_about_it.svg: a big text area with a coaching
// placeholder and an "Extract details" CTA. On extract, Claude turns the text
// into an item + suggested bullets (POST /bank/extract); we then go to the review
// step, where nothing is kept until the user confirms.
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { extractFromText } from '../../api/bank';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { BankStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<BankStackParamList, 'WriteAboutIt'>;

const PLACEHOLDER =
  'e.g. "I spent two years at a fintech startup building their mobile app from ' +
  'scratch. I owned the whole onboarding flow and got signup completion up by 30%…"';

export function WriteAboutItScreen({ navigation }: Props) {
  const [text, setText] = useState('');
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => extractFromText({ text: text.trim() }),
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: ['bank'] });
      logger.info('freeform extraction created item', { itemId: item.id, type: item.type });
      navigation.replace('BulletReview', { itemId: item.id });
    },
    onError: (err) => {
      logger.warn('freeform extraction failed');
      setDialog(errorToCopy(err));
    },
  });

  const canExtract = text.trim().length >= 20 && !mutation.isPending;

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Write about it"
        subtitle="Just describe it — we'll pull out the structured details and bullets for you."
        onBack={() => navigation.goBack()}
      />

      <View style={styles.fieldWrap}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={PLACEHOLDER}
          placeholderTextColor={colors.iconMuted}
          multiline
          textAlignVertical="top"
          style={styles.input}
        />
      </View>
      <Text style={styles.hint}>A sentence or two is plenty — the more detail, the better.</Text>

      <Button
        label="Extract details"
        onPress={() => mutation.mutate()}
        loading={mutation.isPending}
        disabled={!canExtract}
        style={styles.cta}
      />

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  fieldWrap: { marginTop: spacing.sm },
  input: {
    minHeight: 260,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    backgroundColor: colors.fieldBg,
    padding: spacing.lg,
    ...typography.body,
    color: colors.ink,
  },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  cta: { marginTop: spacing.xl, marginBottom: spacing.xl },
});
