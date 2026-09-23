import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (input: string, salt: Buffer, keyLength: number) => Promise<Buffer>;
const base64url = /^[A-Za-z0-9_-]+$/;

function decodeCanonicalBase64url(value: string): Buffer | null {
  if (!base64url.test(value)) return null;

  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

export async function verifyOwnerPassword(input: string, encoded: string): Promise<boolean> {
  const parts = encoded.split(":");
  if (parts.length !== 3) return false;

  const [kind, salt, digest] = parts;
  if (kind !== "scrypt" || !salt || !digest) return false;

  try {
    const expected = decodeCanonicalBase64url(digest);
    const decodedSalt = decodeCanonicalBase64url(salt);
    if (!expected || !decodedSalt || expected.length !== 64 || decodedSalt.length === 0) return false;

    const actual = await scryptAsync(input, decodedSalt, 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
