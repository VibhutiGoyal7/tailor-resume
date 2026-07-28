// The Tailor app-icon logo mark, ported faithfully from screens/tailor_logo.svg:
// a denim asymmetric-rounded square holding a slightly tilted document (with
// three text lines) and a tilted match-score badge reading "91" — the match-score
// dial being the app's signature visual (project doc §9b). Colors come from the
// design tokens. `variant` switches the light/dark lockup fills.
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../../theme/tokens';

interface LogoMarkProps {
  size?: number;
  variant?: 'light' | 'dark';
}

export function LogoMark({ size = 56, variant = 'light' }: LogoMarkProps) {
  const fill = variant === 'light' ? colors.accent : colors.accentOnDark;
  const surface = variant === 'light' ? colors.fieldBg : colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Path
        d="M8,26 C8,12 12,8 26,8 L70,8 C84,8 88,14 88,30 L88,70 C88,84 84,88 70,88 L26,88 C12,88 8,82 8,68 Z"
        fill={fill}
      />
      <Rect
        x={27}
        y={22}
        width={34}
        height={46}
        rx={5}
        fill={surface}
        rotation={-6}
        originX={44}
        originY={45}
      />
      <G rotation={-6} originX={44} originY={45}>
        <Line x1={33} y1={32} x2={55} y2={32} stroke={fill} strokeWidth={3} strokeLinecap="round" />
        <Line x1={33} y1={40} x2={49} y2={40} stroke={fill} strokeWidth={3} strokeLinecap="round" />
        <Line x1={33} y1={48} x2={51} y2={48} stroke={fill} strokeWidth={3} strokeLinecap="round" />
      </G>
      <Path
        d="M58,58 C58,48 64,44 72,44 C80,44 84,50 84,58 C84,66 80,72 72,72 C64,72 58,68 58,58 Z"
        fill={surface}
        rotation={8}
        originX={71}
        originY={58}
      />
      <SvgText
        x={71}
        y={62}
        fontSize={13}
        fontWeight="500"
        fill={fill}
        textAnchor="middle"
        rotation={8}
        originX={71}
        originY={58}
      >
        91
      </SvgText>
    </Svg>
  );
}
