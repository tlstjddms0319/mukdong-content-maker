import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { remoteStore } from "@/lib/files/remoteStore";
import { DraftSchema, type Draft } from "./schema";
import { selectedDraftMedia } from "./selection";
import { summarizeDraft, type DraftSummary } from "./summary";

// 목록용 요약(draft-summaries/)과 작은 썸네일(draft-thumbs/)을 초안과 함께 저장한다(summary.ts 설명 참고).
// 요약 목록은 이 서버 프로세스 메모리에도 10분 동안 들고 있는다. 초안을 쓰는 곳은 이 프로세스뿐이라(저장·삭제 때 함께 고친다)
// 1분마다 도는 예약 점검이 저장소를 매번 읽지 않아도 된다. 다른 곳에서 바뀌었을 때를 대비해 10분마다 다시 읽는다.
const SUMMARY_DIR="draft-summaries",THUMB_DIR="draft-thumbs";
const SUMMARY_TTL_MS=10*60*1000;
// Next는 화면(서버 컴포넌트)과 API 라우트를 따로 묶어, 이 파일이 서버 안에서 여러 번 불러와질 수 있다.
// 그래도 한 프로세스에서 같은 목록을 보도록 globalThis에 둔다(예: API로 저장한 초안이 내 초안 화면에 바로 보이게).
type SummaryCache={entries:Map<string,{loadedAt:number;items:Map<string,DraftSummary>}>;loads:Map<string,Promise<Map<string,DraftSummary>>>};
const shared=globalThis as typeof globalThis&{__mukdongDraftSummaries?:SummaryCache};
shared.__mukdongDraftSummaries??={entries:new Map(),loads:new Map()};
const summaryCache=shared.__mukdongDraftSummaries.entries;
const summaryLoads=shared.__mukdongDraftSummaries.loads;
const THUMB_WIDTH=300,THUMB_HEIGHT=375;

// 표지(첫 선택 이미지)로 300×375 JPEG 썸네일(data URL)을 만든다. 사진을 읽지 못하면 null.
async function thumbnailOf(draft:Draft):Promise<string|null> {
  const cover=selectedDraftMedia(draft)[0]?.file_id;
  const match=cover?.match(/^data:image\/(?:png|jpeg|webp|gif);base64,(.+)$/i);
  if(!match)return null;
  try{
    const bytes=await sharp(Buffer.from(match[1],"base64")).rotate().resize(THUMB_WIDTH,THUMB_HEIGHT,{fit:"cover"}).jpeg({quality:72}).toBuffer();
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  }catch{return null;}
}

export class StorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StorageError";
  }
}

