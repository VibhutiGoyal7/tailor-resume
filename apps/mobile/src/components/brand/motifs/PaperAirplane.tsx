// Paper-airplane illustration motif (project doc §9b: "Sending an application,
// tailoring in motion" — Home CTA, JD input, generate/export success, verify
// email). Ported from screens/tailor_screen_verify_email.svg: a badge-tint coin
// with the denim airplane + a lighter wing.
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../../theme/tokens';

export function PaperAirplane({ size = 150 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="-15 -15 140 140">
      <Circle cx={55} cy={55} r={70} fill={colors.badgeTint} />
      <Path d="M20 60 L95 30 L70 95 L58 68 L20 60 Z" fill={colors.accent} />
      <Path d="M58 68 L70 95 L78 60 L58 68 Z" fill={colors.accentOnDark} />
    </Svg>
  );
}
