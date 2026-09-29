import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radius, spacing, useColors } from "@/theme";

export type StripItem = { id: string; type: "image" | "video"; url: string };

// Up to three square thumbnails in a row; empty slots keep the squares the same size.
export function MediaStrip({
  items,
  onPress,
}: {
  items: StripItem[];
  onPress?: (item: StripItem, index: number) => void;
}) {
  const colors = useColors();
  if (items.length === 0) return null;
  const shown = items.slice(0, 3);
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {shown.map((item, index) => (
        <Pressable
          key={item.id}
          accessibilityRole={onPress ? "imagebutton" : "image"}
          accessibilityLabel={item.type === "video" ? "운동 영상" : "운동 사진"}
          disabled={!onPress}
          onPress={() => onPress?.(item, index)}
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.8 : 1 })}
        >
          {item.type === "image" ? (
            <Image
              source={{ uri: item.url }}
              contentFit="cover"
              style={{ aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.sunken }}
            />
          ) : (
            <View
              style={{
                aspectRatio: 1,
                borderRadius: radius.md,
                backgroundColor: colors.sunken,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialCommunityIcons name="play-circle" size={28} color={colors.inkMuted} />
            </View>
          )}
        </Pressable>
      ))}
      {Array.from({ length: 3 - shown.length }, (_, index) => (
        <View key={`empty-${index}`} style={{ flex: 1 }} />
      ))}
    </View>
  );
}