export function createDraftRepository(dataDirectory = process.env.DATA_DIR ?? path.join(process.cwd(), "data")) {
  const draftsDirectory = path.join(dataDirectory, "drafts");
  const cacheKey = () => (process.env.SUPABASE_URL ? `remote:${process.env.SUPABASE_URL}` : `local:${draftsDirectory}`);

  // 작은 텍스트 파일 읽기·쓰기·지우기(요약 JSON, 썸네일 data URL). Supabase가 있으면 그쪽, 없으면 로컬 폴더.
  const side = {
    async write(folder: string, id: string, value: string, contentType: string) {
      const remote = remoteStore();
      if (remote) { await remote.write(`${folder}/${id}.${contentType === "application/json" ? "json" : "txt"}`, value, contentType); return; }
      const directory = path.join(dataDirectory, folder);
      await mkdir(directory, { recursive: true });
      const target = path.join(directory, `${id}.${contentType === "application/json" ? "json" : "txt"}`);
      await writeFile(`${target}.tmp`, value, "utf8");
      await rename(`${target}.tmp`, target);
    },
    async read(folder: string, file: string): Promise<string | null> {
      const remote = remoteStore();
      if (remote) return remote.read(`${folder}/${file}`);
      try { return await readFile(path.join(dataDirectory, folder, file), "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    },
    async remove(folder: string, file: string) {
      const remote = remoteStore();
      if (remote) { await remote.remove(`${folder}/${file}`); return; }
      await rm(path.join(dataDirectory, folder, file), { force: true });
    },
    async list(folder: string): Promise<string[]> {
      const remote = remoteStore();
      if (remote) return remote.list(folder);
      try { return await readdir(path.join(dataDirectory, folder)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    },
  };

  // 요약·썸네일을 쓴다. 실패해도 초안 저장은 성공으로 둔다(다음 목록에서 초안을 읽어 다시 만든다).
  async function writeSidecars(draft: Draft) {
    const summary = summarizeDraft(draft);
    summaryCache.get(cacheKey())?.items.set(draft.id, summary);
    try {
      await side.write(SUMMARY_DIR, draft.id, JSON.stringify(summary), "application/json");
      const thumbnail = await thumbnailOf(draft);
      if (thumbnail) await side.write(THUMB_DIR, draft.id, thumbnail, "text/plain");
      else await side.remove(THUMB_DIR, `${draft.id}.txt`);
    } catch (error) {
      console.warn("[drafts] 초안 요약을 저장하지 못했어요(다음 목록에서 다시 만들어요):", error instanceof Error ? error.message : String(error));
      await side.remove(SUMMARY_DIR, `${draft.id}.json`).catch(() => {});
    }
    return summary;
  }

  // 메서드를 떼어 넘겨도(예: listDrafts: drafts.listDrafts) 동작하도록 this 대신 repo를 쓴다.
  const repo = {
    async saveDraft(value: Draft): Promise<Draft> {
      const draft = DraftSchema.parse(value);
      const remote = remoteStore();
      if (remote) {
        await remote.write(`drafts/${draft.id}.json`, JSON.stringify(draft), "application/json");
        await writeSidecars(draft);
        return draft;
      }
      await mkdir(draftsDirectory, { recursive: true });
      const target = path.join(draftsDirectory, `${draft.id}.json`);
      const temporary = `${target}.tmp`;
      await writeFile(temporary, JSON.stringify(draft, null, 2), "utf8");
      await rename(temporary, target);
      await writeSidecars(draft);
      return draft;
    },

    // 목록용 요약(최근 수정순). 요약이 없는 예전 초안은 이때 한 번 초안을 읽어 요약을 만든다.
    async listDraftSummaries(): Promise<DraftSummary[]> {
      const key = cacheKey();
      const cached = summaryCache.get(key);
      if (cached && Date.now() - cached.loadedAt < SUMMARY_TTL_MS) return sortSummaries([...cached.items.values()]);
      let load = summaryLoads.get(key);
      if (!load) {
        load = (async () => {
          let draftNames: string[];
          try {
            const remote = remoteStore();
            draftNames = remote ? await remote.list("drafts") : await readdir(draftsDirectory);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") draftNames = [];
            else throw new StorageError("저장된 초안 목록을 읽을 수 없습니다.", { cause: error });
          }
          const ids = draftNames.filter(name => name.endsWith(".json") && zUuid(name.slice(0, -5))).map(name => name.slice(0, -5));
          const summaryNames = new Set(await side.list(SUMMARY_DIR).catch(() => [] as string[]));
          const items = new Map<string, DraftSummary>();
          await Promise.all(ids.map(async id => {
            let summary: DraftSummary | null = null;
            if (summaryNames.has(`${id}.json`)) {
              try { const raw = await side.read(SUMMARY_DIR, `${id}.json`); summary = raw ? JSON.parse(raw) as DraftSummary : null; } catch { summary = null; }
            }
            if (!summary) {
              const draft = await repo.readDraft(id).catch(() => null);
              if (draft) summary = await writeSidecars(draft);
            }
            if (summary) items.set(id, summary);
          }));
          summaryCache.set(key, { loadedAt: Date.now(), items });
          return items;
        })().finally(() => summaryLoads.delete(key));
        summaryLoads.set(key, load);
      }
      return sortSummaries([...(await load).values()]);
    },

    // 목록 화면의 작은 표지(data URL). 없으면 초안을 읽어 만든다. 이미지가 없으면 null.
    async readThumbnail(id: string): Promise<string | null> {
      if (!zUuid(id)) return null;
      const stored = await side.read(THUMB_DIR, `${id}.txt`).catch(() => null);
      if (stored) return stored;
      const draft = await repo.readDraft(id);
      if (!draft) return null;
      await writeSidecars(draft);
      return side.read(THUMB_DIR, `${id}.txt`).catch(() => null);
    },

    // 초안 지우기: 초안·요약·썸네일을 함께 지운다. 없는 초안이면 false.
    async deleteDraft(id: string): Promise<boolean> {
      if (!zUuid(id)) return false;
      const existing = await repo.readDraft(id);
      if (!existing) return false;
      const remote = remoteStore();
      if (remote) await remote.remove(`drafts/${id}.json`);
      else await rm(path.join(draftsDirectory, `${id}.json`), { force: true });
      summaryCache.get(cacheKey())?.items.delete(id);
      await Promise.all([side.remove(SUMMARY_DIR, `${id}.json`), side.remove(THUMB_DIR, `${id}.txt`)]).catch(() => {});
      return true;
    },

    async readDraft(id: string): Promise<Draft | null> {
      if (!zUuid(id)) return null;
      try {
        const remote = remoteStore();
        if (remote) {
          const raw = await remote.read(`drafts/${id}.json`);
          return raw === null ? null : DraftSchema.parse(JSON.parse(raw));
        }
        const raw = await readFile(path.join(draftsDirectory, `${id}.json`), "utf8");
        return DraftSchema.parse(JSON.parse(raw));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new StorageError("저장된 초안을 읽을 수 없습니다.", { cause: error });
      }
    },

    async listDrafts(): Promise<Draft[]> {
      let names: string[];
      try {
        const remote = remoteStore();
        names = remote ? await remote.list("drafts") : await readdir(draftsDirectory);
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw new StorageError("저장된 초안 목록을 읽을 수 없습니다.", { cause:error });
      }
      const drafts = await Promise.all(names.filter(name => name.endsWith(".json") && zUuid(name.slice(0,-5))).map(name => repo.readDraft(name.slice(0,-5))));
      return drafts.filter((draft): draft is Draft => draft !== null).sort((a,b) => b.updated_at.localeCompare(a.updated_at));
    },

    async saveCaption(id: string, caption: string, updatedAt = new Date().toISOString()): Promise<Draft | null> {
      const draft = await repo.readDraft(id);
      if (!draft) return null;
      return repo.saveDraft({ ...draft, caption, final_review_complete:draft.caption===caption?draft.final_review_complete:false, updated_at:updatedAt });
    },
  };
  return repo;
}

function sortSummaries(items: DraftSummary[]) {
  return items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

// 테스트에서 저장소 폴더를 바꿀 때 메모리 요약을 비운다.
export function resetDraftSummaryCache() { summaryCache.clear(); summaryLoads.clear(); }

function zUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
