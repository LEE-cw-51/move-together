import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { spacing, useColors } from "@/theme";

export function Screen({ children, edges = ["top", "bottom"] }: { children: ReactNode; edges?: Edge[] }) {
  const colors = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={edges}>
      <View style={{ flex: 1, paddingHorizontal: spacing.gutter, paddingBottom: spacing.md }}>{children}</View>
    </SafeAreaView>
  );
}
