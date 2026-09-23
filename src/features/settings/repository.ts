import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { DEFAULT_SETTINGS } from "./defaults";
import { AppSettingsSchema, type AppSettings } from "./schema";

const dataDirectory = () => process.env.DATA_DIR ?? path.join(process.cwd(), "data");
let writeQueue: Promise<void> = Promise.resolve();

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(path.join(dataDirectory(), "settings.json"), "utf8");
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const imageAiProvider=stored.imageAiRoutingVersion===1 ? stored.imageAiProvider : "automatic";
    return AppSettingsSchema.parse({ ...stored, carouselSlideCount:stored.carouselSlideCount ?? 5, textAiProvider:stored.textAiProvider ?? "gemini", imageAiProvider });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return AppSettingsSchema.parse(DEFAULT_SETTINGS);
    throw error;
  }
}

export async function writeSettings(value: AppSettings): Promise<void> {
  const settings = AppSettingsSchema.parse(value);
  const write = async () => {
    const directory = dataDirectory();
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, "settings.json");
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({...settings,imageAiRoutingVersion:1}, null, 2), "utf8");
    await rename(temporary, target);
  };
  const pending = writeQueue.then(write);
  writeQueue = pending.catch(() => undefined);
  return pending;
}
