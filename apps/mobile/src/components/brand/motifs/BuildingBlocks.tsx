// The building-blocks staged-progress motif (project doc §9b: "assembling a resume,
// piece by piece") — the animated heart of the tailoring flow's progress screens
// (screens/tailor_screen_staged_progress_*.svg, source motif in
// screens/tailor_motif_stacking_blocks.svg). A dashed resume-page silhouette inside
// a badge-tint coin; four bars fly up into place one after another, hold, then drop
// away together, and the loop repeats.
//
// Ported from the SVG's SMIL choreography to React Native's built-in Animated (a
// single 0→1 looping driver, one interpolation per bar) rather than adding a native
// animation dependency — transform + opacity only, so it runs on the native driver.
// The cycle duration comes from the shared `motif` tokens so timing stays in sync.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { colors, motif } from '../../../theme/tokens';

// Each bar's resting box (in the 200×200 design viewBox) + its keyframe timeline.
// `times` are fractions of the cycle; `y` is the vertical offset in viewBox units
// (60 = fully below its slot); `o` is opacity. Bar 1 is the denim title bar; the
// rest are accent body lines, entering in a staggered cascade.
interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  times: number[];
  offsets: number[];
  opacity: number[];
}

const RISE = 60; // viewBox units a bar travels up into place
const BARS: Bar[] = [
  {
    x: 75,
    y: 58,
    w: 55,
    h: 10,
    color: colors.accent,
    times: [0, 0.1667, 0.8333, 0.9583, 1],
    offsets: [RISE, 0, 0, RISE, RISE],
    opacity: [0, 1, 1, 0, 0],
  },
  {
    x: 75,
    y: 78,
    w: 45,
    h: 8,
    color: colors.accentOnDark,
    times: [0, 0.1667, 0.3333, 0.8333, 0.9583, 1],
    offsets: [RISE, RISE, 0, 0, RISE, RISE],
    opacity: [0, 0, 1, 1, 0, 0],
  },
  {
    x: 75,
    y: 96,
    w: 50,
    h: 8,
    color: colors.accentOnDark,
    times: [0, 0.3333, 0.5, 0.8333, 0.9583, 1],
    offsets: [RISE, RISE, 0, 0, RISE, RISE],
    opacity: [0, 0, 1, 1, 0, 0],
  },
  {
    x: 75,
    y: 114,
    w: 38,
    h: 8,
    color: colors.accentOnDark,
    times: [0, 0.5, 0.6667, 0.8333, 0.9583, 1],
    offsets: [RISE, RISE, 0, 0, RISE, RISE],
    opacity: [0, 0, 1, 1, 0, 0],
  },
];

export function BuildingBlocks({ size = 180 }: { size?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const k = size / 200; // design viewBox → px scale

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: motif.cycleMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
        <Circle cx={100} cy={100} r={70} fill={colors.badgeTint} />
        <Rect
          x={65}
          y={42}
          width={70}
          height={100}
          rx={6}
          fill="none"
          stroke={colors.iconMuted}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.6}
        />
      </Svg>
      {BARS.map((bar, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: bar.x * k,
            top: bar.y * k,
            width: bar.w * k,
            height: bar.h * k,
            borderRadius: 3 * k,
            backgroundColor: bar.color,
            opacity: t.interpolate({ inputRange: bar.times, outputRange: bar.opacity }),
            transform: [
              {
                translateY: t.interpolate({
                  inputRange: bar.times,
                  outputRange: bar.offsets.map((o) => o * k),
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}
