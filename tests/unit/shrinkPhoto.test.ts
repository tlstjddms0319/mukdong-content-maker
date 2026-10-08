import { afterEach, expect, it, vi } from "vitest";
import { SHRINK_MAX_SIDE, shrinkPhoto } from "@/lib/files/shrinkPhoto";

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

// 브라우저 그리기(canvas)를 흉내 낸다: 그린 크기를 기록하고 JPEG 조각을 돌려준다.
function stubBrowser(width:number,height:number){
  const close=vi.fn();
  vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width,height,close})));
  const drawn:{width:number;height:number}[]=[];
  const original=document.createElement.bind(document);
  vi.spyOn(document,"createElement").mockImplementation(((tag:string)=>{
    if(tag!=="canvas")return original(tag);
    const canvas={width:0,height:0,getContext:()=>({fillRect:()=>{},drawImage:()=>drawn.push({width:canvas.width,height:canvas.height}),fillStyle:""}),toBlob:(done:(blob:Blob)=>void)=>done(new Blob(["jpeg"],{type:"image/jpeg"}))};
    return canvas as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
  return {drawn,close};
}

it("shrinks a high-resolution phone photo to a JPEG with the long side capped", async () => {
  const {drawn,close}=stubBrowser(8160,6120);
  const out=await shrinkPhoto(new File(["x"],"IMG_0001.heic.png",{type:"image/png"}));
  expect(out.type).toBe("image/jpeg");
  expect(out.name).toBe("IMG_0001.heic.jpg");
  expect(drawn).toEqual([{width:SHRINK_MAX_SIDE,height:2400}]);
  expect(close).toHaveBeenCalled();
});

it("leaves a normal photo alone, and sends the original when the browser cannot read it", async () => {
  stubBrowser(1500,2000);
  const small=new File(["x"],"a.jpg",{type:"image/jpeg"});
  expect(await shrinkPhoto(small)).toBe(small);
  vi.stubGlobal("createImageBitmap",vi.fn(async()=>{throw new Error("unsupported");}));
  expect(await shrinkPhoto(small)).toBe(small);
});
