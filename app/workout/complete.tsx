import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { readVideoDurationSeconds } from "@/features/media/duration";
import { validateNewMedia, type MediaKind } from "@/features/media/validate";
import { EXERCISE_TYPES, type ExerciseCode } from "@/features/workout/exercises";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { colors } from "@/components/theme";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { WorkoutDetail } from "@/types";

type PendingMedia = {
  uri: string;
  kind: MediaKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
};

export default function CompleteWorkoutScreen() {
  const { token } = useSession();
  const params = useLocalSearchParams<{ challengeId?: string; recordId?: string }>();
  const [selected, setSelected] = useState<ExerciseCode[]>([]);

  useEffect(() => {
    if (!params.recordId || !token) return;
    api<WorkoutDetail>(`/workouts/${params.recordId}`, { token })
      .then((record) => setSelected(record.exerciseTypes))
      .catch(() => undefined);
  }, [params.recordId, token]);
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(code: ExerciseCode) {
    setSelected((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  }

  async function addMedia(source: "library" | "camera") {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("권한이 필요해요", "사진이나 영상을 고르려면 권한을 허용해 주세요.");
      return;
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 0.8, videoMaxDuration: 10 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const kind: MediaKind = asset.type === "video" ? "video" : "image";
    const durationSeconds = kind === "video" ? await readVideoDurationSeconds(asset.uri) : null;
    const validation = validateNewMedia({
      kind,
      sizeBytes: asset.fileSize ?? 1,
      durationSeconds,
      existingCount: media.length,
    });
    if (!validation.ok) {
      Alert.alert("올릴 수 없어요", validation.message);
      return;
    }
    setMedia((current) => [
      ...current,
      {
        uri: asset.uri,
        kind,
        fileName: asset.fileName ?? (kind === "video" ? "clip.mp4" : "photo.jpg"),
        mimeType: asset.mimeType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
        sizeBytes: asset.fileSize ?? 1,
        durationSeconds,
      },
    ]);
  }

  async function submit() {
    if (!params.challengeId && !params.recordId) {
      setError("운동 정보를 찾지 못했어요");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let recordId = params.recordId;
      if (recordId) {
        await api(`/workouts/${recordId}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ exerciseTypes: selected }),
        });
      } else {
        const created = await api<{ id: string }>(`/challenges/${params.challengeId}/workouts`, {
          method: "POST",
          token,
          body: JSON.stringify({ exerciseTypes: selected }),
        });
        recordId = created.id;
      }
      for (const item of media) {
        const form = new FormData();
        form.append("type", item.kind);
        if (item.durationSeconds != null) form.append("durationSeconds", String(item.durationSeconds));
        form.append("file", {
          uri: item.uri,
          name: item.fileName,
          type: item.mimeType,
        } as unknown as Blob);
        await api(`/workouts/${recordId}/media`, { method: "POST", token, body: form });
      }
      router.replace(`/workout/${recordId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "기록을 저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.wrap}>
        <Text style={styles.title}>오늘 무엇을 했나요</Text>
        <Text style={styles.help}>하나 이상 골라 주세요. 사진과 영상은 선택이에요.</Text>
        <View style={styles.chips}>
          {EXERCISE_TYPES.map((item) => {
            const active = selected.includes(item.code);
            return (
              <Pressable
                key={item.code}
                onPress={() => toggle(item.code)}
                style={[styles.chip, active ? styles.chipOn : null]}
              >
                <Text style={[styles.chipText, active ? styles.chipTextOn : null]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.help}>사진·영상 {media.length}/3 · 영상은 10초 이하</Text>
        <View style={styles.row}>
          <Button label="앨범" tone="quiet" disabled={media.length >= 3} onPress={() => addMedia("library")} />
          <Button label="카메라" tone="quiet" disabled={media.length >= 3} onPress={() => addMedia("camera")} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={busy ? "저장 중" : "기록하기"} disabled={busy || selected.length === 0} onPress={submit} />
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
  help: {
    color: colors.muted,
    fontSize: 15,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontWeight: "600",
  },
  chipTextOn: {
    color: colors.accentText,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  error: {
    color: colors.accent,
  },
});
