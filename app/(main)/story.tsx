import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { workoutLabels } from "@/features/workout/exercises";
import { ReactionBar } from "@/components/ReactionBar";
import { ThemedText } from "@/components/ThemedText";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { radius, spacing, useColors } from "@/theme";
import type { MediaItem, ReactionType, WorkoutDetail } from "@/types";

const PHOTO_MS = 5000;
const TICK_MS = 50;

function timeOfDay(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace("/(main)");
}

// Today's photos and short videos, full screen: tap right for next, left for
// previous, hold to pause, swipe down to close. Past days use the album instead.
export default function StoryScreen() {
  const params = useLocalSearchParams<{ recordId: string; start?: string }>();
  const { token } = useSession();
  const colors = useColors();
  const [record, setRecord] = useState<WorkoutDetail | null>(null);
  const [index, setIndex] = useState(Number(params.start ?? 0) || 0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !params.recordId) return;
    api<WorkoutDetail>(`/workouts/${params.recordId}`, { token })
      .then(setRecord)
      .catch((err) => setError(err instanceof ApiError ? err.message : "사진을 불러오지 못했어요"));
  }, [params.recordId, token]);

  const items = record?.media ?? [];
  const item: MediaItem | undefined = items[index];

  const next = useCallback(() => {
    setProgress(0);
    if (index + 1 >= items.length) close();
    else setIndex(index + 1);
  }, [index, items.length]);

  const previous = useCallback(() => {
    setProgress(0);
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  // Photos advance on a timer; videos report their own progress.
  useEffect(() => {
    if (!item || item.type !== "image" || paused) return;
    const timer = setInterval(() => setProgress((value) => Math.min(1, value + TICK_MS / PHOTO_MS)), TICK_MS);
    return () => clearInterval(timer);
  }, [item, paused]);

  useEffect(() => {
    if (progress >= 1) next();
  }, [next, progress]);

  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 80) close();
        },
      }),
    [],
  );

  async function react(type: ReactionType) {
    if (!record) return;
    try {
      await api(`/workouts/${record.id}/reactions`, { method: "POST", token, body: JSON.stringify({ type }) });
      setRecord(await api<WorkoutDetail>(`/workouts/${record.id}`, { token }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "반응을 남기지 못했어요");
    }
  }

  const name = record ? (record.canReact ? record.displayName : "나") : "";
  const labels = record ? workoutLabels(record.exerciseTypes, record.customLabels) : "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.story }} {...swipe.panHandlers}>
      <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, justifyContent: "center" }}>
        {item?.type === "image" ? (
          <Image source={{ uri: item.url }} contentFit="contain" style={{ width: "100%", height: "100%" }} />
        ) : item?.type === "video" ? (
          <StoryVideo key={item.id} url={item.url} paused={paused} onProgress={setProgress} />
        ) : (
          <ThemedText variant="callout" tone="onStory" style={{ textAlign: "center", opacity: 0.7 }}>
            {error || (record ? "올린 사진이 없어요" : "불러오는 중")}
          </ThemedText>
        )}
      </View>

      <View style={{ flex: 1, flexDirection: "row" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전"
          style={{ flex: 1 }}
          onPress={previous}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음"
          style={{ flex: 2 }}
          onPress={next}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
        />
      </View>

      <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md }} pointerEvents="box-none">
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            {items.map((media, position) => (
              <View
                key={media.id}
                style={{ flex: 1, height: 3, borderRadius: radius.full, backgroundColor: colors.storyTrack, overflow: "hidden" }}
              >
                <View
                  style={{
                    height: 3,
                    width: `${(position < index ? 1 : position === index ? progress : 0) * 100}%`,
                    backgroundColor: colors.onStory,
                  }}
                />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="headline" tone="onStory" numberOfLines={1}>
                {name}
              </ThemedText>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <ThemedText variant="footnote" tone="onStory" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {labels}
                </ThemedText>
                <ThemedText variant="footnote" tone="onStory" style={{ opacity: 0.6 }}>
                  {timeOfDay(record?.completedAt ?? null)}
                </ThemedText>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="닫기" hitSlop={12} onPress={close}>
              <MaterialCommunityIcons name="close" size={28} color={colors.onStory} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {record ? (
        <SafeAreaView edges={["bottom"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
          <View style={{ padding: spacing.lg, gap: spacing.sm }}>
            {!record.canReact && record.reactions.some((reaction) => reaction.count > 0) ? (
              <ThemedText variant="footnote" tone="onStory" style={{ opacity: 0.75 }}>
                받은 반응
              </ThemedText>
            ) : null}
            <ReactionBar reactions={record.reactions} onReact={record.canReact ? react : undefined} />
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

function StoryVideo({
  url,
  paused,
  onProgress,
}: {
  url: string;
  paused: boolean;
  onProgress: (value: number) => void;
}) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
    instance.play();
  });
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (player.duration > 0) onProgressRef.current(Math.min(1, player.currentTime / player.duration));
    }, TICK_MS * 2);
    return () => clearInterval(timer);
  }, [player]);

  return <VideoView player={player} contentFit="contain" nativeControls={false} style={{ width: "100%", height: "100%" }} />;
}
