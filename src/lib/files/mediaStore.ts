import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { remoteStore } from "./remoteStore";

const MAX_BYTES = 12 * 1024 * 1024;
const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export class MediaValidationError extends Error {}

export type MediaAsset = {
  id: string;
  originalName: string;
  mimeType: keyof typeof EXTENSIONS;
  size: number;
  source: "photo";
};

function matchesMagic(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.slice(0, 8).every((byte, i) => byte === [137, 80, 78, 71, 13, 10, 26, 10][i]);
  if (type === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return false;
}

export function createMediaStore(root: string) {
  return {
    async saveOriginal(file: File): Promise<MediaAsset> {
      if (!(file.type in EXTENSIONS) || file.size > MAX_BYTES) throw new MediaValidationError("JPG, PNG, WebP 파일만 12MB까지 올릴 수 있어요.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!matchesMagic(file.type, bytes)) throw new MediaValidationError("이미지 파일의 실제 형식이 올바르지 않아요.");
      const id = randomUUID();
      const mimeType = file.type as keyof typeof EXTENSIONS;
      const remote = remoteStore();
      if (remote) await remote.write(`originals/${id}.${EXTENSIONS[mimeType]}`, bytes, mimeType);
      else {
        await mkdir(join(root, "originals"), { recursive: true });
        await writeFile(join(root, "originals", `${id}.${EXTENSIONS[mimeType]}`), bytes);
      }
      return { id, originalName: file.name.slice(0, 160), mimeType, size: file.size, source: "photo" };
    },
  };
}
