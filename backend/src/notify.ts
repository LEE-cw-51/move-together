import type { Sql } from "./db";
import { sendExpoPush } from "./push";

export type NotificationType = "member_completed" | "nudge" | "mutual_success" | "evening_reminder";

export type PendingPush = {
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};

export async function insertNotification(
  sql: Sql,
  input: {
    userId: string;
    type: NotificationType;
    challengeId: string | null;
    actorUserId: string | null;
    workoutRecordId: string | null;
    seoulDate: string | null;
    title: string;
    body: string;
    dedupeKey: string;
  },
  pending: PendingPush[],
): Promise<boolean> {
  const inserted = await sql.query<{ id: string }>(
    `INSERT INTO notifications (
       user_id, type, challenge_id, actor_user_id, workout_record_id, seoul_date, title, body, dedupe_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      input.userId,
      input.type,
      input.challengeId,
      input.actorUserId,
      input.workoutRecordId,
      input.seoulDate,
      input.title,
      input.body,
      input.dedupeKey,
    ],
  );
  if (inserted.rows.length === 0) return false;
  pending.push({
    userId: input.userId,
    title: input.title,
    body: input.body,
    data: {
      type: input.type,
      notificationId: inserted.rows[0]!.id,
      challengeId: input.challengeId,
    },
  });
  return true;
}

export async function flushPushes(sql: Sql, pending: PendingPush[]): Promise<void> {
  if (pending.length === 0) return;
  const userIds = [...new Set(pending.map((item) => item.userId))];
  const tokens = await sql.query<{ user_id: string; token: string }>(
    `SELECT user_id, token FROM push_tokens WHERE user_id = ANY($1::uuid[])`,
    [userIds],
  );
  const byUser = new Map<string, string[]>();
  for (const row of tokens.rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row.token);
    byUser.set(row.user_id, list);
  }
  await sendExpoPush(
    pending.flatMap((item) =>
      (byUser.get(item.userId) ?? []).map((token) => ({
        to: token,
        title: item.title,
        body: item.body,
        data: item.data,
      })),
    ),
  );
}

export async function recordEvent(
  sql: Sql,
  input: {
    userId: string | null;
    type: string;
    challengeId: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await sql.query(
    `INSERT INTO events (user_id, type, challenge_id, payload) VALUES ($1, $2, $3, $4::jsonb)`,
    [input.userId, input.type, input.challengeId, JSON.stringify(input.payload ?? {})],
  );
}
