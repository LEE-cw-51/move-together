import { useCallback, useState } from "react";
import { View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { markCelebrated } from "@/features/celebration/seen";
import { workoutLabels } from "@/features/workout/exercises";
import { Button } from "@/components/Button";
import { PairDot } from "@/components/PairDot";
import { Screen } from "@/components/Screen";
import { ThemedText } from "@/components/ThemedText";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { motion, spacing } from "@/theme";
import type { HomeResponse } from "@/types";

// The core reward: both people moved today. Shown once per Seoul day.
export default function CelebrateScreen() {
  const { token } = useSession();
  const [home, setHome] = useState<HomeResponse | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      api<HomeResponse>("/home", { token })
        .then(setHome)
        .catch(() => undefined);
    }, [token]),
  );

  const challenge = home?.challenge;
  const me = challenge?.members.find((member) => member.isMe);
  const partner = challenge?.members.find((member) => !member.isMe);

  async function close() {
    if (challenge) await markCelebrated(challenge.id, challenge.seoulDate);
    if (router.canGoBack()) router.back();
    else router.replace("/(main)");
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.xxl }}>
        <View style={{ gap: spacing.sm }}>
          <ThemedText variant="headline" tone="muted">
            {challenge ? `${challenge.streak}일 연속` : " "}
          </ThemedText>
          <ThemedText variant="largeTitle">오늘은 둘 다 성공!</ThemedText>
        </View>

        <View style={{ gap: spacing.xl }}>
          <View style={{ gap: spacing.xs }}>
            <ThemedText variant="headline" tone="me">
              나
            </ThemedText>
            <ThemedText variant="body">{me ? workoutLabels(me.today.exerciseTypes, me.today.customLabels) : " "}</ThemedText>
          </View>
          <Animated.View entering={ZoomIn.duration(motion.slow)} style={{ alignSelf: "center" }}>
            <PairDot me partner size={112} />
          </Animated.View>
          <View style={{ gap: spacing.xs, alignItems: "flex-end" }}>
            <ThemedText variant="headline" tone="partner">
              {partner?.displayName ?? " "}
            </ThemedText>
            <ThemedText variant="body">{partner ? workoutLabels(partner.today.exerciseTypes, partner.today.customLabels) : " "}</ThemedText>
          </View>
        </View>

        <ThemedText variant="callout" tone="muted">
          {challenge ? `함께한 날이 ${challenge.streak}일째예요.` : " "}
        </ThemedText>
      </View>
      <Button label="좋아요" onPress={close} />
    </Screen>
  );
}
