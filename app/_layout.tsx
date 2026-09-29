import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/lib/session";
import { useColors } from "@/theme";

export default function RootLayout() {
  const colors = useColors();
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="auth/verify" />
        <Stack.Screen name="invite/[code]" options={{ headerShown: true, title: "초대" }} />
        <Stack.Screen name="workout/complete" options={{ headerShown: true, title: "1 / 2" }} />
        <Stack.Screen
          name="workout/exercise-add"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.45],
            sheetGrabberVisible: true,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
        <Stack.Screen name="workout/done" options={{ gestureEnabled: false }} />
        <Stack.Screen name="workout/[id]" options={{ headerShown: true, title: "기록" }} />
      </Stack>
    </SessionProvider>
  );
}
