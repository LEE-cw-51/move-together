export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 15 * 1024 * 1024;
export const MEDIA_MAX_COUNT = 3;
export const VIDEO_MAX_SECONDS = 10;

export type MediaKind = "image" | "video";

export type MediaValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function validateNewMedia(input: {
  kind: MediaKind;
  sizeBytes: number;
  durationSeconds: number | null;
  existingCount: number;
}): MediaValidation {
  if (input.existingCount >= MEDIA_MAX_COUNT) {
    return {
      ok: false,
      code: "media_limit",
      message: "사진과 영상은 최대 3개까지예요",
    };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return {
      ok: false,
      code: "media_empty",
      message: "파일을 읽지 못했어요. 다시 골라 주세요",
    };
  }
  if (input.kind === "image" && input.sizeBytes > IMAGE_MAX_BYTES) {
    return {
      ok: false,
      code: "media_too_large",
      message: "사진은 8MB 이하만 올릴 수 있어요",
    };
  }
  if (input.kind === "video" && input.sizeBytes > VIDEO_MAX_BYTES) {
    return {
      ok: false,
      code: "media_too_large",
      message: "영상은 15MB 이하만 올릴 수 있어요",
    };
  }
  if (input.kind === "video") {
    if (input.durationSeconds == null || !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
      return {
        ok: false,
        code: "video_duration_unknown",
        message: "영상 길이를 확인할 수 없어요. 다른 영상을 골라 주세요",
      };
    }
    if (input.durationSeconds > VIDEO_MAX_SECONDS) {
      return {
        ok: false,
        code: "video_too_long",
        message: "영상은 10초 이하만 올릴 수 있어요",
      };
    }
  }
  return { ok: true };
}
