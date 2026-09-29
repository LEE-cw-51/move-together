import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { readVideoDurationSeconds } from "@/features/media/duration";
import { validateNewMedia, type MediaKind } from "@/features/media/validate";
import { CUSTOM_EXERCISE_LIMIT, EXERCISE_TYPES, type ExerciseCode } from "@/features/workout/exercises";
import { Button } from "@/components/Button";
import { ExerciseIcon } from "@/components/ExerciseIcon";
import { ThemedText } from "@/components/ThemedText";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { radius, spacing, useColors } from "@/theme";
import type { UserExercise, WorkoutDetail } from "@/types";

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
  const navigation = useNavigation();
  const colors = useColors();
  const params = useLocalSearchParams<{ challengeId?: string; recordId?: string }>();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<ExerciseCode[]>([]);
  const [selectedCustom, setSelectedCustom] = useState<string[]>([]);
  const [myExercises, setMyExercises] = useState<UserExercise[]>([]);
  const [deleting, setDeleting] = useState<UserExercise | null>(null);
  const knownExerciseIds = useRef<Set<string> | null>(null);
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!params.recordId || !token) return;
    api<WorkoutDetail>(`/workouts/${params.recordId}`, { token })
      .then((record) => {
        setSelected(record.exerciseTypes);
        setSelectedCustom(record.customLabels);
      })
      .catch(() => undefined);
  }, [params.recordId, token]);

  // Reloads my list when returning from the add sheet; anything new is selected.
  const loadMyExercises = useCallback(async () => {
    if (!token) return;
    const result = await api<{ exercises: UserExercise[] }>("/me/exercises", { token });
    const known = knownExerciseIds.current;
    if (known) {
      const added = result.exercises.filter((item) => !known.has(item.id)).map((item) => item.label);
      if (added.length > 0) setSelectedCustom((current) => [...current, ...added]);
    }
    knownExerciseIds.current = new Set(result.exercises.map((item) => item.id));
    setMyExercises(result.exercises);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadMyExercises().catch(() => undefined);
    }, [loadMyExercises]),
  );

  function toggleCustom(label: string) {
    setDeleting(null);
    setSelectedCustom((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  }

  async function removeExercise(item: UserExercise) {
    try {
      await api(`/me/exercises/${item.id}`, { method: "DELETE", token });
      setSelectedCustom((current) => current.filter((label) => label !== item.label));
      setDeleting(null);
      await loadMyExercises();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "지우지 못했어요");
    }
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `${step} / 2`,
      headerLeft: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={step === 1 ? "닫기" : "이전 단계"}
          hitSlop={8}
          onPress={() => (step === 1 ? router.back() : setStep(1))}
          style={({ pressed }) => ({ padding: spacing.xs, opacity: pressed ? 0.6 : 1 })}
        >
          <MaterialCommunityIcons name={step === 1 ? "close" : "arrow-left"} size={24} color={colors.ink} />
        </Pressable>
      ),
    });
  }, [colors.ink, navigation, step]);

  function toggle(code: ExerciseCode) {
    setSelected((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  }

  async function addMedia(source: "library" | "camera") {
    setError("");
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("사진이나 영상을 고르려면 설정에서 권한을 허용해 주세요.");
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
      setError(validation.message);
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

  async function submit(withMedia: boolean) {
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
          body: JSON.stringify({ exerciseTypes: selected, customLabels: selectedCustom }),
        });
      } else {
        const created = await api<{ id: string }>(`/challenges/${params.challengeId}/workouts`, {
          method: "POST",
          token,
          body: JSON.stringify({ exerciseTypes: selected, customLabels: selectedCustom }),
        });
        recordId = created.id;
      }
      for (const item of withMedia ? media : []) {
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
      if (params.recordId) router.back();
      else router.replace("/workout/done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "기록을 저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.gutter, gap: spacing.xl }}>
        {step === 1 ? (
          <>
            <View style={{ gap: spacing.xs }}>
              <ThemedText variant="largeTitle">오늘 뭐 했어?</ThemedText>
              <ThemedText variant="callout" tone="muted">
                여러 개 골라도 돼요
              </ThemedText>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {EXERCISE_TYPES.map((item) => {
                const active = selected.includes(item.code);
                return (
                  <Pressable
                    key={item.code}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    onPress={() => toggle(item.code)}
                    style={({ pressed }) => ({
                      flexBasis: "48%",
                      flexGrow: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                      minHeight: 60,
                      paddingHorizontal: spacing.lg,
                      borderRadius: radius.lg,
                      borderCurve: "continuous",
                      backgroundColor: active ? colors.meSoft : colors.surface,
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <ExerciseIcon code={item.code} size={24} color={active ? colors.me : colors.inkMuted} />
                    <ThemedText variant="headline" tone={active ? "me" : "ink"} style={{ flex: 1 }}>
                      {item.label}
                    </ThemedText>
                    {active ? <MaterialCommunityIcons name="check" size={20} color={colors.me} /> : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={{ gap: spacing.md }}>
              <ThemedText variant="headline">내 운동</ThemedText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {myExercises.map((item) => {
                  const active = selectedCustom.includes(item.label);
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                      accessibilityHint="길게 누르면 목록에서 지울 수 있어요"
                      onPress={() => toggleCustom(item.label)}
                      onLongPress={() => setDeleting(item)}
                      style={({ pressed }) => ({
                        flexBasis: "48%",
                        flexGrow: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.md,
                        minHeight: 60,
                        paddingHorizontal: spacing.lg,
                        borderRadius: radius.lg,
                        borderCurve: "continuous",
                        backgroundColor: active ? colors.meSoft : colors.surface,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <MaterialCommunityIcons
                        name="star-four-points-outline"
                        size={22}
                        color={active ? colors.me : colors.inkMuted}
                      />
                      <ThemedText variant="headline" tone={active ? "me" : "ink"} numberOfLines={1} style={{ flex: 1 }}>
                        {item.label}
                      </ThemedText>
                      {active ? <MaterialCommunityIcons name="check" size={20} color={colors.me} /> : null}
                    </Pressable>
                  );
                })}
                {myExercises.length < CUSTOM_EXERCISE_LIMIT ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="운동 직접 추가"
                    onPress={() => router.push("/workout/exercise-add")}
                    style={({ pressed }) => ({
                      flexBasis: "48%",
                      flexGrow: myExercises.length % 2 === 0 ? 0 : 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                      minHeight: 60,
                      paddingHorizontal: spacing.lg,
                      borderRadius: radius.lg,
                      borderCurve: "continuous",
                      borderWidth: 1,
                      borderStyle: "dashed",
                      borderColor: colors.hairline,
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <MaterialCommunityIcons name="plus" size={22} color={colors.me} />
                    <ThemedText variant="headline" tone="me">
                      직접 추가
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
              {deleting ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                    padding: spacing.md,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surface,
                  }}
                >
                  <ThemedText variant="subhead" style={{ flex: 1 }}>
                    {`${deleting.label}${objectParticle(deleting.label)} 내 운동에서 지울까요? 지난 기록은 그대로 남아요.`}
                  </ThemedText>
                  <Button label="취소" variant="ghost" size="md" onPress={() => setDeleting(null)} />
                  <Button label="지우기" variant="secondary" size="md" onPress={() => removeExercise(deleting)} />
                </View>
              ) : (
                <ThemedText variant="footnote" tone="muted">
                  내가 만든 운동은 나에게만 보여요. 길게 누르면 지울 수 있어요.
                </ThemedText>
              )}
            </View>
          </>
        ) : (
          <>
            <View style={{ gap: spacing.xs }}>
              <ThemedText variant="largeTitle">오늘 운동한 순간을{"\n"}남겨보세요</ThemedText>
              <ThemedText variant="callout" tone="muted">
                사진 또는 10초 이내 영상, 최대 3개까지. 남기지 않아도 괜찮아요.
              </ThemedText>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {media.map((item) => (
                <Pressable
                  key={item.uri}
                  accessibilityRole="button"
                  accessibilityLabel="이 사진 빼기"
                  onPress={() => setMedia((current) => current.filter((entry) => entry.uri !== item.uri))}
                  style={{ flex: 1 }}
                >
                  {item.kind === "image" ? (
                    <Image
                      source={{ uri: item.uri }}
                      contentFit="cover"
                      style={{ aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.sunken }}
                    />
                  ) : (
                    <View
                      style={{
                        aspectRatio: 1,
                        borderRadius: radius.md,
                        backgroundColor: colors.sunken,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <MaterialCommunityIcons name="play-circle" size={28} color={colors.inkMuted} />
                    </View>
                  )}
                </Pressable>
              ))}
              {media.length < 3 ? <AddTile icon="image-plus" label="앨범" onPress={() => addMedia("library")} /> : null}
              {media.length < 2 ? <AddTile icon="camera-outline" label="카메라" onPress={() => addMedia("camera")} /> : null}
              {media.length === 0 ? <View style={{ flex: 1 }} /> : null}
            </View>
          </>
        )}
        {error ? (
          <ThemedText variant="footnote" tone="danger">
            {error}
          </ThemedText>
        ) : null}
      </ScrollView>

      <View style={{ padding: spacing.gutter, paddingTop: spacing.sm, gap: spacing.sm }}>
        {step === 1 ? (
          <Button
            label="다음"
            disabled={selected.length + selectedCustom.length === 0}
            onPress={() => setStep(2)}
          />
        ) : (
          <>
            <Button label="완료" disabled={media.length === 0} loading={busy} onPress={() => submit(true)} />
            <Button label="사진 없이 완료" variant="secondary" disabled={busy} onPress={() => submit(false)} />
          </>
        )}
      </View>
    </View>
  );
}

// 을 after a final consonant (받침), 를 otherwise; non-Hangul endings get 를.
function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? "을" : "를";
}

function AddTile({
  icon,
  label,
  onPress,
}: {
  icon: "image-plus" | "camera-outline";
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}에서 추가`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        aspectRatio: 1,
        borderRadius: radius.md,
        borderCurve: "continuous",
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <MaterialCommunityIcons name={icon} size={28} color={colors.me} />
      <ThemedText variant="footnote">{label}</ThemedText>
    </Pressable>
  );
}
