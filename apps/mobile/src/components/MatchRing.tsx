// The match-score ring — a denim arc over a badge-tint track with the percentage
// centered (screens/tailor_screen_resumes_list.svg, tailor_screen_resume_detail.svg).
// Sizeable so the same mark serves the list card, the detail header, and anywhere
// else a compact score badge is needed. A null score (resumes generated before match
// scoring shipped) shows a neutral full track with a dash — same treatment as the
// result-screen dial (§9b: the RAG pipeline's signature output).
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, typography } from '../theme/tokens';

export function MatchRing({
  score,
  size = 44,
  strokeWidth = 3,
  fontSize = 12,
}: {
  score: number | null;
  size?: number;
  strokeWidth?: number;
  fontSize?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const center = size / 2;
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={center} cy={center} r={r} fill={colors.badgeTint} />
        <Circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={colors.badgeTint}
          strokeWidth={strokeWidth}
        />
        {score !== null ? (
          <Circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={colors.accent}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.label, { fontSize }]}>{score === null ? '—' : `${score}%`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.micro, color: colors.accent, fontWeight: '600' },
});
