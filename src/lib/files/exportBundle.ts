import JSZip from "jszip";

export type ExportImage={bytes:Uint8Array;name:string;source:"photo"|"ai-generated"|"ai-edited"};
export type ExportBundleInput={caption:string;images:ExportImage[];checks:string[]};

export async function buildExportBundle(input:ExportBundleInput):Promise<Uint8Array>{
  if(input.images.length===0)throw new Error("내보낼 이미지는 1장 이상이어야 해요.");
  if(input.images.length>10)throw new Error("내보낼 이미지는 10장을 넘을 수 없어요.");
  const zip=new JSZip();
  const slides=input.images.map((image,index)=>{const filename=`slide-${String(index+1).padStart(2,"0")}.jpg`;zip.file(filename,image.bytes);return {position:index+1,filename,source:image.source};});
  zip.file("caption.txt",input.caption);
  zip.file("metadata.json",JSON.stringify({slides,checks:input.checks,exportedAt:new Date().toISOString(),originalPreserved:true},null,2));
  return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
