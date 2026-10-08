import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { ExportActions } from "@/components/review/ExportActions";

describe("ExportActions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("copies the current edited caption", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard:{ writeText } });
    render(<ExportActions caption="지금 편집한 문안" images={[{url:"data:image/png;base64,AQID",source:"ai-generated"}]} />);
    fireEvent.click(screen.getByRole("button", { name:"글 복사" }));
    expect(writeText).toHaveBeenCalledWith("지금 편집한 문안");
  });

  it("downloads the first ordered image separately and every image in the zip", async () => {
    const blobs:Blob[]=[];
    const createObjectURL = vi.fn((blob:Blob) => {blobs.push(blob);return "blob:bundle";});
    const downloads:string[]=[];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this:HTMLAnchorElement) {downloads.push(this.download);});
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL:vi.fn() });
    render(<ExportActions caption="문안" images={[{url:"data:image/png;base64,AQID",source:"photo"},{url:"data:image/png;base64,BAUG",source:"ai-generated"}]} />);
    fireEvent.click(screen.getByRole("button", { name:"첫 장만 받기" }));
    fireEvent.click(screen.getByRole("button", { name:"전체 묶음 받기" }));
    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(2));
    expect(blobs[0]).toHaveProperty("type", "image/jpeg");
    expect(new Uint8Array(await blobs[0].arrayBuffer())).toEqual(new Uint8Array([1,2,3]));
    expect(blobs[1]).toHaveProperty("type", "application/zip");
    expect(downloads).toEqual(["instagram-cover.jpg", "instagram-draft.zip"]);
    const zip=await JSZip.loadAsync(await blobs[1].arrayBuffer());
    expect(await zip.file("slide-01.jpg")!.async("uint8array")).toEqual(new Uint8Array([1,2,3]));
    expect(await zip.file("slide-02.jpg")!.async("uint8array")).toEqual(new Uint8Array([4,5,6]));
    expect(JSON.parse(await zip.file("metadata.json")!.async("string")).slides.map((slide:{source:string})=>slide.source)).toEqual(["photo","ai-generated"]);
    expect(JSON.parse(await zip.file("metadata.json")!.async("string")).checks).toContain("게시 전 사실 정보 확인 필요");
    expect(JSON.parse(await zip.file("metadata.json")!.async("string")).checks).not.toContain("금지 표현 검사 완료");
    expect(await zip.file("posting-guide.txt")!.async("string")).toContain("네이버 플레이스: https://naver.me/Ffex1C2k");
    click.mockRestore();
  });

  it("shows manual posting help instead of an Instagram publish action", () => {
    render(<ExportActions caption="문안" topic="동네 모임 저녁 홍어 한 상" audience="B" images={[{url:"data:image/png;base64,AQID",source:"photo"}]} />);

    expect(screen.getByRole("heading", { name:"인스타그램 앱에서 직접 올리기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name:"# 태그 복사" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/해시태그|문안|API/);
    expect(screen.getByText("밝은 레트로·펑크")).toBeInTheDocument();
    expect(screen.getByText("#모임맛집")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name:/바로 올리기/ })).not.toBeInTheDocument();
  });
});
