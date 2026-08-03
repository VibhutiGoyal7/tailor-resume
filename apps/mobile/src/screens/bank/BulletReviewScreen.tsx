// Review LLM-suggested bullets before keeping them, built to
// screens/tailor_screen_bullet_review.svg: "Review what we found / Nothing saves
// until you say so", one card per suggested bullet with accept/reject toggles
// (rejected shows struck-through + muted), and an "Add N to my bank" CTA. The
// suggested bullets already exist server-side (created by extraction); committing
// PATCHes each to accepted/rejected (retrieval only ever uses accepted/edited).
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import type { ExperienceBankView, ExperienceItemView } from '@tailor/shared-types';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { getExperienceBank, updateBullet } from '../../api/bank';
import { itemDetailText } from '../../lib/bankItem';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { BankStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<BankStackParamList, 'BulletReview'>;

function findItem(bank: ExperienceBankView | undefined, id: string): ExperienceItemView | undefined {
  if (!bank) return undefined;
  for (const list of Object.values(bank)) {
    const found = list.find((i) => i.id === id);
    if (found) return found;
  }
  return undefined;
}

export function BulletReviewScreen({ navigation, route }: Props) {
  const { itemId } = route.params;
  const queryClient = useQueryClient();
  const bank = useQuery({ queryKey: ['bank'], queryFn: getExperienceBank });
  const item = useMemo(() => findItem(bank.data, itemId), [bank.data, itemId]);

  const suggested = useMemo(
    () => item?.bullets.filter((b) => b.status === 'suggested') ?? [],
    [item],
  );
  // Local accept/reject state — everything starts accepted (the design default).
  const [rejected, setRejected] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  const keptCount = suggested.filter((b) => !rejected[b.id]).length;
  const source = item ? itemDetailText(item).title : '';

  const commit = useMutation({
    mutationFn: async () => {
      await Promise.all(
        suggested.map((b) =>
          updateBullet(b.id, { status: rejected[b.id] ? 'rejected' : 'accepted' }),
        ),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bank'] });
      logger.info('bullet review committed', { itemId, kept: keptCount });
      navigation.replace('ItemDetail', { itemId });
    },
    onError: (err) => setDialog(errorToCopy(err)),
  });

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Review what we found"
        subtitle="Nothing saves until you say so."
        onBack={() => navigation.goBack()}
      />

      {bank.isLoading ? (
        <Text style={styles.meta}>Loading…</Text>
      ) : suggested.length === 0 ? (
        <Text style={styles.meta}>No suggestions to review.</Text>
      ) : (
        suggested.map((b) => {
          const isRejected = !!rejected[b.id];
          return (
            <View key={b.id} style={[styles.card, isRejected ? styles.cardRejected : null]}>
              <View style={styles.cardBody}>
                <Text style={[styles.bulletText, isRejected ? styles.struck : null]}>{b.text}</Text>
                {source ? <Text style={styles.source}>from: {source}</Text> : null}
              </View>
              <View style={styles.toggles}>
                <ToggleButton
                  kind="accept"
                  active={!isRejected}
                  onPress={() => setRejected((p) => ({ ...p, [b.id]: false }))}
                />
                <ToggleButton
                  kind="reject"
                  active={isRejected}
                  onPress={() => setRejected((p) => ({ ...p, [b.id]: true }))}
                />
              </View>
            </View>
          );
        })
      )}

      <Button
        label={keptCount > 0 ? `Add ${keptCount} to my bank` : 'Skip all'}
        onPress={() => commit.mutate()}
        loading={commit.isPending}
        disabled={suggested.length === 0 || commit.isPending}
        style={styles.cta}
      />

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

function ToggleButton({
  kind,
  active,
  onPress,
}: {
  kind: 'accept' | 'reject';
  active: boolean;
  onPress: () => void;
}) {
  const bg = active ? colors.badgeTint : colors.fieldBg;
  const stroke = active ? colors.accent : colors.iconMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={kind === 'accept' ? 'Keep bullet' : 'Reject bullet'}
      onPress={onPress}
      hitSlop={6}
      style={[styles.toggle, { backgroundColor: bg, borderColor: active ? colors.badgeTint : colors.cardBorder }]}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24">
        {kind === 'accept' ? (
          <Path
            d="M6 12.5 L10 16.5 L18 7.5"
            fill="none"
            stroke={stroke}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <Path d="M7 12 H17" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />
        )}
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  meta: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardRejected: { backgroundColor: colors.background },
  cardBody: { flex: 1, marginRight: spacing.md },
  bulletText: { ...typography.body, color: colors.ink },
  struck: { textDecorationLine: 'line-through', color: colors.iconMuted },
  source: { ...typography.micro, color: colors.accentOnDark, marginTop: spacing.sm },
  toggles: { flexDirection: 'row', gap: spacing.sm },
  toggle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: { marginTop: spacing.sm, marginBottom: spacing.xl },
});
