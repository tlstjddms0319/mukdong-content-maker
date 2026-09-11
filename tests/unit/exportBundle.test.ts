// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildExportBundle } from "@/lib/files/exportBundle";

describe("export bundle", () => {
  it("contains one image, caption and safe metadata", async () => {
    const bytes = await buildExportBundle({ caption:"안녕하세요 #묵동맛집", image:new Uint8Array([1,2,3]), imageName:"post.jpg", source:"ai-generated", checks:["피사체 좋음"] });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(["caption.txt", "metadata.json", "post.jpg"]);
    const metadata = await zip.file("metadata.json")!.async("string");
    expect(metadata).toContain("ai-generated");
    expect(metadata).not.toMatch(/OPENAI_API_KEY|C:\\\\Users/);
  });
});
