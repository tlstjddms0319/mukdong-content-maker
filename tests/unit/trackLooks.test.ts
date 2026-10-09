// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PALETTES, PaletteIdSchema, contrastRatio } from "@/features/images/design";
import { TRACK_LOOKS, trackLookOf } from "@/features/images/styles/trackLooks";

// 갈래 게시물 색 묶음: 주제마다 색이 바뀌어도 휴대폰에서 읽히는 대비를 지킨다.
describe("track looks", () => {
  it("keeps readable contrast on every surface of every palette", () => {
    for(const id of PaletteIdSchema.options)for(const [part,surface] of Object.entries(TRACK_LOOKS[id])){
      const where=`${id}.${part}`;
      expect(contrastRatio(surface.ink,surface.bg),`${where} ink`).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(surface.dim,surface.bg),`${where} dim`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(surface.accent,surface.bg),`${where} accent`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(surface.chipInk,surface.chip),`${where} chip`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("finds the look from the palette colors and falls back to warm", () => {
    expect(trackLookOf(PALETTES.sea.colors)).toBe(TRACK_LOOKS.sea);
    expect(trackLookOf(undefined)).toBe(TRACK_LOOKS.warm);
  });
});
