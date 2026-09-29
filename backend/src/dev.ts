import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { Hono } from "hono";
import { EXERCISE_TYPES, seoulDateKey, shiftSeoulDate } from "@move-together/shared";
import type { Db, Sql } from "./db";
import { ApiError } from "./errors";
import { activeChallengeId, requireDisplayName, requireUser } from "./http";
import { saveMediaObject } from "./storage";

// Developer tools for trying every screen alone: a stand-in partner, their
// workout toggle, a month of past records, and a reset of today.
// Registered only when NODE_ENV is not "production" (see app.ts).

const DEMO_NAME = "데모 상대";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// A 360x480 vertical gradient between two colors, so the demo partner's
// "photos" are visibly different from each other in the story viewer.
function samplePhoto(top: [number, number, number], bottom: [number, number, number]): Buffer {
  const width = 360;
  const height = 480;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1);
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        raw[rowStart + 1 + x * 3 + channel] = Math.round(top[channel]! + (bottom[channel]! - top[channel]!) * t);
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const SAMPLE_GRADIENTS: [number, number, number][][] = [
  [
    [242, 165, 22],
    [46, 91, 255],
  ],
  [
    [20, 33, 43],
    [242, 165, 22],
  ],
];

function randomTypes(): string {
  const codes = EXERCISE_TYPES.map((item) => item.code);
  const first = codes[Math.floor(Math.random() * codes.length)]!;
  const second = codes[Math.floor(Math.random() * codes.length)]!;
  return `{${Math.random() < 0.3 && second !== first ? `${first},${second}` : first}}`;
}

async function requireChallenge(sql: Sql, userId: string): Promise<string> {
  const challengeId = await activeChallengeId(sql, userId);
  if (!challengeId) throw new ApiError(409, "no_challenge", "먼저 가짜 상대와 연결해 주세요");
  return challengeId;
}

async function partnerOf(sql: Sql, challengeId: string, userId: string): Promise<string> {
  const rows = await sql.query<{ user_id: string }>(
    `SELECT user_id FROM challenge_members WHERE challenge_id = $1 AND user_id <> $2 LIMIT 1`,
    [challengeId, userId],
  );
  if (!rows.rows[0]) throw new ApiError(409, "no_partner", "먼저 가짜 상대와 연결해 주세요");
  return rows.rows[0].user_id;
}

export function registerDevRoutes(app: Hono, db: Db): void {
  app.post("/dev/partner", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    requireDisplayName(user);
    const result = await db.transaction(async (sql) => {
      let challengeId = await activeChallengeId(sql, user.id);
      if (!challengeId) {
        const created = await sql.query<{ id: string }>(
          `INSERT INTO challenges (created_by) VALUES ($1) RETURNING id`,
          [user.id],
        );
        challengeId = created.rows[0]!.id;
        await sql.query(`INSERT INTO challenge_members (challenge_id, user_id) VALUES ($1, $2)`, [challengeId, user.id]);
      }
      const members = await sql.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM challenge_members WHERE challenge_id = $1`,
        [challengeId],
      );
      if (Number(members.rows[0]?.count ?? 0) < 2) {
        const demo = await sql.query<{ id: string }>(
          `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
          [`demo-${randomUUID()}@movetogether.dev`, DEMO_NAME],
        );
        await sql.query(`INSERT INTO challenge_members (challenge_id, user_id) VALUES ($1, $2)`, [
          challengeId,
          demo.rows[0]!.id,
        ]);
        await sql.query(`UPDATE invites SET status = 'used' WHERE challenge_id = $1 AND status = 'pending'`, [
          challengeId,
        ]);
      }
      return { challengeId };
    });
    return c.json(result);
  });

  app.post("/dev/partner/today", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    const result = await db.transaction(async (sql) => {
      const challengeId = await requireChallenge(sql, user.id);
      const partnerId = await partnerOf(sql, challengeId, user.id);
      const today = seoulDateKey();
      const removed = await sql.query(
        `DELETE FROM workout_records WHERE challenge_id = $1 AND user_id = $2 AND seoul_date = $3 RETURNING id`,
        [challengeId, partnerId, today],
      );
      if (removed.rows.length > 0) return { partnerCompleted: false };
      const record = await sql.query<{ id: string }>(
        `INSERT INTO workout_records (challenge_id, user_id, seoul_date, exercise_types, completed_at)
         VALUES ($1, $2, $3, $4, now())
         RETURNING id`,
        [challengeId, partnerId, today, randomTypes()],
      );
      for (const [top, bottom] of SAMPLE_GRADIENTS) {
        const bytes = samplePhoto(top!, bottom!);
        const stored = await saveMediaObject({ bytes, contentType: "image/png", kind: "image" });
        await sql.query(
          `INSERT INTO media (workout_record_id, type, url, duration_seconds, size_bytes) VALUES ($1, 'image', $2, NULL, $3)`,
          [record.rows[0]!.id, stored.url, bytes.length],
        );
      }
      return { partnerCompleted: true };
    });
    return c.json(result);
  });

  app.post("/dev/history", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    const inserted = await db.transaction(async (sql) => {
      const challengeId = await requireChallenge(sql, user.id);
      const partnerId = await partnerOf(sql, challengeId, user.id);
      const today = seoulDateKey();
      let count = 0;
      for (let back = 1; back <= 30; back += 1) {
        const date = shiftSeoulDate(today, -back);
        for (const [userId, chance] of [
          [user.id, 0.75],
          [partnerId, 0.7],
        ] as const) {
          if (Math.random() > chance) continue;
          const row = await sql.query(
            `INSERT INTO workout_records (challenge_id, user_id, seoul_date, exercise_types, completed_at)
             VALUES ($1, $2, $3, $4, ($3::date + time '19:00') AT TIME ZONE 'Asia/Seoul')
             ON CONFLICT (challenge_id, user_id, seoul_date) DO NOTHING
             RETURNING id`,
            [challengeId, userId, date, randomTypes()],
          );
          count += row.rows.length;
        }
      }
      return count;
    });
    return c.json({ inserted });
  });

  app.post("/dev/reset-today", async (c) => {
    const user = await requireUser(db, c.req.header("authorization"));
    await db.transaction(async (sql) => {
      const challengeId = await requireChallenge(sql, user.id);
      const today = seoulDateKey();
      await sql.query(`DELETE FROM workout_records WHERE challenge_id = $1 AND seoul_date = $2`, [challengeId, today]);
      await sql.query(`DELETE FROM nudges WHERE challenge_id = $1 AND seoul_date = $2`, [challengeId, today]);
    });
    return c.json({ ok: true });
  });
}
