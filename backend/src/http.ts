import type { Hono } from "hono";
import {
  CUSTOM_EXERCISE_LIMIT,
  computeJointStreak,
  normalizeCustomLabel,
  parseWorkoutSelection,
  seoulDateKey,
  validateNewMedia,
  type ExerciseCode,
  type ReactionType,
} from "@move-together/shared";
import { inviteCode, randomToken, sha256 } from "./crypto";
import type { Db, Sql } from "./db";
import { ApiError, isUniqueViolation, postgresMessage } from "./errors";
import { deliverMagicLink, isProduction, magicLinkFor } from "./mail";
import { flushPushes, insertNotification, recordEvent, type PendingPush } from "./notify";
import { readLocalMedia, saveMediaObject } from "./storage";

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
};

const REACTION_TYPES: ReactionType[] = ["heart", "muscle", "fire", "clap"];

function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    needsDisplayName: user.display_name == null || user.display_name.length === 0,
  };
}

function normalizeEmail(input: unknown): string {
  if (typeof input !== "string") {
    throw new ApiError(400, "invalid_email", "이메일을 확인해 주세요");
  }
  const email = input.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "invalid_email", "이메일을 확인해 주세요");
  }
  return email;
}

function asTextArray(value: unknown): ExerciseCode[] {
  if (Array.isArray(value)) return value.map(String) as ExerciseCode[];
  if (typeof value === "string") {
    const inner = value.replace(/^\{|\}$/g, "");
    if (!inner) return [];
    return inner.split(",").map((part) => part.replace(/^"|"$/g, "")) as ExerciseCode[];
  }
  return [];
}

