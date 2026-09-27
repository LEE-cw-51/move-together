import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { colors } from "@/components/theme";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { PublicUser } from "@/types";

export default function LoginScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("이메일로 로그인 링크를 보내 드려요.");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestLink() {
    setBusy(true);
    setDevToken(null);
    try {
      const result = await api<{ emailSent: boolean; devToken?: string }>("/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (result.devToken) {
        setDevToken(result.devToken);
        setMessage("개발 환경이에요. 아래 버튼으로 바로 들어갈 수 있어요.");
      } else {
        setMessage("메일함의 링크를 눌러 주세요.");
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "로그인 링크를 보내지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  async function verify(token: string) {
    setBusy(true);
    try {
      const result = await api<{ token: string; user: PublicUser }>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      await signIn(result.token, result.user);
      router.replace(result.user.needsDisplayName ? "/(auth)/display-name" : "/(main)");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "로그인에 실패했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.kicker}>무브 투게더</Text>
        <Text style={styles.title}>오늘 움직였는지{"\n"}서로 확인해요</Text>
        <Text style={styles.body}>{message}</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="이메일"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <Button label={busy ? "보내는 중" : "로그인 링크 받기"} disabled={busy || email.trim().length < 3} onPress={requestLink} />
        {devToken ? <Button label="개발용으로 로그인" tone="quiet" disabled={busy} onPress={() => verify(devToken)} /> : null}
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
  kicker: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  title: {
    color: colors.text,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700",
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
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
});
