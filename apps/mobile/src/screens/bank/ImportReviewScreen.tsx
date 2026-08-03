// Review everything pulled from an imported resume before keeping it. Like the
// single-item bullet review (tailor_screen_bullet_review.svg) but grouped by the
// items the import created — one section per role/project/etc., each with its
// suggested bullets and accept/reject toggles. "Add N to my bank" commits every
// suggestion (accepted → kept, rejected → dropped) via PATCH /bank/bullets/:id.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import type { BulletView, ExperienceBankView, ExperienceItemView } from '@tailor/shared-types';
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

type Props = NativeStackScreenProps<BankStackParamList, 'ImportReview'>;

export function ImportReviewScreen({ navigation, route }: Props) {
  const { itemIds } = route.params;
  const queryClient = useQueryClient();
  const bank = useQuery({ queryKey: ['bank'], queryFn: getExperienceBank });

  const items = useMemo(() => collectItems(bank.data, itemIds), [bank.data, itemIds]);
  const allSuggested = useMemo(
    () => items.flatMap((i) => i.bullets.filter((b) => b.status === 'suggested')),
    [items],
  );

  const [rejected, setRejected] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);
  const keptCount = allSuggested.filter((b) => !rejected[b.id]).length;

  const commit = useMutation({
    mutationFn: async () => {
      await Promise.all(
        allSuggested.map((b) =>
          updateBullet(b.id, { status: rejected[b.id] ? 'rejected' : 'accepted' }),
        ),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bank'] });
      logger.info('import review committed', { items: items.length, kept: keptCount });
      navigation.navigate('BankList');
    },
    onError: (err) => setDialog(errorToCopy(err)),
  });

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Review what we found"
        subtitle={`We pulled ${items.length} ${items.length === 1 ? 'entry' : 'entries'} from your resume. Nothing saves until you say so.`}
        onBack={() => navigation.goBack()}
      />

      {items.map((item) => {
        const suggested = item.bullets.filter((b) => b.status === 'suggested');
        return (
          <View key={item.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{itemDetailText(item).title}</Text>
            {suggested.length === 0 ? (
              <Text style={styles.meta}>No bullets — the entry itself will be saved.</Text>
            ) : (
              suggested.map((b) => (
                <SuggestedBullet
                  key={b.id}
                  bullet={b}
                  rejected={!!rejected[b.id]}
                  onAccept={() => setRejected((p) => ({ ...p, [b.id]: false }))}
                  onReject={() => setRejected((p) => ({ ...p, [b.id]: true }))}
                />
              ))
            )}
          </View>
        );
      })}

      <Button
        label={keptCount > 0 ? `Add ${keptCount} to my bank` : 'Keep entries only'}
        onPress={() => commit.mutate()}
        loading={commit.isPending}
        disabled={commit.isPending}
        style={styles.cta}
      />

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

function collectItems(bank: ExperienceBankView | undefined, ids: string[]): ExperienceItemView[] {
  if (!bank) return [];
  const byId = new Map<string, ExperienceItemView>();
  for (const list of Object.values(bank)) for (const i of list) byId.set(i.id, i);
  return ids.map((id) => byId.get(id)).filter((i): i is ExperienceItemView => i !== undefined);
}

function SuggestedBullet({
  bullet,
  rejected,
  onAccept,
  onReject,
}: {
  bullet: BulletView;
  rejected: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <View style={[styles.card, rejected ? styles.cardRejected : null]}>
      <Text style={[styles.bulletText, rejected ? styles.struck : null]}>{bullet.text}</Text>
      <View style={styles.toggles}>
        <Toggle kind="accept" active={!rejected} onPress={onAccept} />
        <Toggle kind="reject" active={rejected} onPress={onReject} />
      </View>
    </View>
  );
}

function Toggle({
  kind,
  active,
  onPress,
}: {
  kind: 'accept' | 'reject';
  active: boolean;
  onPress: () => void;
}) {
  const stroke = active ? colors.accent : colors.iconMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={kind === 'accept' ? 'Keep bullet' : 'Reject bullet'}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.toggle,
        { backgroundColor: active ? colors.badgeTint : colors.fieldBg, borderColor: active ? colors.badgeTint : colors.cardBorder },
      ]}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24">
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
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.bodyStrong, color: colors.ink, marginBottom: spacing.sm },
  meta: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  cardRejected: { backgroundColor: colors.background },
  bulletText: { ...typography.body, color: colors.ink, flex: 1, marginRight: spacing.md },
  struck: { textDecorationLine: 'line-through', color: colors.iconMuted },
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
