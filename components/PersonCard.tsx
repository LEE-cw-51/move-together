import type { ReactNode } from "react";
import { View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { exerciseLabel, type ExerciseCode } from "@/features/workout/exercises";
import { radius, shadows, spacing, useColors } from "@/theme";
import { ExerciseIcon } from "./ExerciseIcon";
import { ThemedText } from "./ThemedText";

// One card = one person. The colored edge says whose card it is once they
// have moved; the status line says whether they moved today.
export function PersonCard({
  who,
  name,
  done,
  exerciseTypes = [],
  customLabels = [],
  doneLabel = "오늘 운동 완료",
  pendingLabel = "아직 운동 전",
  children,
}: {
  who: "me" | "partner";
  name: string;
  done: boolean;
  exerciseTypes?: readonly ExerciseCode[];
  customLabels?: readonly string[];
  doneLabel?: string;
  pendingLabel?: string;
  children?: ReactNode;
}) {
  const colors = useColors();
  const accent = who === "me" ? colors.me : colors.partner;
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        borderCurve: "continuous",
        boxShadow: shadows.card,
        padding: spacing.lg,
        gap: spacing.md,
        borderLeftWidth: 4,
        borderLeftColor: done ? accent : colors.sunken,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
        <ThemedText variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </ThemedText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <MaterialCommunityIcons
            name={done ? "check-circle" : "clock-outline"}
            size={18}
            color={done ? accent : colors.inkMuted}
          />
          <ThemedText variant="subhead" tone={done ? "ink" : "muted"}>
            {done ? doneLabel : pendingLabel}
          </ThemedText>
        </View>
      </View>
      {done && exerciseTypes.length + customLabels.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg, rowGap: spacing.sm }}>
          {exerciseTypes.map((code) => (
            <View key={code} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <ExerciseIcon code={code} color={accent} />
              <ThemedText variant="callout">{exerciseLabel(code)}</ThemedText>
            </View>
          ))}
          {customLabels.map((label) => (
            <View key={`custom-${label}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <MaterialCommunityIcons name="star-four-points-outline" size={20} color={accent} />
              <ThemedText variant="callout">{label}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
      {children}
    </View>
  );
}
