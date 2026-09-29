import { useCallback, useLayoutEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, View } from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { homePhase, nudgePresentation } from "@/features/challenge/status";
import { hasCelebrated } from "@/features/celebration/seen";
import { connectDemoPartner, devToolsEnabled } from "@/features/dev/tools";
import { Button } from "@/components/Button";
import { MediaStrip } from "@/components/MediaStrip";
import { PairDot } from "@/components/PairDot";
import { PersonCard } from "@/components/PersonCard";
import { ReactionBar } from "@/components/ReactionBar";
import { TextField } from "@/components/TextField";
import { ThemedText } from "@/components/ThemedText";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { radius, spacing, useColors } from "@/theme";
import type { HomeMember, HomeResponse, ReactionType, WorkoutDetail } from "@/types";

type Records = Record<string, WorkoutDetail>;

export default function TodayScreen() {
  const { token } = useSession();
  const navigation = useNavigation();
  const colors = useColors();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [records, setRecords] = useState<Records>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const next = await api<HomeResponse>("/home", { token });
      setHome(next);
      setError("");
      const challenge = next.challenge;
      const bothDone =
        !!challenge && challenge.members.length === 2 && challenge.members.every((member) => member.today.completed);
      if (challenge && bothDone && !(await hasCelebrated(challenge.id, challenge.seoulDate))) {
        router.push({
          pathname: "/(main)/celebrate",
          params: { challengeId: challenge.id, seoulDate: challenge.seoulDate },
        });
      }
      const ids = challenge?.members.map((member) => member.today.recordId).filter((id): id is string => !!id) ?? [];
      const settled = await Promise.allSettled(ids.map((id) => api<WorkoutDetail>(`/workouts/${id}`, { token })));
      const details = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      setRecords(Object.fromEntries(details.map((detail) => [detail.id, detail])));
      if (settled.some((result) => result.status === "rejected")) {
        setError("운동 기록을 일부 불러오지 못했어요");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "오늘 상태를 불러오지 못했어요");
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const challenge = home?.challenge ?? null;
  const me = challenge?.members.find((member) => member.isMe) ?? null;
  const partner = challenge?.members.find((member) => !member.isMe) ?? null;
  const connected = Boolean(challenge && partner);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: connected ? "오늘" : "무브 투게더",
      // Must restate the themed style: setOptions replaces the layout's tabBarStyle.
      tabBarStyle: connected
        ? { backgroundColor: colors.surface, borderTopColor: colors.hairline }
        : { display: "none" },
      headerRight: () => (
        <View style={{ flexDirection: "row", gap: spacing.xs, paddingRight: spacing.md }}>
          {connected ? (
            <HeaderIcon name="bell-outline" label="알림" onPress={() => router.push("/(main)/notifications")} />
          ) : null}
          <HeaderIcon name="cog-outline" label="설정" onPress={() => router.push("/(main)/settings")} />
        </View>
      ),
    });
  }, [colors.hairline, colors.surface, connected, navigation]);

  async function nudge(receiver: HomeMember) {
    if (!challenge) return;
    setBusy(true);
    try {
      await api(`/challenges/${challenge.id}/nudges`, {
        method: "POST",
        token,
        body: JSON.stringify({ receiverId: receiver.userId }),
      });
      router.push({ pathname: "/(main)/nudge-sent", params: { name: receiver.displayName } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "찌르지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  function openStory(recordId: string, index: number) {
    router.push({ pathname: "/(main)/story", params: { recordId, start: String(index) } });
  }

  async function react(recordId: string, type: ReactionType) {
    try {
      await api(`/workouts/${recordId}/reactions`, { method: "POST", token, body: JSON.stringify({ type }) });
      const detail = await api<WorkoutDetail>(`/workouts/${recordId}`, { token });
      setRecords((current) => ({ ...current, [recordId]: detail }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "반응을 남기지 못했어요");
    }
  }

  if (!home) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        {error ? <ThemedText tone="muted">{error}</ThemedText> : <ActivityIndicator color={colors.me} />}
      </View>
    );
  }

  if (!challenge || !me || !partner) {
    return <ConnectBody home={home} onChanged={load} />;
  }

  const phase = homePhase({
    hasChallenge: true,
    hasOtherMember: true,
    meCompleted: me.today.completed,
    otherCompleted: partner.today.completed,
  });
  const nudgeUi = nudgePresentation({
    hasOtherMember: true,
    otherCompleted: partner.today.completed,
    alreadyNudged: challenge.nudges.some((item) => item.receiverId === partner.userId && item.alreadyNudged),
  });
  const myRecord = me.today.recordId ? records[me.today.recordId] : undefined;
  const partnerRecord = partner.today.recordId ? records[partner.today.recordId] : undefined;
  const reward = challenge.streak > 0 ? `${challenge.streak + 1}일째!` : "첫날이에요!";
  const statusLine =
    phase.phase === "both"
      ? "오늘은 둘 다 성공!"
      : phase.phase === "only_me"
        ? `나는 했어요. ${partner.displayName}님도 하면 ${reward}`
        : phase.phase === "only_other"
          ? `${partner.displayName}님은 했어요. 나만 하면 ${reward}`
          : "오늘은 둘 다 아직이에요";

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.gutter, paddingTop: spacing.sm, gap: spacing.lg }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingVertical: spacing.sm }}>
        <PairDot me={me.today.completed} partner={partner.today.completed} size={48} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <ThemedText variant="title">
            {challenge.streak > 0 ? `${challenge.streak}일째 같이 운동 중` : "오늘부터 같이 시작해요"}
          </ThemedText>
          <ThemedText variant="subhead" tone="muted">
            {statusLine}
          </ThemedText>
        </View>
      </View>

      <PersonCard
        who="me"
        name="나"
        done={me.today.completed}
        exerciseTypes={me.today.exerciseTypes}
        customLabels={me.today.customLabels}
      >
        {me.today.completed && myRecord ? (
          <>
            <MediaStrip items={myRecord.media} onPress={(_, index) => openStory(myRecord.id, index)} />
            <ReactionBar reactions={myRecord.reactions} />
          </>
        ) : null}
        {me.today.completed ? (
          me.today.recordId ? (
            <Button
              label="내 기록 보기"
              variant="ghost"
              size="md"
              onPress={() => router.push(`/workout/${me.today.recordId}`)}
              style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
            />
          ) : null
        ) : (
          <Button
            label="운동 완료"
            icon="plus"
            onPress={() => router.push({ pathname: "/workout/complete", params: { challengeId: challenge.id } })}
          />
        )}
      </PersonCard>

      <PersonCard
        who="partner"
        name={partner.displayName}
        done={partner.today.completed}
        exerciseTypes={partner.today.exerciseTypes}
        customLabels={partner.today.customLabels}
      >
        {partner.today.completed && partnerRecord ? (
          <>
            <ReactionBar reactions={partnerRecord.reactions} onReact={(type) => react(partnerRecord.id, type)} />
            <MediaStrip items={partnerRecord.media} onPress={(_, index) => openStory(partnerRecord.id, index)} />
          </>
        ) : nudgeUi ? (
          <Button
            label={nudgeUi.enabled ? "운동하라고 찌르기" : nudgeUi.label}
            icon={nudgeUi.enabled ? "hand-pointing-right" : "check"}
            variant="secondary"
            disabled={!nudgeUi.enabled}
            loading={busy}
            onPress={() => nudge(partner)}
          />
        ) : null}
      </PersonCard>

      {error ? (
        <ThemedText variant="footnote" tone="danger">
          {error}
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}

function HeaderIcon({
  name,
  label,
  onPress,
}: {
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ padding: spacing.sm, opacity: pressed ? 0.6 : 1 })}
    >
      <MaterialCommunityIcons name={name} size={24} color={colors.ink} />
    </Pressable>
  );
}

