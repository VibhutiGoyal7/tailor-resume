// Standard screen wrapper: safe-area padding + the app background, so every screen
// starts from the same base instead of re-declaring it. `scroll` wraps children in
// a ScrollView for content-heavy screens; `center` vertically centers (auth screens).
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/tokens';

interface ScreenContainerProps {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
}

export function ScreenContainer({
  children,
  scroll = false,
  center = false,
}: ScreenContainerProps) {
  const inner = center ? [styles.content, styles.centered] : styles.content;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, styles.scrollContent]}>
          {children}
        </ScrollView>
      ) : (
        <View style={inner}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: spacing.xl,
  },
  centered: {
    justifyContent: 'center',
  },
});
