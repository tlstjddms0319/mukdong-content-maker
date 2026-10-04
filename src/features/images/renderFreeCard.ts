import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ASSET_KIND_LABELS, FreeCardInputSchema, type FreeCardInput, type FreeCard, type LibraryAsset } from "./freeCards";

const fontfile=path.join(process.cwd(),"assets/fonts/Pretendard-Bold.otf");
const ink="#193c32",muted="#65716a",accent="#c65138",paper="#f5f1e8";
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[char]!);

export async function renderFreeCard(value:FreeCardInput,available:LibraryAsset[]):Promise<FreeCard> {
  const input=FreeCardInputSchema.parse(value);
  const selected=input.layout==="text"?[]:input.assetIds.map(id=>available.find(asset=>asset.id===id)).filter((asset):asset is LibraryAsset=>!!asset);
  const layout=input.layout==="compare"&&selected.length>=2?"compare":input.layout!=="text"&&selected.length?"photo":"text";
  const assets=selected.slice(0,layout==="compare"?2:layout==="photo"?1:0);
  const layers:OverlayOptions[]=[];
  async function text(value:string,x:number,y:number,width:number,height:number,size:number,color=ink) {
    if(!value.trim())return;
    const result=await sharp({text:{text:`<span foreground="${color}">${escape(value)}</span>`,font:`Pretendard Bold ${size}`,fontfile,width,wrap:"word-char",spacing:14,rgba:true}})
      .resize({width,height,fit:"inside",withoutEnlargement:true}).png().toBuffer();
    layers.push({input:result,left:x,top:y});
  }
  function shapes(svg:string){layers.push({input:Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`),left:0,top:0});}
  shapes(`<path d="M64 116H1016M64 1250H1016" stroke="${ink}" stroke-width="2"/><rect x="64" y="149" width="8" height="30" fill="${accent}"/>`);
  await text("묵동홍어마을  /  음식 이야기",64,62,850,34,28);
  await text(layout==="compare"?"두 가지를 나란히":layout==="photo"?"사진으로 만나는 질문":"오늘의 음식 질문",88,148,700,38,26,muted);
  await text(input.title,64,218,952,layout==="text"?380:226,layout==="text"?102:78);
  if(layout==="text"){
    shapes(`<rect x="64" y="659" width="84" height="8" fill="${accent}"/><circle cx="916" cy="1060" r="90" fill="none" stroke="#d6dfd2" stroke-width="2"/><circle cx="826" cy="1100" r="62" fill="none" stroke="#d6dfd2" stroke-width="2"/>`);
    await text(input.body,64,723,920,352,43);
  }else{
    const width=layout==="compare"?460:952,height=516;
    for(const [index,asset] of assets.entries()){
      const x=64+index*492;
      const image=await sharp(Buffer.from(asset.preview.split(",")[1],"base64"),{limitInputPixels:40_000_000}).resize(width,height,{fit:"cover",position:"attention"}).jpeg({quality:92}).toBuffer();
      layers.push({input:image,left:x,top:488});
      await text(`${ASSET_KIND_LABELS[asset.kind]} · ${asset.name}`,x,488+height+20,width,50,24,muted);
    }
    await text(input.body,64,1094,952,130,32);
  }
  await text("궁금한 음식에서, 새로운 한 점으로",64,1275,850,32,25,muted);
  const bytes=await sharp({create:{width:1080,height:1350,channels:3,background:paper}}).composite(layers).jpeg({quality:92}).toBuffer();
  return {id:randomUUID(),layout,assetIds:assets.map(asset=>asset.id),source:assets.some(asset=>asset.kind==="ai-generated")?"ai-edited":"design",preview:`data:image/jpeg;base64,${bytes.toString("base64")}`};
}
