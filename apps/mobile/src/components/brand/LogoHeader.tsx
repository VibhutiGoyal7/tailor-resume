// Centered logo mark + "Tailor" wordmark header used at the top of the auth
// screens (screens/tailor_screen_signup_login.svg), with an optional back chevron
// on the left. Keeps branding consistent across the auth stack.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import { LogoMark } from './LogoMark';

export function LogoHeader({ onBack }: { onBack?: () => void }) {
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back} hitSlop={12}>
          <Text style={styles.chevron}>‹</Text>
        </Pressable>
      ) : null}
      <View style={styles.center}>
        <LogoMark size={40} />
        <Text style={styles.wordmark}>Tailor</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 92,
    justifyContent: 'center',
  },
  back: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    fontSize: 30,
    color: colors.ink,
    lineHeight: 32,
  },
  center: {
    alignItems: 'center',
  },
  wordmark: {
    ...typography.heading,
    color: colors.ink,
    marginTop: spacing.xs,
  },
});
