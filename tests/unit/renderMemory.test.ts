// @vitest-environment node
// Render 무료 서버(512MB) 메모리 보호(사장님 제보 2026-10-13: 만들 때마다 한 번 "상태 520"이 나고 다시 누르면 됨).
// 카드 그리기는 한 번에 하나씩 차례로, sharp 스레드·캐시는 작게.
import { describe, expect, it } from "vitest";
import { renderQueueSize, withRenderLock } from "@/features/images/render/renderLock";
import { sharpLimits } from "@/features/images/render/sharpSetup";

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

describe("render lock",()=>{
  it("runs drawing jobs one at a time, in order, and keeps going after a failure",async()=>{
    const log:string[]=[];
    const job=(name:string,ms:number,fail=false)=>withRenderLock(async()=>{log.push(`${name} 시작`);await sleep(ms);log.push(`${name} 끝`);if(fail)throw new Error(name);return name;});
    const results=await Promise.allSettled([job("a",30),job("b",5,true),job("c",5)]);
    expect(log).toEqual(["a 시작","a 끝","b 시작","b 끝","c 시작","c 끝"]);
    expect(results.map(result=>result.status)).toEqual(["fulfilled","rejected","fulfilled"]);
    expect(renderQueueSize()).toBe(0);
  });
});

describe("sharp limits on the server",()=>{
  it("caps threads and cache well below the free instance's memory",()=>{
    const limits=sharpLimits();
    expect(limits.concurrency).toBeLessThanOrEqual(8);
    expect(limits.concurrency).toBeGreaterThanOrEqual(1);
    expect(limits.cacheMemoryMb).toBeLessThanOrEqual(64);
  });
});
