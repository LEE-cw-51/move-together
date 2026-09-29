import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { ThemedText } from "@/components/ThemedText";
import { spacing, useColors } from "@/theme";

export default function NudgeSentSheet() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const colors = useColors();
  return (
    <View style={{ flex: 1, padding: spacing.xl, gap: spacing.md, backgroundColor: colors.surface }}>
      <MaterialCommunityIcons name="hand-pointing-right" size={36} color={colors.partner} />
      <ThemedText variant="title">찌르기 완료!</ThemedText>
      <ThemedText variant="callout" tone="muted">
        {name ? `${name}님에게` : "상대에게"} 운동하라고 알려줬어요. 찌르기는 하루에 한 번이에요.
      </ThemedText>
      <Button label="확인" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />
    </View>
  );
}
