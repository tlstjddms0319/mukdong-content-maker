import type { CarouselPlan } from "./carousel";
import { checkTextClaims, servingClaimIssues } from "@/features/guard/service";

// 슬라이드에 찍히는 글은 캡션과 달리 게시 후 고칠 수 없으므로 여기서 한 번 더 거른다. 표지 요점은 항상 비운다.
// - 요점: 금지 표현이나 확인이 필요한 사실(가격·영업시간·원산지·숙성 기간)이 섞인 줄, 제목을 그대로 되풀이한 줄은 뺀다.
// - 제목: 지울 수 없으므로, 문제가 있으면 남은 요점 하나를 제목으로 올리고, 요점도 없으면 장 역할에 맞는 무난한 제목으로 바꾼다.
// - 큰 숫자(통계 카드): 주제·메모·사진 설명에 나온 숫자이거나 "3가지"처럼 구성을 세는 숫자만 남긴다.
//   AI가 지어낸 "48시간"·"30년"이 크게 찍히지 않게. 비우면 레이아웃 정규화가 브라우저형으로 바꾼다.
export type GuardSources={topic?:string;contentBrief?:string;imageBrief?:string;photoNotes?:readonly string[];storeNotes?:string};

const SAFE_HEADLINES:Record<string,string>={
  overview:"한 상을 먼저 둘러봐요",detail:"가까이 보면 결이 보여요","how-to":"이렇게 먹어 보세요",pairing:"곁들이면 맛이 달라져요",
  process:"이렇게 준비해요",occasion:"이럴 때 잘 어울려요",mood:"천천히 즐기기 좋아요",visit:"가기 전에 메뉴를 확인해요",cta:"다음엔 직접 맛보고 확인해 보세요",
};
// 구성을 세는 숫자(사실 주장이 아님): 3가지, 2단계, 4개, 5번 …
const STRUCTURAL_FIGURE=/^\s*(?:[1-9]|10)\s*(?:가지|단계|개|번|장|곳|조각|점|코스)\s*$/;
const unsafe=(text:string,storeNotes="")=>{const result=checkTextClaims(text,{storeNotes});return result.blocked.length>0||result.verify.length>0||servingClaimIssues(text).length>0;};

export function figureSupported(figure:string,sources:GuardSources):boolean {
  if(!figure.trim())return true;
  if(STRUCTURAL_FIGURE.test(figure))return true;
  const digits=figure.match(/\d+/g);
  if(!digits)return true; // 숫자가 없는 표시(예: "한 점")는 그대로 둔다.
  const known=[sources.topic,sources.contentBrief,sources.imageBrief,sources.storeNotes,...(sources.photoNotes??[])].filter(Boolean).join(" ");
  return digits.every(number=>new RegExp(`(?<!\\d)${number}(?!\\d)`).test(known));
}

export function guardSlidePoints(plan:CarouselPlan,sources:GuardSources={}):CarouselPlan {
  return {...plan,slides:plan.slides.map(slide=>{
    if(slide.role==="cover")return {...slide,points:[]};
    const compact=(value:string)=>value.replace(/\s+/g,"");
    let points=(slide.points??[]).filter(point=>compact(point)!==compact(slide.headline)&&!unsafe(point,sources.storeNotes));
    let headline=slide.headline;
    if(unsafe(headline,sources.storeNotes)){
      if(points.length>1){headline=points[0].replace(/[.!]$/,"");points=points.slice(1);}
      else headline=SAFE_HEADLINES[slide.role]??"한 장씩 넘겨 보세요";
    }
    const figureCheck=checkTextClaims(`${slide.figure} ${headline}`,{storeNotes:sources.storeNotes});
    const figure=figureCheck.blocked.length||figureCheck.verify.length||!figureSupported(slide.figure??"",sources)?"":slide.figure;
    return {...slide,headline,points,figure};
  })};
}
