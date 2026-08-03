// Dog-eared-page illustration motif (project doc §9b: "Neutral empty state").
// Ported from screens/tailor_illustration_motifs.svg — a badge-tint coin behind
// a white page with a folded-down corner (the dog-ear) and two denim text lines.
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { colors } from '../../../theme/tokens';

export function DogEaredPage({ size = 150 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle cx={60} cy={60} r={54} fill={colors.badgeTint} />
      <G transform="rotate(-5 60 60)">
        {/* page body with the top-right corner turned down */}
        <Path
          d="M40,38 h30 v30 l-14,14 h-16 a5,5 0 0 1 -5,-5 v-34 a5,5 0 0 1 5,-5 z"
          fill={colors.fieldBg}
        />
        {/* the folded dog-ear */}
        <Path d="M70,68 l-14,14 v-14 z" fill={colors.badgeTint} />
        {/* two lines of "text" on the page */}
        <Line
          x1={46}
          y1={52}
          x2={64}
          y2={52}
          stroke={colors.accent}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
        <Line
          x1={46}
          y1={60}
          x2={62}
          y2={60}
          stroke={colors.accent}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}
