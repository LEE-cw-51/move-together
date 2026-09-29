import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { CUSTOM_LABEL_MAX_LENGTH, normalizeCustomLabel } from "@/features/workout/exercises";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ThemedText } from "@/components/ThemedText";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { spacing, useColors } from "@/theme";

export default function AddExerciseSheet() {
  const { token } = useSession();
  const colors = useColors();
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = normalizeCustomLabel(label) != null;

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/me/exercises", { method: "POST", token, body: JSON.stringify({ label }) });
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: spacing.xl, gap: spacing.md, backgroundColor: colors.surface }}>
      <ThemedText variant="title">새 운동 추가</ThemedText>
      <ThemedText variant="callout" tone="muted">
        나만 쓰는 운동 목록에 저장돼요.
      </ThemedText>
      <TextField
        autoFocus
        maxLength={CUSTOM_LABEL_MAX_LENGTH}
        placeholder="예: 필라테스"
        returnKeyType="done"
        value={label}
        onChangeText={setLabel}
        onSubmitEditing={() => valid && save()}
      />
      {error ? (
        <ThemedText variant="footnote" tone="danger">
          {error}
        </ThemedText>
      ) : null}
      <Button label="저장" disabled={!valid} loading={busy} onPress={save} />
    </View>
  );
}
