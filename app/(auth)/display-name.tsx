import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { ThemedText } from "@/components/ThemedText";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { spacing } from "@/theme";
import type { PublicUser } from "@/types";

export default function DisplayNameScreen() {
  const { token, setUser } = useSession();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: PublicUser }>("/me/display-name", {
        method: "POST",
        token,
        body: JSON.stringify({ displayName: name }),
      });
      setUser(result.user);
      router.replace("/(main)");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "이름을 저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <ThemedText variant="largeTitle">어떻게 부를까요?</ThemedText>
          <ThemedText variant="callout" tone="muted">
            이 이름이 함께하는 사람에게 보여요.
          </ThemedText>
        </View>
        <TextField maxLength={20} placeholder="이름" value={name} onChangeText={setName} />
        {error ? (
          <ThemedText variant="footnote" tone="danger">
            {error}
          </ThemedText>
        ) : null}
        <Button label={busy ? "저장 중" : "시작하기"} disabled={busy || name.trim().length < 1} onPress={save} />
      </View>
    </Screen>
  );
}
