// Signature-flourish motif (project doc §9b: "This is your resume, your own mark"
// — resume basics, profile, welcome). A single hand-drawn squiggle stroke, per
// the flourish under the wordmark in screens/tailor_screen_welcome.svg.
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../../theme/tokens';

export function SignatureFlourish({
  width = 170,
  color = colors.accentOnDark,
}: {
  width?: number;
  color?: string;
}) {
  const height = (width / 170) * 40;
  return (
    <Svg width={width} height={height} viewBox="0 0 170 40">
      <Path
        d="M0 20 C 30 10, 50 40, 80 25 S 140 5, 170 20"
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}
