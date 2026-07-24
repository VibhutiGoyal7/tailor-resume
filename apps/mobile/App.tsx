import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from './src/theme/tokens';
import { logger } from './src/lib/logger';

// Placeholder root screen — real navigation + auth screens land in Milestone 8.
export default function App() {
  logger.info('app launched');
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tailor</Text>
      <Text style={styles.subtitle}>Scaffold — screens land in Milestone 8.</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.ink,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
