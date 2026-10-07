import { ownerApiError } from "@/features/auth/guard";
import { createDraftRepository } from "@/features/drafts/repository";

// 목록 화면의 작은 표지(300×375 JPEG). 주소에 초안 수정 시각(v)이 붙어 있어, 같은 주소는 브라우저가 오래 캐시해도 된다.
export async function GET(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const id=new URL(request.url).searchParams.get("id")??"";
  const thumbnail=await createDraftRepository().readThumbnail(id).catch(()=>null);
  const match=thumbnail?.match(/^data:image\/jpeg;base64,(.+)$/);
  if(!match)return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
  return new Response(new Uint8Array(Buffer.from(match[1],"base64")),{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, max-age=31536000, immutable"}});
}
