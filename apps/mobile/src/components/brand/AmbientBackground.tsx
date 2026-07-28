// Ambient organic background — soft ellipses + floating dots that run across the
// full screen (project doc §9b: "Ambient organic shapes run across the full
// screen, not just one corner — this is the reference standard"). Rendered as an
// absolutely-positioned, non-interactive layer behind screen content. Shapes are
// placed at fractions of the screen so it adapts to any device size, echoing the
// top-right ellipse + floating dots seen in screens/tailor_screen_signup_login.svg.
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { colors } from '../../theme/tokens';

export function AmbientBackground() {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        {/* Top-right soft blob (as in the auth design). */}
        <Ellipse
          cx={width * 0.92}
          cy={height * 0.06}
          rx={70}
          ry={54}
          fill={colors.ambientLight}
          rotation={10}
          originX={width * 0.92}
          originY={height * 0.06}
        />
        {/* Lower-left counterweight so the field reads across the whole screen. */}
        <Ellipse
          cx={width * 0.04}
          cy={height * 0.82}
          rx={80}
          ry={62}
          fill={colors.ambientLight2}
          rotation={-8}
          originX={width * 0.04}
          originY={height * 0.82}
        />
        {/* Floating dots, scattered. */}
        <Circle cx={width * 0.06} cy={height * 0.11} r={6} fill={colors.ambientDot} />
        <Circle cx={width * 0.88} cy={height * 0.34} r={5} fill={colors.ambientDot2} />
        <Circle cx={width * 0.16} cy={height * 0.52} r={4} fill={colors.ambientDot3} />
        <Circle cx={width * 0.8} cy={height * 0.7} r={6} fill={colors.ambientDot} />
        <Circle cx={width * 0.5} cy={height * 0.9} r={4} fill={colors.ambientDot2} />
      </Svg>
    </View>
  );
}
