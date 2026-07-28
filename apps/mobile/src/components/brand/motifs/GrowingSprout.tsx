// Growing-sprout illustration motif (project doc §9b: "Career growth, building
// over time" — Bank empty state, "you're ready" moments, first-run choice).
// Ported from screens/tailor_screen_first_run_choice.svg: a coin with a stem and
// two leaves.
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../../theme/tokens';

export function GrowingSprout({ size = 150 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="-15 -15 140 140">
      <Circle cx={55} cy={55} r={70} fill={colors.badgeTint} />
      <Path
        d="M55 90 C55 65, 55 55, 55 40"
        fill="none"
        stroke={colors.accent}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Path d="M55 55 C40 50, 32 38, 35 25 C48 28, 56 38, 55 55 Z" fill={colors.accentOnDark} />
      <Path d="M55 62 C70 58, 78 46, 75 33 C62 36, 54 46, 55 62 Z" fill={colors.accent} />
    </Svg>
  );
}
