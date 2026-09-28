import { createHash, randomBytes } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function inviteCode(length = 8): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += INVITE_ALPHABET[bytes[index]! % INVITE_ALPHABET.length];
  }
  return code;
}
