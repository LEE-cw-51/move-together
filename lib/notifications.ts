import * as Notifications from "expo-notifications";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushToken(token: string): Promise<void> {
  try {
    const permission = await Notifications.getPermissionsAsync();
    const granted =
      permission.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const expoToken = await Notifications.getExpoPushTokenAsync();
    if (!expoToken.data) return;
    await api("/me/push-token", {
      method: "POST",
      token,
      body: JSON.stringify({ token: expoToken.data }),
    });
  } catch {
    // Simulators and missing push credentials still keep in-app notification rows.
  }
}
