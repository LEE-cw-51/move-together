import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { seoulDateKey, shiftSeoulDate } from "@move-together/shared";
import { createApp } from "../src/app";
import { createPgDb, createPoolFromEnv, migrate, type Db } from "../src/db";
import { runEveningReminders } from "../src/http";
import { createPgliteDatabase } from "../src/pglite";

process.env.NODE_ENV = "test";

type Json = Record<string, unknown>;

async function request(
  app: ReturnType<typeof createApp>,
  method: string,
  pathname: string,
  body?: unknown,
  token?: string,
) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await app.request(pathname, { method, headers, body: payload });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as Json) : {};
  return { status: response.status, json };
}

function errorCode(json: Json): string {
  const error = json.error as { code?: string } | undefined;
  return error?.code ?? "";
}

async function register(app: ReturnType<typeof createApp>, email: string, displayName: string) {
  const magic = await request(app, "POST", "/auth/magic-link", { email });
  assert.equal(magic.status, 200);
  assert.equal(typeof magic.json.devToken, "string");
  const verified = await request(app, "POST", "/auth/verify", { token: magic.json.devToken });
  assert.equal(verified.status, 200);
  const named = await request(app, "POST", "/me/display-name", { displayName }, String(verified.json.token));
  assert.equal(named.status, 200);
  const user = named.json.user as { id: string; displayName: string };
  return { token: String(verified.json.token), user };
}

function mediaForm(bytes: Buffer, kind: "image" | "video" = "image", durationSeconds?: number, contentType?: string) {
  const form = new FormData();
  form.set("type", kind);
  if (durationSeconds != null) form.set("durationSeconds", String(durationSeconds));
  form.set(
    "file",
    new File([Uint8Array.from(bytes)], kind === "video" ? "clip.mp4" : "photo.jpg", {
      type: contentType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
    }),
  );
  return form;
}

async function setup() {
  const storage = await mkdtemp(path.join(tmpdir(), "mt-media-"));
  process.env.LOCAL_STORAGE_DIR = storage;
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const pool = createPoolFromEnv();
    const db = createPgDb(pool);
    await migrate(db);
    await db.query(`
      TRUNCATE TABLE
        events,
        notifications,
        push_tokens,
        reactions,
        media,
        nudges,
        workout_records,
        invites,
        challenge_members,
        challenges,
        sessions,
        magic_link_tokens,
        users
      RESTART IDENTITY CASCADE
    `);
    const app = createApp(db);
    return {
      app,
      db,
      async close() {
        await pool.end();
        await rm(storage, { recursive: true, force: true });
      },
    };
  }
  const { client, db } = await createPgliteDatabase();
  await migrate(db);
  const app = createApp(db);
  return {
    app,
    db,
    async close() {
      await client.close();
      await rm(storage, { recursive: true, force: true });
    },
  };
}

