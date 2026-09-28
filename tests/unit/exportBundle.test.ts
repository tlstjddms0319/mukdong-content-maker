// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildExportBundle } from "@/lib/files/exportBundle";

describe("export bundle", () => {
  it("contains ordered numbered images, caption and safe per-slide metadata", async () => {
    const images = [
      { bytes:new Uint8Array([1]), name:"unsafe/a.jpg", source:"photo" as const },
      { bytes:new Uint8Array([2]), name:"other.jpg", source:"ai-generated" as const },
      { bytes:new Uint8Array([3]), name:"third.jpg", source:"ai-edited" as const },
      { bytes:new Uint8Array([4]), name:"fourth.jpg", source:"ai-generated" as const },
      { bytes:new Uint8Array([5]), name:"fifth.jpg", source:"design" as const },
    ];
    const bytes = await buildExportBundle({ caption:"안녕하세요 #묵동맛집", images, checks:["피사체 좋음"], postingGuide:"수동 게시 안내" });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(["caption.txt", "metadata.json", "posting-guide.txt", "slide-01.jpg", "slide-02.jpg", "slide-03.jpg", "slide-04.jpg", "slide-05.jpg"]);
    expect(await zip.file("posting-guide.txt")!.async("string")).toBe("수동 게시 안내");
    expect(await zip.file("slide-03.jpg")!.async("uint8array")).toEqual(new Uint8Array([3]));
    const metadata = await zip.file("metadata.json")!.async("string");
    expect(JSON.parse(metadata).slides).toEqual([
      { position:1, filename:"slide-01.jpg", source:"photo" },
      { position:2, filename:"slide-02.jpg", source:"ai-generated" },
      { position:3, filename:"slide-03.jpg", source:"ai-edited" },
      { position:4, filename:"slide-04.jpg", source:"ai-generated" },
      { position:5, filename:"slide-05.jpg", source:"design" },
    ]);
    expect(metadata).not.toMatch(/OPENAI_API_KEY|C:\\\\Users/);
  });

  it("supports one image and rejects an invalid image count", async () => {
    await expect(buildExportBundle({ caption:"문안", images:[{bytes:new Uint8Array([1]),name:"one.jpg",source:"photo"}],checks:[] })).resolves.toBeInstanceOf(Uint8Array);
    await expect(buildExportBundle({ caption:"문안", images:[],checks:[] })).rejects.toThrow("1장 이상");
    await expect(buildExportBundle({ caption:"문안", images:Array.from({length:11},()=>({bytes:new Uint8Array(),name:"x",source:"photo" as const})),checks:[] })).rejects.toThrow("10장");
  });
});
