import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type StoredObject = {
  url: string;
};

export function s3Configured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  );
}

function extensionFor(kind: "image" | "video", contentType: string): string {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("heic")) return ".heic";
  if (contentType.includes("quicktime")) return ".mov";
  if (kind === "video" || contentType.includes("mp4")) return ".mp4";
  return ".jpg";
}

function publicBase(): string {
  return (process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? "8787"}`).replace(/\/$/, "");
}

export function localStorageDir(): string {
  return process.env.LOCAL_STORAGE_DIR ?? path.resolve(process.cwd(), "storage");
}

export async function saveMediaObject(input: {
  bytes: Buffer;
  contentType: string;
  kind: "image" | "video";
}): Promise<StoredObject> {
  const ext = extensionFor(input.kind, input.contentType);
  const key = `${randomUUID()}${ext}`;
  if (s3Configured()) {
    const client = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: input.bytes,
        ContentType: input.contentType,
      }),
    );
    const base = (process.env.S3_PUBLIC_BASE_URL ?? `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}`).replace(
      /\/$/,
      "",
    );
    return { url: `${base}/${key}` };
  }

  const dir = localStorageDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), input.bytes);
  return { url: `${publicBase()}/dev-media/${key}` };
}

export async function readLocalMedia(name: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null;
  const filePath = path.join(localStorageDir(), name);
  try {
    const bytes = await readFile(filePath);
    const contentType = name.endsWith(".png")
      ? "image/png"
      : name.endsWith(".webp")
        ? "image/webp"
        : name.endsWith(".mp4")
          ? "video/mp4"
          : name.endsWith(".mov")
            ? "video/quicktime"
            : "image/jpeg";
    return { bytes, contentType };
  } catch {
    return null;
  }
}
