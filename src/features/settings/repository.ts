import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { remoteStore } from "@/lib/files/remoteStore";
import { DEFAULT_SETTINGS } from "./defaults";
import { AppSettingsSchema, type AppSettings } from "./schema";

const dataDirectory = () => process.env.DATA_DIR ?? path.join(process.cwd(), "data");
let writeQueue: Promise<void> = Promise.resolve();

export async function readSettings(): Promise<AppSettings> {
  try {
    const remote = remoteStore();
    const raw = remote ? await remote.read("settings.json") : await readFile(path.join(dataDirectory(), "settings.json"), "utf8");
    if (raw === null) return AppSettingsSchema.parse(DEFAULT_SETTINGS);
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const imageAiProvider=stored.imageAiRoutingVersion===1 ? stored.imageAiProvider : "automatic";
    return AppSettingsSchema.parse({ ...stored, copyLength:stored.copyWritingVersion===1?stored.copyLength:DEFAULT_SETTINGS.copyLength, carouselSlideCount:stored.carouselSlideCount ?? 5, textAiProvider:stored.textAiRoutingVersion===1 ? stored.textAiProvider : "automatic", imageAiProvider });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return AppSettingsSchema.parse(DEFAULT_SETTINGS);
    throw error;
  }
}

export async function writeSettings(value: AppSettings): Promise<void> {
  const settings = AppSettingsSchema.parse(value);
  const write = async () => {
    const remote = remoteStore();
    if (remote) {
      await remote.write("settings.json", JSON.stringify({...settings,imageAiRoutingVersion:1,copyWritingVersion:1,textAiRoutingVersion:1}), "application/json");
      return;
    }
    const directory = dataDirectory();
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, "settings.json");
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({...settings,imageAiRoutingVersion:1,copyWritingVersion:1,textAiRoutingVersion:1}, null, 2), "utf8");
    await rename(temporary, target);
  };
  const pending = writeQueue.then(write);
  writeQueue = pending.catch(() => undefined);
  return pending;
}
