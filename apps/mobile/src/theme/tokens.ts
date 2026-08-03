// Design tokens — the single source for color in the mobile app (build brief
// Section 8, CLAUDE.md Section 5). Never hardcode a hex value in a component;
// import from here. A color/shape not in this set is a design decision to flag,
// not an inline improvisation.
export const colors = {
  background: '#F1F3F4',
  ambientLight: '#E4EAEC',
  ambientLight2: '#EAEFF0',
  ambientDot: '#D6E1E4',
  cardBorder: '#E4E9EB',
  accent: '#2F4858', // primary CTA, active nav, primary icon fill
  accentOnDark: '#5B8AA6', // same role on dark surfaces
  badgeTint: '#DDE6E9', // match-score badge background
  ink: '#1D2226', // primary text
  textSecondary: '#7B8681', // muted labels/timestamps
  iconMuted: '#A9B2B6', // inactive nav icons
  ambientDot2: '#DCE5E8', // floating decorative dots (variants, project doc §9b)
  ambientDot3: '#CBD8DC',
  fieldBg: '#FFFFFF', // input / white card fill (on the off-white background)
  accentInactive: '#4A5F6B', // muted denim — inactive segment label (per designs)
} as const;

export type ColorToken = keyof typeof colors;

// NOTE: the build brief §8 locks only the color palette above. The scales below
// (spacing, radii, typography) are NOT in that locked set — they're a reasonable
// extension so components can pull every visual value from tokens instead of
// hardcoding (CLAUDE.md §5). Colors remain authoritative; if a spacing/type value
// here ever conflicts with a future design decision, the design decision wins.

/** 4pt spacing scale — the single source for margins/padding/gaps. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Corner radii. `card` is the asymmetric radius from the build brief's shape
 * language (§9b: `26 10 26 10`, not uniform); `cardAlt` mirrors it for the
 * alternating-card look in lists.
 */
export const radii = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
  card: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 26,
    borderBottomLeftRadius: 10,
  },
  cardAlt: {
    borderTopLeftRadius: 10,
    borderTopRightRadius: 26,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 26,
  },
} as const;

/** Type scale (size + line height + weight) — one place for all text styling. */
export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '600' as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: '400' as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '500' as const },
} as const;

/**
 * Building-blocks staged-progress motif timing (build brief §8) — for the
 * reanimated rebuild of the loop (four bars, 2.4s cycle, staggered entrance,
 * hold, synchronized drop). Kept here so the animation and any reference stay
 * in sync. Used by the tailoring flow's progress screens (Milestone 8 slice 4).
 */
export const motif = {
  barCount: 4,
  cycleMs: 2400,
  staggerMs: 400,
  holdMs: 1200,
  dropMs: 300,
} as const;
