import { execFileSync, spawn } from "node:child_process";
import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { recordLoginAttempt } from "@/features/auth/attempts";
import { isOwnerConfigured } from "@/features/auth/config";
import { verifyOwnerPassword } from "@/features/auth/password";

const salt = Buffer.from("owner-auth-test-salt-2026");
const encoded = `scrypt:${salt.toString("base64url")}:${scryptSync("owner-pass", salt, 64).toString("base64url")}`;

function hashFromSplitInput(firstChunk: Buffer, secondChunk: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/hash-owner-password.mjs"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let error = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(error)));
    child.stdin.write(firstChunk);
    setTimeout(() => child.stdin.end(secondChunk), 300);
  });
}

describe("owner authentication primitives", () => {
  it("accepts the matching password but rejects wrong and malformed hashes", async () => {
    expect(await verifyOwnerPassword("owner-pass", encoded)).toBe(true);
    expect(await verifyOwnerPassword("wrong", encoded)).toBe(false);
    expect(await verifyOwnerPassword("owner-pass", "scrypt:not-a-valid-hash")).toBe(false);
    expect(await verifyOwnerPassword("owner-pass", `${encoded}:extra`)).toBe(false);
  });

  it("rejects noncanonical base64url salts and digests", async () => {
    const canonicalSalt = Buffer.alloc(32, 255).toString("base64url");
    const canonicalDigest = scryptSync("owner-pass", Buffer.from(canonicalSalt, "base64url"), 64).toString("base64url");
    const canonicalEncoded = `scrypt:${canonicalSalt}:${canonicalDigest}`;
    const standardBase64 = (value: string) => value.replace(/-/g, "+").replace(/_/g, "/");

    expect(await verifyOwnerPassword("owner-pass", canonicalEncoded)).toBe(true);
    for (const malformedSalt of [`${canonicalSalt}!`, `${canonicalSalt} `, `${canonicalSalt}=`, standardBase64(canonicalSalt)]) {
      expect(await verifyOwnerPassword("owner-pass", `scrypt:${malformedSalt}:${canonicalDigest}`)).toBe(false);
    }
    for (const malformedDigest of [`${canonicalDigest}!`, `${canonicalDigest} `, `${canonicalDigest}=`, standardBase64(canonicalDigest)]) {
      expect(await verifyOwnerPassword("owner-pass", `scrypt:${canonicalSalt}:${malformedDigest}`)).toBe(false);
    }
  });

  it("requires both owner environment values", () => {
    expect(isOwnerConfigured({ NODE_ENV: "test", AUTH_SECRET: "x".repeat(32) } as NodeJS.ProcessEnv)).toBe(false);
    expect(isOwnerConfigured({ NODE_ENV: "test", OWNER_PASSWORD_HASH: encoded } as NodeJS.ProcessEnv)).toBe(false);
    expect(isOwnerConfigured({ NODE_ENV: "test", AUTH_SECRET: "", OWNER_PASSWORD_HASH: encoded } as NodeJS.ProcessEnv)).toBe(false);
    expect(isOwnerConfigured({ NODE_ENV: "test", AUTH_SECRET: "x".repeat(32), OWNER_PASSWORD_HASH: encoded } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("blocks the fifth failed attempt for fifteen minutes without clearing it on a correct password", () => {
    const key = `owner-${Date.now()}`;
    const startedAt = 1_000;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(recordLoginAttempt(key, false, startedAt).blocked).toBe(false);
    }
    expect(recordLoginAttempt(key, false, startedAt).blocked).toBe(true);
    expect(recordLoginAttempt(key, true, startedAt + 1).blocked).toBe(true);
    expect(recordLoginAttempt(key, true, startedAt + 15 * 60 * 1_000).blocked).toBe(false);
  });

  it("creates a scrypt hash and separate auth secret from standard input", () => {
    const output = execFileSync(process.execPath, ["scripts/hash-owner-password.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: "owner-pass\n",
    });
    const [hashAssignment, secretAssignment] = output.trimEnd().split("\n");
    const generatedHash = hashAssignment?.replace("OWNER_PASSWORD_HASH=", "");
    const generatedSecret = secretAssignment?.replace("AUTH_SECRET=", "");
    const [, generatedSalt, generatedDigest] = generatedHash?.split(":") ?? [];

    expect(generatedHash).toMatch(/^scrypt:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(Buffer.from(generatedSalt!, "base64url")).toHaveLength(32);
    expect(Buffer.from(generatedDigest!, "base64url")).toHaveLength(64);
    expect(scryptSync("owner-pass", Buffer.from(generatedSalt!, "base64url"), 64).toString("base64url")).toBe(generatedDigest);
    expect(Buffer.from(generatedSecret!, "base64url")).toHaveLength(32);
  });

  it("preserves a Korean password when its UTF-8 bytes arrive in separate chunks", async () => {
    const password = "한글암호";
    const input = Buffer.from(`${password}\n`, "utf8");
    const output = await hashFromSplitInput(input.subarray(0, 1), input.subarray(1));
    const generatedHash = output.trimEnd().split("\n")[0]?.replace("OWNER_PASSWORD_HASH=", "");
    const [, generatedSalt, generatedDigest] = generatedHash?.split(":") ?? [];

    expect(scryptSync(password, Buffer.from(generatedSalt!, "base64url"), 64).toString("base64url")).toBe(generatedDigest);
  });
});
