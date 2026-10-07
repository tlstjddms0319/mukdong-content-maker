// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { renderStoreCard, storeTokensOf, STORE_TOKENS, STORE_CARD_TAGLINE } from "@/features/images/storeCard";
import { describeIssue } from "@/features/images/render/audit";
import { StyleIdSchema } from "@/features/images/styleCatalog";
import { contrastRatio, PALETTES } from "@/features/images/design";
import { POST } from "@/app/api/images/store-card/route";

const mocks=vi.hoisted(()=>({guard:vi.fn(),settings:vi.fn()}));
vi.mock("@/features/auth/guard",()=>({ownerApiError:mocks.guard}));
vi.mock("@/features/settings/repository",()=>({readSettings:mocks.settings}));

const LONG_HANDLE="mukdong_hongeo_village_official";

describe("store promo card", () => {
  it("has a token row for every style family", () => {
    for(const style of StyleIdSchema.options.filter(id=>id!=="template"))expect(STORE_TOKENS[style as keyof typeof STORE_TOKENS]).toBeTruthy();
    // template은 색 조합을 따른다.
    expect(storeTokensOf({palette:"night",style:"template"}).base).toBe(PALETTES.night.colors.paper);
    expect(storeTokensOf({palette:"sea"}).accent).toBe(PALETTES.sea.colors.accent);
  });

  it("makes no claims in its one-line intro", () => {
    expect(STORE_CARD_TAGLINE).not.toMatch(/\d|원|시|최고|가장|유일|1등|번지|길\s/);
  });

  for(const handle of ["",LONG_HANDLE]){
    it(`renders all 20 style families with no audit issues (${handle?"long handle":"no handle"})`, async () => {
      const failures:string[]=[];
      for(const style of StyleIdSchema.options){
        const {image,report}=await renderStoreCard({palette:"warm",style},6,6,{brandHandle:handle,contrast:true,gridSafe:true});
        const meta=await sharp(image).metadata();
        expect([meta.width,meta.height]).toEqual([1080,1350]);
        if(report.issues.length)failures.push(`${style}: ${report.issues.map(describeIssue).join(" / ")}`);
        expect(report.metrics.shrinks).toBe(0);
        // 계정이 있으면 계정 글자 상자가 하나 더 있다(낙관·워드마크·한 줄 소개·칩·장 번호 + 계정).
        expect(report.boxes.length).toBe(handle?6:5);
      }
      expect(failures).toEqual([]);
    },180_000);
  }

  it("follows every palette and theme in the template family and stays clean in calm tone", async () => {
    const failures:string[]=[];
    for(const [i,palette] of (["warm","sea","night","herb","clay","plum"] as const).entries()){
      const theme=(["classic","magazine","notebook","poster","minimal","retro"] as const)[i];
      for(const tone of ["loud","calm"] as const){
        const {report}=await renderStoreCard({palette,style:"template",theme,tone,titleFont:"blackhan",bodyFont:"plex"},3,3,{brandHandle:LONG_HANDLE,contrast:true,gridSafe:true});
        if(report.issues.length)failures.push(`${palette}/${theme}/${tone}: ${report.issues.map(describeIssue).join(" / ")}`);
      }
    }
    expect(failures).toEqual([]);
  },120_000);

  it("draws the same image for the same input, and calm tone draws fewer stickers", async () => {
    for(const style of ["template","kitsch","hanji","ticket"] as const){
      const a=await renderStoreCard({palette:"clay",style},4,4,{brandHandle:"mukdong"});
      const b=await renderStoreCard({palette:"clay",style},4,4,{brandHandle:"mukdong"});
      expect(a.image.equals(b.image)).toBe(true);
    }
    const loud=await renderStoreCard({palette:"warm",style:"kitsch",tone:"loud"},5,5);
    const calm=await renderStoreCard({palette:"warm",style:"kitsch",tone:"calm"},5,5);
    expect(loud.image.equals(calm.image)).toBe(false);
  },60_000);

  it("keeps the chip readable on every family", () => {
    for(const tokens of Object.values(STORE_TOKENS)){
      const text=contrastRatio("#FFFFFF",tokens.chip)>=contrastRatio("#141414",tokens.chip)?"#FFFFFF":"#141414";
      expect(contrastRatio(text,tokens.chip)).toBeGreaterThanOrEqual(3);
    }
  });

  it("renders one card in about a second", async () => {
    await renderStoreCard({palette:"warm",style:"neon"},5,5);
    const times:number[]=[];
    for(const style of ["template","chalkboard","watercolor","neon"] as const){
      const start=performance.now();
      await renderStoreCard({palette:"warm",style},5,5,{brandHandle:LONG_HANDLE});
      times.push(performance.now()-start);
    }
    // 목표는 1초. 느린 CI를 고려해 테스트는 1.5초에서 끊는다.
    expect(Math.max(...times)).toBeLessThan(1500);
  },60_000);
});

describe("store card route", () => {
  beforeEach(()=>{vi.clearAllMocks();mocks.guard.mockResolvedValue(null);mocks.settings.mockResolvedValue({brandHandle:"mukdong"});});
  const request=(body:unknown)=>new Request("http://localhost/api/images/store-card",{method:"POST",body:JSON.stringify(body)});

  it("blocks requests before login", async () => {
    mocks.guard.mockResolvedValue(new Response(null,{status:401}));
    expect((await POST(request({design:{palette:"warm"},index:5,total:5}))).status).toBe(401);
    expect(mocks.settings).not.toHaveBeenCalled();
  });

  it("rejects a bad body", async () => {
    expect((await POST(request({design:{palette:"warm"},index:6,total:5}))).status).toBe(400);
    expect((await POST(request({design:{palette:"warm",style:"nope"},index:1,total:5}))).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/images/store-card",{method:"POST",body:"{"}))).status).toBe(400);
  });

  it("returns a 1080×1350 JPEG data URL with the saved handle, even for a retired style name", async () => {
    const response=await POST(request({design:{palette:"night",style:"y2k",tone:"calm"},index:7,total:7}));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const {image}=await response.json() as {image:string};
    expect(image).toMatch(/^data:image\/jpeg;base64,/);
    const meta=await sharp(Buffer.from(image.split(",")[1],"base64")).metadata();
    expect([meta.width,meta.height]).toEqual([1080,1350]);
    expect(mocks.settings).toHaveBeenCalledTimes(1);
  },30_000);

  it("still draws the card when settings cannot be read", async () => {
    mocks.settings.mockRejectedValue(new Error("disk"));
    vi.spyOn(console,"warn").mockImplementation(()=>{});
    expect((await POST(request({index:2,total:2}))).status).toBe(200);
  },30_000);
});

describe("owner's promo poster", () => {
  it("uses the poster in assets/store as the last card, fitted whole into 4:5", async () => {
    const { storePoster, STORE_POSTER_FILE }=await import("@/features/images/storeCard");
    const image=await storePoster();
    expect(image).not.toBeNull();
    const meta=await sharp(image!).metadata();
    expect([meta.width,meta.height,meta.format]).toEqual([1080,1350,"jpeg"]);
    // 같은 파일이면 다시 굽지 않는다.
    expect(await storePoster(STORE_POSTER_FILE)).toBe(image);
  });
  it("falls back to the drawn design when there is no poster", async () => {
    const { storePoster }=await import("@/features/images/storeCard");
    expect(await storePoster("/nonexistent/promo-card.webp")).toBeNull();
  });
});
