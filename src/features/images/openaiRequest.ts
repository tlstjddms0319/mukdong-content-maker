import type { ImageBrief } from "./schema";
import { IMAGE_STYLE_DIRECTIONS, resolveImageStyle } from "./style";
import { CARD_LAYOUTS } from "./design";
import { toFile } from "openai";

function foodDirection(input:ImageBrief):string {
  const subject=[input.topic,input.imageBrief,input.slide?.visualPrompt].filter(Boolean).join(" ");
  if(!/홍어|삼합/.test(subject))return "";
  // A scene drafted by AI must not change an explicitly chosen preparation.
  const menuText=/홍어\s*(?:전(?!문|통|체|날)|찜|무침|회)|삼합/.test(input.topic)?input.topic:subject;
  const cooked=[
    [/홍어\s*전(?!문|통|체|날)/,"홍어전 장면은 얇은 생선 살에 전옷을 입혀 노릇하게 부친 표면과 부드러운 속살을 표현한다. 회 접시로 바꾸지 않는다."],
    [/홍어\s*찜/,"홍어찜 장면은 익힌 살의 결을 표현한다. 생회처럼 투명하고 분홍색인 살로 바꾸지 않는다."],
    [/홍어\s*무침/,"홍어무침 장면은 홍어 조각과 양념의 질감을 구분한다. 설명이나 참고 사진에 없는 채소를 임의로 추가하지 않는다."],
  ] as const;
  const preparations:string[]=cooked.filter(([pattern])=>pattern.test(menuText)).map(([,description])=>description);
  if(!preparations.length||/홍어\s*회|삼합/.test(menuText))preparations.push("홍어회·삼합 장면의 홍어는 숙성 홍어 날개 살을 얇고 불규칙하게 썬 연한 분홍빛 또는 아이보리색 회로 표현한다. 삼합에 수육과 묵은지가 등장하면 세 재료가 구분되게 자연스럽게 겹친 한입 크기로 표현한다.");
  // 작은 이미지 모델은 '홍어'를 몰라 베이컨·햄처럼 그리기 쉬워서 영어로 무엇인지 한 번 설명한다.
  preparations.push("Hongeo is Korean fermented skate, a flat ray fish: its flesh has fine parallel fibers and thin translucent cartilage lines, never marbled fat stripes. The skate must not look like bacon, ham, sausage or pork belly.");
  // 이미지 모델은 '홍어 한 점'을 꼬리·지느러미 달린 작은 생선 한 마리(가자미·박대 모양)로 그리기 쉽다.
  // 실제 홍어회는 넓은 날개 살을 썬 조각이므로, 통째 생선 모양을 명시적으로 금지한다.
  preparations.push("홍어는 통째 생선으로 그리지 않는다. 꼬리·지느러미·머리가 달린 작은 생선 한 마리나 가자미·박대 같은 모양이 아니라, 넓은 날개 살을 썬 손가락 두 마디 크기의 납작한 조각으로 보여 준다. 조각 표면에는 한쪽 방향으로 나란한 연골 결이 줄무늬처럼 보인다. Show the skate only as sliced pieces of wing meat (flat, bite-sized, with parallel cartilage ridges). Never show a whole small fish with a tail, fins, head or a fish-shaped outline.");
  // 삼합 장면은 모델이 익숙한 수육을 크게 그리고 홍어를 뒤로 밀기 쉽다. 홍어가 주인공임을 한국어·영어로 못 박는다.
  preparations.push("이 가게의 주인공은 홍어다. 모든 장면에서 홍어가 가장 크고 가장 앞(또는 가운데)에 초점이 맞게 놓이고, 수육·묵은지·막걸리는 더 작게 뒤나 가장자리에 조연으로만 둔다. 집어 올린 한 점은 홍어 조각이어야 하며, 수육이 홍어보다 크거나 앞에 오면 안 된다. The fermented skate is the hero of every scene: largest, closest to the camera or centered, and in focus; boiled pork and kimchi are small supporting sides behind or beside it, never larger or more prominent than the skate.");
  return preparations.join(" ")+" 이번 장면에 해당하는 조리법만 표현한다. 두꺼운 정육면체 회, 두부 같은 고기 블록, 탑처럼 높은 적층, 초밥이나 연어로 바꾸는 표현은 금지한다. 메뉴와 무관한 장식 소스는 추가하지 않는다.";
}

