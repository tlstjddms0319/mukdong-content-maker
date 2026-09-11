"use client";
import { buildExportBundle } from "@/lib/files/exportBundle";
import { InstagramPublish } from "./InstagramPublish";

const DEFAULT_CAPTION = "처음 만나는 홍어라면, 삼합부터 천천히 즐겨보세요. #묵동맛집";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
}

async function imageBytes(imageUrl: string) {
  if (imageUrl.startsWith("data:")) {
    const [header, payload] = imageUrl.split(",", 2);
    if (header.endsWith(";base64")) return Uint8Array.from(atob(payload), character => character.charCodeAt(0));
    return new TextEncoder().encode(decodeURIComponent(payload));
  }
  return new Uint8Array(await (await fetch(imageUrl)).arrayBuffer());
}

export function ExportActions({ caption = DEFAULT_CAPTION, imageUrl }: { caption?:string; imageUrl?:string }) {
  const currentImage = imageUrl ?? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1080' height='1350'%3E%3Crect width='100%25' height='100%25' fill='%231f5a43'/%3E%3C/svg%3E";
  const copy = () => navigator.clipboard?.writeText(caption);
  const downloadImage = async () => download(new Blob([await imageBytes(currentImage)], { type:"image/png" }), "instagram-image.png");
  const downloadBundle = async () => {
    const bundle = await buildExportBundle({ caption, image:await imageBytes(currentImage), imageName:"instagram-image.png", source:imageUrl?"ai-generated":"ai-edited", checks:["사용자 선택 완료", "금지 표현 검사 완료"] });
    download(new Blob([bundle as BlobPart], { type:"application/zip" }), "instagram-draft.zip");
  };
  return <><div className="export-actions"><button type="button" className="button secondary" onClick={downloadImage}>이미지 받기</button><button type="button" className="button secondary" onClick={copy}>문안 복사</button><button type="button" className="button primary" onClick={downloadBundle}>전체 묶음 받기</button></div><InstagramPublish caption={caption} imageUrl={imageUrl}/></>;
}
