import { useCallback, useState } from "react";
import { View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { exerciseLabel } from "@/features/workout/exercises";
import { Button } from "@/components/Button";
import { ExerciseIcon } from "@/components/ExerciseIcon";
import { PairDot } from "@/components/PairDot";
import { Screen } from "@/components/Screen";
import { ThemedText } from "@/components/ThemedText";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { motion, spacing, useColors } from "@/theme";
import type { HomeResponse } from "@/types";

// Small reward right after saving. The pair mark lights my half; if the partner
// already moved, it is already whole, and the Today tab opens the big celebration.
export default function WorkoutDoneScreen() {
  const { token } = useSession();
  const colors = useColors();
  const [home, setHome] = useState<HomeResponse | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      api<HomeResponse>("/home", { token })
        .then(setHome)
        .catch(() => undefined);
    }, [token]),
  );

  const me = home?.challenge?.members.find((member) => member.isMe);
  const partner = home?.challenge?.members.find((member) => !member.isMe);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.xl }}>
        <Animated.View entering={ZoomIn.duration(motion.slow)}>
          <PairDot me partner={Boolean(partner?.today.completed)} size={88} />
        </Animated.View>
        <ThemedText variant="largeTitle">운동 완료!</ThemedText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg, rowGap: spacing.sm }}>
          {(me?.today.exerciseTypes ?? []).map((code) => (
            <View key={code} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <ExerciseIcon code={code} color={colors.me} size={22} />
              <ThemedText variant="headline">{exerciseLabel(code)}</ThemedText>
            </View>
          ))}
          {(me?.today.customLabels ?? []).map((label) => (
            <View key={`custom-${label}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <MaterialCommunityIcons name="star-four-points-outline" size={22} color={colors.me} />
              <ThemedText variant="headline">{label}</ThemedText>
            </View>
          ))}
        </View>
        <ThemedText variant="callout" tone="muted">
          {partner ? `오늘도 해냈어요. ${partner.displayName}님에게 알려줬어요.` : "오늘도 해냈어요."}
        </ThemedText>
      </View>
      <Button label="확인" onPress={() => router.dismissTo("/(main)")} />
    </Screen>
  );
}
