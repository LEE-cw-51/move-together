import type { HomeResponse, InvitePreview, NotificationItem, PublicUser, WorkoutDetail } from "@move-together/shared";

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit & { token?: string | null } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as { error?: { code?: string; message?: string } }) : {};
  if (!response.ok) {
    throw new ApiError(response.status, data.error?.code ?? "error", data.error?.message ?? "요청에 실패했어요");
  }
  return data as T;
}

export type { HomeResponse, InvitePreview, NotificationItem, PublicUser, WorkoutDetail };
