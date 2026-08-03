// Inner-screen header, matching the designs (screens/*.svg): a back chevron
// top-left, a large title below it, and an optional right-side action slot (e.g.
// the item-detail edit affordance). Screens that need it own their header rather
// than the navigator, so the ambient background shows through (headerShown:false).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing, typography } from '../theme/tokens';

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          hitSlop={12}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path
              d="M15 5 L8 12 L15 19"
              fill="none"
              stroke={colors.ink}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
        {right ? <View>{right}</View> : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  title: { ...typography.title, color: colors.ink, marginTop: spacing.lg },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
});
