import { useCallback, useLayoutEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { monthTitle, monthWeeks, seoulDateKey, shiftMonth } from "@/features/history/calendar";
import { PairDot } from "@/components/PairDot";
import { ThemedText } from "@/components/ThemedText";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { radius, spacing, useColors } from "@/theme";
import type { HistoryDay, HistoryResponse, HomeResponse } from "@/types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function HistoryScreen() {
  const { token } = useSession();
  const navigation = useNavigation();
  const colors = useColors();
  const today = seoulDateKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const nextHome = await api<HomeResponse>("/home", { token });
      setHome(nextHome);
      if (!nextHome.challenge) return;
      setHistory(
        await api<HistoryResponse>(`/challenges/${nextHome.challenge.id}/history?month=${month}`, { token }),
      );
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "기록을 불러오지 못했어요");
    }
  }, [month, token]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const streak = home?.challenge?.streak ?? 0;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingRight: spacing.gutter }}>
          <PairDot me partner size={14} />
          <ThemedText variant="subhead">함께한 날 {streak}일</ThemedText>
        </View>
      ),
    });
  }, [navigation, streak]);

  const partnerName = home?.challenge?.members.find((member) => !member.isMe)?.displayName ?? "상대";
  const byDate = new Map((history?.month === month ? history.days : []).map((day) => [day.date, day]));
  const isCurrentMonth = month >= today.slice(0, 7);

  function openDay(day: HistoryDay) {
    const mine = day.members.find((member) => member.isMe);
    const theirs = day.members.find((member) => !member.isMe);
    router.push({
      pathname: "/(main)/history/[date]",
      params: {
        date: day.date,
        meRecordId: mine?.recordId ?? "",
        partnerRecordId: theirs?.recordId ?? "",
        partnerName,
      },
    });
  }

  if (home && !home.challenge) {
    return (
      <View style={{ flex: 1, padding: spacing.gutter, justifyContent: "center", backgroundColor: colors.bg }}>
        <ThemedText variant="callout" tone="muted">
          연결하면 둘의 운동 기록이 여기 쌓여요.
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.gutter, paddingTop: spacing.sm, gap: spacing.lg }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <MonthButton icon="chevron-left" label="이전 달" onPress={() => setMonth(shiftMonth(month, -1))} />
        <ThemedText variant="headline">{monthTitle(month)}</ThemedText>
        <MonthButton
          icon="chevron-right"
          label="다음 달"
          disabled={isCurrentMonth}
          onPress={() => setMonth(shiftMonth(month, 1))}
        />
      </View>

      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          borderCurve: "continuous",
          padding: spacing.md,
          gap: spacing.xs,
        }}
      >
        <View style={{ flexDirection: "row" }}>
          {WEEKDAYS.map((label) => (
            <ThemedText key={label} variant="caption" tone="muted" style={{ flex: 1, textAlign: "center" }}>
              {label}
            </ThemedText>
          ))}
        </View>
        {monthWeeks(month).map((week, index) => (
          <View key={index} style={{ flexDirection: "row" }}>
            {week.map((cell, cellIndex) => {
              if (!cell) return <View key={cellIndex} style={{ flex: 1 }} />;
              const day = byDate.get(cell.date);
              const mine = Boolean(day?.members.some((member) => member.isMe));
              const theirs = Boolean(day?.members.some((member) => !member.isMe));
              const isToday = cell.date === today;
              const future = cell.date > today;
              return (
                <Pressable
                  key={cell.date}
                  accessibilityRole="button"
                  accessibilityLabel={`${cell.day}일${day ? (day.mutual ? ", 둘 다 운동" : mine ? ", 나만 운동" : ", 상대만 운동") : ""}`}
                  disabled={!day}
                  onPress={() => day && openDay(day)}
                  style={({ pressed }) => ({
                    flex: 1,
                    alignItems: "center",
                    gap: spacing.xs,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.md,
                    backgroundColor: pressed ? colors.sunken : "transparent",
                  })}
                >
                  <ThemedText
                    variant={isToday ? "headline" : "subhead"}
                    tone={isToday ? "me" : future ? "muted" : "ink"}
                  >
                    {cell.day}
                  </ThemedText>
                  {day ? <PairDot me={mine} partner={theirs} size={14} /> : <View style={{ height: 14 }} />}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg, rowGap: spacing.sm }}>
        <Legend me partner label="둘 다 운동" />
        <Legend me partner={false} label="나만" />
        <Legend me={false} partner label={`${partnerName}님만`} />
      </View>

      {!history && !error ? <ActivityIndicator color={colors.me} /> : null}
      {error ? (
        <ThemedText variant="footnote" tone="danger">
          {error}
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}

function MonthButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: "chevron-left" | "chevron-right";
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.full,
        backgroundColor: colors.surface,
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <MaterialCommunityIcons name={icon} size={24} color={colors.ink} />
    </Pressable>
  );
}

function Legend({ me, partner, label }: { me: boolean; partner: boolean; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
      <PairDot me={me} partner={partner} size={12} />
      <ThemedText variant="footnote" tone="muted">
        {label}
      </ThemedText>
    </View>
  );
}
