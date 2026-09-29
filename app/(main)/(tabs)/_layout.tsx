import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type, useColors } from "@/theme";

export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: "left",
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleStyle: { fontSize: type.title.fontSize, fontWeight: type.title.fontWeight },
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.me,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.hairline },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "오늘",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="circle-half-full" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "기록",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="calendar-month" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
