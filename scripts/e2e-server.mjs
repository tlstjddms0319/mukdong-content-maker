import { spawn } from "node:child_process";
import { cp, lstat, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureParent = path.join(project, ".superpowers", "sdd", "2026-09-22-owner-access");
const fixture = await mkdtemp(path.join(fixtureParent, "e2e-app-"));
if (!path.resolve(fixture).startsWith(path.resolve(fixtureParent) + path.sep)) throw new Error("Unsafe test fixture path");

let active;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => active?.kill(signal));

function runNext(args, env) {
  return new Promise((resolve, reject) => {
    active = spawn(process.execPath, [path.join(project, "node_modules", "next", "dist", "bin", "next"), ...args], {
      cwd: fixture,
      env,
      stdio: "inherit",
    });
    active.once("error", reject);
    active.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Next ${args[0]} exited ${code}`)));
  });
}

try {
  for (const name of ["src", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "next-env.d.ts"]) {
    const source = path.join(project, name);
    if ((await lstat(source)).isSymbolicLink()) throw new Error(`Symlink not allowed in test fixture: ${name}`);
    await cp(source, path.join(fixture, name), { recursive: name === "src" });
  }
  const env = {};
  for (const name of ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "ComSpec"]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  Object.assign(env, {
    AUTH_URL: "http://127.0.0.1:3001",
    AUTH_SECRET: process.env.AUTH_SECRET,
    OWNER_PASSWORD_HASH: process.env.OWNER_PASSWORD_HASH,
    DATA_DIR: path.join(fixture, "data"),
  });
  if (!env.AUTH_SECRET || !env.OWNER_PASSWORD_HASH) throw new Error("Missing test owner configuration");
  await runNext(["build", fixture], env);
  await runNext(["start", fixture, "-p", "3001", "-H", "127.0.0.1"], env);
} finally {
  if (!path.resolve(fixture).startsWith(path.resolve(fixtureParent) + path.sep)) throw new Error("Unsafe test fixture cleanup path");
  await rm(fixture, { recursive: true, force: true });
}
