// Shown while the session is bootstrapping from the secure store (auth status
// 'loading'), before we know whether to show the auth stack or the tabs.
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

export function SplashScreen() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Tailor</Text>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  title: {
    ...typography.display,
    color: colors.accent,
    marginBottom: spacing.lg,
  },
});
