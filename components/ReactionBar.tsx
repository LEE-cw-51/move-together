import { Pressable, View } from "react-native";
import { radius, spacing, useColors } from "@/theme";
import type { ReactionSummary, ReactionType } from "@/types";
import { ThemedText } from "./ThemedText";

// Reactions are something one person sends the other, so they stay emoji content.
const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "heart", emoji: "❤️", label: "하트" },
  { type: "muscle", emoji: "💪", label: "근육" },
  { type: "fire", emoji: "🔥", label: "불꽃" },
  { type: "clap", emoji: "👏", label: "박수" },
];

// With onReact it is a picker for the partner's record; without it, it shows
// only the reactions I received.
export function ReactionBar({
  reactions,
  onReact,
}: {
  reactions: ReactionSummary[];
  onReact?: (type: ReactionType) => void;
}) {
  const colors = useColors();
  const items = onReact ? REACTIONS : REACTIONS.filter((item) => reactions.some((r) => r.type === item.type && r.count > 0));
  if (items.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {items.map((item) => {
        const summary = reactions.find((reaction) => reaction.type === item.type);
        const mine = Boolean(summary?.mine);
        return (
          <Pressable
            key={item.type}
            accessibilityRole="button"
            accessibilityLabel={`${item.label} 반응`}
            accessibilityState={{ selected: mine, disabled: !onReact }}
            disabled={!onReact}
            onPress={() => onReact?.(item.type)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
              minHeight: 40,
              minWidth: 52,
              justifyContent: "center",
              paddingHorizontal: spacing.md,
              borderRadius: radius.full,
              backgroundColor: mine ? colors.partnerSoft : colors.sunken,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <ThemedText variant="callout">{item.emoji}</ThemedText>
            {summary?.count ? (
              <ThemedText variant="footnote" tone={mine ? "ink" : "muted"}>
                {summary.count}
              </ThemedText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
