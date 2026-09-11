import JSZip from "jszip";

export type ExportBundleInput = { caption:string; image:Uint8Array; imageName:string; source:"photo"|"ai-generated"|"ai-edited"; checks:string[] };

export async function buildExportBundle(input: ExportBundleInput): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(input.imageName.replace(/[^a-zA-Z0-9._-]/g, "_"), input.image);
  zip.file("caption.txt", input.caption);
  zip.file("metadata.json", JSON.stringify({ mediaSource:input.source, checks:input.checks, exportedAt:new Date().toISOString(), originalPreserved:true }, null, 2));
  return zip.generateAsync({ type:"uint8array", compression:"DEFLATE" });
}
