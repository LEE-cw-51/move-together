import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { exerciseLabels } from "@/features/workout/exercises";
import { homePhase, nudgePresentation } from "@/features/challenge/status";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { colors } from "@/components/theme";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { HomeResponse } from "@/types";

export default function HomeScreen() {
  const { token, user, signOut } = useSession();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const next = await api<HomeResponse>("/home", { token });
      setHome(next);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "홈을 불러오지 못했어요");
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  async function createInvite() {
    setBusy(true);
    try {
      await api("/challenges", { method: "POST", token });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "초대를 만들지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  async function sendNudge(receiverId: string) {
    if (!home?.challenge) return;
    setBusy(true);
    try {
      await api(`/challenges/${home.challenge.id}/nudges`, {
        method: "POST",
        token,
        body: JSON.stringify({ receiverId }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "찌르지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  const challenge = home?.challenge ?? null;
  const me = challenge?.members.find((member) => member.isMe) ?? null;
  const other = challenge?.members.find((member) => !member.isMe) ?? null;
  const phase = homePhase({
    hasChallenge: Boolean(challenge),
    hasOtherMember: Boolean(other),
    meCompleted: Boolean(me?.today.completed),
    otherCompleted: Boolean(other?.today.completed),
  });
  const nudgeUi = other
    ? nudgePresentation({
        hasOtherMember: true,
        otherCompleted: other.today.completed,
        alreadyNudged: challenge?.nudges.some((item) => item.receiverId === other.userId && item.alreadyNudged) ?? false,
      })
    : null;

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>{user?.displayName}</Text>
          <Text style={styles.title}>{challenge?.name ?? "무브 투게더"}</Text>
        </View>
        <Pressable onPress={() => router.push("/(main)/notifications")}>
          <Text style={styles.link}>알림</Text>
        </Pressable>
      </View>

      {!home ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      ) : (
        <View style={styles.fill}>
          {challenge ? (
            <View style={styles.streak}>
              <Text style={styles.streakNumber}>{challenge.streak}</Text>
              <Text style={styles.streakLabel}>함께한 날</Text>
              {challenge.todayInProgress ? <Text style={styles.progress}>오늘은 진행 중</Text> : null}
            </View>
          ) : (
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>둘만의 오늘</Text>
              <Text style={styles.heroBody}>연결하면 오늘 움직였는지만 서로 확인해요.</Text>
            </View>
          )}

          <View style={styles.actions}>
            {phase.phase === "disconnected" ? (
              <>
                <Button label={busy ? "만드는 중" : "초대 링크 만들기"} disabled={busy} onPress={createInvite} />
                <Button label="코드 입력" tone="quiet" onPress={() => router.push("/(main)/connect")} />
              </>
            ) : null}

            {challenge && me ? (
              <MemberRow
                name={me.displayName}
                detail={
                  me.today.completed
                    ? `${exerciseLabels(me.today.exerciseTypes)}${me.today.mediaCount ? ` · ${me.today.mediaCount}개` : ""}`
                    : "아직이에요"
                }
                actionLabel={me.today.completed ? "기록 보기" : "운동 완료"}
                onPress={() =>
                  me.today.recordId
                    ? router.push(`/workout/${me.today.recordId}`)
                    : router.push({ pathname: "/workout/complete", params: { challengeId: challenge.id } })
                }
              />
            ) : null}

            {other ? (
              <MemberRow
                name={other.displayName}
                detail={
                  other.today.completed
                    ? `${exerciseLabels(other.today.exerciseTypes)}${other.today.mediaCount ? ` · ${other.today.mediaCount}개` : ""}`
                    : "아직이에요"
                }
                actionLabel={other.today.completed ? (other.today.recordId ? "기록 보기" : undefined) : nudgeUi?.label}
                disabled={Boolean(nudgeUi && !other.today.completed && !nudgeUi.enabled)}
                onPress={
                  other.today.completed && other.today.recordId
                    ? () => router.push(`/workout/${other.today.recordId}`)
                    : nudgeUi?.enabled
                      ? () => sendNudge(other.userId)
                      : undefined
                }
              />
            ) : challenge ? (
              <View style={styles.wait}>
                <Text style={styles.waitText}>함께할 사람을 기다리는 중</Text>
                {challenge.pendingInvite ? <Text style={styles.code}>{challenge.pendingInvite.code}</Text> : null}
                {challenge.pendingInvite ? (
                  <Button
                    label="코드 보내기"
                    tone="quiet"
                    onPress={() =>
                      Share.share({
                        message: `무브 투게더에서 함께해요. 코드 ${challenge.pendingInvite?.code}`,
                      })
                    }
                  />
                ) : null}
              </View>
            ) : null}

            {phase.phase === "both" ? <Text style={styles.banner}>{phase.banner}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </View>
      )}
      <Pressable onPress={() => signOut().then(() => router.replace("/(auth)/login"))}>
        <Text style={styles.signOut}>로그아웃</Text>
      </Pressable>
    </Screen>
  );
}

function MemberRow({
  name,
  detail,
  actionLabel,
  onPress,
  disabled,
}: {
  name: string;
  detail: string;
  actionLabel?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      {actionLabel && onPress ? (
        <Pressable disabled={disabled} onPress={onPress} style={[styles.smallButton, disabled ? styles.smallDisabled : null]}>
          <Text style={[styles.smallLabel, disabled ? styles.smallDisabledText : null]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 8,
  },
  kicker: {
    color: colors.muted,
    fontSize: 14,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  link: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "600",
    paddingTop: 8,
  },
  fill: {
    flex: 1,
    justifyContent: "center",
    gap: 18,
  },
  streak: {
    alignItems: "center",
  },
  streakNumber: {
    fontSize: 64,
    lineHeight: 72,
    fontWeight: "700",
    color: colors.text,
  },
  streakLabel: {
    color: colors.muted,
    fontSize: 16,
  },
  progress: {
    marginTop: 4,
    color: colors.good,
    fontSize: 14,
  },
  hero: {
    gap: 6,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  heroBody: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
  },
  actions: {
    gap: 10,
  },
  row: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  detail: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 14,
  },
  smallButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  smallLabel: {
    color: colors.accentText,
    fontWeight: "700",
  },
  smallDisabled: {
    backgroundColor: colors.disabled,
  },
  smallDisabledText: {
    color: colors.disabledText,
  },
  wait: {
    gap: 8,
    alignItems: "center",
  },
  waitText: {
    color: colors.muted,
  },
  code: {
    fontSize: 28,
    letterSpacing: 4,
    fontWeight: "700",
    color: colors.text,
  },
  banner: {
    textAlign: "center",
    color: colors.good,
    backgroundColor: colors.goodSoft,
    overflow: "hidden",
    borderRadius: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "700",
  },
  error: {
    color: colors.accent,
    textAlign: "center",
  },
  signOut: {
    textAlign: "center",
    color: colors.muted,
    paddingVertical: 8,
  },
});
