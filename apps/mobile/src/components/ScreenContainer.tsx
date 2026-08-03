// Standard screen wrapper: the off-white background + ambient organic shapes
// (project doc §9b) + safe-area padding, so every screen starts from the same
// branded base. `scroll` wraps children in a ScrollView; `center` vertically
// centers (auth screens). `ambient` (default true) draws the background field.
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/tokens';
import { AmbientBackground } from './brand/AmbientBackground';

interface ScreenContainerProps {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  ambient?: boolean;
}

export function ScreenContainer({
  children,
  scroll = false,
  center = false,
  ambient = true,
}: ScreenContainerProps) {
  const inner = center ? [styles.content, styles.centered] : styles.content;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {ambient ? <AmbientBackground /> : null}
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
