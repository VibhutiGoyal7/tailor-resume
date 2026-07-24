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
} as const;

export type ColorToken = keyof typeof colors;
