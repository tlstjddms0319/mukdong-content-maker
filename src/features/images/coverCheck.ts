import "server-only";
import sharp from "sharp";
import { z } from "zod";

// AI 표지 후보 점검. 이미지 AI가 만든 표지 후보(글자를 얹기 전 원본)를 Gemini에 보여 주고
// 흔한 실패(이미지 속 엉뚱한 글자·워터마크, 홍어로 안 보이는 음식, 어색한 손, 음식이 안 보임)를 확인한다.
// 결과는 후보 순서를 정하고(점수 높은 것 먼저) 화면에 경고 배지를 붙이는 데만 쓴다. 다시 만들지는 않는다(이미지 비용 방지).
// Gemini 키가 없거나 호출이 실패하면 점검 없이 원래 순서를 쓴다.

export const CoverCheckSchema=z.object({
  foodVisible:z.boolean(),          // 음식이 화면의 주인공으로 또렷이 보이는가
  looksLikeSkate:z.boolean(),       // 얇게 썬 홍어(가오리류) 살처럼 보이는가
  textInImage:z.boolean(),          // 이미지 안에 글자·숫자·로고·워터마크가 있는가
  oddHands:z.boolean(),             // 손가락 개수·모양이 어색한 손이 있는가
  score:z.number().min(1).max(10),  // 인스타 표지로서의 전체 점수
  note:z.string().max(80),          // 한국어 한 줄 메모
});
export type CoverCheck=z.infer<typeof CoverCheckSchema>&{warnings:string[]};

const PROMPT=`이 사진은 식당 Instagram 카드뉴스 표지 후보입니다(글자는 나중에 얹습니다). 음식은 삭힌 홍어회(얇게 썬 연분홍·흰 살, 결이 보임)여야 합니다.
다음을 JSON으로 답하세요.
- foodVisible: 음식이 화면의 주인공으로 또렷이 보이면 true
- looksLikeSkate: 얇게 썬 홍어(가오리류) 살처럼 보이면 true. 통생선, 연어·참치 같은 다른 생선이면 false
- textInImage: 이미지 안에 글자, 숫자, 간판, 로고, 워터마크가 보이면 true
- oddHands: 손이 있는데 손가락 개수·모양이 어색하면 true (손이 없으면 false)
- score: 표지 사진으로서의 점수 1~10 (먹음직스러움, 선명도, 구도)
- note: 가장 큰 문제나 장점을 한국어 20자 안팎 한 줄로`;

// 경고 문구(화면 배지). 문제가 없으면 빈 배열.
export function coverWarnings(check:z.infer<typeof CoverCheckSchema>):string[] {
  return [
    ...(check.textInImage?["이미지 속 글자"]:[]),
    ...(!check.foodVisible?["음식이 잘 안 보임"]:[]),
    ...(check.foodVisible&&!check.looksLikeSkate?["홍어로 안 보임"]:[]),
    ...(check.oddHands?["손 모양 어색"]:[]),
  ];
}

// 경고가 있으면 점수를 깎아 순서를 정한다(글자·다른 음식은 크게, 손은 조금).
export function coverRank(check:CoverCheck):number {
  return check.score-(check.textInImage?4:0)-(!check.foodVisible?4:0)-(!check.looksLikeSkate?3:0)-(check.oddHands?2:0);
}

type Fetch=typeof fetch;
export async function checkCoverCandidates(images:Buffer[],options:{apiKey?:string;model?:string;fetch?:Fetch}={}):Promise<CoverCheck[]|null> {
  const apiKey=options.apiKey??process.env.GEMINI_API_KEY??"";
  if(!apiKey||!images.length)return null;
  const model=options.model??process.env.GEMINI_VISION_MODEL??process.env.GEMINI_TEXT_MODEL??"gemini-3.5-flash-lite";
  const request=options.fetch??fetch;
  try{
    return await Promise.all(images.map(async image=>{
      // 비용·속도를 위해 512px JPEG로 줄여 보낸다.
      const small=await sharp(image).rotate().resize(512,512,{fit:"inside"}).jpeg({quality:80}).toBuffer();
      const response=await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
        method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
        body:JSON.stringify({contents:[{parts:[{text:PROMPT},{inline_data:{mime_type:"image/jpeg",data:small.toString("base64")}}]}],generationConfig:{responseMimeType:"application/json"}}),
      });
      if(!response.ok)throw new Error(`Gemini ${response.status}`);
      const body=await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
      const text=body.candidates?.[0]?.content?.parts?.map(part=>part.text??"").join("")??"";
      const check=CoverCheckSchema.parse(JSON.parse(text));
      return {...check,warnings:coverWarnings(check)};
    }));
  }catch(error){
    console.warn("[cover-check] 표지 점검을 건너뜁니다:",error instanceof Error?error.message:String(error));
    return null;
  }
}
