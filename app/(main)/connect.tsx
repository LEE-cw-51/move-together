import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { colors } from "@/components/theme";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { InvitePreview } from "@/types";

export default function ConnectScreen() {
  const { token } = useSession();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookup() {
    setBusy(true);
    setError("");
    try {
      const next = await api<InvitePreview>(`/invites/${encodeURIComponent(code.trim())}`, { token });
      setPreview(next);
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : "초대를 찾지 못했어요");
    } finally {
      setBusy(false);
    }
  }

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
    <Screen>
      <View style={styles.wrap}>
        <Text style={styles.title}>받은 코드를 입력해요</Text>
        <TextInput
          autoCapitalize="characters"
          placeholder="초대 코드"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={code}
          onChangeText={setCode}
        />
        <Button label={busy ? "확인 중" : "코드 확인"} disabled={busy || code.trim().length < 4} onPress={lookup} />
        {preview ? (
          <View style={styles.card}>
            <Text style={styles.name}>{preview.inviterDisplayName}</Text>
            <Text style={styles.meta}>{preview.challengeName}</Text>
            <Text style={styles.meta}>{preview.status === "pending" ? "수락할 수 있어요" : "사용할 수 없는 초대예요"}</Text>
            {preview.status === "pending" ? <Button label="함께하기" disabled={busy} onPress={accept} /> : null}
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: 16,
    fontSize: 20,
    letterSpacing: 2,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  meta: {
    color: colors.muted,
  },
  error: {
    color: colors.accent,
  },
});
