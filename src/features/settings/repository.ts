import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SETTINGS } from "./defaults";
import { AppSettingsSchema, type AppSettings } from "./schema";

const dataDirectory = () => process.env.DATA_DIR ?? path.join(process.cwd(), "data");

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(path.join(dataDirectory(), "settings.json"), "utf8");
    return AppSettingsSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return AppSettingsSchema.parse(DEFAULT_SETTINGS);
    throw error;
  }
}

export async function writeSettings(value: AppSettings): Promise<void> {
  const settings = AppSettingsSchema.parse(value);
  const directory = dataDirectory();
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, "settings.json");
  await writeFile(`${target}.tmp`, JSON.stringify(settings, null, 2), "utf8");
  await rename(`${target}.tmp`, target);
}
