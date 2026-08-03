// Experience Bank list, built to screens/tailor_screen_bank_list.svg: items
// grouped into ROLES / PROJECTS / EDUCATION / SKILLS, roles-projects-education as
// slightly-tilted white cards and skills as badge-tint chips, an add "+" in the
// header and a floating "+" (both open the add-entry choice). An empty bank shows
// the growing-sprout motif (§9b) with a first-entry nudge.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import type { ExperienceItemView } from '@tailor/shared-types';
import { AmbientBackground } from '../../components/brand/AmbientBackground';
import { GrowingSprout } from '../../components/brand/motifs/GrowingSprout';
import { Button } from '../../components/ui/Button';
import { getExperienceBank } from '../../api/bank';
import { BANK_SECTIONS, itemCardText, skillLabel } from '../../lib/bankItem';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { BankStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<BankStackParamList, 'BankList'>;

export function BankListScreen({ navigation }: Props) {
  const bank = useQuery({ queryKey: ['bank'], queryFn: getExperienceBank });

  const isEmpty =
    bank.data !== undefined && BANK_SECTIONS.every((s) => (bank.data![s.type] ?? []).length === 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AmbientBackground />

      <View style={styles.headerRow}>
        <Text style={styles.title}>Experience bank</Text>
        <PlusButton size={36} onPress={() => navigation.navigate('AddEntryChoice')} />
      </View>

      {bank.isLoading ? (
        <View style={styles.stateBox}>
          <Text style={styles.emptyBody}>Loading your bank…</Text>
        </View>
      ) : bank.isError ? (
        <View style={styles.stateBox}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load your bank</Text>
          <Pressable onPress={() => void bank.refetch()} hitSlop={8}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : isEmpty ? (
        <View style={styles.emptyWrap}>
          <GrowingSprout size={128} />
          <Text style={styles.emptyTitle}>Your bank is empty</Text>
          <Text style={styles.emptyBody}>
            Add your roles, projects, education, and skills once — then reuse them for every resume.
          </Text>
          <Button
            label="Add your first entry"
            onPress={() => navigation.navigate('AddEntryChoice')}
            style={styles.emptyCta}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {BANK_SECTIONS.map((section) => {
            const items = bank.data![section.type] ?? [];
            if (items.length === 0) return null;
            return (
              <View key={section.type} style={styles.section}>
                <Text style={styles.sectionLabel}>{section.label}</Text>
                {section.type === 'skill' ? (
                  <View style={styles.chipRow}>
                    {items.map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
                        style={styles.chip}
                      >
                        <Text style={styles.chipText}>{skillLabel(item)}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  items.map((item, i) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      index={i}
                      onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
                    />
                  ))
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {!isEmpty ? (
        <View style={styles.fab}>
          <PlusButton size={56} onPress={() => navigation.navigate('AddEntryChoice')} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ItemCard({
  item,
  index,
  onPress,
}: {
  item: ExperienceItemView;
  index: number;
  onPress: () => void;
}) {
  const { title, subtitle } = itemCardText(item);
  const tilt = index % 2 === 0 ? '-0.6deg' : '0.6deg';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        index % 2 === 0 ? radii.card : radii.cardAlt,
        { transform: [{ rotate: tilt }] },
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={styles.cardTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.cardMeta} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The denim "+" circle used in the header and as the FAB. */
function PlusButton({ size, onPress }: { size: number; onPress: () => void }) {
  const r = size / 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add to your bank"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: r, backgroundColor: colors.accent },
        styles.plus,
        pressed ? styles.pressed : null,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 7 V17 M7 12 H17"
          stroke={colors.background}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.ink },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl * 2 },

  section: { marginTop: spacing.lg },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitle: { ...typography.bodyStrong, color: colors.ink },
  cardMeta: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: colors.badgeTint,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  chipText: { ...typography.caption, color: colors.accent },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyCta: { marginTop: spacing.lg, alignSelf: 'stretch' },
  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyTitle: { ...typography.heading, color: colors.ink, marginTop: spacing.sm },
  emptyBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retry: { ...typography.bodyStrong, color: colors.accent },

  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xxl },
  plus: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});
