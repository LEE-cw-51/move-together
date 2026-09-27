import { createVideoPlayer } from "expo-video";

/** Reads duration with expo-video. Returns null when the file cannot be measured. */
export async function readVideoDurationSeconds(uri: string): Promise<number | null> {
  const player = createVideoPlayer(uri);
  try {
    return await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 5000);
      const subscription = player.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay") {
          clearTimeout(timeout);
          subscription.remove();
          const seconds = player.duration;
          resolve(typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds : null);
        }
        if (status === "error") {
          clearTimeout(timeout);
          subscription.remove();
          resolve(null);
        }
      });
    });
  } finally {
    player.release();
  }
}
