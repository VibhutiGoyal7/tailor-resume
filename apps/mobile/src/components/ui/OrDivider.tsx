// "or use email" divider — two hairlines flanking muted centered text, per the
// auth design. A plain component so auth screens don't re-declare it.
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

export function OrDivider({ label = 'or use email' }: { label?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  label: {
    ...typography.caption,
    color: colors.iconMuted,
    marginHorizontal: spacing.md,
  },
});
