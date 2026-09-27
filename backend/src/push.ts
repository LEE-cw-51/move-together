export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function sendExpoPush(messages: PushMessage[]): Promise<void> {
  const deliverable = messages.filter((message) => message.to.length > 0);
  if (deliverable.length === 0) return;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify(deliverable),
    });
    if (!response.ok) {
      console.error(`[push] Expo Push API responded ${response.status}`);
    }
  } catch (error) {
    console.error("[push] Expo Push API request failed", error);
  }
}
