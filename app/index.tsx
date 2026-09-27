import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { colors } from "@/components/theme";
import { useSession } from "@/lib/session";

export default function Index() {
  const { status } = useSession();
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (status === "signedOut") return <Redirect href="/(auth)/login" />;
  if (status === "needsName") return <Redirect href="/(auth)/display-name" />;
  return <Redirect href="/(main)" />;
}
