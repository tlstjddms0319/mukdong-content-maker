// @vitest-environment node
// 꽉 찬 사진 위 제목 자리: 위쪽이 뚜렷이 단순한 사진만 제목을 위로 올리고, 나머지는 기존처럼 아래.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { quietSide } from "@/features/images/styles/textSide";

// 위·아래 절반을 따로 칠한 사진. "busy"는 촘촘한 흑백 줄무늬(음식 결 대신), "flat"은 한 색.
async function photo(top:"busy"|"flat",bottom:"busy"|"flat"):Promise<Buffer> {
  const W=1080,H=1350;
  const stripes=(y:number,h:number)=>Array.from({length:Math.ceil(W/24)},(_,i)=>`<rect x="${i*24}" y="${y}" width="12" height="${h}" fill="#F2E9DC"/>`).join("");
  const half=(kind:"busy"|"flat",y:number)=>`<rect x="0" y="${y}" width="${W}" height="${H/2}" fill="#3A2A22"/>`+(kind==="busy"?stripes(y,H/2):"");
  return sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${half(top,0)}${half(bottom,H/2)}</svg>`)).jpeg().toBuffer();
}

describe("quietSide",()=>{
  it("puts the title on top when the top is plain and the food is below",async()=>{
    expect(await quietSide(await photo("flat","busy"))).toBe("top");
  });
  it("keeps the title at the bottom when the bottom is plain",async()=>{
    expect(await quietSide(await photo("busy","flat"))).toBe("bottom");
  });
  it("keeps the usual bottom place when both are alike",async()=>{
    expect(await quietSide(await photo("busy","busy"))).toBe("bottom");
    expect(await quietSide(await photo("flat","flat"))).toBe("bottom");
  });
});
