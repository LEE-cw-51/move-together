import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radius, spacing, useColors, type Colors } from "@/theme";
import { ThemedText } from "./ThemedText";

type Variant = "primary" | "secondary" | "ghost";

const sizes = {
  md: { minHeight: 44, paddingHorizontal: spacing.lg },
  lg: { minHeight: 54, paddingHorizontal: spacing.xl },
} as const;

function variantColors(colors: Colors, variant: Variant) {
  if (variant === "primary") return { background: colors.me, label: "onMe" as const };
  if (variant === "secondary") return { background: colors.sunken, label: "ink" as const };
  return { background: "transparent", label: "me" as const };
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: keyof typeof sizes;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const tint = variantColors(colors, variant);
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: tint.background,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: spacing.sm,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
          ...sizes[size],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tint.label === "onMe" ? colors.onMe : colors.ink} />
      ) : (
        <>
          {icon ? <MaterialCommunityIcons name={icon} size={20} color={colors[tint.label]} /> : null}
          <ThemedText variant="headline" tone={tint.label}>
            {label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}