// 후보마다 다른 구도. 같은 프롬프트를 n번 보내면 모델의 우연 말고는 차이가 없어서, 후보 번호로 각도와 거리를 갈라 준다.
export const CANDIDATE_VARIANTS:readonly string[]=[
  "45도 위에서 접시 전체와 주변 곁들임이 보이게. 테이블 가장자리에 젓가락을 든 손이 살짝 들어온다",
  "눈높이에서 가까이. 젓가락으로 집어 올린 한 점이 앞에, 상차림은 뒤에서 흐릿하게",
  "바로 위에서 내려다본 상차림. 마주 앉은 두 사람의 손과 잔이 양쪽 가장자리에",
  "옆에서 낮게. 테이블 위 그릇의 높이 차이와 조명의 결이 보이게",
];

// 후보 한 장마다 구도가 다른 요청으로 나눈다. 한 장만 만들 때는 구도를 따로 주지 않는다.
export function candidateBriefs(input:ImageBrief):ImageBrief[] {
  const offset=input.candidateOffset??0;
  const total=offset+input.count;
  return Array.from({length:input.count},(_,index)=>({
    ...input,
    count:1,
    candidateOffset:undefined,
    variant:total>1?CANDIDATE_VARIANTS[(offset+index)%CANDIDATE_VARIANTS.length]:input.variant,
  }));
}

// 참고 이미지를 어떻게 쓸지 알려 주는 문장. 어떤 모드든 참고 이미지 속 글자·표·캐릭터를 베끼지 않게 한다.
function referenceDirection(input:ImageBrief):string {
  const noCopy="참고 이미지 안의 글자, 표, 로고, 캐릭터, 장식은 복제하지 말 것.";
  if(input.referenceMode==="continuity") return input.refinement
    // 수정 요청이 있는 재생성에서 "동일하게 유지"를 그대로 두면 요청이 묻히므로, 기준은 잇되 요청을 우선시킨다.
    ? `첨부 이미지는 선택된 AI 표지의 글자 없는 원본이다. 음식의 종류와 그릇, 테이블, 색감의 기준은 이어 가되, 사용자의 수정 요청과 충돌하면 수정 요청을 우선한다. ${noCopy}`
    // 표지를 그대로 잠그면 거리만 다른 같은 접시가 반복된다. 분위기만 잇고 장면은 새로 만든다.
    : `첨부 이미지는 선택된 AI 표지의 글자 없는 원본이다. 색감, 조명의 방향, 그릇과 테이블의 재질 같은 분위기만 이어 가고, 장면·구도·촬영 거리·피사체 배치는 이번 슬라이드 장면 설명대로 새로 만들 것. 표지와 같은 접시 배치를 다시 그리지 말 것. ${noCopy}`;
  if(input.referenceMode==="style") return `첨부 이미지는 화풍, 색감, 조명, 분위기만 참고한다. 참고 이미지 속 음식과 사물의 배치는 따르지 말고 선택 주제와 슬라이드 장면에 맞는 새 구도로 만들 것. ${noCopy}`;
  return `첨부한 원본 음식의 형태와 특징은 유지하고 조명, 색감, 구도만 자연스럽게 보완할 것. ${noCopy}`;
}

const NO_TEXT_DIRECTIVE="Absolutely no text in the image: no letters, words, Korean or English characters, numbers, captions, speech bubbles, question marks, signs or logos. Food and background only.";

