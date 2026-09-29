import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { radius, spacing, useColors } from "@/theme";
import type { NotificationItem } from "@/types";

export default function NotificationsScreen() {
  const { token } = useSession();
  const colors = useColors();
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const result = await api<{ notifications: NotificationItem[] }>("/notifications", { token });
    setItems(result.notifications);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  async function markRead(id: string) {
    await api(`/notifications/${id}/read`, { method: "POST", token });
    setItems((current) =>
      (current ?? []).map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)),
    );
  }

  if (items && items.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ThemedText variant="callout" tone="muted">
          아직 알림이 없어요
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.gutter }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" }}>
        {(items ?? []).map((item, index) => (
          <Pressable
            key={item.id}
            onPress={() => markRead(item.id)}
            style={({ pressed }) => ({
              padding: spacing.lg,
              gap: spacing.xs,
              backgroundColor: pressed ? colors.sunken : "transparent",
              borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: colors.hairline,
            })}
          >
            <ThemedText variant="headline" tone={item.readAt ? "muted" : "ink"}>
              {item.title}
            </ThemedText>
            <ThemedText variant="subhead" tone="muted">
              {item.body}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
