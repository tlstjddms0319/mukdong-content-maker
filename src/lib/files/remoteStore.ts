const BUCKET = "mukdong-private";

export function remoteStore() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url && !key) return null;
  if (!url) throw new Error("SUPABASE_URL is required for persistent storage.");
  if (!key) throw new Error("SUPABASE_SECRET_KEY is required for persistent storage.");
  return createRemoteStore(url, key);
}

export function createRemoteStore(url: string, key: string, fetcher: typeof fetch = fetch) {
  const base = `${new URL(url).origin}/storage/v1/object`;
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const objectUrl = (name: string) => {
    if (!name || name.split("/").some((part) => !/^[\w.-]+$/.test(part) || part === "..")) throw new Error("Invalid storage path.");
    return `${base}/${BUCKET}/${name.split("/").map(encodeURIComponent).join("/")}`;
  };
  const checked = async (response: Response) => {
    if (!response.ok) throw new RemoteStoreError(response.status, await response.text().catch(() => ""));
    return response;
  };
  // Supabase Storage는 버전에 따라 "파일 없음"을 404로, 또는 400 + {"statusCode":"404","error":"not_found"}로 돌려준다.
  // 둘 다 "없음"으로 처리해야 처음 쓰는 저장소(아직 파일이 없는 상태)에서 오류가 나지 않는다. 버킷이 없는 경우는 진짜 오류로 둔다.
  const isMissing = async (response: Response) => {
    if (response.status === 404) return true;
    if (response.status !== 400) return false;
    const body = await response.clone().text().catch(() => "");
    return /not[_ ]found|"statusCode"\s*:\s*"404"/i.test(body) && !/bucket/i.test(body);
  };

  return {
    async read(name: string): Promise<string | null> {
      const response = await fetcher(objectUrl(name).replace("/object/", "/object/authenticated/"), { headers, cache: "no-store" });
      if (await isMissing(response)) return null;
      return (await checked(response)).text();
    },
    async write(name: string, value: string | Uint8Array, contentType: string): Promise<void> {
      await checked(await fetcher(objectUrl(name), {
        method: "POST",
        headers: { ...headers, "Content-Type": contentType, "x-upsert": "true" },
        body: typeof value === "string" ? value : Buffer.from(value),
        cache: "no-store",
      }));
    },
    async remove(name: string): Promise<void> {
      const response = await fetcher(objectUrl(name), { method: "DELETE", headers, cache: "no-store" });
      if (await isMissing(response)) return;
      await checked(response);
    },
    async list(folder: string): Promise<string[]> {
      const names: string[] = [];
      for (let offset = 0; ; offset += 100) {
        const response = await checked(await fetcher(`${base}/list/${BUCKET}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ prefix: folder, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
          cache: "no-store",
        }));
        const page = await response.json() as { name: string }[];
        names.push(...page.map((item) => item.name));
        if (page.length < 100) return names;
      }
    },
  };
}

// 저장소 요청 실패. 상태 코드와 응답 본문(비밀값 없음)으로 원인을 사람이 읽을 말로 바꾼다.
export class RemoteStoreError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`Persistent storage request failed (${status}).`);
    this.name = "RemoteStoreError";
  }
  get reason(): "key" | "bucket" | "other" {
    if (/bucket/i.test(this.body) && /not[_ ]?found/i.test(this.body)) return "bucket";
    if (this.status === 401 || this.status === 403 || /jwt|signature|unauthorized|invalid.*key/i.test(this.body)) return "key";
    return "other";
  }
}

// 설정 화면의 "저장소 연결 확인": 작은 파일을 쓰고, 읽고, 지워 본다.
export type StoreCheck = { configured: boolean; ok: boolean; message: string };
export async function checkRemoteStore(): Promise<StoreCheck> {
  let store: ReturnType<typeof remoteStore>;
  try { store = remoteStore(); }
  catch (error) { return { configured: false, ok: false, message: error instanceof Error && /URL/.test(error.message) ? "SUPABASE_URL이 비어 있어요. 두 값을 함께 넣어 주세요." : "SUPABASE_SECRET_KEY가 비어 있어요. 두 값을 함께 넣어 주세요." }; }
  if (!store) return { configured: false, ok: false, message: "영구 저장소가 설정되지 않았어요. 서버가 다시 켜지면 게시물과 연결 정보가 지워져요." };
  const name = `health/check-${Date.now()}.txt`;
  try {
    await store.write(name, "ok", "text/plain");
    const value = await store.read(name);
    await store.remove(name);
    if (value !== "ok") return { configured: true, ok: false, message: "저장한 내용을 다시 읽지 못했어요. 잠시 뒤 다시 확인해 주세요." };
    return { configured: true, ok: true, message: `영구 저장소(${BUCKET})에 쓰고 읽기까지 정상이에요.` };
  } catch (error) {
    const reason = error instanceof RemoteStoreError ? error.reason : "other";
    const message = reason === "bucket" ? `Supabase에 '${BUCKET}' 버킷이 없어요. Storage에서 이 이름으로 비공개 버킷을 만들어 주세요.`
      : reason === "key" ? "Supabase가 키를 거절했어요. SUPABASE_SECRET_KEY에 secret 키(sb_secret_… 또는 service_role)를 넣었는지 확인해 주세요."
      : error instanceof RemoteStoreError ? `Supabase 응답 오류(${error.status})예요. 프로젝트가 일시정지됐는지 대시보드에서 확인해 주세요.`
      : "Supabase에 연결하지 못했어요. SUPABASE_URL 주소를 확인해 주세요.";
    return { configured: true, ok: false, message };
  }
}
