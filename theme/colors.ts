import { useColorScheme } from "react-native";

// Two people, two signals: "me" is cobalt, "partner" is amber. A day where both
// signals are lit is shown by the two colors together (see PairDot), so there is
// no separate "success" green.
const light = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  sunken: "#E9EDF1",
  ink: "#14212B",
  inkMuted: "#5E6B76",
  hairline: "#D5DCE2",
  me: "#2E5BFF",
  meSoft: "#E3E9FF",
  partner: "#F2A516",
  partnerSoft: "#FDF1D8",
  onMe: "#FFFFFF",
  danger: "#C8323C",
  // The story viewer is dark in both schemes so photos read true.
  story: "#05080B",
  onStory: "#FFFFFF",
  storyTrack: "rgba(255, 255, 255, 0.3)",
};

export type Colors = { [K in keyof typeof light]: string };

const dark: Colors = {
  bg: "#0F1419",
  surface: "#1A2129",
  sunken: "#242D37",
  ink: "#E8EDF1",
  inkMuted: "#94A1AC",
  hairline: "#2E3843",
  me: "#6B8CFF",
  meSoft: "#1E2A55",
  partner: "#F7C04A",
  partnerSoft: "#3A2F14",
  onMe: "#0B1020",
  danger: "#FF6B72",
  story: "#05080B",
  onStory: "#FFFFFF",
  storyTrack: "rgba(255, 255, 255, 0.3)",
};

export const palettes = { light, dark } as const;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