// Shown instead of today's cards until two people are connected.
function ConnectBody({ home, onChanged }: { home: HomeResponse; onChanged: () => Promise<void> }) {
  const { token } = useSession();
  const colors = useColors();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = home.challenge?.pendingInvite ?? null;

  async function shareInvite() {
    setBusy(true);
    setError("");
    try {
      let inviteCode = pending?.code;
      if (!home.challenge) {
        const created = await api<{ invite: { code: string } }>("/challenges", { method: "POST", token });
        inviteCode = created.invite.code;
      } else if (!inviteCode) {
        const created = await api<{ code: string }>(`/challenges/${home.challenge.id}/invites`, { method: "POST", token });
        inviteCode = created.code;
      }
      await onChanged();
      if (inviteCode) {
        await Share.share({ message: `무브 투게더에서 같이 운동해요. 초대 코드: ${inviteCode}` }).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "초대를 만들지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.gutter, gap: spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: spacing.sm, paddingTop: spacing.lg }}>
        <PairDot me partner={false} size={48} />
        <ThemedText variant="largeTitle">함께 운동할 사람을{"\n"}연결하세요</ThemedText>
        <ThemedText variant="callout" tone="muted">
          연결하면 오늘 운동했는지만 서로 보여요.
        </ThemedText>
      </View>

      <View style={{ gap: spacing.md }}>
        <Button
          label={pending ? "초대 코드 보내기" : "초대 링크 보내기"}
          icon="share-variant"
          loading={busy}
          onPress={shareInvite}
        />
        {pending ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderCurve: "continuous",
              padding: spacing.lg,
              gap: spacing.xs,
            }}
          >
            <ThemedText variant="footnote" tone="muted">
              상대가 이 코드를 입력하면 연결돼요
            </ThemedText>
            <ThemedText variant="title" selectable style={{ letterSpacing: 4 }}>
              {pending.code}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View style={{ gap: spacing.md }}>
        <ThemedText variant="headline">코드를 받았어요</ThemedText>
        <TextField
          autoCapitalize="characters"
          placeholder="초대 코드"
          value={code}
          onChangeText={setCode}
          style={{ letterSpacing: 2 }}
        />
        <Button
          label="연결하기"
          variant="secondary"
          disabled={code.trim().length < 4}
          onPress={() => router.push({ pathname: "/(main)/connect", params: { code: code.trim() } })}
        />
      </View>

      {devToolsEnabled ? (
        <Button
          label="개발용: 가짜 상대와 바로 연결"
          variant="ghost"
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await connectDemoPartner(token);
              await onChanged();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "연결하지 못했어요");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      {error ? (
        <ThemedText variant="footnote" tone="danger">
          {error}
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}
