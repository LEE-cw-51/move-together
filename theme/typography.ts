import type { TextStyle } from "react-native";

// Apple text-style ramp on the system font. Colors are applied by ThemedText's
// `tone`, because they depend on the color scheme.
export const type = {
  display: { fontSize: 56, lineHeight: 60, fontWeight: "800", fontVariant: ["tabular-nums"] },
  largeTitle: { fontSize: 32, lineHeight: 40, fontWeight: "700" },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 24, fontWeight: "400" },
  callout: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;
