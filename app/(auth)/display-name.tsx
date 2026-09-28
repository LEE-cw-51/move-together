import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { colors } from "@/components/theme";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
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
      <View style={styles.center}>
        <Text style={styles.title}>어떻게 부를까요?</Text>
        <Text style={styles.body}>이 이름이 함께하는 사람에게 보여요.</Text>
        <TextInput
          maxLength={20}
          placeholder="이름"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={name}
          onChangeText={setName}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={busy ? "저장 중" : "시작하기"} disabled={busy || name.trim().length < 1} onPress={save} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    gap: 14,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
  },
  body: {
    fontSize: 16,
    color: colors.muted,
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    minHeight: 52,
    fontSize: 17,
    color: colors.text,
  },
  error: {
    color: colors.accent,
  },
});
