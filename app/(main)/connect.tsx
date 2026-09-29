import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ThemedText } from "@/components/ThemedText";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { radius, spacing, useColors } from "@/theme";
import type { InvitePreview } from "@/types";

export default function ConnectScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { token } = useSession();
  const colors = useColors();
  const [code, setCode] = useState(params.code ?? "");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const lookup = useCallback(
    async (value: string) => {
      setBusy(true);
      setError("");
      try {
        setPreview(await api<InvitePreview>(`/invites/${encodeURIComponent(value.trim())}`, { token }));
      } catch (err) {
        setPreview(null);
        setError(err instanceof ApiError ? err.message : "초대를 찾지 못했어요");
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (params.code && token) lookup(params.code).catch(() => undefined);
  }, [lookup, params.code, token]);

  async function accept() {
    if (!preview) return;
    setBusy(true);
    try {
      await api("/invites/accept", {
        method: "POST",
        token,
        body: JSON.stringify({ code: preview.code }),
      });
      router.replace("/(main)");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "참여하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.gutter, gap: spacing.md }}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText variant="title">받은 코드를 입력해요</ThemedText>
      <TextField
        autoCapitalize="characters"
        placeholder="초대 코드"
        value={code}
        onChangeText={setCode}
        style={{ letterSpacing: 2 }}
      />
      <Button
        label={busy && !preview ? "확인 중" : "코드 확인"}
        variant={preview ? "secondary" : "primary"}
        disabled={busy || code.trim().length < 4}
        onPress={() => lookup(code)}
      />
      {preview ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderCurve: "continuous",
            padding: spacing.lg,
            gap: spacing.sm,
          }}
        >
          <ThemedText variant="headline" tone="partner">
            {preview.inviterDisplayName}
          </ThemedText>
          <ThemedText variant="subhead" tone="muted">
            {preview.status === "pending" ? `${preview.challengeName}에 함께할 수 있어요` : "사용할 수 없는 초대예요"}
          </ThemedText>
          {preview.status === "pending" ? <Button label="함께하기" loading={busy} onPress={accept} /> : null}
        </View>
      ) : null}
      {error ? (
        <ThemedText variant="footnote" tone="danger">
          {error}
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}