function dateKey(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function iso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapMembershipError(error: unknown): never {
  const message = postgresMessage(error);
  if (message.includes("member_limit_reached")) {
    throw new ApiError(409, "member_limit", "이미 두 사람이 함께하고 있어요");
  }
  if (message.includes("already_in_active_challenge")) {
    throw new ApiError(409, "already_in_challenge", "이미 진행 중인 운동이 있어요");
  }
  throw error;
}

export async function requireUser(db: Db, authorization: string | undefined): Promise<UserRow> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!token) throw new ApiError(401, "unauthorized", "로그인이 필요해요");
  const found = await db.query<UserRow>(
    `SELECT u.id, u.email, u.display_name, u.avatar_url, u.timezone
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  const user = found.rows[0];
  if (!user) throw new ApiError(401, "unauthorized", "로그인이 필요해요");
  return user;
}

export function requireDisplayName(user: UserRow): void {
  if (!user.display_name) {
    throw new ApiError(409, "display_name_required", "먼저 이름을 정해 주세요");
  }
}

async function assertMember(sql: Sql, userId: string, challengeId: string): Promise<void> {
  const member = await sql.query(
    `SELECT 1 FROM challenge_members WHERE challenge_id = $1 AND user_id = $2`,
    [challengeId, userId],
  );
  if (member.rows.length === 0) {
    throw new ApiError(403, "forbidden", "이 운동의 구성원만 볼 수 있어요");
  }
}

async function assertOwnExercises(sql: Sql, userId: string, labels: string[]): Promise<void> {
  if (labels.length === 0) return;
  const owned = await sql.query<{ label: string }>(`SELECT label FROM user_exercises WHERE user_id = $1`, [userId]);
  const names = new Set(owned.rows.map((row) => row.label.toLowerCase()));
  if (labels.some((label) => !names.has(label.toLowerCase()))) {
    throw new ApiError(400, "invalid_custom_exercise", "내 운동 목록에 없는 운동이 있어요");
  }
}

async function createInvite(sql: Sql, challengeId: string, userId: string) {
  const days = Number(process.env.INVITE_TTL_DAYS ?? 7);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = inviteCode();
    try {
      const inserted = await sql.query<{ code: string; expires_at: Date | string }>(
        `INSERT INTO invites (challenge_id, code, created_by, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(days => $4))
         RETURNING code, expires_at`,
        [challengeId, code, userId, days],
      );
      const row = inserted.rows[0]!;
      await recordEvent(sql, {
        userId,
        type: "invite_created",
        challengeId,
        payload: { code: row.code },
      });
      return { code: row.code, expiresAt: iso(row.expires_at) };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new ApiError(500, "invite_code", "초대 코드를 만들지 못했어요");
}

export async function activeChallengeId(sql: Sql, userId: string): Promise<string | null> {
  const rows = await sql.query<{ id: string }>(
    `SELECT c.id
     FROM challenges c
     JOIN challenge_members cm ON cm.challenge_id = c.id
     WHERE cm.user_id = $1 AND c.status = 'active'
     LIMIT 1`,
    [userId],
  );
  return rows.rows[0]?.id ?? null;
}

type WorkoutRow = {
  id: string;
  challenge_id: string;
  user_id: string;
  seoul_date: string;
  exercise_types: unknown;
  custom_labels?: unknown;
  completed_at: Date | string | null;
};

async function loadWorkoutForMember(sql: Sql, workoutId: string, viewerId: string): Promise<WorkoutRow> {
  const found = await sql.query<WorkoutRow>(
    `SELECT id, challenge_id, user_id, seoul_date::text AS seoul_date, exercise_types, custom_labels, completed_at
     FROM workout_records
     WHERE id = $1`,
    [workoutId],
  );
  const row = found.rows[0];
  if (!row) throw new ApiError(404, "not_found", "기록을 찾을 수 없어요");
  await assertMember(sql, viewerId, row.challenge_id);
  return row;
}

async function saveWorkout(
  sql: Sql,
  user: UserRow,
  challengeId: string,
  types: ExerciseCode[],
  customLabels: string[],
  pending: PendingPush[],
): Promise<{ id: string; createdCompletion: boolean }> {
  await assertMember(sql, user.id, challengeId);
  const today = seoulDateKey();
  const existing = await sql.query<{ id: string; completed_at: Date | string | null }>(
    `SELECT id, completed_at
     FROM workout_records
     WHERE challenge_id = $1 AND user_id = $2 AND seoul_date = $3
     FOR UPDATE`,
    [challengeId, user.id, today],
  );
  const wasCompleted = existing.rows[0]?.completed_at != null;
  let recordId = existing.rows[0]?.id;
  if (recordId) {
    await sql.query(
      `UPDATE workout_records
       SET exercise_types = (
             SELECT COALESCE(array_agg(value), '{}'::text[])
             FROM jsonb_array_elements_text($2::jsonb) AS value
           ),
           custom_labels = (
             SELECT COALESCE(array_agg(value), '{}'::text[])
             FROM jsonb_array_elements_text($3::jsonb) AS value
           ),
           updated_at = now(),
           completed_at = COALESCE(completed_at, now())
       WHERE id = $1`,
      [recordId, JSON.stringify(types), JSON.stringify(customLabels)],
    );
  } else {
    const inserted = await sql.query<{ id: string }>(
      `INSERT INTO workout_records (challenge_id, user_id, seoul_date, exercise_types, custom_labels, completed_at)
       VALUES (
         $1,
         $2,
         $3,
         (
           SELECT COALESCE(array_agg(value), '{}'::text[])
           FROM jsonb_array_elements_text($4::jsonb) AS value
         ),
         (
           SELECT COALESCE(array_agg(value), '{}'::text[])
           FROM jsonb_array_elements_text($5::jsonb) AS value
         ),
         now()
       )
       RETURNING id`,
      [challengeId, user.id, today, JSON.stringify(types), JSON.stringify(customLabels)],
    );
    recordId = inserted.rows[0]!.id;
  }

  if (!wasCompleted) {
    const members = await sql.query<{ user_id: string; display_name: string }>(
      `SELECT cm.user_id, u.display_name
       FROM challenge_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.challenge_id = $1`,
      [challengeId],
    );
    const done = await sql.query<{ user_id: string }>(
      `SELECT user_id FROM workout_records
       WHERE challenge_id = $1 AND seoul_date = $2 AND completed_at IS NOT NULL`,
      [challengeId, today],
    );
    const doneIds = new Set(done.rows.map((row) => row.user_id));
    const mutual = members.rows.length >= 2 && members.rows.every((member) => doneIds.has(member.user_id));
    const actorName = user.display_name ?? "회원";
    if (mutual) {
      for (const member of members.rows) {
        await insertNotification(
          sql,
          {
            userId: member.user_id,
            type: "mutual_success",
            challengeId,
            actorUserId: user.id,
            workoutRecordId: recordId,
            seoulDate: today,
            title: "함께 성공",
            body: "오늘은 둘 다 성공이에요",
            dedupeKey: `mutual_success:${challengeId}:${today}:${member.user_id}`,
          },
          pending,
        );
      }
      await recordEvent(sql, {
        userId: user.id,
        type: "mutual_success",
        challengeId,
        payload: { seoulDate: today },
      });
    } else {
      for (const member of members.rows) {
        if (member.user_id === user.id) continue;
        await insertNotification(
          sql,
          {
            userId: member.user_id,
            type: "member_completed",
            challengeId,
            actorUserId: user.id,
            workoutRecordId: recordId,
            seoulDate: today,
            title: "운동 완료",
            body: `${actorName}님이 오늘 운동을 완료했어요`,
            dedupeKey: `member_completed:${challengeId}:${today}:${user.id}:${member.user_id}`,
          },
          pending,
        );
      }
    }
    await recordEvent(sql, {
      userId: user.id,
      type: "workout_completed",
      challengeId,
      payload: { seoulDate: today, exerciseTypes: types, customLabels },
    });
    const nudged = await sql.query(
      `SELECT 1 FROM nudges WHERE challenge_id = $1 AND receiver_id = $2 AND seoul_date = $3 LIMIT 1`,
      [challengeId, user.id, today],
    );
    if (nudged.rows.length > 0) {
      await recordEvent(sql, {
        userId: user.id,
        type: "workout_completed_after_nudge",
        challengeId,
        payload: { seoulDate: today },
      });
    }
  }

  return { id: recordId, createdCompletion: !wasCompleted };
}

export function registerRoutes(app: Hono, db: Db): void {
  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/dev-media/:name", async (c) => {
    const file = await readLocalMedia(c.req.param("name"));
    if (!file) throw new ApiError(404, "not_found", "파일을 찾을 수 없어요");
    const body = new Uint8Array(file.bytes.byteLength);
    body.set(file.bytes);
    return c.body(body, 200, {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=3600",
    });
  });

  app.post("/auth/magic-link", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const token = randomToken();
    const minutes = Number(process.env.MAGIC_LINK_TTL_MINUTES ?? 15);
    await db.query(
      `INSERT INTO magic_link_tokens (email, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [email, sha256(token), minutes],
    );
    const link = magicLinkFor(token);
    const delivery = await deliverMagicLink(email, link);
    if (isProduction() && !delivery.emailSent) {
      throw new ApiError(502, "email_failed", "로그인 메일을 보내지 못했어요");
    }
    return c.json({
      ok: true,
      emailSent: delivery.emailSent,
      ...(isProduction() ? {} : { devToken: token, devMagicLink: link }),
    });
  });

  app.post("/auth/verify", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) throw new ApiError(400, "invalid_token", "로그인 링크가 올바르지 않아요");
    const session = await db.transaction(async (sql) => {
      const found = await sql.query<{ id: string; email: string }>(
        `SELECT id, email FROM magic_link_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [sha256(token)],
      );
      const magic = found.rows[0];
      if (!magic) throw new ApiError(400, "invalid_token", "로그인 링크가 만료되었거나 이미 사용됐어요");
      await sql.query(`UPDATE magic_link_tokens SET used_at = now() WHERE id = $1`, [magic.id]);
      const user = await sql.query<UserRow>(
        `INSERT INTO users (email) VALUES ($1)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id, email, display_name, avatar_url, timezone`,
        [magic.email],
      );
      const sessionToken = randomToken();
      const days = Number(process.env.SESSION_TTL_DAYS ?? 30);
      await sql.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + make_interval(days => $3))`,
        [user.rows[0]!.id, sha256(sessionToken), days],
      );
      return { token: sessionToken, user: publicUser(user.rows[0]!) };
    });
    return c.json(session);
  });

  app.get("/me", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    return c.json({ user: publicUser(user) });
  });

  app.post("/me/display-name", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    const body = await c.req.json().catch(() => ({}));
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (displayName.length < 1 || displayName.length > 20) {
      throw new ApiError(400, "invalid_display_name", "이름은 1자에서 20자까지예요");
    }
    const updated = await db.query<UserRow>(
      `UPDATE users SET display_name = $2
       WHERE id = $1
       RETURNING id, email, display_name, avatar_url, timezone`,
      [user.id, displayName],
    );
    return c.json({ user: publicUser(updated.rows[0]!) });
  });

  app.get("/me/exercises", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    const rows = await db.query<{ id: string; label: string }>(
      `SELECT id, label FROM user_exercises WHERE user_id = $1 ORDER BY created_at ASC`,
      [user.id],
    );
    return c.json({ exercises: rows.rows });
  });

  app.post("/me/exercises", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    const body = await c.req.json().catch(() => ({}));
    const label = normalizeCustomLabel(body.label);
    if (!label) throw new ApiError(400, "invalid_custom_exercise", "이름은 1~10자로 적어 주세요");
    const created = await db.transaction(async (sql) => {
      const existing = await sql.query<{ id: string; label: string }>(
        `SELECT id, label FROM user_exercises WHERE user_id = $1`,
        [user.id],
      );
      if (existing.rows.some((row) => row.label.toLowerCase() === label.toLowerCase())) {
        throw new ApiError(409, "duplicate_exercise", "이미 있는 운동이에요");
      }
      if (existing.rows.length >= CUSTOM_EXERCISE_LIMIT) {
        throw new ApiError(409, "exercise_limit", `내 운동은 ${CUSTOM_EXERCISE_LIMIT}개까지 만들 수 있어요`);
      }
      const inserted = await sql.query<{ id: string; label: string }>(
        `INSERT INTO user_exercises (user_id, label) VALUES ($1, $2) RETURNING id, label`,
        [user.id, label],
      );
      return inserted.rows[0]!;
    });
    return c.json(created, 201);
  });

  app.delete("/me/exercises/:id", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    const removed = await db.query(`DELETE FROM user_exercises WHERE id = $1 AND user_id = $2 RETURNING id`, [
      c.req.param("id"),
      user.id,
    ]);
    if (removed.rows.length === 0) throw new ApiError(404, "not_found", "운동을 찾을 수 없어요");
    return c.json({ ok: true });
  });

  app.post("/me/push-token", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const body = await c.req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (token.length < 8 || token.length > 256) {
      throw new ApiError(400, "invalid_push_token", "푸시 토큰을 확인해 주세요");
    }
    await db.query(
      `INSERT INTO push_tokens (user_id, token)
       VALUES ($1, $2)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = now()`,
      [user.id, token],
    );
    return c.json({ ok: true });
  });

  app.post("/events", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const body = await c.req.json().catch(() => ({}));
    if (body.type !== "app_opened") {
      throw new ApiError(400, "invalid_event", "앱에서 기록할 수 없는 이벤트예요");
    }
    const challengeId = await activeChallengeId(db, user.id);
    await recordEvent(db, { userId: user.id, type: "app_opened", challengeId, payload: {} });
    return c.json({ ok: true });
  });

  app.post("/challenges", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const pending: PendingPush[] = [];
    const created = await db.transaction(async (sql) => {
      const existing = await activeChallengeId(sql, user.id);
      if (existing) throw new ApiError(409, "already_in_challenge", "이미 진행 중인 운동이 있어요");
      const challenge = await sql.query<{ id: string; name: string }>(
        `INSERT INTO challenges (created_by) VALUES ($1) RETURNING id, name`,
        [user.id],
      );
      try {
        await sql.query(`INSERT INTO challenge_members (challenge_id, user_id) VALUES ($1, $2)`, [
          challenge.rows[0]!.id,
          user.id,
        ]);
      } catch (error) {
        mapMembershipError(error);
      }
      const invite = await createInvite(sql, challenge.rows[0]!.id, user.id);
      return { id: challenge.rows[0]!.id, name: challenge.rows[0]!.name, invite };
    });
    await flushPushes(db, pending);
    return c.json(created, 201);
  });

  app.post("/challenges/:id/invites", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const challengeId = c.req.param("id");
    const invite = await db.transaction(async (sql) => {
      await assertMember(sql, user.id, challengeId);
      const challenge = await sql.query<{ member_limit: number; status: string }>(
        `SELECT member_limit, status FROM challenges WHERE id = $1 FOR UPDATE`,
        [challengeId],
      );
      if (!challenge.rows[0] || challenge.rows[0].status !== "active") {
        throw new ApiError(404, "not_found", "운동을 찾을 수 없어요");
      }
      const count = await sql.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM challenge_members WHERE challenge_id = $1`,
        [challengeId],
      );
      if (Number(count.rows[0]?.count ?? 0) >= challenge.rows[0].member_limit) {
        throw new ApiError(409, "member_limit", "이미 두 사람이 함께하고 있어요");
      }
      return createInvite(sql, challengeId, user.id);
    });
    return c.json(invite, 201);
  });

  app.get("/invites/:code", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const code = c.req.param("code").trim().toUpperCase();
    const found = await db.query<{
      code: string;
      challenge_id: string;
      challenge_name: string;
      inviter_display_name: string;
      expires_at: Date | string;
      status: "pending" | "used" | "expired";
    }>(
      `SELECT i.code, i.challenge_id, c.name AS challenge_name, u.display_name AS inviter_display_name,
              i.expires_at, i.status
       FROM invites i
       JOIN challenges c ON c.id = i.challenge_id
       JOIN users u ON u.id = i.created_by
       WHERE i.code = $1`,
      [code],
    );
    const invite = found.rows[0];
    if (!invite) throw new ApiError(404, "invite_not_found", "초대 코드를 찾을 수 없어요");
    const expired = invite.status === "pending" && new Date(invite.expires_at).getTime() <= Date.now();
    return c.json({
      code: invite.code,
      challengeId: invite.challenge_id,
      challengeName: invite.challenge_name,
      inviterDisplayName: invite.inviter_display_name,
      expiresAt: iso(invite.expires_at),
      status: expired ? "expired" : invite.status,
    });
  });

  app.post("/invites/accept", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const body = await c.req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code) throw new ApiError(400, "invite_not_found", "초대 코드를 입력해 주세요");
    const accepted = await acceptInvite(db, user, code);
    return c.json(accepted);
  });

  app.get("/home", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const today = seoulDateKey();
    const challenge = await db.query<{
      id: string;
      name: string;
      member_limit: number;
      media_required: boolean;
      status: string;
    }>(
      `SELECT c.id, c.name, c.member_limit, c.media_required, c.status
       FROM challenges c
       JOIN challenge_members cm ON cm.challenge_id = c.id
       WHERE cm.user_id = $1 AND c.status = 'active'
       LIMIT 1`,
      [user.id],
    );
    if (!challenge.rows[0]) {
      return c.json({ user: publicUser(user), challenge: null });
    }
    const challengeId = challenge.rows[0].id;
    const members = await db.query<{
      user_id: string;
      display_name: string;
      record_id: string | null;
      exercise_types: unknown;
      custom_labels: unknown;
      completed_at: Date | string | null;
      media_count: string | number;
    }>(
      `SELECT u.id AS user_id,
              u.display_name,
              wr.id AS record_id,
              wr.exercise_types,
              wr.custom_labels,
              wr.completed_at,
              COALESCE(mc.media_count, 0)::text AS media_count
       FROM challenge_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN workout_records wr
         ON wr.challenge_id = cm.challenge_id
        AND wr.user_id = cm.user_id
        AND wr.seoul_date = $2
       LEFT JOIN (
         SELECT workout_record_id, COUNT(*) AS media_count
         FROM media
         GROUP BY workout_record_id
       ) mc ON mc.workout_record_id = wr.id
       WHERE cm.challenge_id = $1
       ORDER BY cm.joined_at ASC`,
      [challengeId, today],
    );
    const history = await db.query<{ user_id: string; seoul_date: string }>(
      `SELECT user_id, seoul_date::text AS seoul_date
       FROM workout_records
       WHERE challenge_id = $1 AND completed_at IS NOT NULL`,
      [challengeId],
    );
    const completedDatesByMember: Record<string, string[]> = {};
    for (const row of history.rows) {
      const list = completedDatesByMember[row.user_id] ?? [];
      list.push(dateKey(row.seoul_date));
      completedDatesByMember[row.user_id] = list;
    }
    const memberIds = members.rows.map((member) => member.user_id);
    const streak = computeJointStreak({ memberIds, completedDatesByMember, today });
    const sent = await db.query<{ receiver_id: string }>(
      `SELECT receiver_id FROM nudges
       WHERE challenge_id = $1 AND sender_id = $2 AND seoul_date = $3`,
      [challengeId, user.id, today],
    );
    const nudged = new Set(sent.rows.map((row) => row.receiver_id));
    const invite = await db.query<{ code: string; expires_at: Date | string }>(
      `SELECT code, expires_at FROM invites
       WHERE challenge_id = $1 AND status = 'pending' AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 1`,
      [challengeId],
    );
    const homeMembers = members.rows.map((member) => ({
      userId: member.user_id,
      displayName: member.display_name,
      isMe: member.user_id === user.id,
      today: {
        completed: member.completed_at != null,
        recordId: member.record_id,
        exerciseTypes: member.completed_at ? asTextArray(member.exercise_types) : [],
        customLabels: member.completed_at ? (asTextArray(member.custom_labels) as string[]) : [],
        mediaCount: Number(member.media_count ?? 0),
      },
    }));
    return c.json({
      user: publicUser(user),
      challenge: {
        id: challengeId,
        name: challenge.rows[0].name,
        memberLimit: challenge.rows[0].member_limit,
        mediaRequired: challenge.rows[0].media_required,
        status: challenge.rows[0].status,
        seoulDate: today,
        streak: streak.streak,
        todayMutual: streak.todayMutual,
        todayInProgress: streak.todayInProgress,
        pendingInvite: invite.rows[0]
          ? { code: invite.rows[0].code, expiresAt: iso(invite.rows[0].expires_at) }
          : null,
        members: homeMembers,
        nudges: homeMembers
          .filter((member) => !member.isMe)
          .map((member) => ({
            receiverId: member.userId,
            receiverDisplayName: member.displayName,
            alreadyNudged: nudged.has(member.userId),
            canNudge: !member.today.completed,
          })),
      },
    });
  });

  app.post("/challenges/:id/workouts", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const body = await c.req.json().catch(() => ({}));
    const parsed = parseWorkoutSelection(body.exerciseTypes, body.customLabels);
    if (!parsed.ok) throw new ApiError(400, parsed.code, parsed.message);
    const pending: PendingPush[] = [];
    const saved = await db.transaction(async (sql) => {
      await assertOwnExercises(sql, user.id, parsed.customLabels);
      return saveWorkout(sql, user, c.req.param("id"), parsed.types, parsed.customLabels, pending);
    });
    await flushPushes(db, pending);
    return c.json(saved, saved.createdCompletion ? 201 : 200);
  });

  app.patch("/workouts/:id", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const body = await c.req.json().catch(() => ({}));
    const parsed = parseWorkoutSelection(body.exerciseTypes, body.customLabels);
    if (!parsed.ok) throw new ApiError(400, parsed.code, parsed.message);
    const today = seoulDateKey();
    await db.transaction(async (sql) => {
      await assertOwnExercises(sql, user.id, parsed.customLabels);
      const workout = await loadWorkoutForMember(sql, c.req.param("id"), user.id);
      if (workout.user_id !== user.id) throw new ApiError(403, "forbidden", "내 기록만 수정할 수 있어요");
      if (dateKey(workout.seoul_date) !== today) {
        throw new ApiError(409, "frozen", "지난 날짜의 기록은 바꿀 수 없어요");
      }
      await sql.query(
        `UPDATE workout_records
         SET exercise_types = (
               SELECT COALESCE(array_agg(value), '{}'::text[])
               FROM jsonb_array_elements_text($2::jsonb) AS value
             ),
             custom_labels = (
               SELECT COALESCE(array_agg(value), '{}'::text[])
               FROM jsonb_array_elements_text($3::jsonb) AS value
             ),
             updated_at = now()
         WHERE id = $1`,
        [workout.id, JSON.stringify(parsed.types), JSON.stringify(parsed.customLabels)],
      );
    });
    return c.json({ ok: true });
  });

  app.get("/workouts/:id", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const today = seoulDateKey();
    const workout = await loadWorkoutForMember(db, c.req.param("id"), user.id);
    const owner = await db.query<{ display_name: string }>(`SELECT display_name FROM users WHERE id = $1`, [
      workout.user_id,
    ]);
    const media = await db.query<{
      id: string;
      type: "image" | "video";
      url: string;
      duration_seconds: string | number | null;
      size_bytes: number;
      created_at: Date | string;
    }>(
      `SELECT id, type, url, duration_seconds, size_bytes, created_at
       FROM media WHERE workout_record_id = $1 ORDER BY created_at ASC`,
      [workout.id],
    );
    const reactions = await db.query<{ type: ReactionType; count: string; mine: boolean }>(
      `SELECT type, COUNT(*)::text AS count, BOOL_OR(user_id = $2) AS mine
       FROM reactions WHERE workout_record_id = $1 GROUP BY type`,
      [workout.id, user.id],
    );
    const byType = new Map(reactions.rows.map((row) => [row.type, row]));
    return c.json({
      id: workout.id,
      challengeId: workout.challenge_id,
      userId: workout.user_id,
      displayName: owner.rows[0]?.display_name ?? "",
      seoulDate: dateKey(workout.seoul_date),
      exerciseTypes: asTextArray(workout.exercise_types),
      customLabels: asTextArray(workout.custom_labels) as string[],
      completedAt: iso(workout.completed_at),
      frozen: dateKey(workout.seoul_date) !== today,
      canReact: workout.user_id !== user.id,
      media: media.rows.map((item) => ({
        id: item.id,
        type: item.type,
        url: item.url,
        durationSeconds: item.duration_seconds == null ? null : Number(item.duration_seconds),
        sizeBytes: item.size_bytes,
        createdAt: iso(item.created_at),
      })),
      reactions: REACTION_TYPES.map((type) => ({
        type,
        count: Number(byType.get(type)?.count ?? 0),
        mine: Boolean(byType.get(type)?.mine),
      })),
    });
  });

  app.get("/challenges/:id/history", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const challengeId = c.req.param("id");
    const month = c.req.query("month") ?? seoulDateKey().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new ApiError(400, "invalid_month", "달을 확인해 주세요");
    }
    await assertMember(db, user.id, challengeId);
    const [year, monthNumber] = month.split("-").map(Number);
    const first = `${month}-01`;
    const next =
      monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
    const members = await db.query<{ user_id: string; display_name: string }>(
      `SELECT u.id AS user_id, u.display_name
       FROM challenge_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.challenge_id = $1
       ORDER BY cm.joined_at ASC`,
      [challengeId],
    );
    const records = await db.query<{
      id: string;
      user_id: string;
      seoul_date: string;
      exercise_types: unknown;
      custom_labels: unknown;
      media_count: string | number;
      thumb_url: string | null;
    }>(
      `SELECT wr.id,
              wr.user_id,
              wr.seoul_date::text AS seoul_date,
              wr.exercise_types,
              wr.custom_labels,
              (SELECT COUNT(*) FROM media m WHERE m.workout_record_id = wr.id)::text AS media_count,
              (SELECT m.url FROM media m
                WHERE m.workout_record_id = wr.id AND m.type = 'image'
                ORDER BY m.created_at ASC LIMIT 1) AS thumb_url
       FROM workout_records wr
       WHERE wr.challenge_id = $1
         AND wr.completed_at IS NOT NULL
         AND wr.seoul_date >= $2::date
         AND wr.seoul_date < $3::date
       ORDER BY wr.seoul_date ASC`,
      [challengeId, first, next],
    );
    const byDate = new Map<string, typeof records.rows>();
    for (const row of records.rows) {
      const date = dateKey(row.seoul_date);
      byDate.set(date, [...(byDate.get(date) ?? []), row]);
    }
    const days = [...byDate.entries()].map(([date, rows]) => ({
      date,
      mutual: members.rows.length > 1 && members.rows.every((member) => rows.some((row) => row.user_id === member.user_id)),
      members: rows.map((row) => ({
        userId: row.user_id,
        displayName: members.rows.find((member) => member.user_id === row.user_id)?.display_name ?? "",
        isMe: row.user_id === user.id,
        recordId: row.id,
        exerciseTypes: asTextArray(row.exercise_types),
        customLabels: asTextArray(row.custom_labels) as string[],
        mediaCount: Number(row.media_count ?? 0),
        thumbUrl: row.thumb_url,
      })),
    }));
    return c.json({ month, days });
  });

  app.post("/workouts/:id/media", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const form = await c.req.formData();
    const kindValue = form.get("type");
    const kind = typeof kindValue === "string" ? kindValue : null;
    const file = form.get("file");
    if (kind !== "image" && kind !== "video") {
      throw new ApiError(400, "invalid_media", "사진 또는 영상만 올릴 수 있어요");
    }
    if (!(file instanceof File)) {
      throw new ApiError(400, "media_missing", "파일을 첨부해 주세요");
    }
    const durationRaw = form.get("durationSeconds");
    const durationSeconds =
      kind === "video" ? (typeof durationRaw === "string" ? Number(durationRaw) : Number.NaN) : null;
    const bytes = Buffer.from(await file.arrayBuffer());
    const today = seoulDateKey();
    const pending: PendingPush[] = [];
    const saved = await db.transaction(async (sql) => {
      const workout = await sql.query<WorkoutRow>(
        `SELECT wr.id, wr.challenge_id, wr.user_id, wr.seoul_date::text AS seoul_date, wr.exercise_types, wr.completed_at
         FROM workout_records wr
         WHERE wr.id = $1
         FOR UPDATE`,
        [c.req.param("id")],
      );
      const row = workout.rows[0];
      if (!row) throw new ApiError(404, "not_found", "기록을 찾을 수 없어요");
      await assertMember(sql, user.id, row.challenge_id);
      if (row.user_id !== user.id) throw new ApiError(403, "forbidden", "내 기록에만 올릴 수 있어요");
      if (dateKey(row.seoul_date) !== today) {
        throw new ApiError(409, "frozen", "지난 날짜의 기록은 바꿀 수 없어요");
      }
      const count = await sql.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM media WHERE workout_record_id = $1`,
        [row.id],
      );
      const validation = validateNewMedia({
        kind,
        sizeBytes: bytes.length,
        durationSeconds: kind === "video" ? durationSeconds : null,
        existingCount: Number(count.rows[0]?.count ?? 0),
      });
      if (!validation.ok) throw new ApiError(400, validation.code, validation.message);
      const contentType = file.type || (kind === "video" ? "video/mp4" : "image/jpeg");
      const stored = await saveMediaObject({ bytes, contentType, kind });
      const inserted = await sql.query<{ id: string }>(
        `INSERT INTO media (workout_record_id, type, url, duration_seconds, size_bytes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [row.id, kind, stored.url, kind === "video" ? durationSeconds : null, bytes.length],
      );
      await recordEvent(sql, {
        userId: user.id,
        type: "media_added",
        challengeId: row.challenge_id,
        payload: { mediaId: inserted.rows[0]!.id, kind },
      });
      return { id: inserted.rows[0]!.id, url: stored.url, type: kind };
    });
    await flushPushes(db, pending);
    return c.json(saved, 201);
  });

  app.delete("/media/:id", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const today = seoulDateKey();
    await db.transaction(async (sql) => {
      const found = await sql.query<{ id: string; user_id: string; seoul_date: string; challenge_id: string }>(
        `SELECT m.id, wr.user_id, wr.seoul_date::text AS seoul_date, wr.challenge_id
         FROM media m
         JOIN workout_records wr ON wr.id = m.workout_record_id
         WHERE m.id = $1
         FOR UPDATE`,
        [c.req.param("id")],
      );
      const row = found.rows[0];
      if (!row) throw new ApiError(404, "not_found", "파일을 찾을 수 없어요");
      await assertMember(sql, user.id, row.challenge_id);
      if (row.user_id !== user.id) throw new ApiError(403, "forbidden", "내 파일만 지울 수 있어요");
      if (dateKey(row.seoul_date) !== today) {
        throw new ApiError(409, "frozen", "지난 날짜의 기록은 바꿀 수 없어요");
      }
      await sql.query(`DELETE FROM media WHERE id = $1`, [row.id]);
    });
    return c.json({ ok: true });
  });

  app.post("/challenges/:id/nudges", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const body = await c.req.json().catch(() => ({}));
    const receiverId = typeof body.receiverId === "string" ? body.receiverId : "";
    if (!receiverId) throw new ApiError(400, "invalid_receiver", "찌를 사람을 확인해 주세요");
    if (receiverId === user.id) throw new ApiError(400, "invalid_receiver", "나에게는 찌를 수 없어요");
    const today = seoulDateKey();
    const pending: PendingPush[] = [];
    await db.transaction(async (sql) => {
      const challengeId = c.req.param("id");
      await assertMember(sql, user.id, challengeId);
      await assertMember(sql, receiverId, challengeId);
      const receiver = await sql.query<{ display_name: string; completed_at: Date | string | null }>(
        `SELECT u.display_name, wr.completed_at
         FROM users u
         LEFT JOIN workout_records wr
           ON wr.user_id = u.id AND wr.challenge_id = $2 AND wr.seoul_date = $3
         WHERE u.id = $1`,
        [receiverId, challengeId, today],
      );
      if (receiver.rows[0]?.completed_at) {
        throw new ApiError(409, "nudge_not_allowed", "오늘은 이미 운동을 마쳤어요");
      }
      try {
        await sql.query(
          `INSERT INTO nudges (challenge_id, sender_id, receiver_id, seoul_date)
           VALUES ($1, $2, $3, $4)`,
          [challengeId, user.id, receiverId, today],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ApiError(409, "nudge_already_sent", "오늘 이미 찔렀어요");
        }
        throw error;
      }
      const senderName = user.display_name ?? "회원";
      await insertNotification(
        sql,
        {
          userId: receiverId,
          type: "nudge",
          challengeId,
          actorUserId: user.id,
          workoutRecordId: null,
          seoulDate: today,
          title: "찌르기",
          body: `${senderName}님이 오늘 운동을 기다리고 있어요`,
          dedupeKey: `nudge:${challengeId}:${today}:${user.id}:${receiverId}`,
        },
        pending,
      );
      await recordEvent(sql, {
        userId: user.id,
        type: "nudge_sent",
        challengeId,
        payload: { receiverId, seoulDate: today },
      });
    });
    await flushPushes(db, pending);
    return c.json({ ok: true }, 201);
  });

  app.post("/workouts/:id/reactions", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const body = await c.req.json().catch(() => ({}));
    const type = body.type as ReactionType;
    if (!REACTION_TYPES.includes(type)) {
      throw new ApiError(400, "invalid_reaction", "반응을 골라 주세요");
    }
    const result = await db.transaction(async (sql) => {
      const workout = await loadWorkoutForMember(sql, c.req.param("id"), user.id);
      if (workout.user_id === user.id) {
        throw new ApiError(403, "forbidden", "다른 사람의 기록에만 반응할 수 있어요");
      }
      const existing = await sql.query<{ id: string }>(
        `SELECT id FROM reactions WHERE workout_record_id = $1 AND user_id = $2 AND type = $3 FOR UPDATE`,
        [workout.id, user.id, type],
      );
      if (existing.rows[0]) {
        await sql.query(`DELETE FROM reactions WHERE id = $1`, [existing.rows[0].id]);
        return { type, active: false };
      }
      await sql.query(`INSERT INTO reactions (workout_record_id, user_id, type) VALUES ($1, $2, $3)`, [
        workout.id,
        user.id,
        type,
      ]);
      await recordEvent(sql, {
        userId: user.id,
        type: "reaction_added",
        challengeId: workout.challenge_id,
        payload: { workoutRecordId: workout.id, reaction: type },
      });
      return { type, active: true };
    });
    return c.json(result);
  });

  app.get("/notifications", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const rows = await db.query<{
      id: string;
      type: "member_completed" | "nudge" | "mutual_success" | "evening_reminder";
      title: string;
      body: string;
      seoul_date: string | null;
      read_at: Date | string | null;
      created_at: Date | string;
      actor_display_name: string | null;
    }>(
      `SELECT n.id, n.type, n.title, n.body, n.seoul_date::text AS seoul_date, n.read_at, n.created_at,
              u.display_name AS actor_display_name
       FROM notifications n
       LEFT JOIN users u ON u.id = n.actor_user_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [user.id],
    );
    return c.json({
      notifications: rows.rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        seoulDate: row.seoul_date ? dateKey(row.seoul_date) : null,
        readAt: iso(row.read_at),
        createdAt: iso(row.created_at),
        actorDisplayName: row.actor_display_name,
      })),
    });
  });

  app.post("/notifications/:id/read", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    await db.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2`,
      [c.req.param("id"), user.id],
    );
    return c.json({ ok: true });
  });

  app.post("/internal/jobs/evening-reminders", async (c) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      throw new ApiError(503, "cron_unconfigured", "CRON_SECRET이 설정되지 않았어요");
    }
    if (c.req.header("authorization") !== `Bearer ${secret}`) {
      throw new ApiError(401, "unauthorized", "권한이 없어요");
    }
    const created = await runEveningReminders(db, seoulDateKey());
    return c.json({ ok: true, created });
  });
}

async function acceptInvite(db: Db, user: UserRow, code: string) {
  return db.transaction(async (sql) => {
    const found = await sql.query<{
      id: string;
      challenge_id: string;
      created_by: string;
      status: string;
      expires_at: Date | string;
      used_at: Date | string | null;
    }>(
      `SELECT id, challenge_id, created_by, status, expires_at, used_at
       FROM invites WHERE code = $1 FOR UPDATE`,
      [code],
    );
    const invite = found.rows[0];
    if (!invite) throw new ApiError(404, "invite_not_found", "초대 코드를 찾을 수 없어요");
    if (invite.status === "used" || invite.used_at) {
      throw new ApiError(409, "invite_used", "이미 사용된 초대예요");
    }
    if (invite.status === "expired" || new Date(invite.expires_at).getTime() <= Date.now()) {
      await sql.query(`UPDATE invites SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [invite.id]);
      throw new ApiError(409, "invite_expired", "만료된 초대예요");
    }
    const alreadyHere = await sql.query(
      `SELECT 1 FROM challenge_members WHERE challenge_id = $1 AND user_id = $2`,
      [invite.challenge_id, user.id],
    );
    if (alreadyHere.rows.length > 0 || invite.created_by === user.id) {
      throw new ApiError(409, "already_member", "이미 이 운동에 함께하고 있어요");
    }
    const otherActive = await sql.query(
      `SELECT 1
       FROM challenge_members cm
       JOIN challenges c ON c.id = cm.challenge_id
       WHERE cm.user_id = $1 AND c.status = 'active' AND c.id <> $2`,
      [user.id, invite.challenge_id],
    );
    if (otherActive.rows.length > 0) {
      throw new ApiError(409, "already_in_challenge", "이미 진행 중인 운동이 있어요");
    }
    const challenge = await sql.query<{ member_limit: number; status: string }>(
      `SELECT member_limit, status FROM challenges WHERE id = $1 FOR UPDATE`,
      [invite.challenge_id],
    );
    if (!challenge.rows[0] || challenge.rows[0].status !== "active") {
      throw new ApiError(409, "challenge_inactive", "끝난 운동이에요");
    }
    const count = await sql.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM challenge_members WHERE challenge_id = $1`,
      [invite.challenge_id],
    );
    if (Number(count.rows[0]?.count ?? 0) >= challenge.rows[0].member_limit) {
      throw new ApiError(409, "member_limit", "이미 두 사람이 함께하고 있어요");
    }
    try {
      await sql.query(`INSERT INTO challenge_members (challenge_id, user_id) VALUES ($1, $2)`, [
        invite.challenge_id,
        user.id,
      ]);
    } catch (error) {
      mapMembershipError(error);
    }
    const updated = await sql.query(
      `UPDATE invites SET status = 'used', used_by = $2, used_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [invite.id, user.id],
    );
    if (updated.rows.length === 0) throw new ApiError(409, "invite_used", "이미 사용된 초대예요");
    await recordEvent(sql, {
      userId: user.id,
      type: "invite_accepted",
      challengeId: invite.challenge_id,
      payload: { code },
    });
    return { challengeId: invite.challenge_id };
  });
}

export async function runEveningReminders(db: Db, seoulDate: string): Promise<number> {
  const pending: PendingPush[] = [];
  const created = await db.transaction(async (sql) => {
    const users = await sql.query<{ id: string }>(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN challenge_members cm ON cm.user_id = u.id
       JOIN challenges c ON c.id = cm.challenge_id AND c.status = 'active'
       WHERE NOT EXISTS (
         SELECT 1 FROM workout_records wr
         WHERE wr.challenge_id = c.id
           AND wr.user_id = u.id
           AND wr.seoul_date = $1
           AND wr.completed_at IS NOT NULL
       )`,
      [seoulDate],
    );
    let count = 0;
    for (const row of users.rows) {
      const inserted = await insertNotification(
        sql,
        {
          userId: row.id,
          type: "evening_reminder",
          challengeId: null,
          actorUserId: null,
          workoutRecordId: null,
          seoulDate,
          title: "오늘 운동",
          body: "오늘 운동을 아직 기록하지 않았어요",
          dedupeKey: `evening_reminder:${seoulDate}:${row.id}`,
        },
        pending,
      );
      if (inserted) count += 1;
    }
    return count;
  });
  await flushPushes(db, pending);
  return created;
}
