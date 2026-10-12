// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { composeSlideCard } from "@/features/images/composeSlide";
import { describeIssue } from "@/features/images/render/audit";
import { TRACK_LOOKS } from "@/features/images/track";
import type { CarouselSlidePlan } from "@/features/images/carousel";

// 갈래 모양(design.look)마다 표지·본문·마지막 장을 상한 길이 글로 그려 자동 검수(넘침·겹침·대비)가 깨끗한지 본다.
// 새 모양을 더하면 TRACK_LOOKS에 이름을 넣는 순간 이 시험이 그 모양까지 그린다.
const base={visualPrompt:"",textPosition:"bottom" as const,figure:"",titleFont:"auto" as const,bodyFont:"auto" as const,variant:0,keywords:["홍어","막걸리"]};
const slides:CarouselSlidePlan[]=[
  {...base,role:"cover",layout:"fullscreen",headline:"비 오는 저녁, 막걸리와 홍어 한 점이 당기는 이유",subline:"처음 먹는 친구에게 알려 주는 순서",points:[]},
  {...base,role:"how-to",layout:"frame",headline:"처음이라면 이 순서로 드셔 보세요",subline:"",points:["덜 삭힌 쪽부터 작게 한 점 집어요","초장을 살짝 찍어 향을 먼저 봐요"]},
  {...base,role:"visit",layout:"frame",headline:"가기 전에 이것만 확인해 두세요",subline:"",points:["처음이라면 덜 삭힌 걸로 주문해 보세요"]},
];

describe("갈래 모양 그리기",()=>{
  for(const [track,style] of [["photo","photo-focus"],["text","text-focus"]] as const){
    TRACK_LOOKS[track].forEach(({name},look)=>{
      it(`${style} ${look}번 '${name}': 표지·본문·마지막 장이 자동 검수를 통과한다`,async()=>{
        const photo=await readFile("assets/design/samples/hands-makgeolli.jpg");
        for(const [i,slide] of slides.entries()){
          const index=i+1;
          const inputs=track==="photo"||index===1?[photo]:[];
          const layout=index===1?"fullscreen":track==="photo"?"frame":"browser";
          const {report}=await composeSlideCard(inputs,{...slide,layout},index,slides.length,"card",{palette:"sea",style,look},{contrast:true,brandHandle:"mukdong_hongeo"});
          expect(report.issues.map(describeIssue),`${name} ${index}장`).toEqual([]);
        }
      },60_000);
    });
  }
});
