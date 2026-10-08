import { spawn } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureParent = path.join(project, ".superpowers", "sdd", "2026-09-22-owner-access");
const insideParent = (target) => path.resolve(target).startsWith(path.resolve(fixtureParent) + path.sep);
await mkdir(fixtureParent, { recursive: true });

// 강제로 멈춘 실행(Ctrl+C 두 번, 시간 초과로 죽은 프로세스)은 finally에 닿지 못해 e2e-app-* 복사본을 남긴다.
// 하나가 200MB쯤이라 쌓이면 수십 GB가 된다(26GB까지 찾았다). 시작할 때 30분보다 오래됐고 주인 프로세스가 없는 것만 지운다
// (지금 다른 창에서 도는 실행의 복사본은 그 프로세스가 살아 있으니 건드리지 않는다).
const STALE_MS = 30 * 60 * 1000;
const OWNER_FILE = ".e2e-owner-pid";
function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}
for (const entry of await readdir(fixtureParent, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^e2e-app-[A-Za-z0-9]+$/.test(entry.name)) continue;
  const stale = path.join(fixtureParent, entry.name);
  if (!insideParent(stale)) continue;
  const info = await lstat(stale).catch(() => null);
  if (!info || info.isSymbolicLink() || Date.now() - info.mtimeMs < STALE_MS) continue;
  const owner = Number(await readFile(path.join(stale, OWNER_FILE), "utf8").catch(() => ""));
  if (processAlive(owner)) continue;
  await rm(stale, { recursive: true, force: true }).catch((error) => console.warn(`Could not remove stale fixture ${entry.name}: ${error.message}`));
}

const fixture = await mkdtemp(path.join(fixtureParent, "e2e-app-"));
if (!insideParent(fixture)) throw new Error("Unsafe test fixture path");
await writeFile(path.join(fixture, OWNER_FILE), String(process.pid));

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
  for (const name of ["src", "assets", "public", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "next-env.d.ts"]) {
    const source = path.join(project, name);
    if ((await lstat(source)).isSymbolicLink()) throw new Error(`Symlink not allowed in test fixture: ${name}`);
    await cp(source, path.join(fixture, name), { recursive: name === "src" || name === "assets" || name === "public" });
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
  if (!insideParent(fixture)) throw new Error("Unsafe test fixture cleanup path");
  await rm(fixture, { recursive: true, force: true });
}
