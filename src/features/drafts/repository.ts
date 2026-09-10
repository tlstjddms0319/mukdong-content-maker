import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DraftSchema, type Draft } from "./schema";

export class StorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StorageError";
  }
}

export function createDraftRepository(dataDirectory = process.env.DATA_DIR ?? path.join(process.cwd(), "data")) {
  const draftsDirectory = path.join(dataDirectory, "drafts");

  return {
    async saveDraft(value: Draft): Promise<Draft> {
      const draft = DraftSchema.parse(value);
      await mkdir(draftsDirectory, { recursive: true });
      const target = path.join(draftsDirectory, `${draft.id}.json`);
      const temporary = `${target}.tmp`;
      await writeFile(temporary, JSON.stringify(draft, null, 2), "utf8");
      await rename(temporary, target);
      return draft;
    },

    async readDraft(id: string): Promise<Draft | null> {
      if (!zUuid(id)) return null;
      try {
        const raw = await readFile(path.join(draftsDirectory, `${id}.json`), "utf8");
        return DraftSchema.parse(JSON.parse(raw));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new StorageError("저장된 초안을 읽을 수 없습니다.", { cause: error });
      }
    },
  };
}

function zUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
