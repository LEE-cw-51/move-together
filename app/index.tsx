import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";
import { useColors } from "@/theme";

export default function Index() {
  const { status } = useSession();
  const colors = useColors();
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.me} />
      </View>
    );
  }
  if (status === "signedOut") return <Redirect href="/(auth)/login" />;
  if (status === "needsName") return <Redirect href="/(auth)/display-name" />;
  return <Redirect href="/(main)" />;
}
