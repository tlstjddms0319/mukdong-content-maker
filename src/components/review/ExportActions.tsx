"use client";
import { buildExportBundle } from "@/lib/files/exportBundle";
import { InstagramPublish } from "./InstagramPublish";

const DEFAULT_CAPTION = "처음 만나는 홍어라면, 삼합부터 천천히 즐겨보세요. #묵동맛집";
export type ReviewImage={url:string;source:"photo"|"ai-generated"|"ai-edited"};

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

export function ExportActions({ caption = DEFAULT_CAPTION, images, draftId }: { caption?:string; images:ReviewImage[]; draftId?:string }) {
  const copy = () => navigator.clipboard?.writeText(caption);
  const downloadImage = async () => { const cover=images[0]; if(cover)download(new Blob([await imageBytes(cover.url)], { type:"image/jpeg" }), "instagram-cover.jpg"); };
  const downloadBundle = async () => {
    const bundle = await buildExportBundle({ caption, images:await Promise.all(images.map(async image=>({bytes:await imageBytes(image.url),name:image.url,source:image.source}))), checks:["사용자 선택 완료", "게시 전 사실 정보 확인 필요"] });
    download(new Blob([bundle as BlobPart], { type:"application/zip" }), "instagram-draft.zip");
  };
  return <><div className="export-actions"><button type="button" className="button secondary" disabled={!images.length} onClick={()=>void downloadImage()}>표지 이미지 받기</button><button type="button" className="button secondary" onClick={copy}>문안 복사</button><button type="button" className="button primary" disabled={!images.length} onClick={()=>void downloadBundle()}>전체 묶음 받기</button></div><InstagramPublish draftId={draftId} caption={caption} imageUrls={images.map(image=>image.url)}/></>;
}
