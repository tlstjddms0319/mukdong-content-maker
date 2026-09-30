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
    if (!response.ok) throw new Error(`Persistent storage request failed (${response.status}).`);
    return response;
  };

  return {
    async read(name: string): Promise<string | null> {
      const response = await fetcher(objectUrl(name).replace("/object/", "/object/authenticated/"), { headers, cache: "no-store" });
      if (response.status === 404) return null;
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
      if (response.status === 404) return;
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
