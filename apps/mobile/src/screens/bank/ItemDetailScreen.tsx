// Experience item detail, built to screens/tailor_screen_item_detail.svg: the
// item's title/subtitle, its bullets as white cards, a dashed "add another
// bullet" row, and a destructive "delete this item" action. The item is read from
// the cached bank query (no separate GET-item endpoint); add-bullet and delete
// hit the profile facade and invalidate the bank so the list stays in sync.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ExperienceBankView, ExperienceItemView } from '@tailor/shared-types';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { addBullet, deleteExperienceItem, getExperienceBank } from '../../api/bank';
import { itemDetailText } from '../../lib/bankItem';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { BankStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<BankStackParamList, 'ItemDetail'>;

function findItem(bank: ExperienceBankView | undefined, id: string): ExperienceItemView | undefined {
  if (!bank) return undefined;
  for (const list of Object.values(bank)) {
    const found = list.find((i) => i.id === id);
    if (found) return found;
  }
  return undefined;
}

export function ItemDetailScreen({ navigation, route }: Props) {
  const { itemId } = route.params;
  const queryClient = useQueryClient();
  const bank = useQuery({ queryKey: ['bank'], queryFn: getExperienceBank });
  const item = useMemo(() => findItem(bank.data, itemId), [bank.data, itemId]);

  const [adding, setAdding] = useState(false);
  const [bulletText, setBulletText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  const invalidateBank = () => queryClient.invalidateQueries({ queryKey: ['bank'] });

  const addMutation = useMutation({
    mutationFn: () => addBullet(itemId, { text: bulletText.trim(), tags: [] }),
    onSuccess: async () => {
      await invalidateBank();
      setBulletText('');
      setAdding(false);
      logger.info('bullet added', { itemId });
    },
    onError: (err) => setDialog(errorToCopy(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteExperienceItem(itemId),
    onSuccess: async () => {
      await invalidateBank();
      logger.info('bank item deleted', { itemId });
      navigation.goBack();
    },
    onError: (err) => setDialog(errorToCopy(err)),
  });

  if (!bank.isLoading && !item) {
    // The item was deleted or never existed — bounce back to the list.
    return (
      <ScreenContainer>
        <ScreenHeader title="Not found" onBack={() => navigation.goBack()} />
        <Text style={styles.meta}>This item is no longer in your bank.</Text>
      </ScreenContainer>
    );
  }

  const header = item ? itemDetailText(item) : { title: '', subtitle: '' };
  const bullets = item?.bullets.filter((b) => b.status !== 'rejected') ?? [];

  return (
    <ScreenContainer scroll>
      <ScreenHeader title={header.title} subtitle={header.subtitle} onBack={() => navigation.goBack()} />

      <Text style={styles.sectionLabel}>BULLETS</Text>

      {bullets.map((b) => (
        <View key={b.id} style={styles.bulletCard}>
          <Text style={styles.bulletText}>{b.text}</Text>
        </View>
      ))}
      {bullets.length === 0 && !adding ? (
        <Text style={styles.meta}>No bullets yet — add what you did here.</Text>
      ) : null}

      {adding ? (
        <View style={styles.addBox}>
          <TextField
            label="New bullet"
            value={bulletText}
            onChangeText={setBulletText}
            placeholder="Led migration to a new checkout flow, cutting cart abandonment 18%"
            multiline
            style={styles.multiline}
          />
          <View style={styles.addActions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => {
                setAdding(false);
                setBulletText('');
              }}
              style={styles.addAction}
            />
            <Button
              label="Add bullet"
              onPress={() => addMutation.mutate()}
              loading={addMutation.isPending}
              disabled={bulletText.trim().length === 0 || addMutation.isPending}
              style={styles.addAction}
            />
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setAdding(true)}
          style={({ pressed }) => [styles.addBullet, pressed ? styles.pressed : null]}
        >
          <Text style={styles.addBulletText}>+ Add another bullet</Text>
        </Pressable>
      )}

      <View style={styles.deleteWrap}>
        {confirmingDelete ? (
          <>
            <Text style={styles.confirmText}>Delete this item and its bullets?</Text>
            <View style={styles.addActions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setConfirmingDelete(false)}
                style={styles.addAction}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                style={({ pressed }) => [styles.deleteBtn, styles.deleteConfirm, pressed ? styles.pressed : null]}
              >
                <Text style={styles.deleteConfirmText}>Delete</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirmingDelete(true)}
            style={({ pressed }) => [styles.deleteBtn, pressed ? styles.pressed : null]}
          >
            <Text style={styles.deleteText}>Delete this item</Text>
          </Pressable>
        )}
      </View>

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  meta: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  bulletCard: {
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  bulletText: { ...typography.body, color: colors.ink },

  addBox: { marginTop: spacing.sm },
  multiline: { height: 90, paddingTop: spacing.md, textAlignVertical: 'top' },
  addActions: { flexDirection: 'row', gap: spacing.md },
  addAction: { flex: 1 },
  addBullet: {
    borderWidth: 1,
    borderColor: colors.iconMuted,
    borderStyle: 'dashed',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  addBulletText: { ...typography.caption, color: colors.textSecondary },

  deleteWrap: { marginTop: spacing.xxl, marginBottom: spacing.xl },
  confirmText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  deleteBtn: {
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { ...typography.bodyStrong, color: colors.dangerText },
  deleteConfirm: { flex: 1, backgroundColor: colors.danger, borderColor: colors.danger },
  deleteConfirmText: { ...typography.bodyStrong, color: colors.background },

  pressed: { opacity: 0.85 },
});
