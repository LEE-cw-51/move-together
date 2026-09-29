import { useEffect } from "react";
import { Stack } from "expo-router";
import { api } from "@/lib/api";
import { registerPushToken } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { useColors } from "@/theme";

export default function MainLayout() {
  const { token, status } = useSession();
  const colors = useColors();

  useEffect(() => {
    if (status !== "ready" || !token) return;
    registerPushToken(token).catch(() => undefined);
    api("/events", { method: "POST", token, body: JSON.stringify({ type: "app_opened" }) }).catch(() => undefined);
  }, [status, token]);

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="connect" options={{ title: "코드 입력" }} />
      <Stack.Screen name="notifications" options={{ title: "알림" }} />
      <Stack.Screen name="settings" options={{ title: "설정" }} />
      <Stack.Screen name="history/[date]" options={{ title: "기록" }} />
      <Stack.Screen
        name="nudge-sent"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.36],
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="story"
        options={{ headerShown: false, presentation: "fullScreenModal", animation: "fade" }}
      />
      <Stack.Screen
        name="celebrate"
        options={{ headerShown: false, presentation: "fullScreenModal", gestureEnabled: false }}
      />
    </Stack>
  );
}
