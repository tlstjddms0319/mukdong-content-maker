// @vitest-environment node
// 이미지 AI를 카드의 사진 칸 비율로 만들기: 비율 고르기와 사진 칸 재기(세로 그림을 가로 칸에 넣으며 접시가 잘리던 문제).
import { describe, expect, it, vi } from "vitest";
import { cloudflareSize, framingDirection, higgsfieldAspect, openaiSize } from "@/features/images/imageAspect";

vi.mock("server-only",()=>({}));

describe("image size for the card's photo window", () => {
  it("picks the nearest size each image AI accepts", () => {
    expect(openaiSize(1.5)).toBe("1536x1024");
    expect(openaiSize(1.05)).toBe("1024x1024");
    expect(openaiSize(.8)).toBe("1024x1536");
    expect(openaiSize()).toBe("1024x1536");
    expect(higgsfieldAspect(1.45)).toBe("3:2");
    expect(higgsfieldAspect(1.3)).toBe("4:3");
    expect(higgsfieldAspect(.8)).toBe("3:4");
    expect(higgsfieldAspect()).toBe("3:4");
    const wide=cloudflareSize(1.5);
    expect(wide.width%16).toBe(0);expect(wide.height%16).toBe(0);
    expect(wide.width/wide.height).toBeCloseTo(1.5,1);
    expect(cloudflareSize()).toEqual({width:1024,height:1280});
  });

  it("asks for the whole plate inside the frame, except for close-up detail shots", () => {
    expect(framingDirection(1.5)).toContain("wide landscape");
    expect(framingDirection(1.5)).toContain("nothing touches or runs off the edges");
    expect(framingDirection(1,true)).not.toContain("margin");
    expect(framingDirection(undefined)).toBe("");
  });
});

describe("measuring the photo window before generating", () => {
  it("finds a landscape window on chalkboard cards and the full post on overlay cards", async () => {
    const { photoWindowRatio }=await import("@/features/images/photoWindow");
    const slide={role:"detail" as const,headline:"과메기는 어떻게 먹어야 할까요",subline:"",points:["김에 싸서 한입에 먹어요","쪽파와 마늘을 곁들여요"],visualPrompt:"과메기 한 접시",textPosition:"bottom" as const,layout:"frame" as const,keywords:[],figure:""};
    const chalk=await photoWindowRatio(slide,2,5,"card",{palette:"warm",style:"chalkboard"});
    expect(chalk).toBeGreaterThan(1.1);
    const overlay=await photoWindowRatio(slide,2,5,"overlay",{palette:"warm"});
    expect(overlay).toBeCloseTo(.8,1);
  },60_000);
});
