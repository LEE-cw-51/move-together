import { TextInput, type TextInputProps } from "react-native";
import { radius, spacing, type, useColors } from "@/theme";

export function TextField({ style, ...props }: TextInputProps) {
  const colors = useColors();
  return (
    <TextInput
      placeholderTextColor={colors.inkMuted}
      style={[
        type.body,
        {
          color: colors.ink,
          backgroundColor: colors.sunken,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          minHeight: 54,
          paddingHorizontal: spacing.lg,
        },
        style,
      ]}
      {...props}
    />
  );
}