export const buildImagePrompt=(input:ImageBrief,reference=false)=>{
  const styleId=resolveImageStyle(input);
  const style=IMAGE_STYLE_DIRECTIONS[styleId];
  return [
    // 작은 이미지 모델은 질문형 주제를 그대로 글씨로 그리기 쉬워서, 글자 금지를 영어로 맨 앞과 맨 끝에 둔다.
    NO_TEXT_DIRECTIVE,
    `한국 음식점 인스타그램 게시물용 ${style.medium}. 선택 주제(장면의 소재일 뿐, 이미지에 글자로 쓰지 말 것): ${input.topic}.`,
    input.imageBrief ? `기존 이미지 설명: ${input.imageBrief}.` : "",
    input.slide ? `슬라이드 역할: ${input.slide.role}. 장면: ${input.slide.visualPrompt}.` : `세로 4:5 구도, 하나의 음식 피사체가 선명하고 먹음직스럽게 보이며 자연스러운 조명과 여백이 있는 ${styleId==="photo"?"실제 음식 사진 스타일":`${style.medium} 스타일`}.`,
    input.styleAnchor ? `전체 캐러셀 공통 스타일: ${input.styleAnchor}.` : "",
    style.look,
    // 장면 설명이나 공통 스타일에 "사진"이 남아 있어도 화풍 지시가 이기도록 한 번 더 못 박는다.
    styleId==="photo" ? "" : `화풍: ${style.anchor}. 장면 설명이나 공통 스타일에 '사진'이라는 말이 있어도 사진처럼 만들지 말고 이 화풍으로 그릴 것.`,
    input.slide?.role==="detail"?"Macro detail: emphasize the actual texture of one bite with a gently blurred background. Keep the focal food clear of the title area; the plate may extend beyond the frame.":input.slide?.role==="overview"?"Top-down overview: keep the whole plate inside the central 75% crop-safe area, with sufficient depth of field to read the arrangement.":"Keep the main food inside the central 75% crop-safe area; use depth of field appropriate to this scene, without losing the food's recognizable shape.",
    input.variant ? `이 후보만의 구도: ${input.variant}.` : "",
    // 사람이 먹고 있는 느낌은 장면 설명이 요구할 때만, 얼굴이 식별되지 않는 범위에서 넣는다.
    "장면 설명에 손, 젓가락, 잔, 뒷모습 같은 사람 요소가 있으면 자연스럽게 넣되, 얼굴은 프레임 밖에 두거나 식별되지 않게 할 것. Hands and chopsticks are welcome when the scene calls for them; never render a recognizable face.",
    foodDirection(input),
    // 레이아웃마다 사진이 쓰이는 방식이 달라서, 그 레이아웃의 사진 분위기와 여백 요청을 붙인다.
    input.slide ? CARD_LAYOUTS[input.slideLayout==="overlay"?"fullscreen":input.slide.layout].photoHint : "",
    reference ? referenceDirection(input) : "",
    // 수정 요청은 위의 화풍·구도 지침보다 우선한다고 명시해야 "애니메이션 풍으로" 같은 요청이 사진 지시에 묻히지 않는다.
    input.refinement ? `사용자의 수정 요청(가장 우선): ${JSON.stringify(input.refinement)}. 위의 화풍·구도·조명 지침과 충돌하면 이 요청을 따른다. 음식의 종류와 사실 기준은 유지한다.` : "",
    "이미지 안에 글자, 로고, 가격표를 넣지 말 것. 실제 매장 외관, 식별되는 얼굴, 확인되지 않은 원산지나 메뉴 구성을 만들지 말 것.",
    NO_TEXT_DIRECTIVE,
  ].filter(Boolean).join(" ");
};

export function buildImageRequest(input: ImageBrief, quality:"medium"|"high"="medium") {
  return { model:"gpt-image-1.5" as const, quality, prompt:buildImagePrompt(input), size:"1024x1536" as const, n:input.count };
}

export async function buildImageEditRequest(input:ImageBrief&{referenceImage:string},quality:"medium"|"high"="medium") {
  const [,mime,encoded]=input.referenceImage.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/)??[];
  if(!mime||!encoded)throw new Error("참고 이미지 형식이 올바르지 않습니다.");
  const image=await toFile(Buffer.from(encoded,"base64"),`reference.${mime==="jpeg"?"jpg":mime}`,{type:`image/${mime}`});
  // 높은 충실도는 참고 이미지를 거의 그대로 잠근다. 사용자가 올린 실제 음식 사진을 그대로 살릴 때만 쓰고,
  // 화풍 참고, 표지 이어 가기, 수정 요청, 그림 화풍에서는 낮춰서 장면이 바뀔 여지를 준다.
  const keepClose=(input.referenceMode??"source")==="source"&&!input.refinement&&resolveImageStyle(input)==="photo";
  const input_fidelity:"high"|"low"=keepClose?"high":"low";
  return {model:"gpt-image-1.5" as const,quality,image,prompt:buildImagePrompt(input,true),size:"1024x1536" as const,n:input.count,input_fidelity};
}
