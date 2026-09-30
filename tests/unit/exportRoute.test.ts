// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive:true, force:true });
  directory=undefined;
  delete process.env.DATA_DIR;
  vi.resetModules();
});

it("exports the saved caption and selected images instead of placeholders", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-export-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const { createDraftRepository }=await import("@/features/drafts/repository");
  const id="22222222-2222-4222-8222-222222222222";
  const image=Buffer.from("fake-jpeg-bytes");
  await createDraftRepository(directory).saveDraft({id,status:"ready",topic:"홍어 한 점",audience:"A",media_candidates:[{id:"44444444-4444-4444-8444-444444444444",source:"design",file_id:`data:image/jpeg;base64,${image.toString("base64")}`,purpose:"instagram-primary"}],selected_media_id:"44444444-4444-4444-8444-444444444444",copy:null,caption:"저장한 실제 문안",facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-10T00:00:00.000Z",updated_at:"2026-09-10T00:00:00.000Z"});
  const { GET }=await import("@/app/api/export/[draftId]/route");

  const response=await GET(new Request(`http://localhost/api/export/${id}`),{params:Promise.resolve({draftId:id})});
  expect(response.status).toBe(200);
  const zip=await JSZip.loadAsync(await response.arrayBuffer());
  expect(await zip.file("caption.txt")!.async("string")).toBe("저장한 실제 문안");
  expect(Buffer.from(await zip.file("slide-01.jpg")!.async("uint8array")).equals(image)).toBe(true);

  const missing=await GET(new Request("http://localhost/api/export/x"),{params:Promise.resolve({draftId:"33333333-3333-4333-8333-333333333333"})});
  expect(missing.status).toBe(404);
});
