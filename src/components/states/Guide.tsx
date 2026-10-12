import type { ReactNode } from "react";

// 긴 설명을 "딱 보면 아는" 모양으로: 아이콘이 있는 1→2→3 단계 그림과, 자세한 설명을 접어 두는 '자세히'.
// 사장님(50대, 큰 모니터)이 문단을 읽지 않고도 순서를 알게 한다. 원래 설명은 '자세히' 안에 남겨 정보는 잃지 않는다.
export type GuideStep={icon:string;title:string;text?:ReactNode};

export function StepGuide({steps,label}:{steps:GuideStep[];label:string}){
  return <ol className="step-guide" aria-label={label}>
    {steps.map((step,index)=><li key={step.title}>
      <span className="step-guide-icon" aria-hidden="true">{step.icon}</span>
      <span className="step-guide-number">{index+1}</span>
      <strong>{step.title}</strong>
      {step.text&&<span className="step-guide-text">{step.text}</span>}
    </li>)}
  </ol>;
}

export function MoreInfo({children,summary="자세히"}:{children:ReactNode;summary?:string}){
  return <details className="more-info"><summary>{summary}</summary><div className="more-info-body">{children}</div></details>;
}

// 어디를 누르면 되는지: "만들기 › 2 만들기 › 사진 올리기"를 칩 모양으로.
export function WherePath({path}:{path:string}){
  const parts=path.split("→").map(part=>part.trim()).filter(Boolean);
  return <span className="where-path" aria-label={`누르는 곳: ${parts.join(", ")}`}>{parts.map((part,index)=><span key={index}>{index>0&&<i aria-hidden="true">›</i>}<b>{part}</b></span>)}</span>;
}
