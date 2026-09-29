import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { spacing, useColors } from "@/theme";
import type { PublicUser } from "@/types";

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const { signIn } = useSession();
  const colors = useColors();
  const signInRef = useRef(signIn);
  signInRef.current = signIn;
  const [message, setMessage] = useState("로그인하는 중");

  useEffect(() => {
    const token = typeof params.token === "string" ? params.token : "";
    if (!token) {
      setMessage("로그인 링크가 올바르지 않아요");
      return;
    }
    let cancelled = false;
    api<{ token: string; user: PublicUser }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(async (result) => {
        if (cancelled) return;
        await signInRef.current(result.token, result.user);
        router.replace(result.user.needsDisplayName ? "/(auth)/display-name" : "/(main)");
      })
      .catch(() => {
        if (!cancelled) setMessage("링크가 만료되었거나 이미 사용됐어요");
      });
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: spacing.md }}>
      <ActivityIndicator color={colors.me} />
      <ThemedText variant="callout">{message}</ThemedText>
    </View>
  );
}
