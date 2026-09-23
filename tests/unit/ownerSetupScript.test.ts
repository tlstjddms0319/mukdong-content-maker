import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scryptSync } from "node:crypto";
import { expect, it } from "vitest";

it("saves owner login values without exposing them or changing other local settings", () => {
  const directory = mkdtempSync(join(tmpdir(), "owner-setup-"));
  const scripts = join(directory, "scripts");
  mkdirSync(scripts);
  copyFileSync(resolve("scripts/setup-owner-password.ps1"), join(scripts, "setup-owner-password.ps1"));
  copyFileSync(resolve("scripts/hash-owner-password.mjs"), join(scripts, "hash-owner-password.mjs"));
  const envPath = join(directory, ".env.local");
  writeFileSync(envPath, "AI_API_KEY=keep-this-value\nAUTH_URL=http://127.0.0.1:3000\nOWNER_PASSWORD_HASH=old\nAUTH_SECRET=old\n");

  try {
    const command = `function Read-Host { param([string]$Prompt, [switch]$AsSecureString) $value = New-Object System.Security.SecureString; 'owner-pass'.ToCharArray() | ForEach-Object { $value.AppendChar($_) }; return $value }; & '${join(scripts, "setup-owner-password.ps1")}'`;
    const output = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      cwd: directory,
      encoding: "utf8",
      timeout: 15_000,
    });
    const content = readFileSync(envPath, "utf8");
    const hash = content.match(/^OWNER_PASSWORD_HASH=(.+)$/m)?.[1];
    const secret = content.match(/^AUTH_SECRET=(.+)$/m)?.[1];
    const [, salt, digest] = hash?.split(":") ?? [];

    expect(content).toContain("AI_API_KEY=keep-this-value\n");
    expect(content).toContain("AUTH_URL=http://127.0.0.1:3000\n");
    expect(content.match(/^OWNER_PASSWORD_HASH=/gm)).toHaveLength(1);
    expect(content.match(/^AUTH_SECRET=/gm)).toHaveLength(1);
    expect(hash).toMatch(/^scrypt:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(scryptSync("owner-pass", Buffer.from(salt!, "base64url"), 64).toString("base64url")).toBe(digest);
    expect(Buffer.from(secret!, "base64url")).toHaveLength(32);
    expect(output).not.toContain(hash);
    expect(output).not.toContain(secret);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("rejects a blank owner password without modifying local settings", () => {
  const directory = mkdtempSync(join(tmpdir(), "owner-setup-"));
  const scripts = join(directory, "scripts");
  mkdirSync(scripts);
  copyFileSync(resolve("scripts/setup-owner-password.ps1"), join(scripts, "setup-owner-password.ps1"));
  copyFileSync(resolve("scripts/hash-owner-password.mjs"), join(scripts, "hash-owner-password.mjs"));
  const envPath = join(directory, ".env.local");
  const original = "AI_API_KEY=keep-this-value\n";
  writeFileSync(envPath, original);

  try {
    const command = `function Read-Host { param([string]$Prompt, [switch]$AsSecureString) return (New-Object System.Security.SecureString) }; & '${join(scripts, "setup-owner-password.ps1")}'`;
    expect(() => execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      cwd: directory,
      encoding: "utf8",
      timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"],
    })).toThrow();
    expect(readFileSync(envPath, "utf8")).toBe(original);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
