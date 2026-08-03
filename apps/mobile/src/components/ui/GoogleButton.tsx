// "Continue with Google" button, per screens/tailor_screen_signup_login.svg: a
// white field-style button with a small G badge and centered label. Google sign-in
// is designed into the UI now; the backend route (POST /auth/google) is deferred
// (project doc — Milestone 2 slice 2b), so `disabled` reflects that until it lands.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';

export function GoogleButton({
  onPress,
  disabled = false,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, pressed && !disabled ? styles.pressed : null]}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>G</Text>
      </View>
      <Text style={styles.label}>Continue with Google</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.fieldBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  badge: {
    position: 'absolute',
    left: spacing.lg,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.badgeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: '600',
  },
  label: {
    ...typography.body,
    color: colors.ink,
  },
});
