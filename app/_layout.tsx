import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/lib/session";
import { colors } from "@/components/theme";

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="auth/verify" />
        <Stack.Screen name="invite/[code]" options={{ headerShown: true, title: "초대" }} />
        <Stack.Screen name="workout/complete" options={{ headerShown: true, title: "오늘 운동" }} />
        <Stack.Screen name="workout/[id]" options={{ headerShown: true, title: "기록" }} />
      </Stack>
    </SessionProvider>
  );
}
