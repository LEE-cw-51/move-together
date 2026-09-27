import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { colors } from "@/components/theme";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { NotificationItem } from "@/types";

export default function NotificationsScreen() {
  const { token } = useSession();
  const [items, setItems] = useState<NotificationItem[]>([]);

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
    setItems((current) => current.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)));
  }

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>아직 알림이 없어요</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {items.map((item) => (
        <Pressable key={item.id} onPress={() => markRead(item.id)} style={[styles.card, item.readAt ? styles.read : null]}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 20,
    gap: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  read: {
    opacity: 0.6,
  },
  title: {
    fontWeight: "700",
    color: colors.text,
    fontSize: 16,
  },
  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  empty: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 16,
  },
});
