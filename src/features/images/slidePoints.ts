import type { CarouselPlan } from "./carousel";
import { checkTextClaims } from "@/features/guard/service";

// 슬라이드에 찍히는 요점은 캡션과 달리 게시 후 고칠 수 없으므로,
// 금지 표현이나 확인이 필요한 가격·영업시간이 섞인 줄, 제목을 그대로 되풀이한 줄은 여기서 뺀다. 표지는 항상 비운다.
export function guardSlidePoints(plan:CarouselPlan):CarouselPlan {
  return {...plan,slides:plan.slides.map(slide=>{
    if(slide.role==="cover")return {...slide,points:[]};
    const compact=(value:string)=>value.replace(/\s+/g,"");
    const points=(slide.points??[]).filter(point=>{
      if(compact(point)===compact(slide.headline))return false;
      const result=checkTextClaims(point);
      return result.blocked.length===0&&result.verify.length===0;
    });
    // 대형 숫자도 확인이 필요한 수치(가격·영업시간 등)면 지운다. 그러면 레이아웃 정규화가 브라우저형으로 바꾼다.
    const figureCheck=checkTextClaims(`${slide.figure} ${slide.headline}`);
    const figure=figureCheck.blocked.length||figureCheck.verify.length?"":slide.figure;
    return {...slide,points,figure};
  })};
}
