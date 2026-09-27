import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { exerciseLabels } from "@/features/workout/exercises";
import { colors } from "@/components/theme";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { ReactionType, WorkoutDetail } from "@/types";

const REACTIONS: { type: ReactionType; label: string }[] = [
  { type: "heart", label: "하트" },
  { type: "muscle", label: "근육" },
  { type: "fire", label: "불" },
  { type: "clap", label: "박수" },
];

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useSession();
  const [record, setRecord] = useState<WorkoutDetail | null>(null);

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
    await api(`/workouts/${id}/reactions`, { method: "POST", token, body: JSON.stringify({ type }) });
    await load();
  }

  if (!record) {
    return (
      <View style={styles.empty}>
        <Text style={styles.muted}>기록을 불러오는 중</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.name}>{record.displayName}</Text>
      <Text style={styles.date}>{record.seoulDate}</Text>
      <Text style={styles.types}>{exerciseLabels(record.exerciseTypes)}</Text>
      {record.media.map((item) =>
        item.type === "image" ? (
          <Image key={item.id} source={{ uri: item.url }} style={styles.image} contentFit="cover" />
        ) : (
          <View key={item.id} style={styles.video}>
            <Text style={styles.videoText}>영상 {item.durationSeconds ?? ""}초</Text>
          </View>
        ),
      )}
      {!record.frozen && !record.canReact ? (
        <Pressable onPress={() => router.push({ pathname: "/workout/complete", params: { recordId: record.id } })}>
          <Text style={styles.edit}>오늘 기록 수정</Text>
        </Pressable>
      ) : null}
      {record.canReact ? (
        <View style={styles.reactions}>
          {REACTIONS.map((item) => {
            const summary = record.reactions.find((reaction) => reaction.type === item.type);
            return (
              <Pressable key={item.type} onPress={() => react(item.type)} style={[styles.reaction, summary?.mine ? styles.mine : null]}>
                <Text style={styles.reactionText}>
                  {item.label}
                  {summary?.count ? ` ${summary.count}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    gap: 12,
    backgroundColor: colors.bg,
  },
  empty: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  date: {
    color: colors.muted,
  },
  types: {
    fontSize: 18,
    color: colors.text,
  },
  image: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    backgroundColor: colors.line,
  },
  video: {
    height: 88,
    borderRadius: 16,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  videoText: {
    color: colors.text,
    fontWeight: "600",
  },
  edit: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 16,
  },
  reactions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reaction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mine: {
    borderColor: colors.accent,
  },
  reactionText: {
    color: colors.text,
  },
  muted: {
    color: colors.muted,
  },
});
