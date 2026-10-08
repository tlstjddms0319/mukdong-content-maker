import type { TrendStatus } from "@/features/topics/naverTrend";

// 추천 주제 위의 한 줄: 네이버 검색 흐름(최근 2주 검색이 늘어난 음식 말)을 이번 추천에 넣었는지 쉬운 말로 알려 준다.
// used: 추천 카드 가운데 그 말을 실제로 쓴 주제의 말(카드에는 "요즘 많이 찾는 말" 표시가 붙는다).
// 증가율 숫자는 사장님께 뜻이 와닿지 않아 빼고 말만 보여 준다.
// prepared: 이번 추천이 AI가 아니라 준비된 주제인지(AI가 한도에 걸렸거나 실패). 그때는 "메뉴와 안 이어져서"가 아니라 그 이유를 말한다.
export function TrendLine({info,used,prepared=false}:{info:{status:TrendStatus;keywords:string[]};used:string[];prepared?:boolean}){
  const words=info.keywords.slice(0,3).join(", ");
  const text=info.status==="ok"&&info.keywords.length
    // 말 뒤에 조사(을/를, 이에요/예요)를 붙이지 않게 "말: …" 꼴로 쓴다(받침에 따라 틀리기 쉽다).
    ?used.length
      ?`네이버에서 요즘 많이 찾는 말: ${words} · 표시가 붙은 추천 주제에 넣었어요.`
      :prepared
        ?`네이버에서 요즘 많이 찾는 말: ${words} · 이번엔 AI 대신 준비된 주제라 넣지 못했어요. 잠시 뒤 '다른 주제 보기'를 눌러 보세요.`
        :`네이버에서 요즘 많이 찾는 말: ${words} · 가게 메뉴와 이어지지 않아 이번 추천에는 넣지 않았어요.`
    :info.status==="none"||info.status==="ok"?"네이버 검색: 요즘 눈에 띄게 많이 찾는 음식 말이 없어 이번 추천에는 넣지 않았어요."
    :info.status==="error"?"네이버 검색 흐름을 불러오지 못해 이번 추천에는 넣지 않았어요."
    :"네이버 검색 흐름은 아직 연결되어 있지 않아요(설정 → 관리자용 설정).";
  return <p className="season-line trend-line" role="status">{text}</p>;
}