async function notificationTypes(db: Db, userId: string) {
  const rows = await db.query<{ type: string }>(
    `SELECT type FROM notifications WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return rows.rows.map((row) => row.type);
}

test("magic link is one-time and hidden when NODE_ENV is production", async () => {
  const ctx = await setup();
  try {
    const magic = await request(ctx.app, "POST", "/auth/magic-link", { email: "a@example.com" });
    const token = String(magic.json.devToken);
    const first = await request(ctx.app, "POST", "/auth/verify", { token });
    assert.equal(first.status, 200);
    const second = await request(ctx.app, "POST", "/auth/verify", { token });
    assert.equal(second.status, 400);
    assert.equal(errorCode(second.json), "invalid_token");

    process.env.NODE_ENV = "production";
    const hidden = await request(ctx.app, "POST", "/auth/magic-link", { email: "b@example.com" });
    assert.equal(hidden.status, 502);
    assert.equal("devToken" in hidden.json, false);
  } finally {
    process.env.NODE_ENV = "test";
    await ctx.close();
  }
});

test("invite is one-time and expiry is rejected", async () => {
  const ctx = await setup();
  try {
    const owner = await register(ctx.app, "owner@example.com", "민지");
    const guest = await register(ctx.app, "guest@example.com", "준호");
    const other = await register(ctx.app, "other@example.com", "하늘");
    const created = await request(ctx.app, "POST", "/challenges", undefined, owner.token);
    assert.equal(created.status, 201);
    const code = String((created.json.invite as { code: string }).code);

    const accepted = await request(ctx.app, "POST", "/invites/accept", { code }, guest.token);
    assert.equal(accepted.status, 200);
    const reused = await request(ctx.app, "POST", "/invites/accept", { code }, other.token);
    assert.equal(reused.status, 409);
    assert.equal(errorCode(reused.json), "invite_used");

    const freshOwner = await register(ctx.app, "fresh@example.com", "수아");
    const freshGuest = await register(ctx.app, "fresh-guest@example.com", "도윤");
    const second = await request(ctx.app, "POST", "/challenges", undefined, freshOwner.token);
    const secondCode = String((second.json.invite as { code: string }).code);
    await ctx.db.query(`UPDATE invites SET expires_at = now() - interval '1 minute' WHERE code = $1`, [secondCode]);
    const expired = await request(ctx.app, "POST", "/invites/accept", { code: secondCode }, freshGuest.token);
    assert.equal(expired.status, 409);
    assert.equal(errorCode(expired.json), "invite_expired");
  } finally {
    await ctx.close();
  }
});

test("a third member is rejected and a user cannot join a second active challenge", async () => {
  const ctx = await setup();
  try {
    const a = await register(ctx.app, "a@example.com", "민지");
    const b = await register(ctx.app, "b@example.com", "준호");
    const c = await register(ctx.app, "c@example.com", "하늘");
    const created = await request(ctx.app, "POST", "/challenges", undefined, a.token);
    const challengeId = String(created.json.id);
    const spare = await request(ctx.app, "POST", `/challenges/${challengeId}/invites`, undefined, a.token);
    assert.equal(spare.status, 201);
    const spareCode = String(spare.json.code);
    const firstCode = String((created.json.invite as { code: string }).code);
    assert.equal((await request(ctx.app, "POST", "/invites/accept", { code: firstCode }, b.token)).status, 200);
    const third = await request(ctx.app, "POST", "/invites/accept", { code: spareCode }, c.token);
    assert.equal(third.status, 409);
    assert.equal(errorCode(third.json), "member_limit");

    const again = await request(ctx.app, "POST", "/challenges", undefined, b.token);
    assert.equal(again.status, 409);
    assert.equal(errorCode(again.json), "already_in_challenge");
  } finally {
    await ctx.close();
  }
});

test("workout requires a type, media caps hold, and non-members are forbidden", async () => {
  const ctx = await setup();
  try {
    const a = await register(ctx.app, "a@example.com", "민지");
    const b = await register(ctx.app, "b@example.com", "준호");
    const stranger = await register(ctx.app, "stranger@example.com", "하늘");
    const created = await request(ctx.app, "POST", "/challenges", undefined, a.token);
    const challengeId = String(created.json.id);
    const code = String((created.json.invite as { code: string }).code);
    await request(ctx.app, "POST", "/invites/accept", { code }, b.token);

    const empty = await request(ctx.app, "POST", `/challenges/${challengeId}/workouts`, { exerciseTypes: [] }, a.token);
    assert.equal(empty.status, 400);
    assert.equal(errorCode(empty.json), "exercise_type_required");

    const forbidden = await request(
      ctx.app,
      "POST",
      `/challenges/${challengeId}/workouts`,
      { exerciseTypes: ["run"] },
      stranger.token,
    );
    assert.equal(forbidden.status, 403);
    assert.equal(errorCode(forbidden.json), "forbidden");

    const saved = await request(
      ctx.app,
      "POST",
      `/challenges/${challengeId}/workouts`,
      { exerciseTypes: ["run", "walk"] },
      a.token,
    );
    assert.equal(saved.status, 201);
    const workoutId = String(saved.json.id);

    for (let index = 0; index < 3; index += 1) {
      const uploaded = await request(
        ctx.app,
        "POST",
        `/workouts/${workoutId}/media`,
        mediaForm(Buffer.from(`image-${index}`)),
        a.token,
      );
      assert.equal(uploaded.status, 201);
    }
    const fourth = await request(
      ctx.app,
      "POST",
      `/workouts/${workoutId}/media`,
      mediaForm(Buffer.from("too-many")),
      a.token,
    );
    assert.equal(fourth.status, 400);
    assert.equal(errorCode(fourth.json), "media_limit");

    const otherWorkout = await request(
      ctx.app,
      "POST",
      `/challenges/${challengeId}/workouts`,
      { exerciseTypes: ["yoga"] },
      b.token,
    );
    const otherId = String(otherWorkout.json.id);
    const missingDuration = await request(
      ctx.app,
      "POST",
      `/workouts/${otherId}/media`,
      mediaForm(Buffer.from("clip"), "video"),
      b.token,
    );
    assert.equal(missingDuration.status, 400);
    assert.equal(errorCode(missingDuration.json), "video_duration_unknown");
    const longVideo = await request(
      ctx.app,
      "POST",
      `/workouts/${otherId}/media`,
      mediaForm(Buffer.from("clip"), "video", 11),
      b.token,
    );
    assert.equal(longVideo.status, 400);
    assert.equal(errorCode(longVideo.json), "video_too_long");
    const huge = await request(
      ctx.app,
      "POST",
      `/workouts/${otherId}/media`,
      mediaForm(Buffer.alloc(8 * 1024 * 1024 + 1, 1)),
      b.token,
    );
    assert.equal(huge.status, 400);
    assert.equal(errorCode(huge.json), "media_too_large");

    const strangerRead = await request(ctx.app, "GET", `/workouts/${workoutId}`, undefined, stranger.token);
    assert.equal(strangerRead.status, 403);
    assert.equal(errorCode(strangerRead.json), "forbidden");
  } finally {
    await ctx.close();
  }
});

test("nudge is once per Seoul day and only before the receiver finishes", async () => {
  const ctx = await setup();
  try {
    const a = await register(ctx.app, "a@example.com", "민지");
    const b = await register(ctx.app, "b@example.com", "준호");
    const created = await request(ctx.app, "POST", "/challenges", undefined, a.token);
    const challengeId = String(created.json.id);
    const code = String((created.json.invite as { code: string }).code);
    await request(ctx.app, "POST", "/invites/accept", { code }, b.token);

    const first = await request(ctx.app, "POST", `/challenges/${challengeId}/nudges`, { receiverId: b.user.id }, a.token);
    assert.equal(first.status, 201);
    const second = await request(ctx.app, "POST", `/challenges/${challengeId}/nudges`, { receiverId: b.user.id }, a.token);
    assert.equal(second.status, 409);
    assert.equal(errorCode(second.json), "nudge_already_sent");
    assert.deepEqual(await notificationTypes(ctx.db, b.user.id), ["nudge"]);

    await request(ctx.app, "POST", `/challenges/${challengeId}/workouts`, { exerciseTypes: ["swim"] }, b.token);
    const afterDone = await request(
      ctx.app,
      "POST",
      `/challenges/${challengeId}/nudges`,
      { receiverId: b.user.id },
      a.token,
    );
    assert.equal(afterDone.status, 409);
    assert.equal(errorCode(afterDone.json), "nudge_not_allowed");
  } finally {
    await ctx.close();
  }
});

test("mutual success notifies both people only when the second completes, and edits stay quiet", async () => {
  const ctx = await setup();
  try {
    const a = await register(ctx.app, "a@example.com", "민지");
    const b = await register(ctx.app, "b@example.com", "준호");
    const created = await request(ctx.app, "POST", "/challenges", undefined, a.token);
    const challengeId = String(created.json.id);
    const code = String((created.json.invite as { code: string }).code);
    await request(ctx.app, "POST", "/invites/accept", { code }, b.token);

    const first = await request(ctx.app, "POST", `/challenges/${challengeId}/workouts`, { exerciseTypes: ["gym"] }, a.token);
    assert.equal(first.status, 201);
    assert.deepEqual(await notificationTypes(ctx.db, a.user.id), []);
    assert.deepEqual(await notificationTypes(ctx.db, b.user.id), ["member_completed"]);

    const second = await request(ctx.app, "POST", `/challenges/${challengeId}/workouts`, { exerciseTypes: ["home"] }, b.token);
    assert.equal(second.status, 201);
    assert.deepEqual(await notificationTypes(ctx.db, a.user.id), ["mutual_success"]);
    assert.deepEqual(await notificationTypes(ctx.db, b.user.id), ["member_completed", "mutual_success"]);

    const edited = await request(
      ctx.app,
      "PATCH",
      `/workouts/${String(second.json.id)}`,
      { exerciseTypes: ["home", "yoga"] },
      b.token,
    );
    assert.equal(edited.status, 200);
    assert.deepEqual(await notificationTypes(ctx.db, a.user.id), ["mutual_success"]);
    assert.deepEqual(await notificationTypes(ctx.db, b.user.id), ["member_completed", "mutual_success"]);

    const home = await request(ctx.app, "GET", "/home", undefined, a.token);
    const challenge = home.json.challenge as { streak: number; todayMutual: boolean; nudges: { canNudge: boolean }[] };
    assert.equal(challenge.todayMutual, true);
    assert.equal(challenge.streak >= 1, true);
    assert.equal(challenge.nudges[0]?.canNudge, false);
  } finally {
    await ctx.close();
  }
});

test("joint streak on home counts finished mutual days and breaks after a miss", async () => {
  const ctx = await setup();
  try {
    const a = await register(ctx.app, "a@example.com", "민지");
    const b = await register(ctx.app, "b@example.com", "준호");
    const created = await request(ctx.app, "POST", "/challenges", undefined, a.token);
    const challengeId = String(created.json.id);
    const code = String((created.json.invite as { code: string }).code);
    await request(ctx.app, "POST", "/invites/accept", { code }, b.token);
    const today = seoulDateKey();
    const yesterday = shiftSeoulDate(today, -1);
    const twoDaysAgo = shiftSeoulDate(today, -2);
    for (const date of [twoDaysAgo, yesterday]) {
      for (const userId of [a.user.id, b.user.id]) {
        await ctx.db.query(
          `INSERT INTO workout_records (challenge_id, user_id, seoul_date, exercise_types, completed_at)
           VALUES ($1, $2, $3, '{walk}', now())`,
          [challengeId, userId, date],
        );
      }
    }
    const open = await request(ctx.app, "GET", "/home", undefined, a.token);
    const openChallenge = open.json.challenge as { streak: number; todayMutual: boolean; todayInProgress: boolean };
    assert.equal(openChallenge.streak, 2);
    assert.equal(openChallenge.todayMutual, false);
    assert.equal(openChallenge.todayInProgress, true);

    await ctx.db.query(`DELETE FROM workout_records WHERE seoul_date = $1 AND user_id = $2`, [yesterday, b.user.id]);
    const broken = await request(ctx.app, "GET", "/home", undefined, a.token);
    const brokenChallenge = broken.json.challenge as { streak: number };
    assert.equal(brokenChallenge.streak, 0);
  } finally {
    await ctx.close();
  }
});

test("evening reminder is created at most once per Seoul date", async () => {
  const ctx = await setup();
  try {
    const a = await register(ctx.app, "a@example.com", "민지");
    await request(ctx.app, "POST", "/challenges", undefined, a.token);
    const today = seoulDateKey();
    assert.equal(await runEveningReminders(ctx.db, today), 1);
    assert.equal(await runEveningReminders(ctx.db, today), 0);
    assert.deepEqual(await notificationTypes(ctx.db, a.user.id), ["evening_reminder"]);
    process.env.CRON_SECRET = "test-secret";
    const denied = await request(ctx.app, "POST", "/internal/jobs/evening-reminders");
    assert.equal(denied.status, 401);
    const allowed = await request(ctx.app, "POST", "/internal/jobs/evening-reminders", undefined, "test-secret");
    assert.equal(allowed.status, 200);
  } finally {
    delete process.env.CRON_SECRET;
    await ctx.close();
  }
});

test("reactions toggle only on the other person's record", async () => {
  const ctx = await setup();
  try {
    const a = await register(ctx.app, "a@example.com", "민지");
    const b = await register(ctx.app, "b@example.com", "준호");
    const created = await request(ctx.app, "POST", "/challenges", undefined, a.token);
    const challengeId = String(created.json.id);
    const code = String((created.json.invite as { code: string }).code);
    await request(ctx.app, "POST", "/invites/accept", { code }, b.token);
    const saved = await request(ctx.app, "POST", `/challenges/${challengeId}/workouts`, { exerciseTypes: ["bike"] }, a.token);
    const workoutId = String(saved.json.id);
    const own = await request(ctx.app, "POST", `/workouts/${workoutId}/reactions`, { type: "heart" }, a.token);
    assert.equal(own.status, 403);
    const added = await request(ctx.app, "POST", `/workouts/${workoutId}/reactions`, { type: "fire" }, b.token);
    assert.equal(added.status, 200);
    assert.equal(added.json.active, true);
    const removed = await request(ctx.app, "POST", `/workouts/${workoutId}/reactions`, { type: "fire" }, b.token);
    assert.equal(removed.json.active, false);
  } finally {
    await ctx.close();
  }
});

test("history lists a month's days, marks mutual days, and is members-only", async () => {
  const ctx = await setup();
  try {
    const a = await register(ctx.app, "a@example.com", "민지");
    const b = await register(ctx.app, "b@example.com", "준호");
    const stranger = await register(ctx.app, "stranger@example.com", "하늘");
    const created = await request(ctx.app, "POST", "/challenges", undefined, a.token);
    const challengeId = String(created.json.id);
    const code = String((created.json.invite as { code: string }).code);
    await request(ctx.app, "POST", "/invites/accept", { code }, b.token);
    const insert = (userId: string, date: string, types: string) =>
      ctx.db.query(
        `INSERT INTO workout_records (challenge_id, user_id, seoul_date, exercise_types, completed_at)
         VALUES ($1, $2, $3, $4, now())`,
        [challengeId, userId, date, types],
      );
    await insert(a.user.id, "2026-08-31", "{run}");
    await insert(a.user.id, "2026-09-05", "{run,walk}");
    await insert(b.user.id, "2026-09-05", "{yoga}");
    await insert(b.user.id, "2026-09-11", "{swim}");

    const september = await request(ctx.app, "GET", `/challenges/${challengeId}/history?month=2026-09`, undefined, a.token);
    assert.equal(september.status, 200);
    const days = september.json.days as {
      date: string;
      mutual: boolean;
      members: { isMe: boolean; displayName: string; exerciseTypes: string[] }[];
    }[];
    assert.deepEqual(
      days.map((day) => [day.date, day.mutual, day.members.length]),
      [
        ["2026-09-05", true, 2],
        ["2026-09-11", false, 1],
      ],
    );
    const partnerOnly = days[1].members[0];
    assert.equal(partnerOnly.isMe, false);
    assert.equal(partnerOnly.displayName, "준호");
    assert.deepEqual(partnerOnly.exerciseTypes, ["swim"]);

    const invalid = await request(ctx.app, "GET", `/challenges/${challengeId}/history?month=2026-13`, undefined, a.token);
    assert.equal(invalid.status, 400);
    assert.equal(errorCode(invalid.json), "invalid_month");

    const forbidden = await request(ctx.app, "GET", `/challenges/${challengeId}/history?month=2026-09`, undefined, stranger.token);
    assert.equal(forbidden.status, 403);
  } finally {
    await ctx.close();
  }
});

test("dev tools connect a stand-in partner, toggle their day, seed history, and stay off in production", async () => {
  const ctx = await setup();
  try {
    const a = await register(ctx.app, "a@example.com", "민지");
    const connected = await request(ctx.app, "POST", "/dev/partner", undefined, a.token);
    assert.equal(connected.status, 200);
    const home = await request(ctx.app, "GET", "/home", undefined, a.token);
    const members = (home.json.challenge as { members: { isMe: boolean; displayName: string }[] }).members;
    assert.equal(members.length, 2);
    assert.equal(members.find((member) => !member.isMe)?.displayName, "데모 상대");

    const again = await request(ctx.app, "POST", "/dev/partner", undefined, a.token);
    assert.equal(again.json.challengeId, connected.json.challengeId);

    const done = await request(ctx.app, "POST", "/dev/partner/today", undefined, a.token);
    assert.equal(done.json.partnerCompleted, true);
    const undone = await request(ctx.app, "POST", "/dev/partner/today", undefined, a.token);
    assert.equal(undone.json.partnerCompleted, false);

    const seeded = await request(ctx.app, "POST", "/dev/history", undefined, a.token);
    assert.ok(Number(seeded.json.inserted) > 0);

    await request(ctx.app, "POST", "/dev/partner/today", undefined, a.token);
    const reset = await request(ctx.app, "POST", "/dev/reset-today", undefined, a.token);
    assert.equal(reset.status, 200);
    const after = await request(ctx.app, "GET", "/home", undefined, a.token);
    const afterMembers = (after.json.challenge as { members: { today: { completed: boolean } }[] }).members;
    assert.ok(afterMembers.every((member) => !member.today.completed));

    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const prodApp = createApp(ctx.db);
      const blocked = await request(prodApp, "POST", "/dev/partner", undefined, a.token);
      assert.equal(blocked.status, 404);
    } finally {
      process.env.NODE_ENV = previous;
    }
  } finally {
    await ctx.close();
  }
});

test("custom exercises are personal, capped, usable alone, and survive deletion on past records", async () => {
  const ctx = await setup();
  try {
    const a = await register(ctx.app, "a@example.com", "민지");
    const b = await register(ctx.app, "b@example.com", "준호");
    const created = await request(ctx.app, "POST", "/challenges", undefined, a.token);
    const challengeId = String(created.json.id);
    const code = String((created.json.invite as { code: string }).code);
    await request(ctx.app, "POST", "/invites/accept", { code }, b.token);

    const pilates = await request(ctx.app, "POST", "/me/exercises", { label: " 필라테스 " }, a.token);
    assert.equal(pilates.status, 201);
    assert.equal(pilates.json.label, "필라테스");
    const duplicate = await request(ctx.app, "POST", "/me/exercises", { label: "필라테스" }, a.token);
    assert.equal(errorCode(duplicate.json), "duplicate_exercise");
    const tooLong = await request(ctx.app, "POST", "/me/exercises", { label: "가".repeat(11) }, a.token);
    assert.equal(tooLong.status, 400);

    const partnerList = await request(ctx.app, "GET", "/me/exercises", undefined, b.token);
    assert.deepEqual(partnerList.json.exercises, []);
    const notTheirs = await request(
      ctx.app,
      "POST",
      `/challenges/${challengeId}/workouts`,
      { exerciseTypes: [], customLabels: ["필라테스"] },
      b.token,
    );
    assert.equal(errorCode(notTheirs.json), "invalid_custom_exercise");

    const saved = await request(
      ctx.app,
      "POST",
      `/challenges/${challengeId}/workouts`,
      { exerciseTypes: [], customLabels: ["필라테스"] },
      a.token,
    );
    assert.equal(saved.status, 201);
    const home = await request(ctx.app, "GET", "/home", undefined, b.token);
    const partner = (home.json.challenge as { members: { isMe: boolean; today: { customLabels: string[] } }[] }).members.find(
      (member) => !member.isMe,
    );
    assert.deepEqual(partner?.today.customLabels, ["필라테스"]);

    await request(ctx.app, "DELETE", `/me/exercises/${String(pilates.json.id)}`, undefined, a.token);
    const detail = await request(ctx.app, "GET", `/workouts/${String(saved.json.id)}`, undefined, b.token);
    assert.deepEqual(detail.json.customLabels, ["필라테스"]);

    for (let index = 0; index < 20; index += 1) {
      await request(ctx.app, "POST", "/me/exercises", { label: `운동${index}` }, a.token);
    }
    const overLimit = await request(ctx.app, "POST", "/me/exercises", { label: "하나 더" }, a.token);
    assert.equal(errorCode(overLimit.json), "exercise_limit");
  } finally {
    await ctx.close();
  }
});
