import { useCallback, useLayoutEffect, useState } from "react";
import { ScrollView } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { dayTitle } from "@/features/history/calendar";
import { MediaStrip } from "@/components/MediaStrip";
import { PersonCard } from "@/components/PersonCard";
import { ReactionBar } from "@/components/ReactionBar";
import { ThemedText } from "@/components/ThemedText";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { spacing, useColors } from "@/theme";
import type { ReactionType, WorkoutDetail } from "@/types";

export default function HistoryDayScreen() {
  const params = useLocalSearchParams<{
    date: string;
    meRecordId?: string;
    partnerRecordId?: string;
    partnerName?: string;
  }>();
  const { token } = useSession();
  const navigation = useNavigation();
  const colors = useColors();
  const [mine, setMine] = useState<WorkoutDetail | null>(null);
  const [theirs, setTheirs] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    if (params.date) navigation.setOptions({ title: dayTitle(params.date) });
  }, [navigation, params.date]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [me, partner] = await Promise.all([
        params.meRecordId ? api<WorkoutDetail>(`/workouts/${params.meRecordId}`, { token }) : null,
        params.partnerRecordId ? api<WorkoutDetail>(`/workouts/${params.partnerRecordId}`, { token }) : null,
      ]);
      setMine(me);
      setTheirs(partner);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "기록을 불러오지 못했어요");
    }
  }, [params.meRecordId, params.partnerRecordId, token]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  async function react(type: ReactionType) {
    if (!theirs) return;
    try {
      await api(`/workouts/${theirs.id}/reactions`, { method: "POST", token, body: JSON.stringify({ type }) });
      setTheirs(await api<WorkoutDetail>(`/workouts/${theirs.id}`, { token }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "반응을 남기지 못했어요");
    }
  }

  const partnerName = theirs?.displayName ?? params.partnerName ?? "상대";

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.gutter, gap: spacing.lg }}>
      <PersonCard
        who="me"
        name="나"
        done={Boolean(mine)}
        exerciseTypes={mine?.exerciseTypes}
        customLabels={mine?.customLabels}
        doneLabel="운동 완료"
        pendingLabel="쉬었어요"
      >
        {mine ? (
          <>
            <MediaStrip items={mine.media} onPress={() => router.push(`/workout/${mine.id}`)} />
            <ReactionBar reactions={mine.reactions} />
          </>
        ) : null}
      </PersonCard>
      <PersonCard
        who="partner"
        name={partnerName}
        done={Boolean(theirs)}
        exerciseTypes={theirs?.exerciseTypes}
        customLabels={theirs?.customLabels}
        doneLabel="운동 완료"
        pendingLabel="쉬었어요"
      >
        {theirs ? (
          <>
            <MediaStrip items={theirs.media} onPress={() => router.push(`/workout/${theirs.id}`)} />
            <ReactionBar reactions={theirs.reactions} onReact={theirs.canReact ? react : undefined} />
          </>
        ) : null}
      </PersonCard>
      {error ? (
        <ThemedText variant="footnote" tone="danger">
          {error}
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}
