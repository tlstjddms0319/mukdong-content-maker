import { z } from "zod";
import { seasonContext } from "@/features/topics/season";

// 계절 소품(계획서 B11): 카드의 빈 자리에 옅게 얹는 계절 장식. 모든 계열·템플릿에 똑같이 쓴다.
// 글자·사진·마스코트 자리를 피해서만 그리고(render/seasonLayer.ts), 날짜·연도 같은 글자는 절대 넣지 않는다.
// 이 파일은 화면 코드도 불러오므로 그리기 코드(sharp 등)를 넣지 않는다.
export const SeasonMotifSchema=z.enum(["none","rain","moon","saekdong","snow","blossom","leaves"]);
export type SeasonMotif=z.infer<typeof SeasonMotifSchema>;

export const SEASON_MOTIFS:Record<SeasonMotif,{label:string;when:string}>={
  none:{label:"없음",when:"계절과 상관없는 글. 장식을 더하지 않음"},
  rain:{label:"빗줄기",when:"비 오는 날, 장마철, 막걸리에 전 부치는 날"},
  moon:{label:"보름달",when:"추석, 정월 대보름, 달 밝은 밤의 술자리"},
  saekdong:{label:"색동 띠",when:"설날, 명절, 잔치, 가족 모임, 축하 자리"},
  snow:{label:"눈송이",when:"겨울, 과메기 철, 연말·신년 모임, 김장철"},
  blossom:{label:"꽃잎",when:"봄, 미나리 철, 봄나들이, 가정의 달"},
  leaves:{label:"단풍잎",when:"가을, 막걸리의 날, 선선한 저녁"},
};

export function seasonCatalogText():string {
  const items=SeasonMotifSchema.options.map(id=>`${id}(${SEASON_MOTIFS[id].label}: ${SEASON_MOTIFS[id].when})`).join(", ");
  return `design.season은 카드 빈 자리에 옅게 얹는 계절 소품입니다. 주제와 시기에 꼭 맞을 때만 고르고, 애매하면 none: ${items}.`;
}

// 주제 낱말이 먼저, 그다음 지금 시기의 행사(설·추석·장마…)로 고른다. 어느 쪽도 아니면 none(장식 없이).
// 한 글자 낱말(비·봄·눈)은 앞에 다른 한글이 붙으면 다른 말이다("가성비가", "준비가", "돌봄", "첫눈"은 예외로 둔다).
const W="(?<![가-힣])";
const TOPIC_RULES:ReadonlyArray<readonly [RegExp,SeasonMotif]>=[
  [new RegExp(`${W}비\\s*(?:오|내리|맞)|${W}빗(?:줄기|소리|물|방울)|장마|우중|비\\s*오는\\s*날`),"rain"],
  [/추석|보름|달빛|한가위/,"moon"],
  [/설날|설\s*연휴|명절|잔치|환갑|칠순|돌잔치|가족\s*모임/,"saekdong"],
  [new RegExp(`과메기|겨울|(?:${W}|첫)눈\\s*(?:오|내리)|송년|연말|신년|김장`),"snow"],
  [new RegExp(`미나리|${W}봄(?![가-힣]*봄)|벚꽃|나들이`),"blossom"],
  [/가을|단풍|막걸리의\s*날/,"leaves"],
];
const EVENT_MOTIFS:Record<string,SeasonMotif>={seollal:"saekdong",chuseok:"moon",makgeolli:"leaves",spring:"blossom",family:"saekdong",rainy:"rain",kimjang:"snow",yearend:"snow",newyear:"snow"};

export function suggestSeasonMotif(topic:string,now:Date=new Date()):SeasonMotif {
  for(const [pattern,motif] of TOPIC_RULES)if(pattern.test(topic))return motif;
  // 행사는 "지금 진행 중"(daysAway 0)인 것만 본다. 다가오는 행사로 미리 장식하면 게시 날짜와 어긋날 수 있다.
  // 지금 진행 중인 행사 가운데 소품이 정해진 첫 행사(복날처럼 소품이 없는 행사가 장마철을 가리지 않게).
  return seasonContext(now,0).events.filter(event=>event.daysAway<=0).map(event=>EVENT_MOTIFS[event.id]).find(Boolean)??"none";
}

export const SEASON_OPTIONS=SeasonMotifSchema.options.map(id=>[id,SEASON_MOTIFS[id].label,SEASON_MOTIFS[id].when] as const);
