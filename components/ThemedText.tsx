import { Text, type TextProps } from "react-native";
import { type, useColors, type Colors, type TypeVariant } from "@/theme";

type Tone = "ink" | "muted" | "me" | "partner" | "onMe" | "danger" | "onStory";

const toneKey: Record<Tone, keyof Colors> = {
  ink: "ink",
  muted: "inkMuted",
  me: "me",
  partner: "partner",
  onMe: "onMe",
  danger: "danger",
  onStory: "onStory",
};

export function ThemedText({
  variant = "body",
  tone = "ink",
  style,
  ...props
}: TextProps & { variant?: TypeVariant; tone?: Tone }) {
  const colors = useColors();
  return <Text style={[type[variant], { color: colors[toneKey[tone]] }, style]} {...props} />;
}
