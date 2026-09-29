import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// The "both of you did it" screen shows once per challenge per Seoul day.
// Stored the same way as the session token: localStorage on web, SecureStore on device.
function key(challengeId: string, seoulDate: string): string {
  return `celebrated.${challengeId}.${seoulDate}`;
}

export async function hasCelebrated(challengeId: string, seoulDate: string): Promise<boolean> {
  try {
    if (Platform.OS === "web") return globalThis.localStorage.getItem(key(challengeId, seoulDate)) === "1";
    return (await SecureStore.getItemAsync(key(challengeId, seoulDate))) === "1";
  } catch {
    return false;
  }
}

export async function forgetCelebrated(challengeId: string, seoulDate: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      globalThis.localStorage.removeItem(key(challengeId, seoulDate));
      return;
    }
    await SecureStore.deleteItemAsync(key(challengeId, seoulDate));
  } catch {
    // Nothing stored is the same as forgotten.
  }
}

export async function markCelebrated(challengeId: string, seoulDate: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      globalThis.localStorage.setItem(key(challengeId, seoulDate), "1");
      return;
    }
    await SecureStore.setItemAsync(key(challengeId, seoulDate), "1");
  } catch {
    // Not remembering only means the celebration may show once more.
  }
}
