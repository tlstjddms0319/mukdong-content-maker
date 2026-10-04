import type { WizardStep } from "@/components/wizard/WizardShell";

// 위저드가 어느 초안의 어느 단계에 있었는지 브라우저 탭 안에서만 기억한다(sessionStorage).
// 다른 화면으로 갔다가 "새 초안"으로 돌아오거나 새로고침해도 같은 초안·같은 단계로 이어진다.
// 이미지 자체는 여기 넣지 않는다. 크기가 커서 저장소 한도를 넘기 쉽고, 진행 중인 생성은 generationStore가 들고 있다.
// planDate·planStyle: 한 달 기획에서 시작한 초안이면 그 게시일과 추천 계열(첫 저장 전에 새로고침해도 이어지게).
export type WizardSession={draftId:string;topic:string;audience:"A"|"B"|"C";imageBrief:string;contentBrief:string;step:WizardStep;planDate?:string;planStyle?:string};

const KEY="mukdong-wizard-session";

export function readWizardSession():WizardSession|null {
  try {
    const raw=window.sessionStorage.getItem(KEY);
    if(!raw)return null;
    const value=JSON.parse(raw) as Partial<WizardSession>;
    if(typeof value.draftId!=="string"||typeof value.topic!=="string"||!value.topic.trim())return null;
    return {
      draftId:value.draftId,
      topic:value.topic,
      audience:value.audience==="A"||value.audience==="B"?value.audience:"C",
      imageBrief:typeof value.imageBrief==="string"?value.imageBrief:"",
      contentBrief:typeof value.contentBrief==="string"?value.contentBrief:"",
      step:value.step==="topic"||value.step==="image"||value.step==="copy"||value.step==="review"?value.step:"image",
      ...(typeof value.planDate==="string"?{planDate:value.planDate}:{}),
      ...(typeof value.planStyle==="string"?{planStyle:value.planStyle}:{}),
    };
  } catch { return null; }
}

export function saveWizardSession(session:WizardSession){
  try { window.sessionStorage.setItem(KEY,JSON.stringify(session)); } catch {}
}

export function clearWizardSession(){
  try { window.sessionStorage.removeItem(KEY); } catch {}
}
