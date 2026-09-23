import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
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

    async listDrafts(): Promise<Draft[]> {
      let names: string[];
      try { names = await readdir(draftsDirectory); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw new StorageError("저장된 초안 목록을 읽을 수 없습니다.", { cause:error });
      }
      const drafts = await Promise.all(names.filter(name => name.endsWith(".json") && zUuid(name.slice(0,-5))).map(name => this.readDraft(name.slice(0,-5))));
      return drafts.filter((draft): draft is Draft => draft !== null).sort((a,b) => b.updated_at.localeCompare(a.updated_at));
    },

    async saveCaption(id: string, caption: string, updatedAt = new Date().toISOString()): Promise<Draft | null> {
      const draft = await this.readDraft(id);
      if (!draft) return null;
      return this.saveDraft({ ...draft, caption, final_review_complete:draft.caption===caption?draft.final_review_complete:false, updated_at:updatedAt });
    },
  };
}

function zUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
