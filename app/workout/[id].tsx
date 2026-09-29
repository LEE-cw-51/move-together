import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { dayTitle } from "@/features/history/calendar";
import { Button } from "@/components/Button";
import { PersonCard } from "@/components/PersonCard";
import { ReactionBar } from "@/components/ReactionBar";
import { ThemedText } from "@/components/ThemedText";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { radius, spacing, useColors } from "@/theme";
import type { ReactionType, WorkoutDetail } from "@/types";

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useSession();
  const colors = useColors();
  const [record, setRecord] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token || !id) return;
    setRecord(await api<WorkoutDetail>(`/workouts/${id}`, { token }));
  }, [id, token]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  async function react(type: ReactionType) {
    if (!id) return;
    try {
      await api(`/workouts/${id}/reactions`, { method: "POST", token, body: JSON.stringify({ type }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "반응을 남기지 못했어요");
    }
  }

  if (!record) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ThemedText variant="callout" tone="muted">
          기록을 불러오는 중
        </ThemedText>
      </View>
    );
  }

  const mine = !record.canReact;
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.gutter, gap: spacing.lg }}>
      <ThemedText variant="subhead" tone="muted">
        {dayTitle(record.seoulDate)}
      </ThemedText>
      <PersonCard
        who={mine ? "me" : "partner"}
        name={mine ? "나" : record.displayName}
        done
        doneLabel="운동 완료"
        exerciseTypes={record.exerciseTypes}
        customLabels={record.customLabels}
      >
        <ReactionBar reactions={record.reactions} onReact={record.canReact ? react : undefined} />
      </PersonCard>
      {record.media.map((item) =>
        item.type === "image" ? (
          <Image
            key={item.id}
            source={{ uri: item.url }}
            contentFit="cover"
            style={{ width: "100%", aspectRatio: 4 / 5, borderRadius: radius.xl, backgroundColor: colors.sunken }}
          />
        ) : (
          <View
            key={item.id}
            style={{
              height: 96,
              borderRadius: radius.xl,
              backgroundColor: colors.surface,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.sm,
            }}
          >
            <MaterialCommunityIcons name="play-circle" size={28} color={colors.inkMuted} />
            <ThemedText variant="headline">영상 {item.durationSeconds ?? ""}초</ThemedText>
          </View>
        ),
      )}
      {!record.frozen && mine ? (
        <Button
          label="오늘 기록 수정"
          variant="secondary"
          onPress={() => router.push({ pathname: "/workout/complete", params: { recordId: record.id } })}
        />
      ) : null}
      {error ? (
        <ThemedText variant="footnote" tone="danger">
          {error}
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}
