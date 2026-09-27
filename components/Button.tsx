import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "./theme";

export function Button({
  label,
  onPress,
  disabled,
  tone = "solid",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "solid" | "quiet" | "good";
}) {
  const background =
    disabled ? colors.disabled : tone === "quiet" ? colors.card : tone === "good" ? colors.good : colors.accent;
  const textColor = disabled ? colors.disabledText : tone === "quiet" ? colors.text : colors.accentText;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: background, borderColor: tone === "quiet" ? colors.line : background }]}
    >
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 17,
    fontWeight: "600",
  },
});
