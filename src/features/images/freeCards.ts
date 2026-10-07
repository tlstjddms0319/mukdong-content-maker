import { z } from "zod";

export const AssetKindSchema=z.enum(["photo","stock","illustration","ai-generated"]);
export const ASSET_KIND_LABELS={photo:"직접 촬영",stock:"자료 사진",illustration:"설명용 일러스트","ai-generated":"AI 연출 이미지"} as const;
export const AssetDetailsSchema=z.object({
  name:z.string().trim().min(1).max(60),
  tags:z.array(z.string().trim().min(1).max(24)).min(1).max(12),
  kind:AssetKindSchema,
  credit:z.string().trim().min(1).max(200),
});
export const LibraryAssetSchema=AssetDetailsSchema.extend({
  id:z.string().uuid(),preview:z.string().startsWith("data:image/jpeg;base64,").max(6_000_000),
  createdAt:z.string().datetime(),lastUsedAt:z.string().datetime().nullable(),
  // 게시물에 쓴 횟수(사진 보관함의 "자주 쓴 사진" 정렬용). 예전에 저장한 사진에는 없으므로 0부터.
  useCount:z.number().int().min(0).default(0),
  // 사진 품질(계획서 A11). 보관함에 넣을 때 render/photoEnhance.ts photoQuality()로 한 번 잰다. 예전 사진에는 없다(null).
  quality:z.object({
    luminance:z.number(),saturation:z.number(),cast:z.number(),sharpness:z.number(),longSide:z.number().int(),
    flags:z.array(z.enum(["dark","blurry","cast","lowres"])),
  }).nullable().default(null),
});
export type LibraryAsset=z.infer<typeof LibraryAssetSchema>;
export type AssetDetails=z.infer<typeof AssetDetailsSchema>;
export const FreeCardInputSchema=z.object({
  title:z.string().trim().min(1).max(120),body:z.string().trim().max(180).default(""),
  layout:z.enum(["photo","compare","text"]),
  assetIds:z.array(z.string().uuid()).max(2).refine(ids=>new Set(ids).size===ids.length,"사진이 중복됐어요."),
}).superRefine((card,ctx)=>{if(card.layout!=="text"&&card.assetIds.length>0&&card.body.length>90)ctx.addIssue({code:"custom",path:["body"],message:"사진형·비교형 설명은 90자 이내로 줄여 주세요."});});
export type FreeCardInput=z.input<typeof FreeCardInputSchema>;
export type FreeCard={id:string;preview:string;source:"design"|"ai-edited";layout:"photo"|"compare"|"text";assetIds:string[]};

// Owner-entered keywords only: this does not analyze or identify image contents.
export function rankAssets(assets:LibraryAsset[],topic:string):LibraryAsset[] {
  const text=topic.normalize("NFKC").toLocaleLowerCase("ko-KR");
  return assets.map(asset=>({asset,score:asset.tags.reduce((sum,tag)=>sum+(text.includes(tag.normalize("NFKC").toLocaleLowerCase("ko-KR"))?tag.length:0),0)}))
    .filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score||(a.asset.lastUsedAt??"").localeCompare(b.asset.lastUsedAt??"")||a.asset.id.localeCompare(b.asset.id))
    .map(item=>item.asset);
}
