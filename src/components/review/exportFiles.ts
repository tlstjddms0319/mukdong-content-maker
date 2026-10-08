// 내려받기·사진첩 저장에 함께 쓰는 도우미(확인 화면의 "휴대폰에 저장하기"와 더보기의 파일 받기).
export type ReviewImage={url:string;source:"photo"|"design"|"ai-generated"|"ai-edited"};

// 클릭 직후 주소를 지우면 일부 브라우저(특히 Safari)가 내려받기를 시작하지 못한다. 잠시 뒤에 지운다.
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export const slideName = (index: number) => `instagram-${String(index + 1).padStart(2, "0")}.jpg`;

export async function imageBytes(imageUrl: string) {
  if (imageUrl.startsWith("data:")) {
    const [header, payload] = imageUrl.split(",", 2);
    if (header.endsWith(";base64")) return Uint8Array.from(atob(payload), character => character.charCodeAt(0));
    return new TextEncoder().encode(decodeURIComponent(payload));
  }
  return new Uint8Array(await (await fetch(imageUrl)).arrayBuffer());
}

// 글을 복사한다. 실패하면 false(안내는 부르는 쪽이 한다).
export async function copyText(text:string):Promise<boolean> {
  try{await navigator.clipboard.writeText(text);return true;}catch{return false;}
}

// 휴대폰에서 장마다 사진첩에 저장: 공유 창이 파일을 받을 수 있으면(iPhone·Android) 한 번에 넘기고, 아니면 한 장씩 내려받는다.
// 돌려주는 값: "shared"(공유 창을 열었음) · "downloaded"(내려받음) · "cancelled"(사장님이 공유 창을 닫음).
export async function saveSlides(images:ReviewImage[],title:string):Promise<"shared"|"downloaded"|"cancelled"> {
  const files = await Promise.all(images.map(async (image, index) => new File([await imageBytes(image.url) as BlobPart], slideName(index), { type: "image/jpeg" })));
  try {
    if (navigator.canShare?.({ files })) { await navigator.share({ files, title }); return "shared"; }
  } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return "cancelled"; }
  for (const [index, file] of files.entries()) { download(file, slideName(index)); await new Promise(resolve => setTimeout(resolve, 400)); }
  return "downloaded";
}
