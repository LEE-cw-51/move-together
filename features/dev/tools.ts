import { forgetCelebrated } from "@/features/celebration/seen";
import { api } from "@/lib/api";
import type { HomeResponse } from "@/types";

// Dev-build shortcuts for trying every screen alone. The API only serves /dev/*
// outside production, and the UI only shows them when __DEV__ is true.
export const devToolsEnabled = __DEV__;

export function connectDemoPartner(token: string | null) {
  return api<{ challengeId: string }>("/dev/partner", { method: "POST", token });
}

export function toggleDemoPartnerToday(token: string | null) {
  return api<{ partnerCompleted: boolean }>("/dev/partner/today", { method: "POST", token });
}

export function seedDemoHistory(token: string | null) {
  return api<{ inserted: number }>("/dev/history", { method: "POST", token });
}

export async function resetToday(token: string | null) {
  await api("/dev/reset-today", { method: "POST", token });
  const home = await api<HomeResponse>("/home", { token });
  if (home.challenge) await forgetCelebrated(home.challenge.id, home.challenge.seoulDate);
}
