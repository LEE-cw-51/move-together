import { useEffect } from "react";
import { Stack } from "expo-router";
import { colors } from "@/components/theme";
import { api } from "@/lib/api";
import { registerPushToken } from "@/lib/notifications";
import { useSession } from "@/lib/session";

export default function MainLayout() {
  const { token, status } = useSession();

  useEffect(() => {
    if (status !== "ready" || !token) return;
    registerPushToken(token).catch(() => undefined);
    api("/events", { method: "POST", token, body: JSON.stringify({ type: "app_opened" }) }).catch(() => undefined);
  }, [status, token]);

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.text,
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="connect" options={{ title: "코드 입력" }} />
      <Stack.Screen name="notifications" options={{ title: "알림" }} />
    </Stack>
  );
}
