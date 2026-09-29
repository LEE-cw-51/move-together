import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import {
  connectDemoPartner,
  devToolsEnabled,
  resetToday,
  seedDemoHistory,
  toggleDemoPartnerToday,
} from "@/features/dev/tools";
import { Button } from "@/components/Button";
import { ThemedText } from "@/components/ThemedText";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { radius, spacing, useColors } from "@/theme";

export default function SettingsScreen() {
  const { user, token, signOut } = useSession();
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setResult("");
    try {
      setResult(await action());
    } catch (err) {
      setResult(err instanceof ApiError ? err.message : "실행하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.gutter, gap: spacing.xl }}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          padding: spacing.lg,
          gap: spacing.xs,
        }}
      >
        <ThemedText variant="headline">{user?.displayName ?? ""}</ThemedText>
        <ThemedText variant="subhead" tone="muted">
          {user?.email ?? ""}
        </ThemedText>
      </View>

      {devToolsEnabled ? (
        <View style={{ gap: spacing.sm }}>
          <ThemedText variant="headline">개발자 도구</ThemedText>
          <ThemedText variant="footnote" tone="muted">
            개발 빌드에서만 보여요. 혼자서 모든 화면을 확인할 때 써요.
          </ThemedText>
          <Button
            label="가짜 상대와 연결"
            variant="secondary"
            disabled={busy}
            onPress={() => run(async () => (await connectDemoPartner(token), "데모 상대와 연결했어요"))}
          />
          <Button
            label="상대 오늘 운동 완료/취소"
            variant="secondary"
            disabled={busy}
            onPress={() =>
              run(async () =>
                (await toggleDemoPartnerToday(token)).partnerCompleted
                  ? "상대가 오늘 운동을 마쳤어요"
                  : "상대의 오늘 운동을 지웠어요",
              )
            }
          />
          <Button
            label="지난 30일 기록 채우기"
            variant="secondary"
            disabled={busy}
            onPress={() => run(async () => `기록 ${(await seedDemoHistory(token)).inserted}개를 만들었어요`)}
          />
          <Button
            label="오늘 기록 초기화"
            variant="secondary"
            disabled={busy}
            onPress={() => run(async () => (await resetToday(token), "오늘 운동, 찌르기, 축하 화면을 초기화했어요"))}
          />
          {result ? (
            <ThemedText variant="footnote" tone="muted">
              {result}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      <Button
        label="로그아웃"
        variant="ghost"
        onPress={() => signOut().then(() => router.replace("/(auth)/login"))}
      />
    </ScrollView>
  );
}
