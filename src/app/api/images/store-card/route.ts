import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { DesignSpecSchema, PaletteIdSchema } from "@/features/images/design";
import { StoredStyleIdSchema } from "@/features/images/styleCatalog";
import { renderStorePromoImage } from "@/features/images/storeCard";
import { readSettings } from "@/features/settings/repository";

// 캐러셀 맨 뒤 가게 홍보 카드("묵동홍어마을" 한 장). 이미지 AI를 부르지 않고 코드로만 그린다(비용 없음).
// 요청: {design, index, total}  →  응답: {image:"data:image/jpeg;base64,..."}
// 계정(@아이디)은 요청에서 받지 않고 설정(brandHandle)에서 읽는다(다른 카드 바닥글과 같은 값).
// 저장된 초안의 예전 계열 이름(y2k·newspaper)도 받도록 계열은 StoredStyleIdSchema로 읽고, 색 조합이 빠졌으면 기본(warm).
const StoreCardRequestSchema=z.object({
  design:DesignSpecSchema.extend({palette:PaletteIdSchema.default("warm"),style:StoredStyleIdSchema.default("template")}).optional(),
  index:z.number().int().min(1).max(30),
  total:z.number().int().min(1).max(30),
}).refine(body=>body.index<=body.total,{message:"index must not exceed total"});

export async function POST(request:Request){
  const denied=await ownerApiError();if(denied)return denied;
  let body:z.infer<typeof StoreCardRequestSchema>;
  try{body=StoreCardRequestSchema.parse(await request.json());}
  catch{return NextResponse.json({message:"홍보 카드 설정(디자인·장 번호)을 확인해 주세요."},{status:400,headers:{"Cache-Control":"no-store"}});}
  try{
    // 설정을 못 읽어도 카드는 계정 없이 그린다(바닥글이 빠질 뿐 실패할 일은 아니다).
    const settings=await readSettings().catch((error)=>{console.warn("[settings] 설정을 읽지 못해 계정 없이 홍보 카드를 그립니다:",error instanceof Error?error.message:String(error));return null;});
    // 사장님 홍보 포스터(assets/store/promo-card.webp)가 있으면 그것을, 없으면 코드 디자인으로 그린다.
    const image=await renderStorePromoImage(body.design,body.index,body.total,{brandHandle:settings?.brandHandle??""});
    return NextResponse.json({image:`data:image/jpeg;base64,${image.toString("base64")}`},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    console.error("[store-card] 홍보 카드를 그리지 못했어요:",error instanceof Error?error.message:String(error));
    return NextResponse.json({message:"홍보 카드를 만들지 못했어요. 다시 시도해 주세요."},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
