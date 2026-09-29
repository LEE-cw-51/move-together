import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { ThemedText } from "@/components/ThemedText";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { spacing } from "@/theme";
import type { InvitePreview } from "@/types";

export default function AcceptInviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { token, status } = useSession();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "signedOut") {
      router.replace("/(auth)/login");
      return;
    }
    if (status !== "ready" || !token || !code) return;
    api<InvitePreview>(`/invites/${encodeURIComponent(code)}`, { token })
      .then(setPreview)
      .catch((err) => setError(err instanceof ApiError ? err.message : "초대를 찾지 못했어요"));
  }, [code, status, token]);

  async function accept() {
    setBusy(true);
    try {
      await api("/invites/accept", { method: "POST", token, body: JSON.stringify({ code }) });
      router.replace("/(main)");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "참여하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.lg }}>
        {preview ? (
          <>
            <ThemedText variant="largeTitle">{preview.inviterDisplayName}님의 초대</ThemedText>
            <ThemedText variant="callout" tone="muted">
              {preview.challengeName}에서 오늘 움직였는지만 함께 확인해요.
            </ThemedText>
            <Button
              label={busy ? "참여하는 중" : "함께하기"}
              disabled={busy || preview.status !== "pending"}
              onPress={accept}
            />
          </>
        ) : (
          <ThemedText variant="callout" tone="muted">
            {error || "초대를 확인하고 있어요"}
          </ThemedText>
        )}
        {error && preview ? (
          <ThemedText variant="footnote" tone="danger">
            {error}
          </ThemedText>
        ) : null}
      </View>
    </Screen>
  );
}
