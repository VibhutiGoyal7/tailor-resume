// Two-option segmented toggle (e.g. Create account | Log in), per
// screens/tailor_screen_signup_login.svg: a badge-tint track with the active
// segment filled in accent denim (white label) and the inactive one showing a
// muted-denim label. Asymmetric outer radii echo the shape language (§9b).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: [SegmentOption<T>, SegmentOption<T>];
  value: T;
  onChange: (key: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.key)}
            style={[styles.segment, active ? styles.segmentActive : null]}
          >
            <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.badgeTint,
    borderRadius: radii.lg,
    padding: 4,
  },
  segment: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  label: {
    ...typography.bodyStrong,
  },
  labelActive: {
    color: colors.background,
  },
  labelInactive: {
    color: colors.accentInactive,
    fontWeight: '400',
  },
});
