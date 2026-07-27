// Placeholder body for tab screens whose full build lands in a later M8 slice.
// Keeps the nav shell runnable/reviewable now without faking functionality.
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.title, color: colors.ink, marginBottom: spacing.sm },
  note: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
