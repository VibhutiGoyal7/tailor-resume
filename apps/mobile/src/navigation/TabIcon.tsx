// Bottom-nav glyphs, ported from the bottom nav in screens/tailor_home_screen.svg
// (lines 72-83): a house (Home), a dog-eared folder (Bank), a lined document
// (Resumes), and a ringed dot (Profile). Stroked in the active/inactive tint the
// tab navigator passes in, so they light up denim when selected.
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { AppTabsParamList } from './types';

type TabName = keyof AppTabsParamList;

export function TabIcon({ name, color }: { name: TabName; color: string }) {
  switch (name) {
    case 'Home':
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Path
            d="M4,11 L12,4 L20,11 V20 H4 Z"
            fill="none"
            stroke={color}
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
          <Rect x={10} y={13} width={4} height={7} fill="none" stroke={color} strokeWidth={1.4} />
        </Svg>
      );
    case 'Bank':
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Path
            d="M4,7 h6 l2,2 h8 v11 h-16 z"
            fill="none"
            stroke={color}
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'Resumes':
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Rect
            x={6}
            y={3}
            width={12}
            height={18}
            rx={2}
            fill="none"
            stroke={color}
            strokeWidth={1.7}
          />
          <Line
            x1={9}
            y1={8}
            x2={15}
            y2={8}
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <Line
            x1={9}
            y1={12}
            x2={15}
            y2={12}
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'Profile':
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={7} fill="none" stroke={color} strokeWidth={1.7} />
          <Circle cx={12} cy={12} r={2.4} fill={color} />
        </Svg>
      );
    default:
      return null;
  }
}
