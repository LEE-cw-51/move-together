import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
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

function param(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw || undefined;
}

// The core reward: both people moved today. Shown once per Seoul day.
export default function CelebrateScreen() {
  const { token } = useSession();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ challengeId?: string; seoulDate?: string }>();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [ready, setReady] = useState(false);
  const markedRef = useRef(false);
  const identityRef = useRef<{ id: string; date: string } | null>(null);
  const readyRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!token) {
        setReady(true);
        return;
      }
      let active = true;
      api<HomeResponse>("/home", { token })
        .then((next) => {
          if (active) setHome(next);
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setReady(true);
        });
      return () => {
        active = false;
      };
    }, [token]),
  );

  const challenge = home?.challenge;
  const me = challenge?.members.find((member) => member.isMe);
  const partner = challenge?.members.find((member) => !member.isMe);
  const challengeId = param(params.challengeId) ?? challenge?.id;
  const seoulDate = param(params.seoulDate) ?? challenge?.seoulDate;
  identityRef.current = challengeId && seoulDate ? { id: challengeId, date: seoulDate } : null;
  readyRef.current = ready || identityRef.current !== null;

  const remember = useCallback(async () => {
    const identity = identityRef.current;
    if (markedRef.current || !identity) return;
    markedRef.current = true;
    await markCelebrated(identity.id, identity.date);
  }, []);

  useEffect(() => {
    return navigation.addListener("beforeRemove", (event) => {
      if (markedRef.current) return;
      if (!identityRef.current) {
        if (!readyRef.current) event.preventDefault();
        return;
      }
      event.preventDefault();
      void remember().finally(() => {
        navigation.dispatch(event.data.action);
      });
    });
  }, [navigation, remember]);

  async function close() {
    await remember();
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
      <Button label="좋아요" disabled={!ready && !(challengeId && seoulDate)} onPress={close} />
    </Screen>
  );
}
